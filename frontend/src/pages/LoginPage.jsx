import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import heroImage from '../assets/hero.png';

const LoginPage = ({ setUser }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const response = await api.post('/auth/login', { email, password });
      setUser(response.data.user);
      navigate('/projects');
    } catch (error) {
      console.error("LOGIN ERROR:", error);
      if (error.response?.status === 423) {
        setMessage(error.response.data.message || "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.");
      } else if (error.response?.status === 401) {
        setMessage("Email hoặc mật khẩu không đúng");
      } else {
        setMessage(error.response?.data?.message || "Không thể kết nối tới máy chủ");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setMessage("Mật khẩu xác nhận không khớp");
      return;
    }

    if (password.length < 6) {
      setMessage("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/register', { email, password, confirmPassword });
      setIsRegister(false);
      setPassword("");
      setConfirmPassword("");
      setMessage("");
      setSuccessMessage("Đăng ký thành công. Bạn có thể đăng nhập bằng tài khoản vừa tạo.");
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      setMessage(error.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  const switchToRegister = () => {
    setIsRegister(true);
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setSuccessMessage("");
  };

  const switchToLogin = () => {
    setIsRegister(false);
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setSuccessMessage("");
  };

  return (
    <main className="auth-page">
      <div className="background-photo" style={{ backgroundImage: `url(${heroImage})` }} />
      <div className="background-overlay" />

      <header className="top-header">
        <div className="main-brand">
          <div className="main-logo"><span>C</span></div>
          <div><strong>Construction</strong><span>Management</span></div>
        </div>
        <div className="header-right">
          <span>Better Construction</span><i>•</i><span>Smarter Management</span>
          <button className="theme-button" type="button">☼</button>
          <button className="language-button" type="button">VN</button>
        </div>
      </header>

      <section className="landing-content">
        <div className="hero-copy">
          <h1>Kiến tạo công trình,<br /><span>quản lý hiệu quả</span></h1>
          <p>Nền tảng quản lý dự án xây dựng hiện đại, giúp bạn kiểm soát tiến độ, nhân sự, chi phí và tài nguyên một cách toàn diện.</p>
          <div className="feature-grid">
            <div className="feature-item"><div className="feature-icon blue">▣</div><span>Quản lý<br />dự án</span></div>
            <div className="feature-item"><div className="feature-icon purple">▦</div><span>Theo dõi<br />tiến độ</span></div>
            <div className="feature-item"><div className="feature-icon green">♟</div><span>Phân công<br />nhân sự</span></div>
            <div className="feature-item"><div className="feature-icon violet">▥</div><span>Báo cáo<br />chi tiết</span></div>
          </div>
        </div>
        <div className="video-box">
          <div className="video-text">Dự án thành công bắt đầu từ<br />một nền tảng quản lý tốt.</div>
          <button type="button" className="play-button">▶</button>
          <span>Xem giới thiệu</span>
        </div>
      </section>

      <section className="auth-card">
        <aside className="intro-panel">
          <div className="welcome-badge"><span></span>Welcome to</div>
          <h2>Construction<br />Management</h2>
          <p>Cùng nhau xây dựng những<br />công trình bền vững</p>
          <div className="short-line"></div>
          <div className="building-art">
            <div className="building-crane">─────╱</div>
            <div className="building">
              <div className="building-top"></div>
              <div className="building-body">
                <span></span><span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div className="chart-box"><span></span><span></span><span></span></div>
          </div>
          <div className="benefits">
            <div className="benefit">
              <div className="benefit-icon">✓</div>
              <div><strong>An toàn</strong><span>Quản lý rủi ro, đảm bảo an toàn lao động</span></div>
            </div>
            <div className="benefit">
              <div className="benefit-icon purple-bg">◷</div>
              <div><strong>Minh bạch</strong><span>Dữ liệu rõ ràng, theo dõi thời gian thực</span></div>
            </div>
            <div className="benefit">
              <div className="benefit-icon people-bg">●</div>
              <div><strong>Hiệu quả</strong><span>Tối ưu nguồn lực, nâng cao năng suất</span></div>
            </div>
          </div>
        </aside>

        <section className="form-panel">
          <div className="auth-tabs">
            <button type="button" className={!isRegister ? "active" : ""} onClick={switchToLogin}>Đăng nhập</button>
            <button type="button" className={isRegister ? "active" : ""} onClick={switchToRegister}>Đăng ký</button>
          </div>

          <div className="form-content">
            <div className="form-heading">
              <h2>{isRegister ? "Tạo tài khoản" : "Chào mừng trở lại!"} {!isRegister && <span className="wave">👋</span>}</h2>
              <p>{isRegister ? "Đăng ký tài khoản để bắt đầu quản lý công trình của bạn." : "Đăng nhập để tiếp tục quản lý công trình của bạn."}</p>
            </div>

            <form onSubmit={isRegister ? handleRegister : handleLogin}>
              <div className="modern-input">
                <span className="field-icon">✉</span>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="modern-input">
                <span className="field-icon lock-icon">♙</span>
                <input type={showPassword ? "text" : "password"} placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                <button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "⊙"}</button>
              </div>

              {isRegister && (
                <div className="modern-input">
                  <span className="field-icon lock-icon">♙</span>
                  <input type={showPassword ? "text" : "password"} placeholder="Xác nhận mật khẩu" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
                </div>
              )}

              {!isRegister && (
                <div className="login-options">
                  <label className="remember">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span>Ghi nhớ đăng nhập</span>
                  </label>
                  <button type="button" className="forgot-password">Quên mật khẩu?</button>
                </div>
              )}

              {message && <div className="message error-message">{message}</div>}
              {successMessage && <div className="message success-message">{successMessage}</div>}

              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? (isRegister ? "Đang đăng ký..." : "Đang đăng nhập...") : (isRegister ? "Đăng ký" : "Đăng nhập")}
                {!loading && <span>→</span>}
              </button>
            </form>
          </div>

          <div className="form-bottom">
            {isRegister ? (
              <>
                <span>Đã có tài khoản?</span>
                <button type="button" onClick={switchToLogin}>Đăng nhập ngay <span>→</span></button>
              </>
            ) : (
              <>
                <span>Chưa có tài khoản?</span>
                <button type="button" onClick={switchToRegister}>Đăng ký ngay <span>→</span></button>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
};

export default LoginPage;
