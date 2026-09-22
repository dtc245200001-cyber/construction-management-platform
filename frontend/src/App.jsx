import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // User đang đăng nhập
  const [user, setUser] = useState(null);

  // Đang kiểm tra session khi mở trang
  const [checkingSession, setCheckingSession] = useState(true);

  // =========================
  // KIỂM TRA SESSION
  // =========================
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          "http://localhost:3000/api/auth/me",
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        setUser(null);
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
        setPassword("");
      } else {
        setMessage(data.message || "Đăng nhập thất bại");
      }
    } catch (error) {
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
      const response = await fetch(
        "http://localhost:3000/api/auth/logout",
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (response.ok) {
        setUser(null);
        setEmail("");
        setPassword("");
        setMessage("Đăng xuất thành công");
      } else {
        setMessage("Đăng xuất thất bại");
      }
    } catch (error) {
      setMessage("Không thể kết nối tới máy chủ");
    }
  };

  // Đợi kiểm tra session
  if (checkingSession) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  // =========================
  // ĐÃ ĐĂNG NHẬP
  // =========================
  if (user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Hệ thống quản lý thi công</h1>

          <p className="subtitle">
            Đăng nhập thành công
          </p>

          <div className="message">
            Xin chào: {user.email}
          </div>

          <button onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  // =========================
  // CHƯA ĐĂNG NHẬP
  // =========================
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Đăng nhập</h1>

        <p className="subtitle">
          Hệ thống quản lý thi công công trình
        </p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Nhập email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>

            <input
              type="password"
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <div className="message">
              {message}
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;