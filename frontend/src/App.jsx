import { useEffect, useState } from "react";
import "./App.css";
import heroImage from "./assets/hero.png";
import CategoryTreeWrapper from "./components/CategoryTreeWrapper";
function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [projectId, setProjectId] = useState(null); // Project ID selected by user

  // false = đăng nhập
  // true = đăng ký
  const [isRegister, setIsRegister] = useState(false);

  // =========================
  // KIỂM TRA SESSION
  // =========================
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          "https://construction-management-platform.onrender.com/api/auth/me",
          {
            credentials: "include",
          }
        );

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
      const response = await fetch(
        "https://construction-management-platform.onrender.com/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

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
      const response = await fetch(
        "https://construction-management-platform.onrender.com/api/auth/register",
        {
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
        }
      );

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
      await fetch("https://construction-management-platform.onrender.com/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      setUser(null);
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
  // CHUYỂN FORM
  // =========================
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

  // =========================
  // LOADING
  // =========================
  if (checkingSession) {
    return (
      <div className="loading-page">
        Đang tải hệ thống...
      </div>
    );
  }

  // =========================
  // ĐÃ ĐĂNG NHẬP
  // =========================
  // ... (inside the App component, after checking user)
  if (user) {
    return (
      <div className="dashboard" style={{ flexDirection: 'column', padding: '40px', gap: '20px', alignItems: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
        <div className="dashboard-card" style={{ width: '100%', maxWidth: '800px' }}>
          <div className="logo-small">CM</div>

          <h1>Hệ thống quản lý thi công</h1>

          <p>Đăng nhập thành công</p>

          <div className="user-info">
            Xin chào <strong>{user.email}</strong>
          </div>

          <button
            onClick={handleLogout}
            className="logout-button"
            style={{ marginBottom: '20px' }}
          >
            Đăng xuất
          </button>
        </div>

        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tạm thời cung cấp UI chọn Project do chức năng chọn dự án chưa có (nằm ngoài phạm vi T-09) */}
          {!projectId ? (
            <div className="dashboard-card" style={{ textAlign: 'center' }}>
              <p>Vui lòng chọn dự án để xem cây hạng mục</p>
              <button 
                className="login-button" 
                style={{ marginTop: '10px', width: 'auto', padding: '10px 20px' }}
                onClick={() => setProjectId(1)}
              >
                Tải Dự Án #1 (Demo)
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Đang xem dự án #{projectId}</h3>
                <button 
                  onClick={() => setProjectId(null)}
                  style={{ background: 'none', border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
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
    <div className="login-page">

      {/* =========================
          BÊN TRÁI
      ========================= */}
      <section
        className="login-hero"
        style={{
          backgroundImage: `url(${heroImage})`,
        }}
      >
        <div className="hero-overlay"></div>

        <div className="brand">
          <div className="brand-icon">
            CM
          </div>

          <div>
            <h2>
              Construction Management
            </h2>

            <span>
              Quản lý thi công công trình
            </span>
          </div>
        </div>

        <div className="hero-content">
          <span className="hero-label">
            NỀN TẢNG QUẢN LÝ XÂY DỰNG
          </span>

          <h1>
            Quản lý công trình
            <br />

            <span>
              hiệu quả hơn.
            </span>
          </h1>

          <p>
            Theo dõi tiến độ, nhân sự, vật tư
            và toàn bộ hoạt động thi công trên
            một nền tảng duy nhất.
          </p>

          <div className="hero-stats">

            <div>
              <strong>50+</strong>
              <span>Dự án</span>
            </div>

            <div>
              <strong>1.200+</strong>
              <span>Nhân sự</span>
            </div>

            <div>
              <strong>98%</strong>
              <span>Đúng tiến độ</span>
            </div>

          </div>
        </div>

        <div className="hero-footer">
          Hệ thống quản lý thi công công trình
        </div>
      </section>

      {/* =========================
          BÊN PHẢI
      ========================= */}
      <section className="login-section">

        <div className="login-wrapper">

          <div className="mobile-brand">
            <div className="brand-icon">
              CM
            </div>

            <strong>
              Construction Management
            </strong>
          </div>

          {/* =========================
              TIÊU ĐỀ
          ========================= */}
          <div className="welcome">

            <span>
              {isRegister
                ? "TẠO TÀI KHOẢN"
                : "CHÀO MỪNG TRỞ LẠI"}
            </span>

            <h1>
              {isRegister
                ? "Đăng ký"
                : "Đăng nhập"}
            </h1>

            <p>
              {isRegister
                ? "Tạo tài khoản để truy cập hệ thống quản lý."
                : "Nhập thông tin tài khoản để truy cập hệ thống quản lý."}
            </p>

          </div>

          {/* =========================
              FORM
          ========================= */}
          <form
            onSubmit={
              isRegister
                ? handleRegister
                : handleLogin
            }
          >

            {/* EMAIL */}
            <div className="form-group">

              <label>Email</label>

              <div className="input-wrapper">

                <span className="input-icon">
                  ✉
                </span>

                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                />

              </div>
            </div>

            {/* MẬT KHẨU */}
            <div className="form-group">

              <div className="password-label">

                <label>
                  Mật khẩu
                </label>

                {!isRegister && (
                  <span>
                    Quên mật khẩu?
                  </span>
                )}

              </div>

              <div className="input-wrapper">

                <span className="input-icon">
                  ●
                </span>

                <input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  required
                  minLength={6}
                />

              </div>
            </div>

            {/* XÁC NHẬN MẬT KHẨU */}
            {isRegister && (
              <div className="form-group">

                <label>
                  Xác nhận mật khẩu
                </label>

                <div className="input-wrapper">

                  <span className="input-icon">
                    ●
                  </span>

                  <input
                    type="password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    required
                    minLength={6}
                  />

                </div>
              </div>
            )}

            {/* THÔNG BÁO LỖI */}
            {message && (
              <div className="message">
                {message}
              </div>
            )}

            {/* THÔNG BÁO THÀNH CÔNG */}
            {successMessage && (
              <div className="message success-message">
                {successMessage}
              </div>
            )}

            {/* BUTTON */}
            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >

              {loading
                ? isRegister
                  ? "Đang đăng ký..."
                  : "Đang đăng nhập..."
                : isRegister
                ? "Đăng ký tài khoản"
                : "Đăng nhập"}

              {!loading && (
                <span>→</span>
              )}

            </button>

          </form>

          {/* =========================
              CHUYỂN LOGIN / REGISTER
          ========================= */}
          <div
            style={{
              textAlign: "center",
              marginTop: "22px",
              fontSize: "14px",
            }}
          >

            {isRegister ? (
              <>
                Đã có tài khoản?{" "}

                <button
                  type="button"
                  onClick={switchToLogin}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontWeight: "700",
                    color: "#2563eb",
                    padding: "0",
                  }}
                >
                  Đăng nhập
                </button>
              </>
            ) : (
              <>
                Chưa có tài khoản?{" "}

                <button
                  type="button"
                  onClick={switchToRegister}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontWeight: "700",
                    color: "#2563eb",
                    padding: "0",
                  }}
                >
                  Đăng ký ngay
                </button>
              </>
            )}

          </div>

          <div className="login-footer">
            <span></span>

            Bảo mật & quản lý tập trung

            <span></span>
          </div>

        </div>

        <p className="copyright">
          © 2026 Construction Management Platform
        </p>

      </section>

    </div>
  );
}

export default App;