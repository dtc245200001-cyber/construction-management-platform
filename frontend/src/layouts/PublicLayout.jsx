import React, { useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { Menu, Search, UserRound, X, FolderKanban, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import api from "../lib/api";

export function Logo({ light = false }) {
  return <Link to="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Nền tảng thi công công trình - Trang chủ">
    <svg className="brand-mark" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M4 42h40v3H4zM9 22l8-4v24H9V22ZM20 12l11-7v37H20V12ZM34 14l8 5v23h-8V14Z" fill="currentColor"/>
      <path d="M20 12 31 5l11 14-11-7-11 6v-6Z" fill="currentColor" opacity=".82"/>
      <path d="M25 15v23M38 21v17" stroke="var(--logo-line)" strokeWidth="2"/>
    </svg>
    <span className="brand-copy"><strong>NỀN TẢNG THI CÔNG<br/>CÔNG TRÌNH</strong>{!light && <small>Kết nối nhà thầu - Chủ đầu tư - Kiến tạo tương lai</small>}</span>
  </Link>;
}

export default function PublicLayout({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState("");

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }); 
      setUser(null);
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim() || subscribeLoading) return;
    
    setSubscribeLoading(true);
    setSubscribeMessage("");
    try {
      const res = await api.post('/public/newsletter', { email: email.trim() });
      setSubscribeMessage(res.data.message || "Đăng ký nhận tin thành công!");
      setSubscribed(true);
      setEmail("");
    } catch (error) {
      setSubscribeMessage(error.response?.data?.message || "Đã có lỗi xảy ra, vui lòng thử lại.");
      setSubscribed(false);
    } finally {
      setSubscribeLoading(false);
    }
  };

  const nav = [ 
    ["Trang chủ", "/"], 
    ["Dự án", "/du-an"], 
    ["Nhà thầu", "/nha-thau"], 
    ["Vật tư - Thiết bị", "/vat-tu"], 
    ["Tin tức", "/tin-tuc"], 
    ["Liên hệ", "/lien-he"] 
  ];

  return (
    <div className="site-shell landing-scope">
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <nav className={`main-nav ${mobileMenu ? "nav-open" : ""}`} aria-label="Điều hướng chính">
            {nav.map(([label, href]) => (
              <Link 
                key={label} 
                className={location.pathname === href || (href !== '/' && location.pathname.startsWith(href)) ? "active" : ""} 
                to={href} 
                onClick={() => setMobileMenu(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link className="header-search" to="/du-an" aria-label="Tìm kiếm">
              <Search size={21}/>
            </Link>
            {user ? (
              <>
                {user.is_system_admin && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                    <Shield size={15} style={{ marginRight: '6px' }}/> Quản trị
                  </Button>
                )}
                <Button variant="default" size="sm" onClick={() => navigate('/projects')}>
                  <FolderKanban size={15} style={{ marginRight: '6px' }}/> Dự án của tôi
                </Button>
                <Button variant="outline" size="sm" onClick={handleLogout}>Đăng xuất</Button>
              </>
            ) : (
              <>
                 <Button variant="outline" size="sm" onClick={() => navigate('/login')}><UserRound size={15}/> Đăng nhập</Button>
                 <Button size="sm" onClick={() => navigate('/register')}>Đăng ký</Button>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="mobile-menu-button" aria-label={mobileMenu ? "Đóng menu" : "Mở menu"} onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X/> : <Menu/>}
          </Button>
        </div>
      </header>

      <Outlet />

      <footer id="lien-he" className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo light/>
            <small>© 2025 Nền tảng thi công công trình. Tất cả quyền được bảo lưu.</small>
          </div>
          <div className="footer-column">
            <strong>Về chúng tôi</strong>
            <Link to="/gioi-thieu">Giới thiệu</Link>
            <Link to="/dieu-khoan">Điều khoản sử dụng</Link>
            <Link to="/bao-mat">Chính sách bảo mật</Link>
          </div>
          <div className="footer-column">
            <strong>Hỗ trợ</strong>
            <Link to="/huong-dan">Hướng dẫn sử dụng</Link>
            <Link to="/faq">Câu hỏi thường gặp</Link>
            <Link to="/lien-he">Liên hệ</Link>
          </div>
          <div className="footer-column footer-social">
            <strong>Kết nối với chúng tôi</strong>
            <div>
              <a href="#" aria-label="Facebook" target="_blank" rel="noopener noreferrer">f</a>
              <a href="#" aria-label="YouTube" target="_blank" rel="noopener noreferrer">▶</a>
              <a href="#" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">in</a>
              <a href="#" aria-label="Zalo" target="_blank" rel="noopener noreferrer">Zalo</a>
            </div>
          </div>
          <form className="footer-subscribe" onSubmit={handleSubscribe}>
            <strong>Đăng ký nhận tin</strong>
            <span>Nhận thông tin dự án mới nhất qua email</span>
            <div>
              <input type="email" aria-label="Email nhận tin" placeholder="Nhập email của bạn" value={email} onChange={e => {setEmail(e.target.value); setSubscribed(false); setSubscribeMessage("")}} required disabled={subscribeLoading}/>
              <Button type="submit" size="sm" disabled={subscribeLoading}>{subscribeLoading ? "..." : "Đăng ký"}</Button>
            </div>
            {subscribeMessage && <small className={`subscribe-note ${subscribed ? "text-green-300" : "text-red-300"}`}>{subscribed && <Check size={13}/>} {subscribeMessage}</small>}
          </form>
        </div>
      </footer>
    </div>
  );
}
