import { useState } from "react";
import heroImage from "./assets/hero.png";
import { registerUser } from "./services/api";

function Register({ onNavigate, onRegisterSuccess }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error"); // "error" | "success"
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setMessage("Vui lòng điền đầy đủ tất cả các trường.");
      setMessageType("error");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setMessage("Địa chỉ email không đúng định dạng.");
      setMessageType("error");
      return false;
    }

    if (password.length < 6) {
      setMessage("Mật khẩu phải có ít nhất 6 ký tự.");
      setMessageType("error");
      return false;
    }

    if (password !== confirmPassword) {
      setMessage("Mật khẩu và xác nhận mật khẩu không khớp.");
      setMessageType("error");
      return false;
    }

    return true;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await registerUser(name, email, password);
      setMessage(data.message || "Đăng ký thành công!");
      setMessageType("success");

      if (onRegisterSuccess) {
        // Tự động đăng nhập hoặc chuyển sang dashboard
        setTimeout(() => {
          onRegisterSuccess(data.user);
        }, 800);
      }
    } catch (error) {
      setMessageType("error");
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        setMessage("Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại backend.");
      } else {
        setMessage(error.message || "Đăng ký thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

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
            <span>TẠO TÀI KHOẢN MỚI</span>
            <h1>Đăng ký</h1>
            <p>Điền thông tin để đăng ký tài khoản truy cập hệ thống.</p>
          </div>

          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Họ và tên</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

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
              <label>Mật khẩu</label>
              <div className="input-wrapper">
                <span className="input-icon">●</span>
                <input
                  type="password"
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Xác nhận mật khẩu</label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {message && (
              <div className={`message ${messageType}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Đang xử lý..." : "Đăng ký"}
              {!loading && <span>→</span>}
            </button>
          </form>

          <div className="auth-switch">
            Đã có tài khoản?
            <button
              type="button"
              className="auth-switch-link"
              onClick={() => onNavigate("/login")}
            >
              Đăng nhập
            </button>
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

export default Register;
