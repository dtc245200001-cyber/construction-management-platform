const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'ethereal';
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const ALLOWED_EMAIL_DOMAINS = process.env.ALLOWED_EMAIL_DOMAINS ? process.env.ALLOWED_EMAIL_DOMAINS.split(',').map(d => d.trim().toLowerCase()) : [];

// Kiểm tra cấu hình lúc khởi động
if (NODE_ENV === 'production') {
  if (EMAIL_PROVIDER !== 'smtp' && EMAIL_PROVIDER !== 'resend') {
    logger.error("Production cần cấu hình EMAIL_PROVIDER là 'smtp' hoặc 'resend'");
    process.exit(1);
  }
  if (!APP_BASE_URL.startsWith('https://')) {
    logger.error("Production cần cấu hình APP_BASE_URL bắt đầu bằng https://");
    process.exit(1);
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.error("Production thiếu cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS)");
    process.exit(1);
  }
} else if (NODE_ENV !== 'test') {
  if (!process.env.EMAIL_PROVIDER) {
    logger.warn("Chưa cấu hình EMAIL_PROVIDER, đang dùng mặc định: ethereal (hoặc memory).");
  }
}

// CHỐT AN TOÀN 1
if (NODE_ENV === 'test' && (EMAIL_PROVIDER === 'smtp' || EMAIL_PROVIDER === 'resend')) {
  throw new Error("KHÔNG BAO GIỜ được dùng bộ gửi thư thật trong môi trường test!");
}

let transporter;
// Bộ nhớ để lưu thư trong môi trường test
const memoryInbox = [];

if (EMAIL_PROVIDER === 'memory') {
  transporter = {
    sendMail: async (mailOptions) => {
      memoryInbox.push(mailOptions);
      return { messageId: `mem-${Date.now()}` };
    }
  };
} else if (EMAIL_PROVIDER === 'smtp' || EMAIL_PROVIDER === 'resend') {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  // ethereal
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER || 'demo', // Sẽ dùng demo account hoặc account do user cấp
      pass: process.env.ETHEREAL_PASS || 'demo'
    }
  });
  // Auto-generate ethereal account if not provided
  if (!process.env.ETHEREAL_USER) {
    nodemailer.createTestAccount((err, account) => {
      if (err) {
        logger.error('Failed to create a testing account. ' + err.message);
        return;
      }
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass
        }
      });
      logger.info('Ethereal Email Test Account created.');
    });
  }
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

async function sendEmail({ to, subject, html, text, typeCode = 'GENERAL' }) {
  const maskedTo = maskEmail(to);

  // CHỐT AN TOÀN 2: Lọc domain ở dev/staging
  if (NODE_ENV !== 'production' && NODE_ENV !== 'test' && ALLOWED_EMAIL_DOMAINS.length > 0) {
    const toDomain = to.split('@')[1]?.toLowerCase();
    const isAllowed = ALLOWED_EMAIL_DOMAINS.some(d => {
      if (d.startsWith('*.')) {
        return toDomain === d.substring(2) || toDomain.endsWith(d.substring(1));
      } else if (d.startsWith('*@')) {
        return toDomain === d.substring(2);
      }
      return toDomain === d;
    });

    if (!isAllowed) {
      logger.warn({ to: maskedTo, type: typeCode }, "Địa chỉ nhận bị chặn bởi danh sách trắng ở môi trường dev/staging.");
      return { status: 'blocked_by_allowlist' };
    }
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Nền tảng thi công" <no-reply@localhost>',
    replyTo: process.env.EMAIL_REPLY_TO || '"Hỗ trợ" <support@localhost>',
    to,
    subject,
    html,
    text
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({ to: maskedTo, type: typeCode, status: 'sent', messageId: info.messageId }, "Gửi email thành công.");
    
    if (EMAIL_PROVIDER === 'ethereal' && info.messageId) {
      logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }

    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    logger.error({ to: maskedTo, type: typeCode, status: 'error', error: error.message }, "Gửi email thất bại.");
    throw error;
  }
}

module.exports = {
  sendEmail,
  memoryInbox,
  maskEmail
};
