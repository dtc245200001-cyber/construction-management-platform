import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import loginBg from '../assets/login-bg.png';
import logoImg from '../assets/logo.svg';
import './AuthPages.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail || normalizedEmail.length > 255 || !EMAIL_REGEX.test(normalizedEmail)) {
      setMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api.post('/auth/forgot-password', { email: normalizedEmail });
      setSent(true);
      setMessage(res.data?.message || 'Nếu email này thuộc một tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi đến email đó.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nl-login-page">
      <img
        src={loginBg}
        className="nl-login-bg"
        alt="Background"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <main className="nl-main nl-main-single">
        <div className="nl-card nl-card-single">
          <div className="nl-card-right">
            <div className="nl-header" style={{ marginBottom: '12px' }}>
              <img src={logoImg} className="nl-logo-img" alt="Logo" />
              <div className="nl-logo-text">
                <strong>Construction</strong>
                <span>Management</span>
              </div>
            </div>

            <div className="nl-form-container">
              {message && (
                <div className={sent ? 'nl-alert-success' : 'nl-alert-error'} role="status">
                  {message}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <h3 className="nl-form-title">Khôi phục mật khẩu</h3>
                <p className="nl-form-desc">
                  Nhập email đã đăng ký. Nếu email thuộc một tài khoản hợp lệ, hệ thống sẽ gửi liên kết đặt lại mật khẩu.
                </p>

                <div className="nl-input-group">
                  <div className="nl-input-icon"><Mail /></div>
                  <input
                    type="text"
                    inputMode="email"
                    placeholder="Email của bạn"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <button type="submit" className="nl-submit-btn" disabled={loading}>
                  {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
                  {!loading && <ArrowRight />}
                </button>

                <Link to="/login" className="nl-back-link">
                  <ArrowLeft size={16} /> Quay lại đăng nhập
                </Link>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
