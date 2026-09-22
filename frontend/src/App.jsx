import { useEffect, useState } from "react";
import "./App.css";
import heroImage from "./assets/hero.png";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          "http://localhost:3000/api/auth/me",
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

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        "http://localhost:3000/api/auth/login",
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
      } else {
        setMessage(data.message || "Đăng nhập thất bại");
      }
    } catch (error) {
      setMessage("Không thể kết nối tới máy chủ");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:3000/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      setUser(null);
      setEmail("");
      setPassword("");
      setMessage("Đăng xuất thành công");
    } catch (error) {
      setMessage("Không thể đăng xuất");
    }
  };

  if (checkingSession) {
    return <div className="loading-page">Đang tải hệ thống...</div>;
  }

  if (user) {
    return (
      <div className="dashboard">
        <div className="dashboard-card">
          <div className="logo-small">CM</div>

          <h1>Hệ thống quản lý thi công</h1>
          <p>Đăng nhập thành công</p>

          <div className="user-info">
            Xin chào <strong>{user.email}</strong>
          </div>

          <button onClick={handleLogout} className="logout-button">
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">

      <section
        className="login-hero"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="hero-overlay"></div>

        <div className="brand">
          <div className="brand-icon">CM</div>

          <div>
            <h2>Construction Management</h2>
            <span>Quản lý thi công công trình</span>
          </div>
        </div>

        <div className="hero-content">
          <span className="hero-label">NỀN TẢNG QUẢN LÝ XÂY DỰNG</span>

          <h1>
            Quản lý công trình
            <br />
            <span>hiệu quả hơn.</span>
          </h1>

          <p>
            Theo dõi tiến độ, nhân sự, vật tư và toàn bộ hoạt động
            thi công trên một nền tảng duy nhất.
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

      <section className="login-section">

        <div className="login-wrapper">

          <div className="mobile-brand">
            <div className="brand-icon">CM</div>
            <strong>Construction Management</strong>
          </div>

          <div className="welcome">
            <span>CHÀO MỪNG TRỞ LẠI</span>

            <h1>Đăng nhập</h1>

            <p>
              Nhập thông tin tài khoản để truy cập hệ thống quản lý.
            </p>
          </div>

          <form onSubmit={handleLogin}>

            <div className="form-group">
              <label>Email</label>

              <div className="input-wrapper">
                <span className="input-icon">✉</span>

                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="password-label">
                <label>Mật khẩu</label>
                <span>Quên mật khẩu?</span>
              </div>

              <div className="input-wrapper">
                <span className="input-icon">●</span>

                <input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {message && (
              <div className="message">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              {!loading && <span>→</span>}
            </button>

          </form>

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