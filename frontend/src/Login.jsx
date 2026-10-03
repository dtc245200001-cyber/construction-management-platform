import { useState } from "react";
import heroImage from "./assets/hero.png";
import logoIcon from "./assets/logo.svg";
import { loginUser } from "./services/api";
import {
  Building2,
  Calendar,
  Users,
  BarChart3,
  ShieldCheck,
  Clock,
  TrendingUp,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Play,
} from "lucide-react";

function Login({ onNavigate, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setMessage("Vui lòng nhập email và mật khẩu");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await loginUser(email, password);
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        setMessage("Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại backend.");
      } else {
        setMessage(error.message || "Đăng nhập thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper-root">
      {/* Background & Overlay */}
      <div
        className="login-bg-layer"
        style={{ backgroundImage: `url('/bg-construction.png'), url(${heroImage})` }}
      />
      <div className="login-overlay-layer" />

      {/* Row 1: Header */}
      <header className="main-header">
        <div className="left-brand-header">
          <img src={logoIcon} alt="Logo" className="brand-logo-img" />
          <div className="brand-text-wrapper">
            <span className="brand-title">Construction</span>
            <span className="brand-sub">Management</span>
          </div>
        </div>
      </header>

      {/* Row 2: Content Container */}
      <div className="main-content-row">
        {/* ================= NỬA BÊN TRÁI: NỘI DUNG ================= */}
        <section className="login-left-hero">
          <div className="left-hero-body">
            <div className="hero-pill-badge">
              <span className="pill-dot"></span>
              <span>NỀN TẢNG QUẢN LÝ XÂY DỰNG</span>
            </div>

            <h1 className="hero-main-heading">
              Kiến tạo công trình,
              <br />
              <span className="heading-highlight">quản lý hiệu quả</span>
            </h1>

            <p className="hero-subtext">
              Nền tảng quản lý dự án xây dựng hiện đại, giúp bạn kiểm soát tiến độ,
              nhân sự, chi phí và tài nguyên một cách toàn diện.
            </p>

            {/* 4 cột icon tính năng xếp ngang */}
            <div className="hero-feature-columns">
              <div className="feature-column-item">
                <div className="feature-icon-box icon-blue">
                  <Building2 size={22} />
                </div>
                <span className="feature-column-label">
                  Quản lý<br />dự án
                </span>
              </div>

              <div className="feature-column-item">
                <div className="feature-icon-box icon-indigo">
                  <Calendar size={22} />
                </div>
                <span className="feature-column-label">
                  Theo dõi<br />tiến độ
                </span>
              </div>

              <div className="feature-column-item">
                <div className="feature-icon-box icon-teal">
                  <Users size={22} />
                </div>
                <span className="feature-column-label">
                  Phân công<br />nhân sự
                </span>
              </div>

              <div className="feature-column-item">
                <div className="feature-icon-box icon-purple">
                  <BarChart3 size={22} />
                </div>
                <span className="feature-column-label">
                  Báo cáo<br />chi tiết
                </span>
              </div>
            </div>
          </div>

          {/* Banner giới thiệu video */}
          <div className="intro-video-banner">
            <div className="video-banner-left">
              <div className="banner-accent-bar"></div>
              <span>
                Dự án thành công bắt đầu từ
                <br />
                một nền tảng quản lý tốt.
              </span>
            </div>
            <div className="video-banner-action">
              <button
                type="button"
                className="banner-play-btn"
                aria-label="Xem giới thiệu"
              >
                <Play size={15} fill="currentColor" />
              </button>
              <span className="play-label">Xem giới thiệu</span>
            </div>
          </div>
        </section>

        {/* ================= NỬA BÊN PHẢI: AUTH CARD ================= */}
        <section className="login-right-content">
          <div className="auth-card-box">
            {/* Cột trái Card: Tòa nhà /building.png + 3 tính năng dọc */}
            <aside className="card-left-column">
              <div className="card-welcome-tag">
                <span className="welcome-tag-circle"></span>
                <span>Welcome to</span>
              </div>

              <h2 className="card-intro-title">
                Construction
                <br />
                Management
              </h2>

              <p className="card-intro-desc">
                Cùng nhau xây dựng những
                <br />
                công trình bền vững
              </p>

              <div className="card-divider-line"></div>

              {/* Ảnh minh họa tòa nhà */}
              <div className="building-visual-wrapper">
                <img
                  src="/building.png"
                  alt="Building Illustration"
                  className="building-illustration-img"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.parentElement?.querySelector(".building-fallback-icon");
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div className="building-fallback-icon" style={{ display: "none" }}>
                  <Building2 size={70} color="#1d6fdc" />
                </div>
              </div>

              {/* 3 tính năng dọc */}
              <div className="vertical-benefits-list">
                <div className="benefit-row-item">
                  <div className="benefit-icon-cube icon-shield">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="benefit-info">
                    <strong>An toàn</strong>
                    <span>Quản lý rủi ro, đảm bảo an toàn lao động</span>
                  </div>
                </div>

                <div className="benefit-row-item">
                  <div className="benefit-icon-cube icon-clock">
                    <Clock size={18} />
                  </div>
                  <div className="benefit-info">
                    <strong>Minh bạch</strong>
                    <span>Dữ liệu rõ ràng, theo dõi thời gian thực</span>
                  </div>
                </div>

                <div className="benefit-row-item">
                  <div className="benefit-icon-cube icon-trend">
                    <TrendingUp size={18} />
                  </div>
                  <div className="benefit-info">
                    <strong>Hiệu quả</strong>
                    <span>Tối ưu nguồn lực, nâng cao năng suất</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Cột phải Card: Form đăng nhập */}
            <div className="card-right-column">
              {/* Header Tabs: Đăng nhập / Đăng ký */}
              <div className="auth-tab-switch">
                <button
                  type="button"
                  className="tab-item active"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  className="tab-item"
                  onClick={() => onNavigate("/register")}
                >
                  Đăng ký
                </button>
              </div>

              <div className="card-form-content">
                <div className="form-greeting">
                  <h3>
                    Chào mừng trở lại! <span className="greeting-wave">👋</span>
                  </h3>
                  <p>Đăng nhập để tiếp tục quản lý công trình của bạn.</p>
                </div>

                <form onSubmit={handleLogin} className="main-auth-form">
                  {/* Email */}
                  <div className="form-input-group">
                    <label className="input-field-label">Email</label>
                    <div className="input-control-box">
                      <span className="input-prefix-icon">
                        <Mail size={18} />
                      </span>
                      <input
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="form-input-group">
                    <label className="input-field-label">Mật khẩu</label>
                    <div className="input-control-box">
                      <span className="input-prefix-icon">
                        <Lock size={18} />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Nhập mật khẩu của bạn"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="password-reveal-button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me & Forgot Password */}
                  <div className="form-utility-row">
                    <label className="checkbox-remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Ghi nhớ đăng nhập</span>
                    </label>
                    <button
                      type="button"
                      className="btn-forgot-password"
                      onClick={() => {}}
                    >
                      Quên mật khẩu?
                    </button>
                  </div>

                  {/* Error Notification */}
                  {message && (
                    <div className="auth-error-alert" role="alert">
                      <span className="alert-circle-icon">!</span>
                      <span className="alert-text-content">{message}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="auth-primary-submit-btn"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="auth-btn-spinner" />
                        <span>Đang đăng nhập...</span>
                      </>
                    ) : (
                      <>
                        <span>Đăng nhập</span>
                        <ArrowRight size={18} className="btn-arrow" />
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Form Bottom Link */}
              <div className="card-bottom-bar">
                <span>Chưa có tài khoản?</span>
                <button
                  type="button"
                  className="btn-link-register"
                  onClick={() => onNavigate("/register")}
                >
                  Đăng ký ngay <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Scoped CSS Styles for Login Page */}
      <style>{`
        /* ================= ROOT & BACKGROUND ================= */
        html, body { margin: 0; }
        html { scrollbar-gutter: stable; }

        .login-wrapper-root {
          position: relative;
          width: 100%;
          min-height: 100dvh;
          box-sizing: border-box;
          overflow-x: hidden;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #0c2344;
          background: #eef5ff;
          display: grid;
          grid-template-rows: auto 1fr;
        }

        .login-bg-layer {
          position: fixed;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          z-index: 0;
          transform: scale(1.02);
        }

        .login-overlay-layer {
          position: fixed;
          inset: 0;
          z-index: 1;
          /* Gradient trắng/xám mờ dần từ phải sang trái làm nổi bật form bên phải */
          background: linear-gradient(
            to left,
            rgba(240, 245, 252, 0.98) 0%,
            rgba(241, 246, 253, 0.92) 38%,
            rgba(244, 249, 255, 0.76) 72%,
            rgba(255, 255, 255, 0.58) 100%
          );
          pointer-events: none;
        }

        /* ================= ROW 1: HEADER ================= */
        .main-header {
          position: relative;
          z-index: 2;
          padding: 24px 48px 16px 48px;
          box-sizing: border-box;
        }

        .left-brand-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-logo-img {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }

        .brand-text-wrapper {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-size: 20px;
          font-weight: 800;
          color: #071d3b;
          line-height: 1.15;
          letter-spacing: -0.3px;
        }

        .brand-sub {
          font-size: 14px;
          font-weight: 600;
          color: #526b8f;
        }

        /* ================= ROW 2: CONTENT ================= */
        .main-content-row {
          position: relative;
          z-index: 2;
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 48px;
          padding: 0 48px 32px 48px;
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .login-left-hero {
          display: flex;
          flex-direction: column;
        }

        .left-hero-body {
          max-width: 580px;
        }

        .hero-pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(22, 119, 255, 0.08);
          border: 1px solid rgba(22, 119, 255, 0.2);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          color: #1677ff;
          letter-spacing: 0.8px;
          margin-bottom: 22px;
        }

        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #1677ff;
          box-shadow: 0 0 8px #1677ff;
        }

        .hero-main-heading {
          margin: 0;
          font-size: clamp(34px, 3.5vw, 54px);
          font-weight: 800;
          line-height: 1.12;
          color: #071d3b;
          letter-spacing: -1.8px;
        }

        .heading-highlight {
          color: #1677ff;
        }

        .hero-subtext {
          margin: 22px 0 36px;
          font-size: 16px;
          line-height: 1.65;
          color: #4e6382;
          max-width: 520px;
        }

        /* 4 cột tính năng ngang */
        .hero-feature-columns {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          max-width: 540px;
        }

        .feature-column-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .feature-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 22px rgba(35, 83, 145, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          border: 1px solid rgba(255, 255, 255, 0.9);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .feature-column-item:hover .feature-icon-box {
          transform: translateY(-3px);
          box-shadow: 0 12px 26px rgba(35, 83, 145, 0.16);
        }

        .icon-blue {
          color: #1677ff;
        }

        .icon-indigo {
          color: #4b54e8;
        }

        .icon-teal {
          color: #0ea5e9;
        }

        .icon-purple {
          color: #8b5cf6;
        }

        .feature-column-label {
          font-size: 13px;
          font-weight: 700;
          color: #172c49;
          line-height: 1.35;
        }

        /* Video banner */
        .intro-video-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(90deg, rgba(18, 38, 64, 0.93) 0%, rgba(26, 47, 75, 0.88) 100%);
          backdrop-filter: blur(12px);
          padding: 16px 22px;
          border-radius: 14px;
          color: #ffffff;
          box-shadow: 0 16px 36px rgba(9, 27, 52, 0.22);
          max-width: 440px;
          margin-top: 24px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .video-banner-left {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 500;
        }

        .banner-accent-bar {
          width: 3px;
          height: 34px;
          background: #1677ff;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .video-banner-action {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .banner-play-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: none;
          background: #ffffff;
          color: #1677ff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s, background-color 0.2s;
        }

        .banner-play-btn:hover {
          transform: scale(1.08);
          background: #f0f6ff;
        }

        .play-label {
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
          white-space: nowrap;
        }

        /* ================= NỬA BÊN PHẢI: AUTH CARD ================= */
        .login-right-content {
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }

        .auth-card-box {
          width: 780px;
          max-width: 100%;
          height: clamp(600px, calc(100dvh - 9rem), 740px);
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 30px 70px rgba(35, 75, 130, 0.14);
          display: grid;
          grid-template-columns: 290px 1fr;
          overflow: hidden;
          transition: box-shadow 0.3s ease;
        }

        /* --- Cột trái Card: Tòa nhà & Tính năng --- */
        .card-left-column {
          background: linear-gradient(180deg, #eaf3ff 0%, #f4f8fe 100%);
          padding: 36px 28px 30px;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #edf2f9;
          position: relative;
        }

        .card-welcome-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 16px;
          font-size: 11px;
          font-weight: 700;
          color: #1677ff;
          width: fit-content;
        }

        .welcome-tag-circle {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #1677ff;
        }

        .card-intro-title {
          margin: 16px 0 8px;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.15;
          color: #071d3b;
          letter-spacing: -0.6px;
        }

        .card-intro-desc {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          color: #627896;
        }

        .card-divider-line {
          width: 28px;
          height: 3px;
          background: #1677ff;
          border-radius: 2px;
          margin: 16px 0 20px;
        }

        .building-visual-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 10px 0 22px;
          flex: 1;
          min-height: 0;
        }

        .building-illustration-img {
          width: 100%;
          max-width: 190px;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 12px 24px rgba(22, 119, 255, 0.16));
        }

        .building-fallback-icon {
          width: 120px;
          height: 120px;
          border-radius: 20px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px rgba(22, 119, 255, 0.12);
        }

        .vertical-benefits-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-top: auto;
        }

        .benefit-row-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .benefit-icon-cube {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(35, 75, 130, 0.08);
        }

        .icon-shield {
          color: #1677ff;
        }

        .icon-clock {
          color: #5551f3;
        }

        .icon-trend {
          color: #0ea5e9;
        }

        .benefit-info {
          display: flex;
          flex-direction: column;
        }

        .benefit-info strong {
          font-size: 12px;
          font-weight: 700;
          color: #172c49;
        }

        .benefit-info span {
          font-size: 10px;
          color: #7b8ea8;
          line-height: 1.35;
          margin-top: 1px;
        }

        /* --- Cột phải Card: Form đăng nhập --- */
        .card-right-column {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          overflow-y: auto;
        }

        .auth-tab-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          height: 72px;
          padding: 0 36px;
          border-bottom: 1px solid #edf2f9;
        }

        .tab-item {
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 700;
          color: #7889a2;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .tab-item:hover {
          color: #1677ff;
        }

        .tab-item.active {
          color: #1677ff;
        }

        .tab-item.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 3px;
          background: #1677ff;
          border-radius: 3px;
        }

        .card-form-content {
          padding: 36px 36px 24px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .form-greeting h3 {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #0c2344;
          letter-spacing: -0.4px;
        }

        .greeting-wave {
          display: inline-block;
          animation: wave-hand 2.2s infinite;
          transform-origin: 70% 70%;
        }

        @keyframes wave-hand {
          0%, 60%, 100% { transform: rotate(0deg); }
          10%, 30% { transform: rotate(14deg); }
          20% { transform: rotate(-10deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(10deg); }
        }

        .form-greeting p {
          margin: 8px 0 28px;
          font-size: 13px;
          color: #71839e;
        }

        .main-auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-field-label {
          font-size: 12px;
          font-weight: 700;
          color: #1a2d48;
        }

        .input-control-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-prefix-icon {
          position: absolute;
          left: 16px;
          color: #6f84a2;
          pointer-events: none;
          display: flex;
          align-items: center;
        }

        .input-control-box input {
          width: 100%;
          height: 56px;
          padding: 0 46px 0 46px;
          border: 1px solid #d9e2ee;
          border-radius: 12px;
          background: #ffffff;
          font-size: 13px;
          color: #1d314e;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-control-box input::placeholder {
          color: #98a7bc;
        }

        .input-control-box input:focus {
          border-color: #1677ff;
          box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12);
        }

        .password-reveal-button {
          position: absolute;
          right: 14px;
          border: none;
          background: transparent;
          color: #7186a5;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 6px;
          border-radius: 6px;
          transition: color 0.2s;
        }

        .password-reveal-button:hover {
          color: #1677ff;
        }

        .form-utility-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          margin-top: -2px;
        }

        .checkbox-remember {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: #253953;
          font-weight: 500;
        }

        .checkbox-remember input {
          width: 16px;
          height: 16px;
          accent-color: #1677ff;
          cursor: pointer;
        }

        .btn-forgot-password {
          border: none;
          background: transparent;
          color: #1677ff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: opacity 0.2s;
        }

        .btn-forgot-password:hover {
          opacity: 0.8;
          text-decoration: underline;
        }

        /* Error Banner */
        .auth-error-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #fff2f2;
          border: 1px solid #ffd4d4;
          border-radius: 10px;
          color: #d32f2f;
          font-size: 12px;
          line-height: 1.4;
          animation: shake 0.3s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        .alert-circle-icon {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #d32f2f;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 11px;
          flex-shrink: 0;
        }

        .alert-text-content {
          flex: 1;
        }

        /* Submit Button */
        .auth-primary-submit-btn {
          width: 100%;
          height: 56px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(100deg, #1677ff 0%, #4b54e8 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(22, 119, 255, 0.25);
          transition: transform 0.2s, box-shadow 0.2s;
          margin-top: 6px;
        }

        .auth-primary-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(22, 119, 255, 0.32);
        }

        .auth-primary-submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .btn-arrow {
          transition: transform 0.2s;
        }

        .auth-primary-submit-btn:hover:not(:disabled) .btn-arrow {
          transform: translateX(4px);
        }

        .auth-btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Bottom Bar Switch */
        .card-bottom-bar {
          min-height: 60px;
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-top: 1px solid #edf2f9;
          font-size: 12px;
          color: #8293a8;
          padding: 12px;
        }

        .btn-link-register {
          border: none;
          background: transparent;
          color: #1677ff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: gap 0.2s;
        }

        .btn-link-register:hover {
          gap: 9px;
          text-decoration: underline;
        }

        /* ================= RESPONSIVE HEIGHTS ================= */
        @media (max-height: 900px) {
          .input-control-box input,
          .auth-primary-submit-btn {
            height: 48px;
          }
          .main-auth-form {
            gap: 12px;
          }
          .form-greeting h3 {
            font-size: 30px;
          }
        }

        @media (max-height: 760px) {
          .auth-card-box {
            height: auto;
          }
        }

        /* ================= RESPONSIVE ================= */
        @media (max-width: 1100px) {
          .main-content-row {
            padding: 0 24px 24px 24px;
            gap: 24px;
          }

          .hero-main-heading {
            font-size: 38px;
          }

          .auth-card-box {
            grid-template-columns: 250px 1fr;
          }
        }

        /* MOBILE & TABLET: Ẩn nửa bên trái, chỉ hiển thị Card đăng nhập ra giữa màn hình */
        @media (max-width: 900px) {
          .login-left-hero {
            display: none !important;
          }

          .main-content-row {
            grid-template-columns: 1fr;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .login-right-content {
            width: 100%;
            padding: 24px 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .auth-card-box {
            max-width: 520px;
            grid-template-columns: 1fr;
            min-height: auto;
            border-radius: 20px;
            box-shadow: 0 20px 50px rgba(18, 48, 88, 0.15);
          }

          .card-left-column {
            display: none !important;
          }

          .card-form-content {
            padding: 30px 24px 20px;
          }
        }
      `}</style>
    </div>
  );
}

export default Login;
