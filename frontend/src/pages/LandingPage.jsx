import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoutButton from '../components/LogoutButton';

const LandingPage = ({ user, setUser }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  
  const [locationLabel, setLocationLabel] = useState('Tất cả địa điểm');
  const [typeLabel, setTypeLabel] = useState('Tất cả loại dự án');

  const navigate = useNavigate();

  const toggleDropdown = (e, name) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleDocumentClick = () => {
    setOpenDropdown(null);
  };

  React.useEffect(() => {
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  return (
    <div className="landing-container w-full min-h-screen flex flex-col bg-white">
      {/* 1. HEADER */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 h-[72px] flex items-center shadow-sm">
        <div className="max-w-[1280px] w-full mx-auto px-6 flex justify-between items-center">
            
            {/* Logo & Brand */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/projects')}>
                <div className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center shrink-0">
                    <i className="ph ph-buildings text-2xl"></i>
                </div>
                <div className="hidden sm:block">
                    <h1 className="text-sm font-bold text-gray-900 leading-tight">NỀN TẢNG THI CÔNG CÔNG TRÌNH</h1>
                    <p className="text-[11px] text-gray-500 leading-tight">Kết nối nhà thầu - Chủ đầu tư - Kiến tạo tương lai</p>
                </div>
            </div>

            {/* Mobile Menu Button */}
            <button 
                className="lg:hidden text-gray-600 hover:text-primary transition-colors" 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Menu"
            >
                <i className="ph ph-list text-2xl"></i>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-8">
                <a href="#" className="text-primary font-medium border-b-2 border-primary py-5">Trang chủ</a>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate('/projects'); }} className="text-gray-600 font-medium hover:text-primary transition-colors py-5">Quản lý Dự án</a>
                <a href="#" className="text-gray-600 font-medium hover:text-primary transition-colors py-5">Nhà thầu</a>
                <a href="#" className="text-gray-600 font-medium hover:text-primary transition-colors py-5">Vật tư - Thiết bị</a>
                <a href="#" className="text-gray-600 font-medium hover:text-primary transition-colors py-5">Tin tức</a>
                <a href="#" className="text-gray-600 font-medium hover:text-primary transition-colors py-5">Liên hệ</a>
            </nav>

            {/* Right Actions */}
            <div className="hidden lg:flex items-center gap-4">
                <button className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-primary rounded-full hover:bg-gray-100 transition-colors" aria-label="Search">
                    <i className="ph ph-magnifying-glass text-xl"></i>
                </button>
                <div className="text-sm text-gray-700">
                    Xin chào, <strong>{user?.email || 'User'}</strong>
                </div>
                <LogoutButton setUser={setUser} />
            </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
            <div className="absolute top-[72px] left-0 w-full bg-white border-b border-gray-200 shadow-lg lg:hidden flex flex-col z-50">
                <a href="#" className="px-6 py-3 text-primary font-medium bg-blue-50 border-l-4 border-primary">Trang chủ</a>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate('/projects'); }} className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-50 border-l-4 border-transparent">Quản lý Dự án</a>
                <a href="#" className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-50 border-l-4 border-transparent">Nhà thầu</a>
                <a href="#" className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-50 border-l-4 border-transparent">Vật tư - Thiết bị</a>
                <div className="p-6 flex flex-col gap-3 border-t border-gray-100">
                    <div className="text-sm text-gray-700 mb-2">Xin chào, {user?.email || 'User'}</div>
                    <LogoutButton setUser={setUser} />
                </div>
            </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative w-full min-h-[480px] flex flex-col justify-center bg-gray-900 overflow-hidden shrink-0">
          <div className="absolute inset-0 z-0">
              <img src="https://images.unsplash.com/photo-1541888086225-f6740f9e04f0?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" alt="Construction site" className="w-full h-full object-cover object-center opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0F1E3D] via-[rgba(15,30,61,0.8)] to-[rgba(245,158,11,0.5)]"></div>
          </div>

          <div className="relative z-10 max-w-[1280px] w-full mx-auto px-6 py-12 lg:py-0">
              <div className="max-w-[640px] mb-8">
                  <h2 className="text-white text-4xl sm:text-5xl font-bold leading-[1.15] mb-4 drop-shadow-md">
                      Tìm kiếm, kết nối và triển khai<br/>các dự án xây dựng
                  </h2>
                  <p className="text-blue-100 text-[15px] leading-relaxed drop-shadow">
                      Nền tảng giúp các nhà thầu, chủ đầu tư và đối tác trong ngành xây dựng dễ dàng tìm kiếm dự án, trao đổi, hợp tác và phát triển bền vững.
                  </p>
              </div>

              {/* SEARCH BAR */}
              <div className="glass-panel rounded-2xl max-w-[1050px] p-2 flex flex-col md:flex-row items-stretch gap-2 md:gap-0">
                  {/* Search Input */}
                  <div className="flex-1 flex items-center px-4 py-3 md:border-r border-gray-200">
                      <i className="ph ph-magnifying-glass text-gray-400 text-xl mr-3"></i>
                      <input type="text" placeholder="Tìm kiếm dự án, nhà thầu, vật tư..." className="w-full bg-transparent border-none outline-none text-gray-700 placeholder-gray-400" />
                  </div>
                  
                  {/* Location Dropdown */}
                  <div className="relative w-full md:w-[220px] md:border-r border-gray-200">
                      <button 
                          className="w-full h-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors rounded-lg md:rounded-none group"
                          onClick={(e) => toggleDropdown(e, 'location')}
                      >
                          <div className="flex items-center text-gray-600">
                              <i className="ph ph-map-pin text-xl mr-2 group-hover:text-primary transition-colors"></i>
                              <span className="truncate">{locationLabel}</span>
                          </div>
                          <i className="ph ph-caret-down text-gray-400"></i>
                      </button>
                      {openDropdown === 'location' && (
                          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                              {['Tất cả địa điểm', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'].map(loc => (
                                  <a key={loc} href="#" onClick={(e) => { e.preventDefault(); setLocationLabel(loc); setOpenDropdown(null); }} className="block px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-primary">{loc}</a>
                              ))}
                          </div>
                      )}
                  </div>

                  {/* Project Type Dropdown */}
                  <div className="relative w-full md:w-[220px]">
                      <button 
                          className="w-full h-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors rounded-lg md:rounded-none group"
                          onClick={(e) => toggleDropdown(e, 'type')}
                      >
                          <div className="flex items-center text-gray-600">
                              <i className="ph ph-calendar text-xl mr-2 group-hover:text-primary transition-colors"></i>
                              <span className="truncate">{typeLabel}</span>
                          </div>
                          <i className="ph ph-caret-down text-gray-400"></i>
                      </button>
                      {openDropdown === 'type' && (
                          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                              {['Tất cả loại dự án', 'Dân dụng', 'Công nghiệp', 'Giao thông'].map(t => (
                                  <a key={t} href="#" onClick={(e) => { e.preventDefault(); setTypeLabel(t); setOpenDropdown(null); }} className="block px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-primary">{t}</a>
                              ))}
                          </div>
                      )}
                  </div>

                  <button className="bg-accent text-white font-medium px-8 py-3 rounded-xl md:rounded-r-xl md:rounded-l-none hover:bg-blue-900 transition-colors flex items-center justify-center gap-2 shadow-sm md:ml-1 mt-2 md:mt-0">
                      <i className="ph ph-magnifying-glass text-lg"></i>
                      Tìm kiếm
                  </button>
              </div>
          </div>
      </section>

      {/* 3. FEATURE STRIP */}
      <section className="bg-[#F8FAFC] border-y border-gray-200 py-6 min-h-[90px] flex items-center shrink-0">
          <div className="max-w-[1280px] w-full mx-auto px-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6">
                  {/* Features */}
                  {[
                      { icon: 'clipboard-text', title: 'Dự án công trình', sub: 'Đầy đủ thông tin, minh bạch' },
                      { icon: 'users', title: 'Nhà thầu uy tín', sub: 'Chất lượng – Kinh nghiệm' },
                      { icon: 'handshake', title: 'Hợp tác dễ dàng', sub: 'Kết nối nhanh chóng' },
                      { icon: 'shield-check', title: 'Đảm bảo an toàn', sub: 'Minh bạch – Bảo mật' },
                      { icon: 'gear', title: 'Vật tư - Thiết bị', sub: 'Chất lượng, giá tốt' },
                      { icon: 'headphones', title: 'Hỗ trợ 24/7', sub: 'Luôn đồng hành' }
                  ].map((f, i) => (
                      <div key={i} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#E8EEFB] text-primary flex items-center justify-center shrink-0">
                              <i className={`ph ph-${f.icon} text-xl`}></i>
                          </div>
                          <div>
                              <h3 className="text-[13px] font-bold text-gray-900 leading-tight">{f.title}</h3>
                              <p className="text-[11px] text-gray-500 mt-0.5">{f.sub}</p>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </section>

      {/* 4. MAIN CONTENT */}
      <main className="py-12 bg-white flex-grow">
          <div className="max-w-[1280px] w-full mx-auto px-6 flex flex-col lg:flex-row gap-6">
              {/* LEFT COLUMN */}
              <div className="lg:w-[70%]">
                  <div className="flex justify-between items-end mb-6">
                      <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center">
                              <i className="ph ph-buildings text-lg"></i>
                          </div>
                          <h2 className="text-2xl font-bold text-gray-900">Dự án nổi bật</h2>
                      </div>
                      <a href="#" className="text-primary font-medium hover:text-accent hover:underline text-sm flex items-center transition-all">
                          Xem tất cả <i className="ph ph-arrow-right ml-1"></i>
                      </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {/* Project Cards */}
                      {[
                          { img: '1541888086225-f6740f9e04f0', status: 'Đang thi công', statusColor: '#16A34A', title: 'Cầu vượt sông Hồng', loc: 'Hà Nội', start: '01/2024', end: '12/2026' },
                          { img: '1503387762-592deb58ef4e', status: 'Chuẩn bị đầu tư', statusColor: '#3B82F6', title: 'Khu đô thị Vinhomes Green City', loc: 'TP. Hồ Chí Minh', start: '06/2025', end: '12/2030' },
                          { img: '1581094794329-c8112a89af12', status: 'Đang đấu thầu', statusColor: '#F59E0B', title: 'Nhà máy sản xuất linh kiện điện tử', loc: 'Bắc Ninh', start: '08/2025', end: '12/2027' }
                      ].map((p, i) => (
                          <div key={i} className="bg-white rounded-[14px] border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all group flex flex-col h-full cursor-pointer" onClick={() => navigate('/projects')}>
                              <div className="relative h-[150px] w-full overflow-hidden bg-gray-100">
                                  <img src={`https://images.unsplash.com/photo-${p.img}?w=600&q=80`} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                  <div className="absolute top-3 left-3 px-2.5 py-1 text-white text-[11px] font-bold rounded-full shadow-sm" style={{ backgroundColor: p.statusColor }}>
                                      {p.status}
                                  </div>
                              </div>
                              <div className="p-5 flex flex-col flex-grow">
                                  <h3 className="font-bold text-gray-900 text-lg leading-tight mb-4 group-hover:text-primary transition-colors line-clamp-2">
                                      {p.title}
                                  </h3>
                                  <div className="flex flex-col gap-2.5 mt-auto mb-5 text-[13px] text-gray-500">
                                      <div className="flex items-center gap-2">
                                          <i className="ph ph-map-pin text-gray-400 text-base"></i>
                                          <span>{p.loc}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <i className="ph ph-calendar-blank text-gray-400 text-base"></i>
                                          <span>Khởi công: {p.start}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <i className="ph ph-calendar-check text-gray-400 text-base"></i>
                                          <span>Dự kiến HT: {p.end}</span>
                                      </div>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); navigate('/projects'); }} className="mt-auto w-full py-2.5 border border-primary text-primary font-medium text-sm rounded-xl text-center hover:bg-blue-50 transition-colors flex justify-center items-center gap-1.5">
                                      Xem chi tiết <i className="ph ph-arrow-right"></i>
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="lg:w-[30%] flex flex-col gap-6">
                  {/* CTA Card */}
                  <div className="relative bg-gradient-to-br from-primary to-accent rounded-[14px] overflow-hidden p-6 shadow-md group cursor-pointer hover:shadow-lg transition-shadow">
                      <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
                          <img src="https://images.unsplash.com/photo-1504307651254-35680f356f27?w=500&q=80" alt="Worker" className="w-full h-full object-cover object-right" style={{ maskImage: 'linear-gradient(to right, transparent, black)', WebkitMaskImage: 'linear-gradient(to right, transparent, black)' }} />
                      </div>
                      <div className="relative z-10">
                          <h3 className="text-white text-xl font-bold mb-2">Bạn là nhà thầu?</h3>
                          <p className="text-blue-100 text-sm mb-6 leading-relaxed">
                              Khám phá các tính năng quản lý dự án dành riêng cho bạn
                          </p>
                          <button onClick={() => navigate('/projects')} className="inline-flex px-5 py-2.5 bg-white text-primary font-bold text-sm rounded-full shadow-sm hover:bg-gray-50 transition-colors items-center gap-1.5">
                              Quản lý ngay <i className="ph ph-arrow-right"></i>
                          </button>
                      </div>
                  </div>

                  {/* News Card */}
                  <div className="border border-gray-200 rounded-[14px] bg-white p-5 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                              📰 Tin tức mới nhất
                          </h3>
                          <a href="#" className="text-primary text-[13px] font-medium hover:underline flex items-center">
                              Xem tất cả <i className="ph ph-arrow-right ml-1"></i>
                          </a>
                      </div>
                      
                      <div className="flex flex-col">
                          {[
                              { img: '1541888086225-f6740f9e04f0', title: 'Thị trường bất động sản công nghiệp dự báo bùng nổ', date: '20/05/2024' },
                              { img: '1503387762-592deb58ef4e', title: 'Bộ Xây dựng ban hành quy chuẩn mới', date: '18/05/2024' },
                              { img: '1581094794329-c8112a89af12', title: 'Giá thép xây dựng tiếp tục biến động trong quý tới', date: '15/05/2024' }
                          ].map((n, i) => (
                              <a key={i} href="#" className="flex gap-4 py-3 group border-b border-gray-100 last:border-0 last:pb-0">
                                  <img src={`https://images.unsplash.com/photo-${n.img}?w=100&q=80`} alt="News" className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
                                  <div>
                                      <h4 className="font-bold text-gray-900 text-[14px] leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-1">
                                          {n.title}
                                      </h4>
                                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                          <i className="ph ph-clock"></i> {n.date}
                                      </span>
                                  </div>
                              </a>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      </main>

      {/* 5. FOOTER */}
      <footer className="bg-dark text-gray-300 py-12 border-t border-[#1a2f5c] shrink-0 mt-auto">
          <div className="max-w-[1280px] w-full mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-6">
              <div className="lg:col-span-2">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 bg-primary text-white rounded-lg flex items-center justify-center shrink-0">
                          <i className="ph ph-buildings text-xl"></i>
                      </div>
                      <div>
                          <h2 className="text-[15px] font-bold text-white leading-tight">NỀN TẢNG THI CÔNG CÔNG TRÌNH</h2>
                          <p className="text-[11px] text-gray-400 mt-0.5">Kết nối nhà thầu - Chủ đầu tư</p>
                      </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-6 max-w-sm">
                      Nền tảng trực tuyến hàng đầu hỗ trợ kết nối, đấu thầu và quản lý dự án xây dựng chuyên nghiệp tại Việt Nam.
                  </p>
                  <p className="text-[13px] text-gray-500">
                      © 2025 Nền tảng thi công công trình. Tất cả quyền được bảo lưu.
                  </p>
              </div>

              <div>
                  <h4 className="text-white font-bold mb-4 text-[15px]">Về chúng tôi</h4>
                  <ul className="flex flex-col gap-3">
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Giới thiệu</a></li>
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Điều khoản sử dụng</a></li>
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Chính sách bảo mật</a></li>
                  </ul>
              </div>

              <div>
                  <h4 className="text-white font-bold mb-4 text-[15px]">Hỗ trợ</h4>
                  <ul className="flex flex-col gap-3">
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Hướng dẫn sử dụng</a></li>
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Câu hỏi thường gặp</a></li>
                      <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Liên hệ</a></li>
                  </ul>
              </div>

              <div>
                  <h4 className="text-white font-bold mb-4 text-[15px]">Kết nối với chúng tôi</h4>
                  <div className="flex gap-3 mb-8">
                      <a href="#" className="w-9 h-9 rounded-full bg-[#1a2f5c] hover:bg-primary flex items-center justify-center text-white transition-colors">
                          <i className="ph ph-facebook-logo text-lg"></i>
                      </a>
                      <a href="#" className="w-9 h-9 rounded-full bg-[#1a2f5c] hover:bg-primary flex items-center justify-center text-white transition-colors">
                          <i className="ph ph-youtube-logo text-lg"></i>
                      </a>
                      <a href="#" className="w-9 h-9 rounded-full bg-[#1a2f5c] hover:bg-primary flex items-center justify-center text-white transition-colors">
                          <i className="ph ph-linkedin-logo text-lg"></i>
                      </a>
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
};

export default LandingPage;
