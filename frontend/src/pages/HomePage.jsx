import React, { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, ChevronDown, MapPin, Newspaper, Search, FileText, UsersRound, Handshake, ShieldPlus, Settings, Headphones, ClipboardList, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./HomePage.css"; // The scoped CSS

import heroImage from "@/assets/construction-hero.jpg";
import bridgeImage from "@/assets/bridge-project.jpg";
import urbanImage from "@/assets/urban-project.jpg";
import factoryImage from "@/assets/factory-project.jpg";
import contractorImage from "@/assets/contractor-banner.jpg";
import api from "../lib/api";

const news = [
  { title: "Ngành xây dựng Việt Nam tiếp tục tăng trưởng trong năm 2025", date: "15/08/2025", image: bridgeImage },
  { title: "Những xu hướng công nghệ mới trong thi công công trình", date: "10/08/2025", image: urbanImage },
  { title: "Hội thảo kết nối nhà thầu và chủ đầu tư năm 2025", date: "05/08/2025", image: contractorImage },
];

export default function HomePage({ user }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Tất cả địa điểm");
  const [type, setType] = useState("Tất cả loại dự án");

  const [topProjects, setTopProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);

  useEffect(() => {
    const fetchTopProjects = async () => {
      try {
        const res = await api.get('/public/projects?limit=3');
        setTopProjects(res.data.projects);
      } catch (error) {
        console.error("Lỗi khi tải dự án", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTopProjects();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (location !== "Tất cả địa điểm") params.set("tinh", location);
    if (type !== "Tất cả loại dự án") params.set("loai", type);
    navigate(`/du-an?${params.toString()}`);
  };

  return (
    <>
      <section className="hero" aria-label="Tìm kiếm dự án xây dựng">
        <img src={heroImage} width={1920} height={600} alt="Công trình đang thi công với cần cẩu trong ánh hoàng hôn" className="hero-photo" />
        <div className="hero-shade"/><div className="hero-inner">
          <h1>Tìm kiếm, kết nối và triển khai<br className="desktop-break"/> các dự án xây dựng</h1>
          <p>Nền tảng giúp các nhà thầu, chủ đầu tư và đối tác trong ngành xây dựng<br className="desktop-break"/> dễ dàng tìm kiếm dự án, trao đổi, hợp tác và phát triển bền vững.</p>
          <form id="tim-kiem" className="search-panel" onSubmit={handleSearch}>
            <label className="search-field search-keyword">
              <Search size={21}/>
              <input aria-label="Tìm kiếm dự án, nhà thầu, vật tư" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm dự án, nhà thầu, vật tư..." />
            </label>
            <label className="search-field select-field">
              <MapPin size={19}/>
              <select aria-label="Địa điểm" value={location} onChange={e => setLocation(e.target.value)}>
                <option>Tất cả địa điểm</option>
                <option>Hà Nội</option>
                <option>TP. Hồ Chí Minh</option>
                <option>Bắc Ninh</option>
              </select>
              <ChevronDown size={15}/>
            </label>
            <label className="search-field select-field">
              <Building2 size={18}/>
              <select aria-label="Loại dự án" value={type} onChange={e => setType(e.target.value)}>
                <option>Tất cả loại dự án</option>
                <option>Hạ tầng giao thông</option>
                <option>Khu đô thị</option>
                <option>Công nghiệp</option>
              </select>
              <ChevronDown size={15}/>
            </label>
            <Button type="submit" className="search-submit"><Search size={19}/> Tìm kiếm</Button>
          </form>
        </div>
      </section>

      <section id="loi-ich" className="benefits"><div className="benefits-inner">
        {[{icon: FileText, title: "Dự án công trình", sub: "Đầy đủ thông tin, minh bạch"}, {icon: UsersRound, title: "Nhà thầu uy tín", sub: "Chất lượng - Kinh nghiệm"}, {icon: Handshake, title: "Hợp tác dễ dàng", sub: "Kết nối nhanh chóng"}, {icon: ShieldPlus, title: "Đảm bảo an toàn", sub: "Minh bạch - Bảo mật"}, {icon: Settings, title: "Vật tư - Thiết bị", sub: "Chất lượng, giá tốt"}, {icon: Headphones, title: "Hỗ trợ 24/7", sub: "Luôn đồng hành"}].map(({icon: Icon, title, sub}) => <div className="benefit" key={title}><Icon className="benefit-icon" strokeWidth={1.9}/><div><strong>{title}</strong><span>{sub}</span></div></div>)}
      </div></section>

      <main className="content-wrap">
        <section id="du-an" className="projects-section">
          <div className="section-heading">
            <h2><ClipboardList size={20} fill="currentColor"/> Dự án nổi bật</h2>
            <Link to="/du-an">Xem tất cả <ArrowRight size={15}/></Link>
          </div>
          {loading ? (
            <div className="empty-results">Đang tải dự án...</div>
          ) : topProjects.length === 0 ? (
            <div className="empty-results">Chưa có dự án nào được công bố.</div>
          ) : (
            <div className="project-grid">
              {topProjects.map(p => 
                <article className="project-card" key={p.id}>
                  <div className="project-image">
                    <img src={p.cover_image_url || '/placeholder.jpg'} alt={p.name} width={1152} height={576} loading="lazy" onError={(e) => { e.target.src = 'https://placehold.co/600x400/e2e8f0/64748b?text=No+Image' }}/>
                    <span className={`status status-blue`}>{p.stage || p.status}</span>
                  </div>
                  <div className="project-body">
                    <h3><Link to={`/du-an/${p.id}`} className="hover:underline">{p.name}</Link></h3>
                    <p><MapPin size={13} fill="currentColor"/> {p.province || p.location}</p>
                    <p><CalendarDays size={13}/> Loại: {p.project_type || 'Chưa cập nhật'}</p>
                    <p><CalendarDays size={13}/> Dự kiến hoàn thành: {p.expected_completion_date ? new Date(p.expected_completion_date).toLocaleDateString('vi-VN') : 'Đang cập nhật'}</p>
                    <Button variant="outline" size="sm" className="detail-button" onClick={() => navigate(`/du-an/${p.id}`)}>
                      Xem chi tiết <ArrowRight size={14}/>
                    </Button>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        <aside className="sidebar-content">
          {!user && (
            <section id="nha-thau" className="contractor-banner">
              <img src={contractorImage} alt="Kỹ sư xây dựng xem bản vẽ tại công trình" width={1152} height={576} loading="lazy"/>
              <div className="banner-shade"/>
              <div className="banner-copy">
                <h2>Bạn là nhà thầu?</h2>
                <p>Đăng ký ngay để tiếp cận<br/> hàng trăm dự án hấp dẫn.</p>
                <Button variant="secondary" size="sm" onClick={() => navigate('/register')}>Đăng ký ngay <ArrowRight size={14}/></Button>
              </div>
            </section>
          )}
          
          <section id="tin-tuc" className="news-section">
            <div className="news-heading">
              <h2><Newspaper size={18}/> Tin tức mới nhất</h2>
              <Link to="/tin-tuc">Xem tất cả <ArrowRight size={13}/></Link>
            </div>
            <div className="news-list">
              {news.map(item => 
                <button className="news-item" key={item.title} onClick={() => navigate(`/tin-tuc/1`)}>
                  <img src={item.image} alt="" width={1152} height={576} loading="lazy"/>
                  <span><strong>{item.title}</strong><small>{item.date}</small></span>
                </button>
              )}
            </div>
          </section>
        </aside>
      </main>

      {(selectedProject || selectedNews) && <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) {setSelectedProject(null); setSelectedNews(null);} }}><div className="modal" role="dialog" aria-modal="true" aria-label={selectedProject?.name || selectedNews?.title || "Thông tin"}><Button variant="ghost" size="icon" className="modal-close" aria-label="Đóng" onClick={() => {setSelectedProject(null); setSelectedNews(null);}}><X/></Button>{selectedProject ? <><img className="modal-image" src={selectedProject.image} alt={selectedProject.name}/><h2>{selectedProject.name}</h2><p>{selectedProject.description}</p><div className="modal-meta"><span><MapPin size={16}/> {selectedProject.city}</span><span><CalendarDays size={16}/> {selectedProject.start} – {selectedProject.finish}</span><span>{selectedProject.status}</span></div></> : selectedNews ? <><img className="modal-image" src={selectedNews.image} alt=""/><h2>{selectedNews.title}</h2><p className="modal-date">{selectedNews.date}</p><p>Thông tin chi tiết đang được cập nhật.</p></> : null}</div></div>}
    </>
  );
}
