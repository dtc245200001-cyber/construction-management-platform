"use strict";

/**
 * Staging Monitor & Alerting Service (T-128 & T-129 / S-51)
 *
 * 1. Gọi định kỳ endpoint health của staging (mặc định mỗi 30 giây).
 * 2. Theo dõi thời gian gián đoạn liên tục.
 * 3. Kích hoạt cảnh báo khi health check thất bại liên tục quá 5 phút (300 giây).
 * 4. Tự động gửi thông báo khôi phục (Recovery) khi staging phục hồi.
 * 5. Hỗ trợ đa kênh thông báo linh hoạt (Slack, Discord, Telegram, Generic Webhook).
 * 6. Tuân thủ NFR: Không để lộ token/webhook URL trong log và Git.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

class StagingMonitor {
  /**
   * @param {object} [config]
   * @param {string} [config.targetUrl] - URL endpoint health cần kiểm tra
   * @param {number} [config.checkIntervalSeconds] - Chu kỳ kiểm tra (giây)
   * @param {number} [config.alertThresholdSeconds] - Ngưỡng cảnh báo (giây, mặc định 300 = 5 phút)
   * @param {string} [config.webhookUrl] - URL webhook nhận cảnh báo
   * @param {string} [config.channelType] - Loại kênh: 'auto' | 'slack' | 'discord' | 'telegram' | 'generic'
   * @param {string} [config.environment] - Môi trường: 'staging' | 'production' | 'dev'
   * @param {Function} [config.httpClient] - Hàm HTTP client custom (dùng cho unit test / mock)
   * @param {Function} [config.onAlertSent] - Callback khi gửi cảnh báo
   * @param {Function} [config.onRecoverySent] - Callback khi gửi thông báo phục hồi
   * @param {object} [config.logger] - Logger tùy chọn
   */
  constructor(config = {}) {
    this.targetUrl = config.targetUrl || process.env.MONITOR_TARGET_URL || "http://localhost:3000/health";
    this.checkIntervalSeconds = config.checkIntervalSeconds || Number(process.env.CHECK_INTERVAL_SECONDS) || 30;
    this.alertThresholdSeconds = config.alertThresholdSeconds || Number(process.env.ALERT_THRESHOLD_SECONDS) || 300;
    this.webhookUrl = config.webhookUrl !== undefined ? config.webhookUrl : (process.env.ALERT_WEBHOOK_URL || "");
    this.telegramChatId = config.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
    this.channelType = config.channelType || process.env.ALERT_CHANNEL_TYPE || "auto";
    this.environment = config.environment || process.env.ALERT_ENVIRONMENT || "staging";
    this.httpClient = config.httpClient || null;
    this.onAlertSent = config.onAlertSent || null;
    this.onRecoverySent = config.onRecoverySent || null;
    this.logger = config.logger || console;

    // Trạng thái giám sát (State machine)
    this.consecutiveFailures = 0;
    this.firstFailureTime = null;
    this.alertTriggered = false;
    this.alertTriggeredTime = null;
    this.lastCheckedTime = null;
    this.lastStatus = "unknown";
    this.lastError = null;

    this.timer = null;
    this.isRunning = false;
  }

  /**
   * Tự động phát hiện định dạng kênh dựa trên Webhook URL nếu channelType là 'auto'.
   * @returns {'slack' | 'discord' | 'telegram' | 'generic'}
   */
  resolveChannelType() {
    if (this.channelType && this.channelType !== "auto") {
      return this.channelType.toLowerCase();
    }
    const url = (this.webhookUrl || "").toLowerCase();
    if (url.includes("discord.com/api/webhooks")) return "discord";
    if (url.includes("hooks.slack.com")) return "slack";
    if (url.includes("api.telegram.org")) return "telegram";
    return "generic";
  }

  /**
   * Thực hiện một lần gửi HTTP Request (GET hoặc POST).
   *
   * @param {string} urlStr
   * @param {object} options
   * @param {string} [options.method='GET']
   * @param {object} [options.body]
   * @param {number} [options.timeout=5000]
   * @returns {Promise<{ statusCode: number, body: any }>}
   */
  async makeRequest(urlStr, options = {}) {
    if (typeof this.httpClient === "function") {
      return this.httpClient(urlStr, options);
    }

    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(urlStr);
        const isHttps = parsedUrl.protocol === "https:";
        const client = isHttps ? https : http;

        const payload = options.body
          ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body))
          : null;

        const reqOptions = {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: options.method || "GET",
          headers: {
            "User-Agent": "CMP-Staging-Monitor/1.0",
            Accept: "application/json",
            ...(payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload, "utf8"),
                }
              : {}),
            ...(options.headers || {}),
          },
          timeout: options.timeout || 5000,
        };

        const req = client.request(reqOptions, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            let parsedBody = data;
            try {
              parsedBody = JSON.parse(data);
            } catch {
              // Body không phải JSON, giữ nguyên string
            }
            resolve({
              statusCode: res.statusCode,
              body: parsedBody,
            });
          });
        });

        req.on("timeout", () => {
          req.destroy(new Error(`Request timeout (${reqOptions.timeout}ms)`));
        });

        req.on("error", (err) => {
          reject(err);
        });

        if (payload) {
          req.write(payload);
        }

        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Tạo payload thông báo tùy chỉnh cho từng kênh (Slack, Discord, Telegram, Generic).
   *
   * @param {'alert' | 'recovery'} type
   * @param {object} details
   * @returns {object}
   */
  buildNotificationPayload(type, details) {
    const isAlert = type === "alert";
    const channel = this.resolveChannelType();
    const envUpper = this.environment.toUpperCase();
    const nowIso = new Date().toISOString();

    const durationFormatted =
      details.durationSeconds >= 60
        ? `${Math.floor(details.durationSeconds / 60)} phút`
        : `${details.durationSeconds} giây`;

    const totalOutageSeconds = details.totalOutageSeconds || 0;
    const outageFormatted =
      totalOutageSeconds >= 60
        ? `${Math.floor(totalOutageSeconds / 60)} phút ${totalOutageSeconds % 60 ? `${totalOutageSeconds % 60} giây` : ""}`.trim()
        : `${totalOutageSeconds} giây`;

    const title = isAlert
      ? `🚨 [${envUpper}] CẢNH BÁO: Staging ngừng phản hồi quá ${durationFormatted}`
      : `✅ [${envUpper}] PHỤC HỒI: Staging đã hoạt động bình thường`;

    const description = isAlert
      ? `Hệ thống Staging (${details.targetUrl}) đã thất bại liên tục trong ${details.durationSeconds} giây (${details.consecutiveFailures} lần kiểm tra).\nLý do: ${details.error || "Không thể kết nối"}`
      : `Hệ thống Staging (${details.targetUrl}) đã phục hồi hoàn toàn sau sự cố kéo dài ${outageFormatted}.\nThời điểm phục hồi: ${nowIso}`;

    if (channel === "discord") {
      return {
        embeds: [
          {
            title,
            description,
            color: isAlert ? 0xef4444 : 0x10b981, // Đỏ hoặc Xanh lá
            fields: [
              { name: "Môi trường", value: envUpper, inline: true },
              { name: "Trạng thái", value: isAlert ? "DOWN" : "UP / RECOVERED", inline: true },
              {
                name: isAlert ? "Thời gian ngừng phản hồi" : "Tổng thời gian sự cố",
                value: `${isAlert ? details.durationSeconds : details.totalOutageSeconds} giây`,
                inline: true,
              },
            ],
            footer: { text: "Construction Management Platform Health Monitor" },
            timestamp: nowIso,
          },
        ],
      };
    }

    if (channel === "slack") {
      return {
        text: `${title}\n${description}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: title },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: description },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*Môi trường:* ${envUpper} | *Thời gian:* ${nowIso}`,
              },
            ],
          },
        ],
      };
    }

    if (channel === "telegram") {
      let chatId = this.telegramChatId;
      if (!chatId && this.webhookUrl) {
        try {
          const u = new URL(this.webhookUrl);
          chatId = u.searchParams.get("chat_id") || "";
        } catch {
          // ignore
        }
      }
      return {
        ...(chatId ? { chat_id: chatId } : {}),
        text: `*${title}*\n\n${description}\n\n_Thời điểm:_ \`${nowIso}\``,
        parse_mode: "Markdown",
      };
    }

    // Generic Webhook
    return {
      event: isAlert ? "staging_down" : "staging_recovered",
      status: isAlert ? "unhealthy" : "healthy",
      environment: this.environment,
      service: "staging-backend",
      targetUrl: details.targetUrl,
      durationSeconds: isAlert ? details.durationSeconds : details.totalOutageSeconds,
      consecutiveFailures: details.consecutiveFailures,
      timestamp: nowIso,
      title,
      description,
    };
  }

  /**
   * Gửi thông báo đến Webhook đã cấu hình (nếu có).
   *
   * @param {'alert' | 'recovery'} type
   * @param {object} details
   */
  async sendNotification(type, details) {
    const payload = this.buildNotificationPayload(type, details);

    if (type === "alert" && typeof this.onAlertSent === "function") {
      this.onAlertSent(payload, details);
    } else if (type === "recovery" && typeof this.onRecoverySent === "function") {
      this.onRecoverySent(payload, details);
    }

    if (!this.webhookUrl || this.webhookUrl === "mock" || this.webhookUrl.trim() === "") {
      this.logger.info(`[STAGING MONITOR - MOCK/LOG ONLY] Không có webhook cấu hình. Chi tiết thông báo (${type}):`, {
        event: payload.event || type,
        title: payload.title || (payload.embeds && payload.embeds[0].title),
      });
      return { success: true, simulated: true };
    }

    try {
      const res = await this.makeRequest(this.webhookUrl, {
        method: "POST",
        body: payload,
        timeout: 8000,
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        this.logger.info(`[STAGING MONITOR] Đã gửi thông báo ${type} thành công (HTTP ${res.statusCode})`);
        return { success: true, statusCode: res.statusCode };
      }

      this.logger.error(`[STAGING MONITOR] Webhook trả về mã lỗi (HTTP ${res.statusCode}):`, res.body);
      return { success: false, statusCode: res.statusCode, body: res.body };
    } catch (err) {
      this.logger.error(`[STAGING MONITOR] Lỗi khi gửi thông báo tới webhook: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Thực hiện một lần kiểm tra trạng thái sức khỏe của Staging.
   *
   * @returns {Promise<{ status: 'healthy' | 'unhealthy', error?: string, alertSent?: boolean, recoverySent?: boolean, durationSeconds: number }>}
   */
  async checkHealthOnce() {
    if (this._isChecking) {
      return {
        status: this.lastStatus,
        skipped: true,
        durationSeconds: this.firstFailureTime ? Math.floor((Date.now() - this.firstFailureTime) / 1000) : 0,
      };
    }
    this._isChecking = true;

    try {
      this.lastCheckedTime = Date.now();
      let isHealthy = false;
      let failureReason = null;

      try {
        const res = await this.makeRequest(this.targetUrl, {
          method: "GET",
          timeout: 5000,
        });

        // Điều kiện khỏe: mã HTTP 200 VÀ body.status === 'healthy'
        if (res.statusCode === 200 && res.body && res.body.status === "healthy") {
          isHealthy = true;
        } else {
          isHealthy = false;
          failureReason =
            res.body && res.body.database && res.body.database.error
              ? `DB lỗi: ${res.body.database.error}`
              : `HTTP ${res.statusCode} (Trạng thái: ${res.body ? res.body.status : "không phản hồi"})`;
        }
      } catch (err) {
        isHealthy = false;
        failureReason = `Không thể kết nối (${err.message})`;
      }

      if (isHealthy) {
        let recoverySent = false;
        let totalOutageSeconds = 0;

        if (this.alertTriggered) {
          // Staging đã phục hồi sau khi bị cảnh báo
          totalOutageSeconds = Math.floor((Date.now() - (this.firstFailureTime || Date.now())) / 1000);
          await this.sendNotification("recovery", {
            targetUrl: this.targetUrl,
            totalOutageSeconds,
            consecutiveFailures: this.consecutiveFailures,
          });
          recoverySent = true;
        }

        // Đặt lại toàn bộ cờ thất bại
        this.consecutiveFailures = 0;
        this.firstFailureTime = null;
        this.alertTriggered = false;
        this.alertTriggeredTime = null;
        this.lastStatus = "healthy";
        this.lastError = null;

        return {
          status: "healthy",
          durationSeconds: 0,
          recoverySent,
        };
      }

      // Xử lý trường hợp thất bại (unhealthy)
      if (!this.firstFailureTime) {
        this.firstFailureTime = Date.now();
      }
      this.consecutiveFailures += 1;
      this.lastStatus = "unhealthy";
      this.lastError = failureReason;

      const failureDurationSeconds = Math.floor((Date.now() - this.firstFailureTime) / 1000);
      let alertSent = false;

      // Quy tắc: Nếu thất bại liên tục vượt quá ngưỡng (mặc định 5 phút = 300 giây) và chưa phát cảnh báo
      if (failureDurationSeconds >= this.alertThresholdSeconds && !this.alertTriggered) {
        await this.sendNotification("alert", {
          targetUrl: this.targetUrl,
          durationSeconds: failureDurationSeconds,
          consecutiveFailures: this.consecutiveFailures,
          error: failureReason,
        });
        this.alertTriggered = true;
        this.alertTriggeredTime = Date.now();
        alertSent = true;
      }

      return {
        status: "unhealthy",
        error: failureReason,
        durationSeconds: failureDurationSeconds,
        consecutiveFailures: this.consecutiveFailures,
        alertSent,
        alertTriggered: this.alertTriggered,
      };
    } finally {
      this._isChecking = false;
    }
  }

  /**
   * Bắt đầu vòng lặp giám sát định kỳ.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info(
      `[STAGING MONITOR] Bắt đầu giám sát ${this.targetUrl} mỗi ${this.checkIntervalSeconds}s (Ngưỡng cảnh báo: ${this.alertThresholdSeconds}s)`
    );

    // Chạy kiểm tra ngay lập tức lần đầu
    this.checkHealthOnce().catch((err) => {
      this.logger.error(`[STAGING MONITOR] Lỗi chu kỳ đầu: ${err.message}`);
    });

    this.timer = setInterval(() => {
      this.checkHealthOnce().catch((err) => {
        this.logger.error(`[STAGING MONITOR] Lỗi chu kỳ: ${err.message}`);
      });
    }, this.checkIntervalSeconds * 1000);
  }

  /**
   * Dừng vòng lặp giám sát.
   */
  stop() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.logger.info("[STAGING MONITOR] Đã dừng giám sát.");
  }
}

module.exports = StagingMonitor;
