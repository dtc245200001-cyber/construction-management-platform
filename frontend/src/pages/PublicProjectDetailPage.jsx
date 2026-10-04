import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Building2, CalendarDays, ArrowLeft, Loader2, Info, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '../lib/api';

export default function PublicProjectDetailPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await api.get(`/public/projects/${id}`);
        setProject(res.data.project);
      } catch (err) {
        if (err.response && err.response.status === 404) {
          setError('Không tìm thấy dự án hoặc dự án không được công khai.');
        } else {
          setError('Đã xảy ra lỗi khi tải thông tin dự án.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <Info className="mx-auto text-slate-400 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-slate-800 mb-4">{error}</h2>
          <Button onClick={() => navigate('/du-an')}>Quay lại danh sách</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header with image */}
      <div className="h-64 md:h-96 w-full relative bg-slate-200">
        <img 
          src={project.cover_image_url || '/placeholder.jpg'} 
          alt={project.name} 
          className="w-full h-full object-cover"
          onError={(e) => { e.target.src = 'https://placehold.co/1920x600/e2e8f0/64748b?text=No+Image' }}
        />
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 text-white">
          <div className="max-w-5xl mx-auto">
            <Link to="/du-an" className="inline-flex items-center text-white/80 hover:text-white mb-4 transition-colors">
              <ArrowLeft size={16} className="mr-2" /> Trở về danh sách
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                {project.stage || project.status}
              </span>
              <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
                Mã DA: {project.code}
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight drop-shadow-md">
              {project.name}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Giới thiệu dự án</h2>
              <div className="prose max-w-none text-slate-600 leading-relaxed whitespace-pre-wrap">
                {project.description || 'Chưa có thông tin giới thiệu chi tiết cho dự án này.'}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Thông tin tổng quan</h3>
              <div className="space-y-4 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-slate-400 mt-0.5" />
                  <div>
                    <strong className="block text-slate-800">Địa điểm</strong>
                    <span>{project.location || project.province || 'Đang cập nhật'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 size={18} className="text-slate-400 mt-0.5" />
                  <div>
                    <strong className="block text-slate-800">Loại dự án</strong>
                    <span>{project.project_type || 'Đang cập nhật'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays size={18} className="text-slate-400 mt-0.5" />
                  <div>
                    <strong className="block text-slate-800">Khởi công</strong>
                    <span>{project.start_date ? new Date(project.start_date).toLocaleDateString('vi-VN') : 'Đang cập nhật'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays size={18} className="text-slate-400 mt-0.5" />
                  <div>
                    <strong className="block text-slate-800">Dự kiến hoàn thành</strong>
                    <span>{project.expected_completion_date ? new Date(project.expected_completion_date).toLocaleDateString('vi-VN') : 'Đang cập nhật'}</span>
                  </div>
                </div>
              </div>
            </div>

            {user ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
                <p className="text-blue-800 font-medium mb-4">Bạn là thành viên hoặc quản trị viên hệ thống?</p>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(`/projects/${project.id}`)}>
                  Truy cập Dashboard <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                <p className="text-slate-600 text-sm mb-4">Đây là thông tin công khai. Yêu cầu đăng nhập để xem tiến độ chi tiết nếu bạn là thành viên dự án.</p>
                <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                  Đăng nhập
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
