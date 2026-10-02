# Invitation & Project Members UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the frontend UI for displaying invitation status, resending invitations on the Members page, and accepting invitations via a dedicated page.

**Architecture:** We will modify `MembersPage.jsx` to show `email_status` and `is_expired` for each invitation, along with a "Gửi lại" button. We will also create a new page `InvitationAcceptPage.jsx` and add it to `App.jsx`'s routing to handle the invitation acceptance flow.

**Tech Stack:** React, React Router, Tailwind CSS, Lucide React, Axios (via our `api` helper).

---

### Task 1: Update MembersPage.jsx to support email status and resend

**Files:**
- Modify: `d:/construction-management-platform/frontend/src/pages/MembersPage.jsx`

**Step 1: Write minimal implementation for MembersPage**

In `MembersPage.jsx`, modify the `invitations.map((inv) => ...)` section:
1. Add state for `resendingId` to show loading state on specific buttons: `const [resendingId, setResendingId] = useState(null);`
2. Add a `handleResend(invId)` function:
```javascript
  const handleResend = async (invId) => {
    setResendingId(invId);
    try {
      await api.post(`/projects/${currentProjectId}/invitations/${invId}/resend`);
      setInviteSuccess("Đã gửi lại thư mời thành công!");
      fetchMembers();
    } catch (err) {
      setInviteError(err.response?.data?.message || "Lỗi khi gửi lại thư mời");
    } finally {
      setResendingId(null);
    }
  };
```
3. Update the invitation rendering to include `email_status` and `is_expired` checks, and render the "Gửi lại" button:
```jsx
// Change the status column rendering:
<td className="px-6 py-4 text-right">
  <div className="flex items-center justify-end gap-2 flex-wrap">
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      inv.email_status === 'error' ? 'bg-site-critical/10 text-site-critical' : 
      inv.email_status === 'sent' ? 'bg-site-success/10 text-site-success' : 
      'bg-site-alert/10 text-site-alert'
    }`}>
      {inv.email_status === 'error' ? 'Lỗi gửi thư' : inv.email_status === 'sent' ? 'Đã gửi thư' : 'Đang gửi...'}
    </span>
    {inv.is_expired && (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-critical/10 text-site-critical">
        Hết hạn
      </span>
    )}
    {canInvite && (
      <button
        onClick={() => handleResend(inv.id)}
        disabled={resendingId === inv.id}
        title="Gửi lại thư mời"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-primary/10 text-site-primary hover:bg-site-primary hover:text-white transition-colors disabled:opacity-50"
      >
        <Mail className="size-3" /> {resendingId === inv.id ? 'Đang gửi...' : 'Gửi lại'}
      </button>
    )}
  </div>
</td>
```

**Step 2: Commit**

```bash
git add frontend/src/pages/MembersPage.jsx
git commit -m "feat(ui): E5 - Hiển thị trạng thái thư mời và tính năng gửi lại"
```

---

### Task 2: Create InvitationAcceptPage.jsx

**Files:**
- Create: `d:/construction-management-platform/frontend/src/pages/InvitationAcceptPage.jsx`

**Step 1: Write the implementation**

Create `InvitationAcceptPage.jsx` with the following content:
```jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { Shield, Mail, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

const roleLabels = {
  chu_dau_tu: "Chủ đầu tư",
  ban_quan_ly: "Ban quản lý",
  ky_su_giam_sat: "Kỹ sư giám sát",
  chi_huy_truong: "Chỉ huy trưởng",
  doi_truong: "Đội trưởng thi công",
  ke_toan: "Kế toán"
};

export default function InvitationAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const res = await api.get(`/public/invitations/${token}`);
        setInvitation(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Mã thư mời không hợp lệ hoặc đã hết hạn');
      } finally {
        setLoading(false);
      }
    };
    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await api.post(`/public/invitations/${token}/accept`);
      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.message.includes('chưa có tài khoản')) {
        navigate(`/login?token=${token}`);
      } else {
        setError(err.response?.data?.message || 'Có lỗi xảy ra khi chấp nhận lời mời');
      }
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-site-bg">
        <div className="text-site-baseline flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-site-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          Đang tải thông tin thư mời...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-site-bg p-4">
      <div className="bg-site-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-site-primary p-6 text-white text-center">
          <div className="size-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="size-8" />
          </div>
          <h2 className="text-2xl font-bold">Thư Mời Tham Gia Dự Án</h2>
        </div>

        <div className="p-6">
          {error ? (
            <div className="bg-site-critical/10 text-site-critical p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Rất tiếc!</p>
                <p className="text-sm mt-1">{error}</p>
                <div className="mt-4">
                  <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
                    Về trang chủ <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : success ? (
            <div className="bg-site-success/10 text-site-success p-6 rounded-xl flex flex-col items-center text-center">
              <CheckCircle className="size-12 mb-3" />
              <p className="font-semibold text-lg">Gia nhập dự án thành công!</p>
              <p className="text-sm mt-1">Đang chuyển hướng về trang chủ...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center text-site-dark">
                <p className="mb-2">Bạn đã được mời tham gia vào hệ thống quản lý dự án.</p>
                
                <div className="bg-site-bg p-4 rounded-xl text-left space-y-3 mt-4">
                  <div className="flex items-center gap-3">
                    <Mail className="size-5 text-site-baseline" />
                    <div>
                      <p className="text-xs text-site-baseline">Email</p>
                      <p className="font-medium text-site-dark">{invitation.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="size-5 text-site-baseline" />
                    <div>
                      <p className="text-xs text-site-baseline">Vai trò được cấp</p>
                      <p className="font-medium text-site-dark">{roleLabels[invitation.projectRole] || invitation.projectRole}</p>
                    </div>
                  </div>
                </div>
              </div>

              {!invitation.userExists && (
                <div className="bg-site-alert/10 text-site-alert p-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>Email này chưa có tài khoản. Bạn sẽ cần tạo tài khoản sau khi ấn chấp nhận.</span>
                </div>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-site-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-site-primary/90 transition-all focus:ring-4 focus:ring-site-primary/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <>
                    <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Đang xử lý...
                  </>
                ) : (
                  <>Chấp nhận lời mời <ArrowRight className="size-5" /></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/InvitationAcceptPage.jsx
git commit -m "feat(ui): E4 - Thêm trang chấp nhận lời mời (Accept Invitation)"
```

---

### Task 3: Add route to App.jsx

**Files:**
- Modify: `d:/construction-management-platform/frontend/src/App.jsx`

**Step 1: Write minimal implementation**

In `App.jsx`, import the new page:
```javascript
import InvitationAcceptPage from './pages/InvitationAcceptPage';
```

And add it to the routing, ideally outside of layouts that require authentication if we want it to be accessible without logging in, but since it's a standalone page, adding it to a blank route or `PublicLayout` is fine. Let's add it right before the `PublicLayout` block as a standalone route, or just inside `Routes`:
```jsx
// Add this right after the AuthLayout block
<Route path="/invitations/:token/accept" element={<InvitationAcceptPage />} />
```

**Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(ui): E4 - Thêm định tuyến cho trang chấp nhận lời mời"
```
