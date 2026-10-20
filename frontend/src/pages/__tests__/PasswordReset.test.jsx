import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import api from '../../lib/api';
import ForgotPasswordPage from '../ForgotPasswordPage';
import ResetPasswordPage from '../ResetPasswordPage';
import LoginPage from '../LoginPage';

vi.mock('../../lib/api');

function renderWithRouter(ui, initialEntries = ['/login']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('báo lỗi khi email sai định dạng', async () => {
    renderWithRouter(<ForgotPasswordPage />, ['/forgot-password']);
    fireEvent.change(screen.getByPlaceholderText('Email của bạn'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByText('Gửi liên kết đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('địa chỉ email hợp lệ');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('gửi yêu cầu thành công và chống nhấn liên tiếp', async () => {
    api.post.mockResolvedValue({ data: { message: 'neutral' } });
    renderWithRouter(<ForgotPasswordPage />, ['/forgot-password']);
    fireEvent.change(screen.getByPlaceholderText('Email của bạn'), { target: { value: 'user@example.com' } });
    const button = screen.getByText('Gửi liên kết đặt lại mật khẩu');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'user@example.com' });
    expect(await screen.findByRole('status')).toHaveTextContent('neutral');
  });

  it('báo lỗi khi server thất bại', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Lỗi máy chủ' } } });
    renderWithRouter(<ForgotPasswordPage />, ['/forgot-password']);
    fireEvent.change(screen.getByPlaceholderText('Email của bạn'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByText('Gửi liên kết đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('Lỗi máy chủ');
  });
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('báo lỗi khi mật khẩu xác nhận không khớp', async () => {
    renderWithRouter(<ResetPasswordPage />, ['/reset-password?token=abc']);
    fireEvent.change(screen.getByPlaceholderText('Mật khẩu mới'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByPlaceholderText('Xác nhận mật khẩu mới'), { target: { value: 'Password124' } });
    fireEvent.click(screen.getByText('Đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('không khớp');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('báo lỗi khi mật khẩu quá ngắn', async () => {
    renderWithRouter(<ResetPasswordPage />, ['/reset-password?token=abc']);
    fireEvent.change(screen.getByPlaceholderText('Mật khẩu mới'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Xác nhận mật khẩu mới'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('ít nhất 8 ký tự');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('báo lỗi khi thiếu token', async () => {
    renderWithRouter(<ResetPasswordPage />, ['/reset-password']);
    fireEvent.change(screen.getByPlaceholderText('Mật khẩu mới'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByPlaceholderText('Xác nhận mật khẩu mới'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByText('Đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('không hợp lệ hoặc đã hết hạn');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('đặt lại thành công và hiển thị hướng dẫn đăng nhập', async () => {
    api.post.mockResolvedValue({ data: { message: 'Đặt lại thành công' } });
    renderWithRouter(<ResetPasswordPage />, ['/reset-password?token=abc']);
    fireEvent.change(screen.getByPlaceholderText('Mật khẩu mới'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByPlaceholderText('Xác nhận mật khẩu mới'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByText('Đặt lại mật khẩu'));
    expect(await screen.findByRole('status')).toHaveTextContent('Đặt lại thành công');
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
      token: 'abc',
      password: 'Password123',
      confirmPassword: 'Password123',
    });
  });
});

describe('LoginPage OAuth + forgot link', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('nút Quên mật khẩu chuyển sang /forgot-password', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage setUser={() => {}} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Quên mật khẩu?'));
    expect(screen.getByText('Khôi phục mật khẩu')).toBeInTheDocument();
  });

  it('nút Google hiển thị loading và chặn nhấn liên tiếp', async () => {
    let resolveStatus;
    api.get.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    renderWithRouter(<LoginPage setUser={() => {}} />);
    const buttons = screen.getAllByRole('button', { name: /Google/ });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[0]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText('Đang kết nối Google...')).length).toBeGreaterThan(0);
    resolveStatus({ data: { configured: false } });
    await waitFor(() => expect(screen.queryAllByText(/chưa được cấu hình/).length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it('nút Google báo lỗi khi server thất bại', async () => {
    api.get.mockRejectedValue({ response: { data: { message: 'OAuth lỗi' } } });
    renderWithRouter(<LoginPage setUser={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Google/ })[0]);
    expect(await screen.findByText('OAuth lỗi')).toBeInTheDocument();
  });
});
