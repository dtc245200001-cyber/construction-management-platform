import React from 'react';
import { Link } from 'react-router-dom';

export default function ComingSoonPage({ title = "Trang này" }) {
  return (
    <div style={{ textAlign: 'center', padding: '100px 20px', minHeight: '60vh' }}>
      <h1 style={{ fontSize: '32px', color: '#0f172a', marginBottom: '20px' }}>Sắp ra mắt</h1>
      <p style={{ fontSize: '18px', color: '#64748b', marginBottom: '30px' }}>
        {title} đang được xây dựng và sẽ sớm ra mắt. Cảm ơn bạn đã quan tâm!
      </p>
      <Link to="/" style={{ display: 'inline-block', padding: '10px 20px', background: '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none' }}>
        Quay lại Trang chủ
      </Link>
    </div>
  );
}
