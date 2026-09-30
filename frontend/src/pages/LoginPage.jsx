import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  FolderCheck,
  Calendar,
  Users,
  BarChart3,
  Sun,
  MapPin,
  ShieldCheck,
  Eye,
  Mail,
  Lock,
  EyeOff,
  ArrowRight
} from 'lucide-react';
import loginBg from '../assets/login-bg.png';
import loginIllustration from '../assets/login-illustration.png';
import logoImg from '../assets/logo.svg';

const LoginPage = ({ setUser }) => {
  const [name, setName] = useState("");
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

    if (!name.trim()) {
      setMessage("Vui lòng nhập họ và tên");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Mật khẩu xác nhận không khớp");
      return;
    }

    if (password.length < 8) {
      setMessage("Mật khẩu phải có ít nhất 8 ký tự");
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/register', { name, email, password, confirmPassword });
      setIsRegister(false);
      setName("");
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
    setName("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setSuccessMessage("");
  };

  const switchToLogin = () => {
    setIsRegister(false);
    setName("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setSuccessMessage("");
  };

  return (
    <div className="nl-login-page">
      <img src={loginBg} className="nl-login-bg" alt="Background" />
      
      <main className="nl-main">
        <div className="nl-left-column">
          <header className="nl-header">
            <img src={logoImg} className="nl-logo-img" alt="Logo" />
            <div className="nl-logo-text">
              <strong>Construction</strong>
              <span>Management</span>
            </div>
          </header>

          <div className="nl-hero">
            <h1 className="nl-title">
              <span>Kiến tạo công trình,</span>
              <span className="nl-gradient-text">quản lý hiệu quả</span>
            </h1>
            <p className="nl-desc">
              Nền tảng quản lý dự án xây dựng hiện đại, giúp bạn kiểm soát tiến độ, nhân sự, chi phí và tài nguyên một cách toàn diện.
            </p>
          <div className="nl-features">
            <div className="nl-feature" tabIndex={0}>
              <div className="nl-f-icon"><FolderCheck color="#2563EB" /></div>
              <span>Quản lý<br/>dự án</span>
            </div>
            <div className="nl-feature" tabIndex={0}>
              <div className="nl-f-icon"><Calendar color="#9333EA" /></div>
              <span>Theo dõi<br/>tiến độ</span>
            </div>
            <div className="nl-feature" tabIndex={0}>
              <div className="nl-f-icon"><Users color="#16A34A" /></div>
              <span>Phân công<br/>nhân sự</span>
            </div>
            <div className="nl-feature" tabIndex={0}>
              <div className="nl-f-icon"><BarChart3 color="#9333EA" /></div>
              <span>Báo cáo<br/>chi tiết</span>
            </div>
          </div>
        </div>
        </div>

        <div className="nl-card">
          <div className="nl-card-left">
            <div>
              <div className="nl-badge"><MapPin /> Chào mừng bạn đến với</div>
              <h2 className="nl-card-title">Construction<br/>Management</h2>
              <p className="nl-card-subtitle">Cùng nhau xây dựng những công trình bền vững</p>
              <div className="nl-line"></div>
            </div>
            
            <img src={loginIllustration} alt="Illustration" className="nl-illustration" />
            
            <div className="nl-benefits">
              <div className="nl-benefit">
                <div className="nl-b-icon"><ShieldCheck /></div>
                <div className="nl-b-text">
                  <strong>An toàn</strong>
                  <span>Quản lý rủi ro, đảm bảo an toàn lao động</span>
                </div>
              </div>
              <div className="nl-benefit">
                <div className="nl-b-icon"><Eye /></div>
                <div className="nl-b-text">
                  <strong>Minh bạch</strong>
                  <span>Dữ liệu rõ ràng, theo dõi thời gian thực</span>
                </div>
              </div>
              <div className="nl-benefit">
                <div className="nl-b-icon"><Users /></div>
                <div className="nl-b-text">
                  <strong>Hiệu quả</strong>
                  <span>Tối ưu nguồn lực, nâng cao năng suất</span>
                </div>
              </div>
            </div>
          </div>

          <div className="nl-card-right">
            <div className="nl-tabs">
              <button type="button" onClick={switchToLogin} className={!isRegister ? "nl-active" : ""}>Đăng nhập</button>
              <button type="button" onClick={switchToRegister} className={isRegister ? "nl-active" : ""}>Đăng ký</button>
            </div>
            
            <div className="nl-form-container">
              {message && <div className="nl-alert-error">{message}</div>}
              {successMessage && <div className="nl-alert-success">{successMessage}</div>}

              <div className="nl-forms-wrapper">
                <form className={`nl-form-pane ${!isRegister ? 'nl-active' : ''}`} onSubmit={handleLogin}>
                  <h3 className="nl-form-title">Chào mừng trở lại! 👋</h3>
                  <p className="nl-form-desc">Đăng nhập để tiếp tục quản lý công trình của bạn.</p>

                  <div className="nl-input-group">
                    <div className="nl-input-icon"><Mail /></div>
                    <input type="email" placeholder="Email hoặc số điện thoại" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>

                  <div className="nl-input-group nl-input-group-pw">
                    <div className="nl-input-icon"><Lock /></div>
                    <input type={showPassword ? "text" : "password"} placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                    <button type="button" className="nl-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>

                  <div className="nl-form-options">
                    <label className="nl-remember">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                      <span>Ghi nhớ đăng nhập</span>
                    </label>
                    <button type="button" className="nl-forgot">Quên mật khẩu?</button>
                  </div>

                  <button type="submit" className="nl-submit-btn" disabled={loading}>
                    {loading ? "Đang đăng nhập..." : "Đang đăng nhập"}
                    {!loading && <ArrowRight />}
                  </button>

                  <div className="nl-divider"><span>Hoặc</span></div>

                  <button type="button" className="nl-google-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Đăng nhập với Google
                  </button>
                </form>

                <form className={`nl-form-pane ${isRegister ? 'nl-active' : ''}`} onSubmit={handleRegister}>
                  <h3 className="nl-form-title">Tạo tài khoản</h3>
                  <p className="nl-form-desc">Đăng ký tài khoản để bắt đầu quản lý công trình của bạn.</p>

                  <div className="nl-input-group">
                    <div className="nl-input-icon"><Users /></div>
                    <input type="text" placeholder="Họ và tên" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>

                  <div className="nl-input-group">
                    <div className="nl-input-icon"><Mail /></div>
                    <input type="email" placeholder="Email hoặc số điện thoại" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>

                  <div className="nl-input-group nl-input-group-pw">
                    <div className="nl-input-icon"><Lock /></div>
                    <input type={showPassword ? "text" : "password"} placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                    <button type="button" className="nl-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>

                  <div className="nl-input-group nl-input-group-pw">
                    <div className="nl-input-icon"><Lock /></div>
                    <input type={showPassword ? "text" : "password"} placeholder="Xác nhận mật khẩu" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
                  </div>

                  <button type="submit" className="nl-submit-btn" style={{marginTop: "calc(var(--u) * 28)"}} disabled={loading}>
                    {loading ? "Đang đăng ký..." : "Đang đăng ký"}
                    {!loading && <ArrowRight />}
                  </button>

                  <div className="nl-divider"><span>Hoặc</span></div>

                  <button type="button" className="nl-google-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Đăng nhập với Google
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
        }

        .nl-login-page {
          --u: clamp(0.8px, min(calc(100vw / 1820), calc(100vh / 865)), 1px);
          position: relative;
          min-height: 100dvh;
          width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
          font-family: inherit;
        }

        .nl-login-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: left bottom;
          z-index: 0;
          pointer-events: none;
        }
        
        .nl-login-page::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.4);
          z-index: 1;
        }

        .nl-main {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr calc(var(--u) * 914);
          align-items: center;
          width: 100%;
          min-height: 100dvh;
          padding: 0 calc(var(--u) * 100) 0 0;
          box-sizing: border-box;
          gap: calc(var(--u) * 32);
        }
        
        .nl-left-column {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          padding: calc(var(--u) * 40) 0 calc(var(--u) * 40) calc(var(--u) * 80);
          box-sizing: border-box;
        }

        /* HERO */
        .nl-hero {
          display: flex;
          flex-direction: column;
          margin-top: calc(var(--u) * 64);
          max-width: calc(var(--u) * 560);
        }

        .nl-header {
          display: flex;
          align-items: center;
          gap: calc(var(--u) * 12);
        }
        
        .nl-logo-img {
          width: calc(var(--u) * 48);
          height: calc(var(--u) * 48);
          object-fit: contain;
        }
        
        .nl-logo-text strong {
          display: block;
          font-size: calc(var(--u) * 20);
          color: #0F1B4C;
          font-weight: 700;
          line-height: 1.25;
        }
        .nl-logo-text span {
          display: block;
          font-size: calc(var(--u) * 16);
          color: #64748b;
          font-weight: 500;
          line-height: 1.25;
        }

        .nl-title {
          font-size: calc(var(--u) * 52);
          font-weight: 700;
          line-height: 1.12;
          margin: 0;
        }
        .nl-title span:first-child {
          color: #0f1f4a;
          display: block;
        }
        .nl-gradient-text {
          display: block;
          background: linear-gradient(90deg, #2563eb, #6d4bf0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .nl-desc {
          font-size: max(12px, calc(var(--u) * 17));
          line-height: 1.45;
          color: #5b6b85;
          max-width: calc(var(--u) * 460);
          margin: calc(var(--u) * 20) 0 0 0;
        }
        
        .nl-features {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: calc(var(--u) * 16);
          max-width: calc(var(--u) * 460);
          margin-top: calc(var(--u) * 40);
        }
        .nl-feature {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          outline: none;
          font-size: max(12px, calc(var(--u) * 14));
          line-height: 1.375;
          color: #1E293B;
        }
        .nl-feature span {
          transition: all 0.3s ease-out;
        }
        .nl-f-icon {
          width: calc(var(--u) * 64);
          height: calc(var(--u) * 64);
          background: rgba(255, 255, 255, 0.9);
          border-radius: calc(var(--u) * 16);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          margin-bottom: calc(var(--u) * 12);
          transition: all 0.3s ease-out;
          will-change: transform, box-shadow;
        }
        .nl-f-icon svg {
          width: calc(var(--u) * 28);
          height: calc(var(--u) * 28);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Hover Effects */
        .nl-feature:hover .nl-f-icon, .nl-feature:focus-visible .nl-f-icon {
          transform: scale(1.15) translateY(calc(var(--u) * -4));
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 2px #bfdbfe;
        }
        .nl-feature:hover .nl-f-icon svg, .nl-feature:focus-visible .nl-f-icon svg {
          transform: scale(1.15);
        }
        .nl-feature:hover span, .nl-feature:focus-visible span {
          color: #1d4ed8;
        }

        @media (prefers-reduced-motion: reduce) {
          .nl-f-icon, .nl-feature:hover .nl-f-icon, .nl-feature:focus-visible .nl-f-icon, .nl-feature span {
            transition: none !important;
            transform: none !important;
          }
        }

        /* AUTH CARD (RIGHT COLUMN) */
        .nl-card {
          width: calc(var(--u) * 914);
          min-height: calc(var(--u) * 780);
          max-height: calc(100dvh - 3rem);
          border-radius: calc(var(--u) * 32);
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(calc(var(--u) * 20));
          -webkit-backdrop-filter: blur(calc(var(--u) * 20));
          border: 1px solid rgba(255,255,255,0.7);
          box-shadow: 0 calc(var(--u) * 30) calc(var(--u) * 80) rgba(37,99,235,0.15);
          display: grid;
          grid-template-columns: calc(var(--u) * 386) 1fr;
          overflow: hidden;
        }

        .nl-card-left {
          background: linear-gradient(180deg, #f8fbfd 0%, #eef5fc 100%);
          padding: calc(var(--u) * 40) calc(var(--u) * 32) calc(var(--u) * 40) calc(var(--u) * 32);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
        }
        .nl-badge {
          display: inline-flex;
          align-items: center;
          gap: calc(var(--u) * 6);
          background: rgba(255,255,255,0.7);
          color: #2563eb;
          padding: calc(var(--u) * 6) calc(var(--u) * 12);
          border-radius: calc(var(--u) * 20);
          font-size: max(12px, calc(var(--u) * 12));
          font-weight: 600;
          width: fit-content;
        }
        .nl-badge svg {
          width: calc(var(--u) * 14);
          height: calc(var(--u) * 14);
        }
        .nl-card-title {
          font-size: calc(var(--u) * 32);
          color: #0f1f4a;
          font-weight: 700;
          margin: calc(var(--u) * 20) 0 0 0;
          line-height: 1.15;
        }
        .nl-card-subtitle {
          font-size: max(12px, calc(var(--u) * 16));
          color: #6b7a90;
          margin: calc(var(--u) * 10) 0 0 0;
          line-height: 1.4;
        }
        .nl-line {
          width: calc(var(--u) * 38);
          height: calc(var(--u) * 2);
          background: #2563eb;
          border-radius: calc(var(--u) * 2);
          margin: calc(var(--u) * 16) 0 calc(var(--u) * 20) 0;
        }
        .nl-illustration {
          width: calc(var(--u) * 360);
          flex: 0 1 auto;
          object-fit: contain;
          margin: calc(var(--u) * 20) auto;
          display: block;
        }
        .nl-benefits {
          display: flex;
          flex-direction: column;
          gap: calc(var(--u) * 24);
        }
        .nl-benefit {
          display: flex;
          gap: calc(var(--u) * 14);
          align-items: center;
        }
        .nl-b-icon {
          width: calc(var(--u) * 50);
          height: calc(var(--u) * 50);
          background: white;
          border-radius: calc(var(--u) * 16);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2563eb;
          flex-shrink: 0;
          box-shadow: 0 calc(var(--u) * 4) calc(var(--u) * 12) rgba(0,0,0,0.04);
        }
        .nl-b-icon svg {
          width: calc(var(--u) * 24);
          height: calc(var(--u) * 24);
        }
        .nl-b-text {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .nl-b-text strong {
          color: #0f1f4a;
          font-size: max(12px, calc(var(--u) * 17));
          font-weight: 500;
          margin-bottom: calc(var(--u) * 2);
        }
        .nl-b-text span {
          color: #8b99ae;
          font-size: max(12px, calc(var(--u) * 12.5));
          white-space: nowrap;
        }

        .nl-card-right {
          padding: calc(var(--u) * 40) calc(var(--u) * 38);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          overflow-y: auto;
        }

        .nl-tabs {
          width: 100%;
          max-width: calc(var(--u) * 420);
          display: flex;
          height: calc(var(--u) * 56);
          background: rgba(255,255,255,0.6);
          border-radius: calc(var(--u) * 28);
          padding: calc(var(--u) * 4);
          box-sizing: border-box;
          margin-bottom: calc(var(--u) * 40);
          flex-shrink: 0;
        }
        .nl-tabs button {
          flex: 1;
          border: none;
          background: transparent;
          font-size: max(12px, calc(var(--u) * 16));
          font-weight: 500;
          color: #6b7a90;
          cursor: pointer;
          border-radius: calc(var(--u) * 24);
          outline: none;
        }
        .nl-tabs button:focus-visible {
          box-shadow: 0 0 0 2px #93c5fd;
        }
        .nl-tabs button.nl-active {
          background: #dbeafe;
          color: #2563eb;
          font-weight: 600;
        }

        .nl-form-container {
          width: 100%;
          max-width: calc(var(--u) * 420);
        }

        .nl-forms-wrapper {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: 1fr;
        }
        .nl-form-pane {
          grid-column: 1;
          grid-row: 1;
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .nl-form-pane.nl-active {
          visibility: visible;
          opacity: 1;
          pointer-events: auto;
        }

        .nl-form-title {
          font-size: calc(var(--u) * 36);
          color: #0f1f4a;
          font-weight: 700;
          margin: 0;
        }
        .nl-form-desc {
          font-size: max(12px, calc(var(--u) * 15));
          color: #7b8aa5;
          margin: calc(var(--u) * 12) 0 calc(var(--u) * 32) 0;
        }

        .nl-input-group {
          position: relative;
          margin-bottom: calc(var(--u) * 20);
        }
        .nl-input-icon {
          position: absolute;
          left: calc(var(--u) * 16);
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          width: calc(var(--u) * 20);
          height: calc(var(--u) * 20);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nl-input-icon svg {
          width: 100%;
          height: 100%;
        }
        .nl-input-group input {
          width: 100%;
          height: calc(var(--u) * 64);
          padding: 0 calc(var(--u) * 48) 0 calc(var(--u) * 48) !important;
          border: 1px solid #e3e9f3;
          border-radius: calc(var(--u) * 16);
          font-size: max(12px, calc(var(--u) * 16));
          color: #0f1f4a;
          background: rgba(255,255,255,0.85);
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        }
        .nl-input-group input:focus {
          border-color: #3b8cf7;
        }
        .nl-input-group input::placeholder {
          color: #94a3b8;
        }
        
        input:-webkit-autofill, input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
          -webkit-text-fill-color: #0f1f4a !important;
        }

        .nl-eye-btn {
          position: absolute;
          right: calc(var(--u) * 16);
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          display: flex;
          width: calc(var(--u) * 20);
          height: calc(var(--u) * 20);
        }
        .nl-eye-btn svg {
          width: 100%;
          height: 100%;
        }

        .nl-form-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: calc(var(--u) * 8);
          margin-bottom: calc(var(--u) * 28);
        }
        .nl-remember {
          display: flex;
          align-items: center;
          gap: calc(var(--u) * 8);
          font-size: max(12px, calc(var(--u) * 14));
          color: #5b6b85;
          cursor: pointer;
        }
        .nl-remember input {
          width: calc(var(--u) * 16);
          height: calc(var(--u) * 16);
          accent-color: #2563eb;
          cursor: pointer;
          border-radius: calc(var(--u) * 4);
        }
        .nl-forgot {
          font-size: max(12px, calc(var(--u) * 14));
          color: #2563eb;
          text-decoration: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }

        .nl-submit-btn {
          width: 100%;
          height: calc(var(--u) * 64);
          background: linear-gradient(90deg, #1d6ff2, #3b8cf7);
          color: white;
          border: none;
          border-radius: calc(var(--u) * 16);
          font-size: max(12px, calc(var(--u) * 16));
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: calc(var(--u) * 8);
          box-shadow: 0 calc(var(--u) * 6) calc(var(--u) * 15) rgba(59,140,247,0.3);
          transition: opacity 0.2s;
        }
        .nl-submit-btn svg {
          width: calc(var(--u) * 18);
          height: calc(var(--u) * 18);
        }
        .nl-submit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .nl-submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .nl-divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: #94a3b8;
          font-size: max(12px, calc(var(--u) * 14));
          margin: calc(var(--u) * 28) 0;
        }
        .nl-divider::before, .nl-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #e3e9f3;
        }
        .nl-divider span {
          padding: 0 calc(var(--u) * 12);
        }

        .nl-google-btn {
          width: 100%;
          height: calc(var(--u) * 64);
          margin-bottom: calc(var(--u) * 8);
          background: white;
          border: 1px solid #e3e9f3;
          border-radius: calc(var(--u) * 16);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: calc(var(--u) * 12);
          font-size: max(12px, calc(var(--u) * 15));
          font-weight: 500;
          color: #0f1f4a;
          cursor: pointer;
          transition: background 0.2s;
        }
        .nl-google-btn svg {
          width: calc(var(--u) * 22);
          height: calc(var(--u) * 22);
        }
        .nl-google-btn:hover {
          background: #f8fafc;
        }

        .nl-alert-error, .nl-alert-success {
          padding: calc(var(--u) * 12);
          border-radius: calc(var(--u) * 8);
          font-size: max(12px, calc(var(--u) * 14));
          margin-bottom: calc(var(--u) * 16);
        }
        .nl-alert-error {
          background: #FEE2E2;
          color: #B91C1C;
          border: 1px solid #FCA5A5;
        }
        .nl-alert-success {
          background: #DCFCE7;
          color: #15803D;
          border: 1px solid #86EFAC;
        }

        /* RESPONSIVE & LOW-HEIGHT ADJUSTMENTS */
        @media (max-height: 850px) {
          .nl-card {
            min-height: 0;
          }
          .nl-input-group input, .nl-submit-btn, .nl-google-btn {
            height: calc(var(--u) * 56) !important;
          }
          .nl-tabs {
            height: calc(var(--u) * 48);
            margin-bottom: calc(var(--u) * 24);
          }
          .nl-input-group {
            margin-bottom: calc(var(--u) * 16);
          }
          .nl-form-options {
            margin-top: calc(var(--u) * 8);
            margin-bottom: calc(var(--u) * 20);
          }
          .nl-divider {
            margin: calc(var(--u) * 20) 0;
          }
          .nl-illustration {
            width: calc(var(--u) * 280);
          }
          .nl-benefits {
            gap: calc(var(--u) * 12);
          }
          .nl-b-icon {
            width: calc(var(--u) * 40);
            height: calc(var(--u) * 40);
          }
          .nl-card-left, .nl-card-right {
            padding: calc(var(--u) * 24);
          }
        }

        @media (max-height: 760px) {
          .nl-card {
            max-height: none;
          }
        }

        @media (max-width: 1099px) {
          .nl-main {
            grid-template-columns: 1fr;
            padding: 40px 20px 60px 20px;
            gap: 40px;
          }
          .nl-card {
            width: min(100%, 640px);
            margin: 0 auto;
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .nl-card-left {
            display: none;
          }
          .nl-title {
            font-size: max(32px, calc(var(--u) * 40));
          }
        }

        @media (max-width: 639px) {
          .nl-tagline, .nl-features {
            display: none;
          }
          .nl-title {
            font-size: 32px;
          }
          .nl-main {
            padding: 20px;
          }
          .nl-header {
            padding-left: 20px;
            padding-right: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
