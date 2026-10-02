// Lưu lại các biến môi trường gốc
const originalEnv = process.env;

describe('Mailer Library (E1)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('Gửi bằng cấu hình memory: bộ nhớ ghi nhận đúng thư', async () => {
    process.env.EMAIL_PROVIDER = 'memory';
    process.env.NODE_ENV = 'test';
    
    const { sendEmail, memoryInbox } = require('../lib/mailer');
    
    await sendEmail({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>HTML</p>',
      text: 'TEXT',
      typeCode: 'TEST'
    });

    expect(memoryInbox.length).toBe(1);
    expect(memoryInbox[0].to).toBe('test@example.com');
    expect(memoryInbox[0].subject).toBe('Hello');
  });

  it('Production thiếu cấu hình: khởi động thất bại', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'memory'; // Sai, phải là smtp/resend
    
    // Mock process.exit and logger.error
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    require('../lib/mailer');
    
    expect(mockExit).toHaveBeenCalledWith(1);
    
    mockExit.mockRestore();
  });

  it('Production thiếu APP_BASE_URL https: khởi động thất bại', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.APP_BASE_URL = 'http://example.com';
    
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    require('../lib/mailer');
    
    expect(mockExit).toHaveBeenCalledWith(1);
    
    mockExit.mockRestore();
  });

  it('Test dùng bộ gửi thật (smtp): ném lỗi ngay (Chốt an toàn 1)', () => {
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_PROVIDER = 'smtp';
    
    expect(() => {
      require('../lib/mailer');
    }).toThrow("KHÔNG BAO GIỜ được dùng bộ gửi thư thật trong môi trường test!");
  });

  it('Staging: địa chỉ ngoài danh sách cho phép bị chặn (Chốt an toàn 2)', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.EMAIL_PROVIDER = 'memory';
    process.env.ALLOWED_EMAIL_DOMAINS = '*@gmail.com, company.com';
    
    const { sendEmail, memoryInbox } = require('../lib/mailer');
    
    const res = await sendEmail({
      to: 'attacker@evil.com',
      subject: 'Hello'
    });
    
    expect(res.status).toBe('blocked_by_allowlist');
    expect(memoryInbox.length).toBe(0); // Không có thư nào vào memory
  });

  it('Staging: địa chỉ trong danh sách cho phép được gửi', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.EMAIL_PROVIDER = 'memory';
    process.env.ALLOWED_EMAIL_DOMAINS = '*@gmail.com, company.com';
    
    const { sendEmail, memoryInbox } = require('../lib/mailer');
    
    const res = await sendEmail({
      to: 'user@company.com',
      subject: 'Hello'
    });
    
    expect(res.status).toBe('sent');
    expect(memoryInbox.length).toBe(1);
  });

  it('Nhật ký không chứa email thật hoặc token', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_PROVIDER = 'memory';
    
    // Mock logger
    jest.doMock('../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));
    
    const { sendEmail, maskEmail } = require('../lib/mailer');
    const logger = require('../utils/logger');
    
    expect(maskEmail('hello@example.com')).toBe('h***o@example.com');
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    
    await sendEmail({
      to: 'secret_user@example.com',
      subject: 'Hello',
      html: 'TOKEN_12345'
    });
    
    // Check what was logged
    expect(logger.info).toHaveBeenCalled();
    const logCall = logger.info.mock.calls[0];
    const logObj = logCall[0]; // { to, type, status, messageId }
    
    expect(logObj.to).toBe('s***r@example.com');
    expect(logObj.to).not.toContain('secret_user');
    
    // Đảm bảo không có trường nào chứa nội dung thư hoặc HTML
    const logStr = JSON.stringify(logCall);
    expect(logStr).not.toContain('TOKEN_12345');
    expect(logStr).not.toContain('html');
    expect(logStr).not.toContain('subject');
  });
});
