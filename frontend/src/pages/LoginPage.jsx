import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import './AuthPages.css';

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
  const [token, setToken] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
      setIsRegister(true); // Tự động mở tab Đăng ký nếu có thư mời
    }

    const oauthError = searchParams.get('oauth_error');
    if (oauthError === 'google_not_configured') {
      setGoogleConfigured(false);
      setMessage('Đăng nhập Google chưa được cấu hình trên máy chủ. Vui lòng dùng email/mật khẩu hoặc liên hệ quản trị viên.');
    } else if (oauthError === 'google_failed') {
      setMessage('Đăng nhập Google thất bại. Vui lòng thử lại hoặc dùng email/mật khẩu.');
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const response = await api.post('/auth/login', { email, password });
      // Xác minh cookie session có được trình duyệt giữ lại không.
      // WebView trong app chat (Zalo/Messenger/Facebook) và chế độ chặn
      // cookie bên thứ ba thường nuốt Set-Cookie cross-site: login vẫn 200
      // nhưng request sau mất session -> user bị đá về login khó hiểu.
      try {
        await api.get('/auth/me');
      } catch (verifyErr) {
        if (verifyErr.response?.status === 401) {
          setMessage("Đăng nhập thành công nhưng trình duyệt đã chặn cookie phiên làm việc. Vui lòng mở link bằng Safari/Chrome (không mở trong Zalo/Messenger), bật cho phép cookie rồi đăng nhập lại.");
          return;
        }
        throw verifyErr;
      }
      setUser(response.data.user);

const redirect = new URLSearchParams(location.search).get('redirect');

navigate(
  redirect?.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/projects',
  { replace: true }
);
    } catch (error) {
      console.error("LOGIN ERROR:", error);
      if (error.response?.status === 429) {
        setMessage("Bạn đã thử đăng nhập quá nhiều lần liên tiếp. Vui lòng chờ vài phút rồi thử lại.");
      } else if (error.response?.status === 423) {
        setMessage(error.response.data.message || "Tài khoản này đang bị khóa tạm thời do nhập sai mật khẩu 5 lần. Vui lòng thử lại sau 15 phút.");
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
      await api.post('/auth/register', { name, email, password, confirmPassword, token });
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

  const handleGoogleLogin = async () => {
    if (googleLoading || loading) return;
    setGoogleLoading(true);
    setMessage("");
    try {
      const res = await api.get('/auth/google/status');
      if (res.data?.configured) {
        window.location.href = '/api/auth/google';
      } else {
        setGoogleConfigured(false);
        setMessage('Đăng nhập Google chưa được cấu hình trên máy chủ. Vui lòng dùng email/mật khẩu hoặc liên hệ quản trị viên.');
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Không thể khởi tạo đăng nhập Google. Vui lòng thử lại sau.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="nl-login-page">
      <img
        src={loginBg}
        className="nl-login-bg"
        alt="Background"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      
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
            
            <img
              src={loginIllustration}
              alt="Illustration"
              className="nl-illustration"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            
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
                    <button type="button" className="nl-forgot" onClick={() => navigate('/forgot-password')}>Quên mật khẩu?</button>
                  </div>

                  <button type="submit" className="nl-submit-btn" disabled={loading}>
                    {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                    {!loading && <ArrowRight />}
                  </button>

                  <div className="nl-divider"><span>Hoặc</span></div>

                  <button type="button" className="nl-google-btn" onClick={handleGoogleLogin} disabled={googleLoading || loading}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {googleLoading ? 'Đang kết nối Google...' : googleConfigured ? 'Đăng nhập với Google' : 'Google chưa được cấu hình'}
                  </button>
                </form>

                <form className={`nl-form-pane ${isRegister ? 'nl-active' : ''}`} onSubmit={handleRegister}>
                  <h3 className="nl-form-title">Tạo tài khoản</h3>
                  <p className="nl-form-desc">Đăng ký tài khoản để bắt đầu quản lý công trình của bạn.</p>

                  {token && (
                    <div className="nl-alert-success" style={{ marginBottom: '16px' }}>
                      Bạn đang đăng ký thông qua thư mời bảo mật.
                    </div>
                  )}

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
                    {loading ? "Đang đăng ký..." : "Đăng ký"}
                    {!loading && <ArrowRight />}
                  </button>

                  <div className="nl-divider"><span>Hoặc</span></div>

                  <button type="button" className="nl-google-btn" onClick={handleGoogleLogin} disabled={googleLoading || loading}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {googleLoading ? 'Đang kết nối Google...' : googleConfigured ? 'Đăng nhập với Google' : 'Google chưa được cấu hình'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
};

export default LoginPage;
