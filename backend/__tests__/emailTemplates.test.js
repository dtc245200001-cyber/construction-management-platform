const { renderProjectInvite } = require('../lib/emailTemplates');

describe('Email Templates (E2)', () => {
  const mockBaseUrl = 'https://example.com';

  it('Thoát ký tự HTML ở tên người mời, tên dự án và vai trò (Chống XSS)', () => {
    const result = renderProjectInvite({
      inviterName: '<script>alert(1)</script>John',
      projectName: 'Dự án <b>Mới</b>',
      role: '"Quản trị"',
      token: 'abc',
      isNewUser: true,
      baseUrl: mockBaseUrl
    });

    // Nội dung HTML không được chứa nguyên thẻ script hay thẻ b
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;John');
    expect(result.html).not.toContain('<b>');
    expect(result.html).toContain('Dự án &lt;b&gt;Mới&lt;/b&gt;');
    expect(result.html).toContain('&quot;Quản trị&quot;');
  });

  it('Loại bỏ ký tự xuống dòng ở tiêu đề (Chống Header Injection)', () => {
    const result = renderProjectInvite({
      inviterName: 'John',
      projectName: 'Dự án\nMới\r\nNhất',
      role: 'PM',
      token: 'abc',
      isNewUser: true,
      baseUrl: mockBaseUrl
    });

    expect(result.subject).not.toContain('\n');
    expect(result.subject).not.toContain('\r');
    expect(result.subject).toBe('Lời mời tham gia dự án: Dự án Mới Nhất');
  });

  it('Liên kết bắt đầu bằng APP_BASE_URL cấu hình', () => {
    const token = 'my-secret-token';
    const resultNew = renderProjectInvite({
      inviterName: 'A', projectName: 'B', role: 'C', token, isNewUser: true, baseUrl: mockBaseUrl
    });
    const resultExisting = renderProjectInvite({
      inviterName: 'A', projectName: 'B', role: 'C', token, isNewUser: false, baseUrl: mockBaseUrl
    });

    // New user -> link tới trang đăng ký/đặt mật khẩu
    expect(resultNew.html).toContain(`${mockBaseUrl}/register?token=${token}`);
    expect(resultNew.text).toContain(`${mockBaseUrl}/register?token=${token}`);

    // Existing user -> link tới đăng nhập
    expect(resultExisting.html).toContain(`${mockBaseUrl}/login`);
    expect(resultExisting.text).toContain(`${mockBaseUrl}/login`);
  });

  it('Không chứa dữ liệu thừa ngoài danh sách cho phép', () => {
    const result = renderProjectInvite({
      inviterName: 'John',
      projectName: 'Project X',
      role: 'Thành viên',
      token: 'abc',
      isNewUser: true,
      baseUrl: mockBaseUrl,
      // Dữ liệu thừa, có thể do lỡ pass toàn bộ object dự án
      budget: '1000000',
      contractAmount: '500'
    });

    expect(result.html).not.toContain('1000000');
    expect(result.html).not.toContain('500');
    expect(result.text).not.toContain('1000000');
    expect(result.text).not.toContain('500');
  });
});
