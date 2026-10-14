/**
 * _production-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard bảo vệ production — import ở đầu mọi script có khả năng ghi/xóa dữ liệu.
 *
 * Cách dùng:
 *   require('./_production-guard')('tên-script.js');
 *
 * Script sẽ bị CHẶN và thoát ngay nếu DATABASE_URL trỏ vào production
 * (Supabase, Render, hoặc bất kỳ host không phải localhost/127.0.0.1).
 */

'use strict';

const PROD_PATTERNS = [
  /supabase\.co/i,
  /supabase\.in/i,
  /render\.com/i,
  /railway\.app/i,
  /neon\.tech/i,
  /planetscale\.com/i,
  /amazonaws\.com/i,
  /\.cloud\.google\.com/i,
];

const LOCAL_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /::1/,
  /0\.0\.0\.0/,
];

/**
 * @param {string} scriptName - Tên script đang chạy (để log rõ ràng)
 * @param {object} [opts]
 * @param {boolean} [opts.allowProduction=false] - Đặt true nếu cố ý chạy trên production (cần xác nhận)
 */
function guardProduction(scriptName, opts = {}) {
  const allowProduction = opts.allowProduction || process.env.ALLOW_PRODUCTION_RESTORE === "true";

  // Đọc DATABASE_URL sau khi dotenv đã được load
  const dbUrl = process.env.DATABASE_URL || '';
  const dbHost = process.env.DB_HOST || '';
  const target = dbUrl || dbHost;

  if (!target) {
    console.warn(`⚠️  [GUARD] ${scriptName}: Không tìm thấy DATABASE_URL hoặc DB_HOST.`);
    console.warn('   Không thể xác minh môi trường — thoát để an toàn.');
    process.exit(1);
  }

  // Kiểm tra xem có phải production không
  const isProd = PROD_PATTERNS.some((p) => p.test(target));
  const isLocal = LOCAL_PATTERNS.some((p) => p.test(target));

  if (isProd && !allowProduction) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  🚫  BỊ CHẶN: SCRIPT NGUY HIỂM — TRỎ VÀO PRODUCTION        ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error(`║  Script : ${scriptName.padEnd(51)}║`);
    console.error(`║  Target : ${target.substring(0, 51).padEnd(51)}║`);
    console.error('║                                                              ║');
    console.error('║  Script này có thể XÓA hoặc GHI ĐÈ dữ liệu production.      ║');
    console.error('║  Nếu chắc chắn muốn chạy, hãy hỏi project owner trước.      ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  if (!isLocal && !isProd) {
    console.warn(`⚠️  [GUARD] ${scriptName}: Không nhận diện được môi trường (${target.substring(0, 60)})`);
    console.warn('   Có thể là staging hoặc DB lạ — thoát để an toàn.');
    process.exit(1);
  }

  if (isLocal) {
    console.log(`✅ [GUARD] ${scriptName}: Đã xác minh kết nối LOCAL — an toàn để chạy.`);
  }
}

module.exports = guardProduction;
