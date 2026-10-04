import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicLayout from '../PublicLayout';
import { describe, it, expect, vi } from 'vitest';

describe('PublicLayout Navigation', () => {
  it('renders correct navigation links and sets active state', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/du-an']}>
        <PublicLayout user={null} setUser={() => {}} />
      </MemoryRouter>
    );
    
    // Nút logo
    const homeLinks = screen.getAllByRole('link', { name: /Trang chủ/i, hidden: true });
    expect(homeLinks.length).toBeGreaterThan(0);
    
    // Các nav links
    const navs = screen.getAllByRole('link', { name: /Trang chủ|Dự án|Nhà thầu|Vật tư|Tin tức|Liên hệ/i });
    expect(navs.length).toBeGreaterThan(0);
    
    // Mục "Dự án" đang ở /du-an thì sẽ được active
    const projectLink = navs.find(n => n.textContent === 'Dự án');
    expect(projectLink).toHaveClass('active');
  });

  it('shows admin link for system admin', () => {
    const adminUser = { id: 1, email: 'admin@test.com', is_system_admin: true };
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicLayout user={adminUser} setUser={() => {}} />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Quản trị')).toBeInTheDocument();
  });

  it('hides admin link for normal user', () => {
    const normalUser = { id: 2, email: 'user@test.com', is_system_admin: false };
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicLayout user={normalUser} setUser={() => {}} />
      </MemoryRouter>
    );
    
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
  });

  it('handles logout flow', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'Đăng xuất thành công' }),
      })
    );

    const setUserMock = vi.fn();
    const user = { id: 2, email: 'user@test.com' };

    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicLayout user={user} setUser={setUserMock} />
      </MemoryRouter>
    );

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(setUserMock).toHaveBeenCalledWith(null);
    });
  });
});
