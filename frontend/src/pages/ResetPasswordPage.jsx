import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import loginBg from '../assets/login-bg.png';
import logoImg from '../assets/logo.svg';
import './AuthPages.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!token) {
      setMessage('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
      return;
    }

    if (!password || password.length < 8) {
      setMessage('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }

    if (password.length > 128) {
      setMessage('Mật khẩu không được vượt quá 128 ký tự');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api.post('/auth/reset-password', { token, password, confirmPassword });
      setSuccess(true);
      setMessage(res.data?.message || 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
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
                <div className={success ? 'nl-alert-success' : 'nl-alert-error'} role="status">
                  {message}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <h3 className="nl-form-title">Đặt mật khẩu mới</h3>
                <p className="nl-form-desc">Mật khẩu mới phải có ít nhất 8 ký tự và tối đa 128 ký tự.</p>

                <div className="nl-input-group nl-input-group-pw">
                  <div className="nl-input-icon"><Lock /></div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mật khẩu mới"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                  <button type="button" className="nl-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>

                <div className="nl-input-group nl-input-group-pw">
                  <div className="nl-input-icon"><Lock /></div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Xác nhận mật khẩu mới"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <button type="submit" className="nl-submit-btn" disabled={loading || success}>
                  {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
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
