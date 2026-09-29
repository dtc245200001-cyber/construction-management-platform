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
    <div className="landing-container w-full min-h-screen flex flex-col bg-[#F8FAFC] text-[#111827] font-sans antialiased">
      {/* 1. HEADER */}
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] h-[72px] flex items-center">
        <div className="max-w-[1280px] w-full mx-auto px-6 flex justify-between items-center h-full">
            
            {/* Logo */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/projects')}>
                <div className="w-[42px] h-[42px] bg-[#1D4ED8] text-white rounded-[10px] flex items-center justify-center shrink-0">
                    <i className="ph ph-buildings text-[28px]"></i>
                </div>
                <div className="hidden sm:block">
                    <h1 className="text-[15px] font-bold text-[#1E3A8A] leading-[1.2] tracking-tight uppercase">NỀN TẢNG THI CÔNG<br/>CÔNG TRÌNH</h1>
                    <p className="text-[11px] text-[#6B7280] leading-tight mt-0.5">Kết nối nhà thầu – Chủ đầu tư – Kiến tạo tương lai</p>
                </div>
            </div>

            {/* Mobile Menu Toggle */}
            <button 
                className="lg:hidden text-[#6B7280] hover:text-[#1D4ED8] transition-colors p-2" 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Menu"
            >
                <i className="ph ph-list text-2xl"></i>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-9 h-full">
                <a href="#" className="text-[#1D4ED8] font-semibold text-[14px] border-b-2 border-[#1D4ED8] h-[72px] flex items-center">Trang chủ</a>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate('/projects'); }} className="text-[#111827] font-medium text-[14px] hover:text-[#1D4ED8] transition-colors h-[72px] flex items-center">Quản lý Dự án</a>
                <a href="#" className="text-[#111827] font-medium text-[14px] hover:text-[#1D4ED8] transition-colors h-[72px] flex items-center">Nhà thầu</a>
                <a href="#" className="text-[#111827] font-medium text-[14px] hover:text-[#1D4ED8] transition-colors h-[72px] flex items-center">Vật tư - Thiết bị</a>
                <a href="#" className="text-[#111827] font-medium text-[14px] hover:text-[#1D4ED8] transition-colors h-[72px] flex items-center">Tin tức</a>
                <a href="#" className="text-[#111827] font-medium text-[14px] hover:text-[#1D4ED8] transition-colors h-[72px] flex items-center">Liên hệ</a>
            </nav>

            {/* Right Actions */}
            <div className="hidden lg:flex items-center gap-3">
                <button className="w-10 h-10 flex items-center justify-center text-[#6B7280] hover:text-[#1D4ED8] transition-colors" aria-label="Search">
                    <i className="ph ph-magnifying-glass text-[20px]"></i>
                </button>
                <div className="px-[18px] py-[9px] border border-[#E5E7EB] text-[#111827] font-medium text-[14px] rounded-full flex items-center gap-2">
                    <i className="ph ph-user text-[18px]"></i>
                    {user?.email || 'User'}
                </div>
                <LogoutButton setUser={setUser} />
            </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
            <div className="absolute top-[72px] left-0 w-full bg-white border-b border-[#E5E7EB] shadow-lg lg:hidden flex flex-col z-40">
                <a href="#" className="px-6 py-4 text-[#1D4ED8] font-medium border-l-4 border-[#1D4ED8] bg-blue-50/50">Trang chủ</a>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate('/projects'); }} className="px-6 py-4 text-[#111827] font-medium hover:bg-gray-50 border-l-4 border-transparent">Quản lý Dự án</a>
                <a href="#" className="px-6 py-4 text-[#111827] font-medium hover:bg-gray-50 border-l-4 border-transparent">Nhà thầu</a>
                <a href="#" className="px-6 py-4 text-[#111827] font-medium hover:bg-gray-50 border-l-4 border-transparent">Vật tư - Thiết bị</a>
                <div className="p-6 flex flex-col gap-3 bg-gray-50 border-t border-[#E5E7EB]">
                    <div className="w-full py-2.5 border border-[#E5E7EB] bg-white text-[#111827] font-medium rounded-full flex items-center justify-center gap-2">
                        <i className="ph ph-user text-[18px]"></i> {user?.email || 'User'}
                    </div>
                    <div className="w-full">
                        <LogoutButton setUser={setUser} />
                    </div>
                </div>
            </div>
        )}
      </header>

      {/* 2. HERO BANNER */}
      <section className="relative w-full h-[460px] flex items-center overflow-hidden bg-[#0F1E3D] shrink-0">
          <div className="absolute inset-0 z-0">
              <img src="https://images.unsplash.com/photo-1541888086225-f6740f9e04f0?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" alt="Construction crane at sunset" className="w-full h-full object-cover object-center" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0F1E3D] via-[rgba(15,30,61,0.8)] to-transparent"></div>
          </div>

          <div className="relative z-10 max-w-[1280px] w-full mx-auto px-6">
              <div className="max-w-[600px] mb-9">
                  <h2 className="text-white text-[42px] font-bold leading-[1.25] mb-5 tracking-tight">
                      Tìm kiếm, kết nối và triển khai<br/>các dự án xây dựng
                  </h2>
                  <p className="text-[#E5EAF5] text-[15.5px] leading-[1.6] max-w-[560px]">
                      Nền tảng giúp các nhà thầu, chủ đầu tư và đối tác trong ngành xây dựng dễ dàng tìm kiếm dự án, trao đổi, hợp tác và phát triển bền vững.
                  </p>
              </div>

              {/* SEARCH BAR */}
              <div className="bg-white rounded-[12px] max-w-[800px] p-[8px] flex flex-col md:flex-row items-stretch relative z-20" style={{ boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)' }}>
                  {/* Search Input */}
                  <div className="flex-1 flex items-center px-4 py-2.5">
                      <i className="ph ph-magnifying-glass text-gray-400 text-[20px] mr-3"></i>
                      <input type="text" placeholder="Tìm kiếm dự án, nhà thầu, vật tư..." className="w-full bg-transparent border-none outline-none text-[#111827] placeholder-gray-400 text-[14.5px] font-medium" />
                  </div>
                  
                  {/* Divider */}
                  <div className="hidden md:block w-px bg-gray-200 my-2"></div>
                  
                  {/* Location Dropdown */}
                  <div className="relative w-full md:w-[200px]">
                      <button 
                          className="w-full h-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors rounded-lg group"
                          onClick={(e) => toggleDropdown(e, 'location')}
                      >
                          <div className="flex items-center text-[#6B7280]">
                              <i className="ph ph-map-pin text-[20px] mr-2 group-hover:text-[#1D4ED8] transition-colors"></i>
                              <span className="text-[14.5px] font-medium text-[#111827] truncate">{locationLabel}</span>
                          </div>
                          <i className="ph ph-caret-down text-gray-400 text-[14px]"></i>
                      </button>
                      {openDropdown === 'location' && (
                          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white rounded-[10px] shadow-lg border border-[#E5E7EB] py-1.5 z-50">
                              {['Tất cả địa điểm', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'].map(loc => (
                                  <a key={loc} href="#" onClick={(e) => { e.preventDefault(); setLocationLabel(loc); setOpenDropdown(null); }} className="block px-4 py-2 text-[14px] hover:bg-blue-50 text-[#111827] hover:text-[#1D4ED8]">{loc}</a>
                              ))}
                          </div>
                      )}
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block w-px bg-gray-200 my-2"></div>

                  {/* Project Type Dropdown */}
                  <div className="relative w-full md:w-[210px]">
                      <button 
                          className="w-full h-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors rounded-lg group"
                          onClick={(e) => toggleDropdown(e, 'type')}
                      >
                          <div className="flex items-center text-[#6B7280]">
                              <i className="ph ph-calendar-blank text-[20px] mr-2 group-hover:text-[#1D4ED8] transition-colors"></i>
                              <span className="text-[14.5px] font-medium text-[#111827] truncate">{typeLabel}</span>
                          </div>
                          <i className="ph ph-caret-down text-gray-400 text-[14px]"></i>
                      </button>
                      {openDropdown === 'type' && (
                          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white rounded-[10px] shadow-lg border border-[#E5E7EB] py-1.5 z-50">
                              {['Tất cả loại dự án', 'Dân dụng', 'Công nghiệp', 'Giao thông'].map(t => (
                                  <a key={t} href="#" onClick={(e) => { e.preventDefault(); setTypeLabel(t); setOpenDropdown(null); }} className="block px-4 py-2 text-[14px] hover:bg-blue-50 text-[#111827] hover:text-[#1D4ED8]">{t}</a>
                              ))}
                          </div>
                      )}
                  </div>

                  <button className="bg-[#1D4ED8] text-white font-medium text-[15px] px-[28px] py-[10px] rounded-[10px] hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm shrink-0 md:ml-1 mt-2 md:mt-0">
                      <i className="ph ph-magnifying-glass text-[18px]"></i>
                      Tìm kiếm
                  </button>
              </div>
          </div>
      </section>

      {/* 3. FEATURE STRIP */}
      <section className="bg-white border-b border-[#E5E7EB] min-h-[90px] flex items-center relative z-10 shadow-sm shrink-0">
          <div className="max-w-[1280px] w-full mx-auto px-6 py-6 lg:py-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                  {[
                      { icon: 'files', title: 'Dự án công trình', sub: 'Đầy đủ thông tin, minh bạch', px: 'px-2 lg:px-4 lg:pl-0' },
                      { icon: 'users', title: 'Nhà thầu uy tín', sub: 'Chất lượng – Kinh nghiệm', px: 'px-2 lg:px-6' },
                      { icon: 'handshake', title: 'Hợp tác dễ dàng', sub: 'Kết nối nhanh chóng', px: 'px-2 lg:px-6' },
                      { icon: 'shield-check', title: 'Đảm bảo an toàn', sub: 'Minh bạch – Bảo mật', px: 'px-2 lg:px-6' },
                      { icon: 'gear', title: 'Vật tư - Thiết bị', sub: 'Chất lượng, giá tốt', px: 'px-2 lg:px-6' },
                      { icon: 'headphones', title: 'Hỗ trợ 24/7', sub: 'Luôn đồng hành', px: 'px-2 lg:px-4 lg:pr-0' }
                  ].map((f, i) => (
                      <div key={i} className={`flex items-center gap-[14px] py-4 lg:py-[22px] ${f.px}`}>
                          <div className="w-[44px] h-[44px] rounded-[10px] bg-[#E8EEFB] text-[#1D4ED8] flex items-center justify-center shrink-0">
                              <i className={`ph ph-${f.icon} text-[24px]`}></i>
                          </div>
                          <div>
                              <h3 className="text-[14px] font-bold text-[#111827] leading-tight mb-1">{f.title}</h3>
                              <p className="text-[12px] text-[#6B7280] leading-tight">{f.sub}</p>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </section>

      {/* 4. MAIN CONTENT */}
      <main className="py-[48px] bg-transparent flex-grow">
          <div className="max-w-[1280px] w-full mx-auto px-6 flex flex-col lg:flex-row gap-[24px]">
              
              {/* LEFT COLUMN */}
              <div className="lg:w-[70%]">
                  <div className="flex justify-between items-end mb-[20px]">
                      <div className="flex items-center gap-[10px]">
                          <div className="w-[32px] h-[32px] rounded-[8px] bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0">
                              <i className="ph ph-buildings text-[18px]"></i>
                          </div>
                          <h2 className="text-[20px] font-bold text-[#111827]">Dự án nổi bật</h2>
                      </div>
                      <a href="#" className="text-[#1D4ED8] font-medium hover:text-blue-800 transition-colors text-[14px] flex items-center group">
                          Xem tất cả <i className="ph ph-arrow-right ml-1 group-hover:translate-x-1 transition-transform"></i>
                      </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px]">
                      {[
                          { img: '1541888086225-f6740f9e04f0', status: 'Đang thi công', statusColor: '#16A34A', title: 'Cầu vượt sông Hồng', loc: 'Hà Nội', start: '01/2024', end: '12/2026' },
                          { img: '1503387762-592deb58ef4e', status: 'Chuẩn bị đầu tư', statusColor: '#3B82F6', title: 'Khu đô thị Vinhomes Green City', loc: 'TP. Hồ Chí Minh', start: '06/2025', end: '12/2030' },
                          { img: '1581094794329-c8112a89af12', status: 'Đang đấu thầu', statusColor: '#F59E0B', title: 'Nhà máy sản xuất linh kiện điện tử', loc: 'Bắc Ninh', start: '08/2025', end: '12/2027' }
                      ].map((p, i) => (
                          <div key={i} className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden hover:border-gray-300 transition-all group flex flex-col cursor-pointer" style={{ boxShadow: '0 4px 10px rgba(0, 0, 0, 0.06)' }} onClick={() => navigate('/projects')}>
                              <div className="relative h-[170px] w-full overflow-hidden bg-gray-100 shrink-0">
                                  <img src={`https://images.unsplash.com/photo-${p.img}?w=600&q=80`} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                  <div className="absolute top-[12px] left-[12px] px-[12px] py-[4px] text-white text-[11px] font-bold rounded-full shadow-sm" style={{ backgroundColor: p.statusColor }}>
                                      {p.status}
                                  </div>
                              </div>
                              <div className="p-[16px] flex flex-col flex-grow">
                                  <h3 className="font-bold text-[#111827] text-[16px] leading-[1.3] mb-[16px] group-hover:text-[#1D4ED8] transition-colors" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                      {p.title}
                                  </h3>
                                  <div className="flex flex-col gap-[10px] mt-auto mb-[20px]">
                                      <div className="flex items-start gap-2 text-[13px] text-[#6B7280]">
                                          <i className="ph ph-map-pin text-[16px] shrink-0 mt-[2px]"></i>
                                          <span className="leading-tight">{p.loc}</span>
                                      </div>
                                      <div className="flex items-start gap-2 text-[13px] text-[#6B7280]">
                                          <i className="ph ph-calendar-blank text-[16px] shrink-0 mt-[2px]"></i>
                                          <span className="leading-tight">Khởi công: {p.start}</span>
                                      </div>
                                      <div className="flex items-start gap-2 text-[13px] text-[#6B7280]">
                                          <i className="ph ph-calendar-check text-[16px] shrink-0 mt-[2px]"></i>
                                          <span className="leading-tight">Dự kiến hoàn thành: {p.end}</span>
                                      </div>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); navigate('/projects'); }} className="mt-auto w-full py-[8px] border border-[#1D4ED8] text-[#1D4ED8] font-semibold text-[13px] rounded-[6px] text-center hover:bg-blue-50 transition-colors flex justify-center items-center gap-[6px]">
                                      Xem chi tiết <i className="ph ph-arrow-right font-bold"></i>
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="lg:w-[30%] flex flex-col gap-[24px]">
                  
                  {/* CTA Card */}
                  <div className="relative bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] rounded-[14px] overflow-hidden p-[24px] group" style={{ boxShadow: '0 4px 10px rgba(0, 0, 0, 0.06)' }}>
                      <div className="absolute inset-y-0 right-0 w-[55%] opacity-40 mix-blend-overlay">
                          <img src="https://images.unsplash.com/photo-1504307651254-35680f356f27?w=400&q=80" alt="Construction worker" className="w-full h-full object-cover" style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 100%)' }} />
                      </div>
                      
                      <div className="relative z-10 w-[70%]">
                          <h3 className="text-white text-[18px] font-bold mb-[8px]">Bạn là nhà thầu?</h3>
                          <p className="text-white/90 text-[13.5px] leading-relaxed mb-[20px]">
                              Khám phá các tính năng quản lý dự án dành riêng cho bạn.
                          </p>
                          <button onClick={() => navigate('/projects')} className="inline-flex px-[16px] py-[8px] bg-white text-[#1D4ED8] font-semibold text-[13px] rounded-full shadow-sm hover:bg-gray-100 transition-colors items-center gap-[6px]">
                              Quản lý ngay <i className="ph ph-arrow-right font-bold"></i>
                          </button>
                      </div>
                  </div>

                  {/* News Card */}
                  <div className="border border-[#E5E7EB] rounded-[14px] bg-white p-[16px]" style={{ boxShadow: '0 4px 10px rgba(0, 0, 0, 0.06)' }}>
                      <div className="flex justify-between items-center mb-[16px]">
                          <h3 className="font-bold text-[#111827] text-[16px] flex items-center gap-2">
                              <i className="ph ph-newspaper text-[20px] text-[#1D4ED8]"></i> Tin tức mới nhất
                          </h3>
                          <a href="#" className="text-[#1D4ED8] text-[13px] font-medium hover:underline flex items-center group">
                              Xem tất cả <i className="ph ph-arrow-right ml-1 group-hover:translate-x-1 transition-transform"></i>
                          </a>
                      </div>
                      
                      <div className="flex flex-col divide-y divide-gray-100">
                          {[
                              { img: '1541888086225-f6740f9e04f0', title: 'Ngành xây dựng Việt Nam tiếp tục tăng trưởng trong năm 2025', date: '15/08/2025' },
                              { img: '1503387762-592deb58ef4e', title: 'Những xu hướng công nghệ mới trong thi công công trình', date: '10/08/2025' },
                              { img: '1581094794329-c8112a89af12', title: 'Hội thảo kết nối nhà thầu và chủ đầu tư năm 2025', date: '05/08/2025' }
                          ].map((n, i) => (
                              <a key={i} href="#" className="flex gap-[12px] py-[12px] group hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                                  <img src={`https://images.unsplash.com/photo-${n.img}?w=100&q=80`} alt="News" className="w-[56px] h-[56px] rounded-[8px] object-cover shrink-0" />
                                  <div className="flex flex-col justify-center">
                                      <h4 className="font-bold text-[#111827] text-[13px] leading-[1.4] group-hover:text-[#1D4ED8] transition-colors mb-[4px]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                          {n.title}
                                      </h4>
                                      <span className="text-[12px] text-[#6B7280]">
                                          {n.date}
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
      <footer className="bg-[#0F1E3D] py-[48px] shrink-0 mt-auto">
          <div className="max-w-[1280px] w-full mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-y-10 lg:gap-[30px]">
              
              {/* Col 1 */}
              <div className="lg:col-span-2 pr-4">
                  <div className="flex items-center gap-[12px] mb-[20px]">
                      <div className="w-[42px] h-[42px] rounded-[10px] flex items-center justify-center shrink-0 border border-white/20">
                          <i className="ph ph-buildings text-white text-[28px]"></i>
                      </div>
                      <div>
                          <h2 className="text-[15px] font-bold text-white leading-[1.2] tracking-tight uppercase">NỀN TẢNG THI CÔNG<br/>CÔNG TRÌNH</h2>
                      </div>
                  </div>
                  <p className="text-[13px] text-[#AEB9CC] leading-relaxed">
                      © 2025 Nền tảng thi công công trình. Tất cả quyền được bảo lưu.
                  </p>
              </div>

              {/* Col 2 */}
              <div>
                  <h4 className="text-white font-bold mb-[16px] text-[14px]">Về chúng tôi</h4>
                  <ul className="flex flex-col gap-[12px]">
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Giới thiệu</a></li>
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Điều khoản sử dụng</a></li>
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Chính sách bảo mật</a></li>
                  </ul>
              </div>

              {/* Col 3 */}
              <div>
                  <h4 className="text-white font-bold mb-[16px] text-[14px]">Hỗ trợ</h4>
                  <ul className="flex flex-col gap-[12px]">
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Hướng dẫn sử dụng</a></li>
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Câu hỏi thường gặp</a></li>
                      <li><a href="#" className="text-[13px] text-[#AEB9CC] hover:text-white transition-colors">Liên hệ</a></li>
                  </ul>
              </div>

              {/* Col 4 & 5 */}
              <div className="flex flex-col gap-[32px]">
                  <div>
                      <h4 className="text-white font-bold mb-[16px] text-[14px]">Kết nối với chúng tôi</h4>
                      <div className="flex gap-[12px]">
                          <a href="#" className="w-[36px] h-[36px] rounded-full bg-[#1e325c] hover:bg-[#1D4ED8] flex items-center justify-center text-white transition-colors">
                              <i className="ph ph-facebook-logo text-[18px]"></i>
                          </a>
                          <a href="#" className="w-[36px] h-[36px] rounded-full bg-[#1e325c] hover:bg-[#1D4ED8] flex items-center justify-center text-white transition-colors">
                              <i className="ph ph-youtube-logo text-[18px]"></i>
                          </a>
                          <a href="#" className="w-[36px] h-[36px] rounded-full bg-[#1e325c] hover:bg-[#1D4ED8] flex items-center justify-center text-white transition-colors">
                              <i className="ph ph-linkedin-logo text-[18px]"></i>
                          </a>
                          <a href="#" className="w-[36px] h-[36px] rounded-full bg-[#1e325c] hover:bg-[#1D4ED8] flex items-center justify-center text-white transition-colors">
                              <i className="ph ph-chat-circle-dots text-[18px]"></i>
                          </a>
                      </div>
                  </div>
                  <div>
                      <h4 className="text-white font-bold mb-[8px] text-[14px]">Đăng ký nhận tin</h4>
                      <p className="text-[13px] text-[#AEB9CC] mb-[12px]">Nhận thông tin dự án mới nhất qua email</p>
                      <div className="flex h-[40px]">
                          <input type="email" placeholder="Nhập email của bạn" className="bg-white text-[#111827] border-none outline-none px-[12px] text-[13px] rounded-l-[4px] w-full placeholder-gray-400 focus:ring-2 focus:ring-[#1D4ED8]" />
                          <button className="bg-[#1D4ED8] hover:bg-blue-600 text-white px-[16px] text-[13px] font-semibold rounded-r-[4px] transition-colors shrink-0">
                              Đăng ký
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
};

export default LandingPage;
