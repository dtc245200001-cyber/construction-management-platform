"use strict";

const StagingMonitor = require("../services/stagingMonitor");

describe("Staging Monitor & Alerting Service (T-128 & T-129 / S-51)", () => {
  let mockHttpClient;
  let alertEvents;
  let recoveryEvents;

  beforeEach(() => {
    alertEvents = [];
    recoveryEvents = [];
    mockHttpClient = jest.fn();
  });

  const createMonitor = (overrides = {}) => {
    return new StagingMonitor({
      targetUrl: "http://staging.example.com/health",
      checkIntervalSeconds: 30,
      alertThresholdSeconds: 300, // 5 phút
      webhookUrl: "https://hooks.slack.com/services/mock/webhook/123",
      channelType: "auto",
      environment: "staging",
      httpClient: mockHttpClient,
      onAlertSent: (payload, details) => alertEvents.push({ payload, details }),
      onRecoverySent: (payload, details) => recoveryEvents.push({ payload, details }),
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      ...overrides,
    });
  };

  describe("T-128: Định kỳ kiểm tra endpoint health", () => {
    it("Ghi nhận trạng thái healthy khi endpoint trả về HTTP 200 và body.status === 'healthy'", async () => {
      mockHttpClient.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          status: "healthy",
          app: { status: "healthy", uptime: 100 },
          database: { status: "healthy", responseTimeMs: 10 },
        },
      });

      const monitor = createMonitor();
      const res = await monitor.checkHealthOnce();

      expect(res.status).toBe("healthy");
      expect(monitor.consecutiveFailures).toBe(0);
      expect(mockHttpClient).toHaveBeenCalledWith(
        "http://staging.example.com/health",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("Ghi nhận thất bại khi endpoint trả về mã lỗi hoặc DB unhealthy", async () => {
      mockHttpClient.mockResolvedValueOnce({
        statusCode: 503,
        body: {
          status: "unhealthy",
          database: { status: "unhealthy", error: "Không thể kết nối cơ sở dữ liệu" },
        },
      });

      const monitor = createMonitor();
      const res = await monitor.checkHealthOnce();

      expect(res.status).toBe("unhealthy");
      expect(monitor.consecutiveFailures).toBe(1);
      expect(monitor.lastStatus).toBe("unhealthy");
    });
  });

  describe("T-129: Quy tắc cảnh báo thất bại quá 5 phút & chuyển trạng thái phục hồi", () => {
    it("Không kích hoạt cảnh báo nếu thời gian thất bại dưới 5 phút (< 300s)", async () => {
      mockHttpClient.mockResolvedValue({
        statusCode: 503,
        body: { status: "unhealthy" },
      });

      const monitor = createMonitor({ alertThresholdSeconds: 300 });

      // Lần 1: Bắt đầu lỗi
      const res1 = await monitor.checkHealthOnce();
      expect(res1.status).toBe("unhealthy");
      expect(res1.alertSent).toBe(false);
      expect(alertEvents.length).toBe(0);

      // Giả lập 2 phút trôi qua (120s < 300s)
      monitor.firstFailureTime = Date.now() - 120 * 1000;
      const res2 = await monitor.checkHealthOnce();
      expect(res2.alertSent).toBe(false);
      expect(alertEvents.length).toBe(0);
    });

    it("Kích hoạt cảnh báo khi thất bại liên tục quá 5 phút (>= 300s)", async () => {
      mockHttpClient.mockResolvedValue({
        statusCode: 503,
        body: { status: "unhealthy" },
      });

      const monitor = createMonitor({ alertThresholdSeconds: 300 });

      await monitor.checkHealthOnce();

      // Giả lập thời gian lỗi đã trôi qua 301 giây (> 5 phút)
      monitor.firstFailureTime = Date.now() - 301 * 1000;

      const res = await monitor.checkHealthOnce();
      expect(res.alertSent).toBe(true);
      expect(monitor.alertTriggered).toBe(true);
      expect(alertEvents.length).toBe(1);
      expect(alertEvents[0].details.durationSeconds).toBeGreaterThanOrEqual(300);
    });

    it("Không gửi cảnh báo trùng lặp (spam) trong các chu kỳ tiếp theo khi vẫn đang lỗi", async () => {
      mockHttpClient.mockResolvedValue({
        statusCode: 503,
        body: { status: "unhealthy" },
      });

      const monitor = createMonitor({ alertThresholdSeconds: 300 });
      monitor.firstFailureTime = Date.now() - 310 * 1000;

      // Chu kỳ 1: Gửi cảnh báo
      const res1 = await monitor.checkHealthOnce();
      expect(res1.alertSent).toBe(true);
      expect(alertEvents.length).toBe(1);

      // Chu kỳ 2: Tiếp tục lỗi, không gửi thêm cảnh báo
      const res2 = await monitor.checkHealthOnce();
      expect(res2.alertSent).toBe(false);
      expect(alertEvents.length).toBe(1);
    });

    it("Staging phục hồi thì tự động chuyển trạng thái và gửi thông báo Recovery", async () => {
      const monitor = createMonitor({ alertThresholdSeconds: 300 });

      // Giả lập hệ thống đang trong tình trạng đã kích hoạt cảnh báo
      monitor.firstFailureTime = Date.now() - 360 * 1000;
      monitor.alertTriggered = true;
      monitor.consecutiveFailures = 12;

      // Bây giờ Staging phản hồi 200 khỏe mạnh trở lại
      mockHttpClient.mockResolvedValueOnce({
        statusCode: 200,
        body: { status: "healthy" },
      });

      const res = await monitor.checkHealthOnce();
      expect(res.status).toBe("healthy");
      expect(res.recoverySent).toBe(true);
      expect(monitor.alertTriggered).toBe(false);
      expect(monitor.consecutiveFailures).toBe(0);
      expect(monitor.firstFailureTime).toBeNull();

      expect(recoveryEvents.length).toBe(1);
      expect(recoveryEvents[0].details.totalOutageSeconds).toBeGreaterThanOrEqual(360);
    });
  });

  describe("T-129: Định dạng kênh thông báo (Slack, Discord, Telegram, Generic)", () => {
    it("Định dạng đúng cho Slack blocks", () => {
      const monitor = createMonitor({
        channelType: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
      });
      const payload = monitor.buildNotificationPayload("alert", {
        targetUrl: "http://staging:3000/health",
        durationSeconds: 320,
        consecutiveFailures: 10,
        error: "DB connection timeout",
      });

      expect(payload.text).toContain("CẢNH BÁO");
      expect(Array.isArray(payload.blocks)).toBe(true);
      expect(payload.blocks[0].type).toBe("header");
    });

    it("Định dạng đúng cho Discord embeds với màu Đỏ (Alert) và Xanh (Recovery)", () => {
      const monitor = createMonitor({
        channelType: "discord",
        webhookUrl: "https://discord.com/api/webhooks/xxx",
      });

      const alertPayload = monitor.buildNotificationPayload("alert", {
        targetUrl: "http://staging:3000/health",
        durationSeconds: 310,
        consecutiveFailures: 10,
      });
      expect(alertPayload.embeds[0].color).toBe(0xef4444); // Đỏ

      const recoveryPayload = monitor.buildNotificationPayload("recovery", {
        targetUrl: "http://staging:3000/health",
        totalOutageSeconds: 350,
      });
      expect(recoveryPayload.embeds[0].color).toBe(0x10b981); // Xanh
    });

    it("Định dạng đúng cho Telegram Markdown", () => {
      const monitor = createMonitor({
        channelType: "telegram",
        webhookUrl: "https://api.telegram.org/bot123/sendMessage",
      });
      const payload = monitor.buildNotificationPayload("alert", {
        targetUrl: "http://staging:3000/health",
        durationSeconds: 300,
        consecutiveFailures: 10,
      });

      expect(payload.parse_mode).toBe("Markdown");
      expect(payload.text).toContain("CẢNH BÁO");
    });

    it("Định dạng chuẩn cho Generic Webhook", () => {
      const monitor = createMonitor({
        channelType: "generic",
        webhookUrl: "https://my-webhook.example.com",
      });
      const payload = monitor.buildNotificationPayload("alert", {
        targetUrl: "http://staging:3000/health",
        durationSeconds: 305,
        consecutiveFailures: 10,
      });

      expect(payload.event).toBe("staging_down");
      expect(payload.status).toBe("unhealthy");
      expect(payload.service).toBe("staging-backend");
      expect(payload.durationSeconds).toBe(305);
    });

    it("NFR: Không có Webhook URL thì ghi log an toàn mà không bị lỗi crash", async () => {
      const monitor = createMonitor({ webhookUrl: "" });
      const result = await monitor.sendNotification("alert", {
        targetUrl: "http://staging:3000/health",
        durationSeconds: 300,
        consecutiveFailures: 10,
      });

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
    });
  });
});
