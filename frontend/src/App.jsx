import { useEffect, useState } from "react";
import "./App.css";
import heroImage from "./assets/hero.png";
import CategoryTreeWrapper from "./components/CategoryTreeWrapper";

const API_URL = "http://localhost:3000/api";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Chức năng chọn dự án từ main
  const [projectId, setProjectId] = useState(null);

  // false = đăng nhập
  // true = đăng ký
  const [isRegister, setIsRegister] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // =========================
  // KIỂM TRA SESSION
  // =========================
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error("Không thể kiểm tra session", error);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  // =========================
  // ĐĂNG NHẬP
  // =========================
  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setMessage("");
        setSuccessMessage("");
      } else {
        setMessage(data.message || "Đăng nhập thất bại");
      }
    } catch (error) {
      console.error("LOGIN ERROR:", error);
      setMessage("Không thể kết nối tới máy chủ");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ĐĂNG KÝ
  // =========================
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
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsRegister(false);
        setPassword("");
        setConfirmPassword("");
        setMessage("");

        setSuccessMessage(
          "Đăng ký thành công. Bạn có thể đăng nhập bằng tài khoản vừa tạo."
        );
      } else {
        setMessage(data.message || "Đăng ký thất bại");
      }
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      setMessage("Không thể kết nối tới máy chủ");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ĐĂNG XUẤT
  // =========================
  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      setUser(null);
      setProjectId(null);

      setEmail("");
      setPassword("");
      setConfirmPassword("");

      setMessage("");
      setSuccessMessage("Đăng xuất thành công");
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
      setMessage("Không thể đăng xuất");
    }
  };

  // =========================
  // CHUYỂN SANG ĐĂNG KÝ
  // =========================
  const switchToRegister = () => {
    setIsRegister(true);

    setPassword("");
    setConfirmPassword("");

    setMessage("");
    setSuccessMessage("");
  };

  // =========================
  // CHUYỂN SANG ĐĂNG NHẬP
  // =========================
  const switchToLogin = () => {
    setIsRegister(false);

    setPassword("");
    setConfirmPassword("");

    setMessage("");
    setSuccessMessage("");
  };

  // =========================
  // LOADING
  // =========================
  if (checkingSession) {
    return (
      <div className="loading-page">
        <div className="loading-logo">CM</div>
        <p>Đang tải hệ thống...</p>
      </div>
    );
  }

  // =========================
  // SAU KHI ĐĂNG NHẬP
  // =========================
  if (user) {
    return (
      <div
        className="dashboard"
        style={{
          flexDirection: "column",
          padding: "40px",
          gap: "20px",
          alignItems: "center",
          minHeight: "100vh",
          background: "#f3f4f6",
        }}
      >
        <div
          className="dashboard-card"
          style={{
            width: "100%",
            maxWidth: "800px",
          }}
        >
          <div className="logo-small">CM</div>

          <h1>Hệ thống quản lý thi công</h1>

          <p className="dashboard-success">
            Đăng nhập thành công
          </p>

          <div className="user-info">
            Xin chào <strong>{user.email}</strong>
          </div>

          <button
            onClick={handleLogout}
            className="logout-button"
            style={{
              marginBottom: "20px",
            }}
          >
            Đăng xuất
          </button>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: "800px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* Tạm thời chọn Project demo */}
          {!projectId ? (
            <div
              className="dashboard-card"
              style={{
                textAlign: "center",
              }}
            >
              <p>Vui lòng chọn dự án để xem cây hạng mục</p>

              <button
                className="login-button"
                style={{
                  marginTop: "10px",
                  width: "auto",
                  padding: "10px 20px",
                }}
                onClick={() => setProjectId(1)}
              >
                Tải Dự Án #1 (Demo)
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3>Đang xem dự án #{projectId}</h3>

                <button
                  onClick={() => setProjectId(null)}
                  style={{
                    background: "none",
                    border: "1px solid #ccc",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Đóng dự án
                </button>
              </div>

              <CategoryTreeWrapper projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================
  // LOGIN / REGISTER PAGE
  // =========================
  return (
    <main className="auth-page">
      {/* BACKGROUND */}
      <div
        className="background-photo"
        style={{
          backgroundImage: `url(${heroImage})`,
        }}
      />

      <div className="background-overlay" />

      {/* HEADER */}
      <header className="top-header">
        <div className="main-brand">
          <div className="main-logo">
            <span>C</span>
          </div>

          <div>
            <strong>Construction</strong>
            <span>Management</span>
          </div>
        </div>

        <div className="header-right">
          <span>Better Construction</span>
          <i>•</i>
          <span>Smarter Management</span>

          <button
            className="theme-button"
            type="button"
            aria-label="Giao diện"
          >
            ☼
          </button>

          <button
            className="language-button"
            type="button"
            aria-label="Ngôn ngữ"
          >
            VN
          </button>
        </div>
      </header>

      {/* LEFT CONTENT */}
      <section className="landing-content">
        <div className="hero-copy">
          <h1>
            Kiến tạo công trình,
            <br />
            <span>quản lý hiệu quả</span>
          </h1>

          <p>
            Nền tảng quản lý dự án xây dựng hiện đại,
            giúp bạn kiểm soát tiến độ, nhân sự, chi phí
            và tài nguyên một cách toàn diện.
          </p>

          <div className="feature-grid">
            <div className="feature-item">
              <div className="feature-icon blue">▣</div>
              <span>
                Quản lý
                <br />
                dự án
              </span>
            </div>

            <div className="feature-item">
              <div className="feature-icon purple">▦</div>
              <span>
                Theo dõi
                <br />
                tiến độ
              </span>
            </div>

            <div className="feature-item">
              <div className="feature-icon green">♟</div>
              <span>
                Phân công
                <br />
                nhân sự
              </span>
            </div>

            <div className="feature-item">
              <div className="feature-icon violet">▥</div>
              <span>
                Báo cáo
                <br />
                chi tiết
              </span>
            </div>
          </div>
        </div>

        <div className="video-box">
          <div className="video-text">
            Dự án thành công bắt đầu từ
            <br />
            một nền tảng quản lý tốt.
          </div>

          <button
            type="button"
            className="play-button"
          >
            ▶
          </button>

          <span>Xem giới thiệu</span>
        </div>
      </section>

      {/* MAIN AUTH CARD */}
      <section className="auth-card">
        {/* PANEL GIỚI THIỆU */}
        <aside className="intro-panel">
          <div className="welcome-badge">
            <span></span>
            Welcome to
          </div>

          <h2>
            Construction
            <br />
            Management
          </h2>

          <p>
            Cùng nhau xây dựng những
            <br />
            công trình bền vững
          </p>

          <div className="short-line"></div>

          {/* BUILDING ART */}
          <div className="building-art">
            <div className="building-crane">
              ─────╱
            </div>

            <div className="building">
              <div className="building-top"></div>

              <div className="building-body">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>

            <div className="chart-box">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          {/* BENEFITS */}
          <div className="benefits">
            <div className="benefit">
              <div className="benefit-icon">
                ✓
              </div>

              <div>
                <strong>An toàn</strong>
                <span>
                  Quản lý rủi ro, đảm bảo an toàn lao động
                </span>
              </div>
            </div>

            <div className="benefit">
              <div className="benefit-icon purple-bg">
                ◷
              </div>

              <div>
                <strong>Minh bạch</strong>
                <span>
                  Dữ liệu rõ ràng, theo dõi thời gian thực
                </span>
              </div>
            </div>

            <div className="benefit">
              <div className="benefit-icon people-bg">
                ●
              </div>

              <div>
                <strong>Hiệu quả</strong>
                <span>
                  Tối ưu nguồn lực, nâng cao năng suất
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* FORM PANEL */}
        <section className="form-panel">
          {/* TABS */}
          <div className="auth-tabs">
            <button
              type="button"
              className={!isRegister ? "active" : ""}
              onClick={switchToLogin}
            >
              Đăng nhập
            </button>

            <button
              type="button"
              className={isRegister ? "active" : ""}
              onClick={switchToRegister}
            >
              Đăng ký
            </button>
          </div>

          <div className="form-content">
            <div className="form-heading">
              <h2>
                {isRegister
                  ? "Tạo tài khoản"
                  : "Chào mừng trở lại!"}

                {!isRegister && (
                  <span className="wave">
                    👋
                  </span>
                )}
              </h2>

              <p>
                {isRegister
                  ? "Đăng ký tài khoản để bắt đầu quản lý công trình của bạn."
                  : "Đăng nhập để tiếp tục quản lý công trình của bạn."}
              </p>
            </div>

            <form
              onSubmit={
                isRegister
                  ? handleRegister
                  : handleLogin
              }
            >
              {/* EMAIL */}
              <div className="modern-input">
                <span className="field-icon">
                  ✉
                </span>

                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                />
              </div>

              {/* PASSWORD */}
              <div className="modern-input">
                <span className="field-icon lock-icon">
                  ♙
                </span>

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Mật khẩu"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  minLength={6}
                  required
                />

                <button
                  type="button"
                  className="show-password"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  aria-label="Hiện hoặc ẩn mật khẩu"
                >
                  {showPassword ? "◉" : "⊙"}
                </button>
              </div>

              {/* CONFIRM PASSWORD */}
              {isRegister && (
                <div className="modern-input">
                  <span className="field-icon lock-icon">
                    ♙
                  </span>

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Xác nhận mật khẩu"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    minLength={6}
                    required
                  />
                </div>
              )}

              {/* OPTIONS */}
              {!isRegister && (
                <div className="login-options">
                  <label className="remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) =>
                        setRememberMe(
                          e.target.checked
                        )
                      }
                    />

                    <span>
                      Ghi nhớ đăng nhập
                    </span>
                  </label>

                  <button
                    type="button"
                    className="forgot-password"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
              )}

              {/* ERROR */}
              {message && (
                <div className="message error-message">
                  {message}
                </div>
              )}

              {/* SUCCESS */}
              {successMessage && (
                <div className="message success-message">
                  {successMessage}
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading
                  ? isRegister
                    ? "Đang đăng ký..."
                    : "Đang đăng nhập..."
                  : isRegister
                  ? "Đăng ký"
                  : "Đăng nhập"}

                {!loading && <span>→</span>}
              </button>
            </form>
          </div>

          {/* BOTTOM SWITCH */}
          <div className="form-bottom">
            {isRegister ? (
              <>
                <span>
                  Đã có tài khoản?
                </span>

                <button
                  type="button"
                  onClick={switchToLogin}
                >
                  Đăng nhập ngay
                  <span>→</span>
                </button>
              </>
            ) : (
              <>
                <span>
                  Chưa có tài khoản?
                </span>

                <button
                  type="button"
                  onClick={switchToRegister}
                >
                  Đăng ký ngay
                  <span>→</span>
                </button>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;