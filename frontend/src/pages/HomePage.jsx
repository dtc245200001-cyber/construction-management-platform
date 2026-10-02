import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, Check, ChevronDown, ClipboardList, FileText, Handshake, Headphones, MapPin, Menu, Newspaper, Search, Settings, ShieldPlus, UserRound, UsersRound, X, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./HomePage.css"; // The scoped CSS

import heroImage from "@/assets/construction-hero.jpg";
import bridgeImage from "@/assets/bridge-project.jpg";
import urbanImage from "@/assets/urban-project.jpg";
import factoryImage from "@/assets/factory-project.jpg";
import contractorImage from "@/assets/contractor-banner.jpg";

const projects = [
  { id: 1, name: "Cầu vượt sông Hồng", city: "Hà Nội", place: "Hà Nội", type: "Hạ tầng giao thông", start: "01/2024", finish: "12/2026", status: "Đang thi công", color: "green", image: bridgeImage, description: "Dự án cầu vượt sông Hồng kết nối các khu vực trọng điểm, góp phần phát triển hạ tầng giao thông đô thị." },
  { id: 2, name: "Khu đô thị Vinhomes Green City", city: "TP. Hồ Chí Minh", place: "TP. Hồ Chí Minh", type: "Khu đô thị", start: "06/2025", finish: "12/2030", status: "Chuẩn bị đầu tư", color: "blue", image: urbanImage, description: "Khu đô thị hiện đại với không gian sống xanh, tiện ích đồng bộ và hệ thống hạ tầng hoàn chỉnh." },
  { id: 3, name: "Nhà máy sản xuất linh kiện điện tử", city: "Bắc Ninh", place: "Bắc Ninh", type: "Công nghiệp", start: "08/2025", finish: "12/2027", status: "Đang đấu thầu", color: "orange", image: factoryImage, description: "Tổ hợp nhà máy sản xuất linh kiện điện tử với quy mô lớn tại khu công nghiệp Bắc Ninh." },
];

const news = [
  { title: "Ngành xây dựng Việt Nam tiếp tục tăng trưởng trong năm 2025", date: "15/08/2025", image: bridgeImage },
  { title: "Những xu hướng công nghệ mới trong thi công công trình", date: "10/08/2025", image: urbanImage },
  { title: "Hội thảo kết nối nhà thầu và chủ đầu tư năm 2025", date: "05/08/2025", image: contractorImage },
];

function Logo({ light = false }) {
  return <a href="#trang-chu" className={`brand ${light ? "brand-light" : ""}`} aria-label="Nền tảng thi công công trình - Trang chủ">
    <svg className="brand-mark" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M4 42h40v3H4zM9 22l8-4v24H9V22ZM20 12l11-7v37H20V12ZM34 14l8 5v23h-8V14Z" fill="currentColor"/>
      <path d="M20 12 31 5l11 14-11-7-11 6v-6Z" fill="currentColor" opacity=".82"/>
      <path d="M25 15v23M38 21v17" stroke="var(--logo-line)" strokeWidth="2"/>
    </svg>
    <span className="brand-copy"><strong>NỀN TẢNG THI CÔNG<br/>CÔNG TRÌNH</strong>{!light && <small>Kết nối nhà thầu - Chủ đầu tư - Kiến tạo tương lai</small>}</span>
  </a>;
}

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Tất cả địa điểm");
  const [type, setType] = useState("Tất cả loại dự án");
  const [submitted, setSubmitted] = useState(false);

  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = !submitted || p.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")) || p.type.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"));
      const matchesLoc = location === "Tất cả địa điểm" || p.place === location;
      const matchesType = type === "Tất cả loại dự án" || p.type === type;
      return matchesSearch && matchesLoc && matchesType;
    });
  }, [query, location, type, submitted]);

  const handleLogout = async () => {
    try {
      // Gọi qua api thay vì api.post
      await fetch('/api/auth/logout', { method: 'POST' }); 
      setUser(null);
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
    }
  };

  const nav = [ ["Trang chủ", "#trang-chu"], ["Dự án", "#du-an"], ["Nhà thầu", "#nha-thau"], ["Vật tư - Thiết bị", "#loi-ich"], ["Tin tức", "#tin-tuc"], ["Liên hệ", "#lien-he"] ];

  return <div id="trang-chu" className="site-shell landing-scope">
    <header className="site-header"><div className="header-inner">
      <Logo />
      <nav className={`main-nav ${mobileMenu ? "nav-open" : ""}`} aria-label="Điều hướng chính">{nav.map(([label, href], i) => <a key={label} className={i === 0 ? "active" : ""} href={href} onClick={() => setMobileMenu(false)}>{label}</a>)}</nav>
      <div className="header-actions">
        <a className="header-search" href="#tim-kiem" aria-label="Tìm kiếm"><Search size={21}/></a>
        {user ? (
          <>
             <span style={{ fontSize: '13px', fontWeight: 600, display: 'none' }}>Chào, {user.name}</span>
             <Button variant="default" size="sm" onClick={() => navigate('/projects')}><FolderKanban size={15} style={{ marginRight: '6px' }}/> Dự án của tôi</Button>
             <Button variant="outline" size="sm" onClick={handleLogout}>Đăng xuất</Button>
          </>
        ) : (
          <>
             <Button variant="outline" size="sm" onClick={() => navigate('/login')}><UserRound size={15}/> Đăng nhập</Button>
             <Button size="sm" onClick={() => navigate('/register')}>Đăng ký</Button>
          </>
        )}
      </div>
      <Button variant="ghost" size="icon" className="mobile-menu-button" aria-label={mobileMenu ? "Đóng menu" : "Mở menu"} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X/> : <Menu/>}</Button>
    </div></header>

    <section className="hero" aria-label="Tìm kiếm dự án xây dựng">
      <img src={heroImage} width={1920} height={600} alt="Công trình đang thi công với cần cẩu trong ánh hoàng hôn" className="hero-photo" />
      <div className="hero-shade"/><div className="hero-inner">
        <h1>Tìm kiếm, kết nối và triển khai<br className="desktop-break"/> các dự án xây dựng</h1>
        <p>Nền tảng giúp các nhà thầu, chủ đầu tư và đối tác trong ngành xây dựng<br className="desktop-break"/> dễ dàng tìm kiếm dự án, trao đổi, hợp tác và phát triển bền vững.</p>
        <form id="tim-kiem" className="search-panel" onSubmit={e => { e.preventDefault(); setSubmitted(true); document.getElementById("du-an")?.scrollIntoView({ behavior: "smooth" }); }}>
          <label className="search-field search-keyword"><Search size={21}/><input aria-label="Tìm kiếm dự án, nhà thầu, vật tư" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm dự án, nhà thầu, vật tư..." /></label>
          <label className="search-field select-field"><MapPin size={19}/><select aria-label="Địa điểm" value={location} onChange={e => setLocation(e.target.value)}><option>Tất cả địa điểm</option><option>Hà Nội</option><option>TP. Hồ Chí Minh</option><option>Bắc Ninh</option></select><ChevronDown size={15}/></label>
          <label className="search-field select-field"><Building2 size={18}/><select aria-label="Loại dự án" value={type} onChange={e => setType(e.target.value)}><option>Tất cả loại dự án</option><option>Hạ tầng giao thông</option><option>Khu đô thị</option><option>Công nghiệp</option></select><ChevronDown size={15}/></label>
          <Button type="submit" className="search-submit"><Search size={19}/> Tìm kiếm</Button>
        </form>
      </div>
    </section>

    <section id="loi-ich" className="benefits"><div className="benefits-inner">
      {[{icon: FileText, title: "Dự án công trình", sub: "Đầy đủ thông tin, minh bạch"}, {icon: UsersRound, title: "Nhà thầu uy tín", sub: "Chất lượng - Kinh nghiệm"}, {icon: Handshake, title: "Hợp tác dễ dàng", sub: "Kết nối nhanh chóng"}, {icon: ShieldPlus, title: "Đảm bảo an toàn", sub: "Minh bạch - Bảo mật"}, {icon: Settings, title: "Vật tư - Thiết bị", sub: "Chất lượng, giá tốt"}, {icon: Headphones, title: "Hỗ trợ 24/7", sub: "Luôn đồng hành"}].map(({icon: Icon, title, sub}) => <div className="benefit" key={title}><Icon className="benefit-icon" strokeWidth={1.9}/><div><strong>{title}</strong><span>{sub}</span></div></div>)}
    </div></section>

    <main className="content-wrap"><section id="du-an" className="projects-section"><div className="section-heading"><h2><ClipboardList size={20} fill="currentColor"/> Dự án nổi bật</h2><a href="#du-an" onClick={e => {e.preventDefault(); setQuery(""); setLocation("Tất cả địa điểm"); setType("Tất cả loại dự án"); setSubmitted(false);}}>Xem tất cả <ArrowRight size={15}/></a></div>
      <div className="project-grid">{filteredProjects.map(p => <article className="project-card" key={p.id}><div className="project-image"><img src={p.image} alt={p.name} width={1152} height={576} loading="lazy"/><span className={`status status-${p.color}`}>{p.status}</span></div><div className="project-body"><h3>{p.name}</h3><p><MapPin size={13} fill="currentColor"/> {p.city}</p><p><CalendarDays size={13}/> Khởi công: {p.start}</p><p><CalendarDays size={13}/> Dự kiến hoàn thành: {p.finish}</p><Button variant="outline" size="sm" className="detail-button" onClick={() => setSelectedProject(p)}>Xem chi tiết <ArrowRight size={14}/></Button></div></article>)}</div>
      {filteredProjects.length === 0 && <div className="empty-results">Không tìm thấy dự án phù hợp. Hãy thử bộ lọc khác.</div>}
    </section><aside className="sidebar-content"><section id="nha-thau" className="contractor-banner"><img src={contractorImage} alt="Kỹ sư xây dựng xem bản vẽ tại công trình" width={1152} height={576} loading="lazy"/><div className="banner-shade"/><div className="banner-copy"><h2>Bạn là nhà thầu?</h2><p>Đăng ký ngay để tiếp cận<br/> hàng trăm dự án hấp dẫn.</p><Button variant="secondary" size="sm" onClick={() => navigate('/register')}>Đăng ký ngay <ArrowRight size={14}/></Button></div></section>
    <section id="tin-tuc" className="news-section"><div className="news-heading"><h2><Newspaper size={18}/> Tin tức mới nhất</h2><a href="#tin-tuc">Xem tất cả <ArrowRight size={13}/></a></div><div className="news-list">{news.map(item => <button className="news-item" key={item.title} onClick={() => setSelectedNews(item)}><img src={item.image} alt="" width={1152} height={576} loading="lazy"/><span><strong>{item.title}</strong><small>{item.date}</small></span></button>)}</div></section></aside></main>

    <footer id="lien-he" className="site-footer"><div className="footer-inner"><div className="footer-brand"><Logo light/><small>© 2025 Nền tảng thi công công trình. Tất cả quyền được bảo lưu.</small></div><div className="footer-column"><strong>Về chúng tôi</strong><a href="#trang-chu">Giới thiệu</a><a href="#du-an">Điều khoản sử dụng</a><a href="#lien-he">Chính sách bảo mật</a></div><div className="footer-column"><strong>Hỗ trợ</strong><a href="#tim-kiem">Hướng dẫn sử dụng</a><a href="#lien-he">Câu hỏi thường gặp</a><a href="mailto:lienhe@nentrangthicong.vn">Liên hệ</a></div><div className="footer-column footer-social"><strong>Kết nối với chúng tôi</strong><div><a href="#lien-he" aria-label="Facebook">f</a><a href="#lien-he" aria-label="YouTube">▶</a><a href="#lien-he" aria-label="LinkedIn">in</a><a href="#lien-he" aria-label="Zalo">Zalo</a></div></div><form className="footer-subscribe" onSubmit={e => {e.preventDefault(); if(email.trim()) setSubscribed(true)}}><strong>Đăng ký nhận tin</strong><span>Nhận thông tin dự án mới nhất qua email</span><div><input type="email" aria-label="Email nhận tin" placeholder="Nhập email của bạn" value={email} onChange={e => {setEmail(e.target.value); setSubscribed(false)}} required/><Button type="submit" size="sm">Đăng ký</Button></div>{subscribed && <small className="subscribe-note"><Check size={13}/> Đã ghi nhận email của bạn trong bản xem thử.</small>}</form></div></footer>

    {(selectedProject || selectedNews) && <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) {setSelectedProject(null); setSelectedNews(null);} }}><div className="modal" role="dialog" aria-modal="true" aria-label={selectedProject?.name || selectedNews?.title || "Thông tin"}><Button variant="ghost" size="icon" className="modal-close" aria-label="Đóng" onClick={() => {setSelectedProject(null); setSelectedNews(null);}}><X/></Button>{selectedProject ? <><img className="modal-image" src={selectedProject.image} alt={selectedProject.name}/><h2>{selectedProject.name}</h2><p>{selectedProject.description}</p><div className="modal-meta"><span><MapPin size={16}/> {selectedProject.city}</span><span><CalendarDays size={16}/> {selectedProject.start} – {selectedProject.finish}</span><span>{selectedProject.status}</span></div></> : selectedNews ? <><img className="modal-image" src={selectedNews.image} alt=""/><h2>{selectedNews.title}</h2><p className="modal-date">{selectedNews.date}</p><p>Thông tin chi tiết đang được cập nhật.</p></> : null}</div></div>}
  </div>;
}
