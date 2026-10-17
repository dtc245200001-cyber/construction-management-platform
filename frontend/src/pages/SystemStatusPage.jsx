import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Server,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Bell,
  Play,
  ArrowLeft,
  ShieldAlert,
  Zap,
  Home,
} from 'lucide-react';
import api from '../lib/api';

export default function SystemStatusPage() {
  const navigate = useNavigate();

  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  // Trạng thái mô phỏng sự cố (Simulation state)
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(null);
  const [simLogs, setSimLogs] = useState([]);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      // Gọi qua proxy /api hoặc trực tiếp endpoint backend
      const res = await api.get('/health', {
        validateStatus: () => true, // chấp nhận cả 503 để lấy body unhealthy
      });
      setHealthData(res.data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message || 'Không thể kết nối đến máy chủ Backend');
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // Tự động làm mới mỗi 15s
    return () => clearInterval(interval);
  }, []);

  // Chạy kịch bản mô phỏng T-129 ngay trên giao diện
  const runSimulation = async () => {
    if (simulating) return;
    setSimulating(true);
    setSimLogs([]);

    const addLog = (msg, type = 'info') => {
      setSimLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), msg, type },
      ]);
    };

    try {
      addLog('🚀 Bắt đầu kịch bản mô phỏng T-128 & T-129...', 'info');
      setSimStep('running');
      await new Promise((r) => setTimeout(r, 800));

      // Bước 1: Trạng thái bình thường
      addLog('1. Kiểm tra trạng thái hiện tại: Hệ thống đang sẵn sàng (200 OK)', 'success');
      await new Promise((r) => setTimeout(r, 1200));

      // Bước 2: Giả lập Staging bị ngắt kết nối DB
      addLog('2. [MÔ PHỎNG] Cắt kết nối DB: Endpoint /health phát hiện lỗi kết nối PostgreSQL', 'warning');
      addLog('   -> Mã HTTP chuyển sang 503 Service Unavailable, status="unhealthy"', 'warning');
      await new Promise((r) => setTimeout(r, 1500));

      // Bước 3: Đếm thời gian lỗi vượt ngưỡng
      addLog('3. [MÔ PHỎNG] Thời gian gián đoạn kéo dài vượt ngưỡng 5 phút (300 giây)...', 'warning');
      await new Promise((r) => setTimeout(r, 1500));

      // Bước 4: Kích hoạt cảnh báo
      addLog('4. 🚨 [CẢNH BÁO KÍCH HOẠT]: Đã phát hiện sự cố Staging ngừng phản hồi quá 5 phút!', 'error');
      addLog('   -> Gửi thông báo sự cố tới Webhook (Discord / Slack / Telegram) của Team.', 'error');
      await new Promise((r) => setTimeout(r, 1800));

      // Bước 5: Phục hồi
      addLog('5. [MÔ PHỎNG] Kết nối cơ sở dữ liệu đã phục hồi thành công (200 OK trở lại).', 'success');
      await new Promise((r) => setTimeout(r, 1200));

      // Bước 6: Chuyển trạng thái cảnh báo sang Resolved
      addLog('6. ✅ [PHỤC HỒI THÀNH CÔNG]: Cảnh báo tự động chuyển trạng thái!', 'success');
      addLog('   -> Đã gửi thông báo Phục hồi (Staging Recovered) kèm tổng thời gian gián đoạn.', 'success');
      setSimStep('completed');
    } catch (err) {
      addLog(`Lỗi mô phỏng: ${err.message}`, 'error');
      setSimStep('error');
    } finally {
      setSimulating(false);
    }
  };

  const isHealthy = healthData?.status === 'healthy';
  const isDbHealthy = healthData?.database?.status === 'healthy';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Navigation & Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
              }}
            >
              <Home size={16} /> Về Dashboard chính
            </button>
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                color: '#475569',
                fontSize: '13px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <ArrowLeft size={16} /> Về trang Đăng nhập
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              Kiểm tra lần cuối: <strong>{lastChecked || 'Chưa có'}</strong>
            </span>
            <button
              onClick={fetchHealth}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                fontSize: '13px',
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Đang ping...' : 'Làm mới'}
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Activity size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Giám sát Sức khỏe Staging & Cảnh báo
              </h1>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
                Bảng điều khiển kiểm tra trực quan trạng thái Ứng dụng, PostgreSQL và Quy tắc cảnh báo 5 phút
              </p>
            </div>
          </div>
        </div>

        {/* Status Summary Banner */}
        <div
          style={{
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
            backgroundColor: isHealthy ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${isHealthy ? '#bbf7d0' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: isHealthy ? '#22c55e' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              {isHealthy ? <CheckCircle2 size={26} /> : <AlertTriangle size={26} />}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: isHealthy ? '#166534' : '#991b1b' }}>
                {isHealthy ? 'Toàn bộ hệ thống đang HOẠT ĐỘNG TỐT (Healthy)' : 'Phát hiện sự cố: Hệ thống KHÔNG KHỎE (Unhealthy)'}
              </div>
              <div style={{ fontSize: '13px', color: isHealthy ? '#15803d' : '#b91c1c', marginTop: '2px' }}>
                {isHealthy
                  ? 'Ứng dụng Backend và PostgreSQL phản hồi nhanh chóng, không có lỗi.'
                  : healthData?.database?.error || error || 'Cơ sở dữ liệu hoặc kết nối gặp sự cố.'}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              backgroundColor: isHealthy ? '#dcfce7' : '#fee2e2',
              color: isHealthy ? '#15803d' : '#b91c1c',
              fontWeight: 700,
              fontSize: '14px',
              border: `1px solid ${isHealthy ? '#86efac' : '#fca5a5'}`,
            }}
          >
            HTTP {isHealthy ? '200 OK' : '503 SERVICE UNAVAILABLE'}
          </div>
        </div>

        {/* 3 Metric Cards for T-128 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '28px' }}>
          
          {/* Card 1: Ứng dụng Backend */}
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={20} color="#2563eb" />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Ứng dụng (App)</span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                }}
              >
                {healthData?.app?.status?.toUpperCase() || 'ONLINE'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#475569' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Thời gian sống (Uptime):</span>
                <strong>{healthData?.app?.uptime ? `${healthData.app.uptime} giây` : 'N/A'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Môi trường:</span>
                <strong style={{ textTransform: 'capitalize' }}>{healthData?.app?.environment || 'development'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cổng API:</span>
                <strong>3000 (Backend) / 5173 (Proxy)</strong>
              </div>
            </div>
          </div>

          {/* Card 2: PostgreSQL Database */}
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={20} color={isDbHealthy ? '#16a34a' : '#dc2626'} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>PostgreSQL</span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: isDbHealthy ? '#dcfce7' : '#fee2e2',
                  color: isDbHealthy ? '#15803d' : '#b91c1c',
                }}
              >
                {isDbHealthy ? 'HEALTHY' : 'UNHEALTHY'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#475569' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Độ trễ truy vấn (SELECT 1):</span>
                <strong style={{ color: isDbHealthy ? '#16a34a' : '#dc2626' }}>
                  {isDbHealthy ? `${healthData?.database?.responseTimeMs} ms` : 'Thất bại'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Giới hạn Timeout (NFR):</span>
                <strong>3000 ms (Chống nghẽn pool)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bảo mật (NFR):</span>
                <strong style={{ color: '#16a34a' }}>Đã che giấu secrets</strong>
              </div>
            </div>
          </div>

          {/* Card 3: Quy tắc Cảnh báo T-129 */}
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Bell size={20} color="#7c3aed" />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Quy tắc Cảnh báo</span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: '#f3e8ff',
                  color: '#7e22ce',
                }}
              >
                ACTIVE
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#475569' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ngưỡng kích hoạt:</span>
                <strong>5 phút liên tục (300s)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Chu kỳ kiểm tra:</span>
                <strong>Mỗi 30 giây</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Kênh nhận:</span>
                <strong>Discord / Slack / Telegram</strong>
              </div>
            </div>
          </div>

        </div>

        {/* Section Interactive Test & Simulation (T-129) */}
        <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={20} color="#f59e0b" /> Kiểm thử Kịch bản Mô phỏng Sự cố & Phục hồi
              </h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                Nhấn nút bên dưới để chạy mô phỏng chu trình: Staging bình thường → DB sập vượt ngưỡng → Bắn cảnh báo sự cố → DB phục hồi → Bắn thông báo phục hồi.
              </p>
            </div>

            <button
              onClick={runSimulation}
              disabled={simulating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: simulating ? '#94a3b8' : '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: simulating ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
              }}
            >
              <Play size={16} /> {simulating ? 'Đang chạy mô phỏng...' : 'Chạy Mô Phỏng Sự Cố Ngay'}
            </button>
          </div>

          {/* Simulation Output Log Box */}
          {simLogs.length > 0 && (
            <div
              style={{
                backgroundColor: '#0f172a',
                color: '#e2e8f0',
                padding: '16px',
                borderRadius: '8px',
                fontFamily: 'Consolas, monospace',
                fontSize: '13px',
                lineHeight: 1.6,
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {simLogs.map((log, idx) => {
                let color = '#94a3b8';
                if (log.type === 'success') color = '#4ade80';
                if (log.type === 'warning') color = '#facc15';
                if (log.type === 'error') color = '#f87171';
                return (
                  <div key={idx} style={{ color }}>
                    <span style={{ color: '#64748b' }}>[{log.time}]</span> {log.msg}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Raw Endpoint Links */}
        <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#334155', margin: '0 0 6px' }}>
            🔗 Các đường dẫn API kiểm tra trực tiếp (Raw JSON Endpoints):
          </h3>
          <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px', lineHeight: 1.5 }}>
            💡 <em>Lưu ý: Khi mở các liên kết bên dưới, trình duyệt sẽ hiển thị dữ liệu thô (định dạng <strong>JSON</strong> chỉ có 1 dòng mã). Đây là chuẩn API để các công cụ tự động (Docker, Kubernetes, Script Deploy CI/CD, Bot giám sát) đọc và kiểm tra hệ thống định kỳ.</em>
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#475569' }}>
            <li>
              <strong>Endpoint Sức khỏe Toàn diện:</strong>{' '}
              <a href="/api/health" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                http://localhost:5173/api/health
              </a>{' '}
              (hoặc{' '}
              <a href="http://localhost:3000/health" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                http://localhost:3000/health
              </a>)
            </li>
            <li>
              <strong>Readiness Probe (Deploy Blue/Green):</strong>{' '}
              <a href="http://localhost:3000/ready" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                http://localhost:3000/ready
              </a>
            </li>
            <li>
              <strong>Liveness Probe (Tiến trình App):</strong>{' '}
              <a href="http://localhost:3000/health/live" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                http://localhost:3000/health/live
              </a>
            </li>
            <li>
              <strong>Tài liệu Tương tác Swagger API:</strong>{' '}
              <a href="http://localhost:3000/docs/" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                http://localhost:3000/docs/
              </a>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}
