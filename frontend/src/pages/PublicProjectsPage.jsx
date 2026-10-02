import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, Building2, ChevronDown, CalendarDays, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '../lib/api';
import './HomePage.css'; // Reuse some layout styles if needed, or stick to Tailwind

export default function PublicProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [location, setLocation] = useState(searchParams.get('tinh') || 'Tất cả địa điểm');
  const [type, setType] = useState(searchParams.get('loai') || 'Tất cả loại dự án');

  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 9;

  const fetchProjects = async (q, tinh, loai, pageNum) => {
    try {
      setLoading(true);
      const offset = (pageNum - 1) * limit;
      let url = `/public/projects?limit=${limit}&offset=${offset}`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (tinh && tinh !== 'Tất cả địa điểm') url += `&tinh=${encodeURIComponent(tinh)}`;
      if (loai && loai !== 'Tất cả loại dự án') url += `&loai=${encodeURIComponent(loai)}`;

      const res = await api.get(url);
      setProjects(res.data.projects);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get('q') || '';
    const tinh = searchParams.get('tinh') || 'Tất cả địa điểm';
    const loai = searchParams.get('loai') || 'Tất cả loại dự án';
    
    setQuery(q);
    setLocation(tinh);
    setType(loai);
    setPage(1);

    fetchProjects(q, tinh, loai, 1);
  }, [searchParams]);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (location !== 'Tất cả địa điểm') params.set('tinh', location);
    if (type !== 'Tất cả loại dự án') params.set('loai', type);
    setSearchParams(params);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    const q = searchParams.get('q') || '';
    const tinh = searchParams.get('tinh') || 'Tất cả địa điểm';
    const loai = searchParams.get('loai') || 'Tất cả loại dự án';
    fetchProjects(q, tinh, loai, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Search Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">Tìm kiếm dự án</h1>
          <form className="flex flex-col md:flex-row gap-4" onSubmit={handleSearch}>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tên dự án, mã dự án..." 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:w-64 relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select 
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full pl-10 pr-10 py-2 appearance-none border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Tất cả địa điểm</option>
                <option>Hà Nội</option>
                <option>TP. Hồ Chí Minh</option>
                <option>Bắc Ninh</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
            <div className="md:w-64 relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select 
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full pl-10 pr-10 py-2 appearance-none border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Tất cả loại dự án</option>
                <option>Hạ tầng giao thông</option>
                <option>Khu đô thị</option>
                <option>Công nghiệp</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
            <Button type="submit" className="md:w-32 bg-blue-600 hover:bg-blue-700 text-white">Tìm kiếm</Button>
          </form>
        </div>

        {/* Results */}
        <div className="mb-6">
          <h2 className="text-lg font-medium text-slate-700">
            Tìm thấy {total} dự án {searchParams.get('q') ? `cho từ khóa "${searchParams.get('q')}"` : ''}
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm">
            <Search className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 text-lg">Không tìm thấy dự án nào phù hợp với điều kiện tìm kiếm.</p>
            <Button variant="outline" className="mt-4" onClick={() => {
              setQuery(''); setLocation('Tất cả địa điểm'); setType('Tất cả loại dự án');
              setSearchParams(new URLSearchParams());
            }}>
              Xóa bộ lọc
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(p => (
                <article key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                  <div className="h-48 relative overflow-hidden bg-slate-100">
                    <img 
                      src={p.cover_image_url || '/placeholder.jpg'} 
                      alt={p.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.src = 'https://placehold.co/600x400/e2e8f0/64748b?text=No+Image' }}
                    />
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-blue-700">
                      {p.stage || p.status}
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800 mb-2 line-clamp-2">
                      <Link to={`/du-an/${p.id}`} className="hover:text-blue-600 transition-colors">{p.name}</Link>
                    </h3>
                    <p className="text-slate-500 text-sm mb-4 line-clamp-2 flex-1">
                      {p.description || "Chưa có thông tin mô tả cho dự án này."}
                    </p>
                    <div className="space-y-2 text-sm text-slate-600 mb-5">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-slate-400" /> {p.province || p.location}
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-slate-400" /> {p.project_type || 'Chưa phân loại'}
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={16} className="text-slate-400" /> 
                        Dự kiến hoàn thành: {p.expected_completion_date ? new Date(p.expected_completion_date).toLocaleDateString('vi-VN') : 'Đang cập nhật'}
                      </div>
                    </div>
                    <Button variant="outline" className="w-full justify-between group" onClick={() => navigate(`/du-an/${p.id}`)}>
                      Xem chi tiết 
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center gap-2">
                <Button 
                  variant="outline" 
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  Trước
                </Button>
                {[...Array(totalPages)].map((_, i) => (
                  <Button 
                    key={i} 
                    variant={page === i + 1 ? 'default' : 'outline'}
                    className={page === i + 1 ? 'bg-blue-600' : ''}
                    onClick={() => handlePageChange(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button 
                  variant="outline" 
                  disabled={page === totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Sau
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
