function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanHeaderString(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Render nội dung email mời vào dự án
 * @param {Object} data 
 * @param {string} data.inviterName 
 * @param {string} data.projectName 
 * @param {string} data.role 
 * @param {string} data.token 
 * @param {boolean} data.isNewUser 
 * @param {string} data.baseUrl 
 * @returns {Object} { subject, html, text }
 */
function renderProjectInvite({ inviterName, projectName, role, token, isNewUser, baseUrl }) {
  const safeProject = cleanHeaderString(projectName);
  
  const subject = `Lời mời tham gia dự án: ${safeProject}`;

  // Liên kết (Link)
  const actionLink = `${baseUrl}/invitations/${encodeURIComponent(token)}/accept`;

  const htmlInviter = escapeHtml(inviterName);
  const htmlProject = escapeHtml(projectName);
  const htmlRole = escapeHtml(role);

  const textBody = `Xin chào,\n\nBạn đã được ${inviterName} mời tham gia dự án "${projectName}" với vai trò là "${role}".\n\nĐể chấp nhận lời mời, vui lòng truy cập liên kết sau:\n${actionLink}\n\nLiên kết này có hiệu lực trong 7 ngày.\n\nNếu bạn không mong đợi email này, hãy bỏ qua.`;

  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #2563eb;">Nền tảng thi công</h2>
      <p>Xin chào,</p>
      <p>Bạn đã được <strong>${htmlInviter}</strong> mời tham gia dự án "<strong>${htmlProject}</strong>" với vai trò là "<strong>${htmlRole}</strong>".</p>
      <div style="margin: 30px 0;">
        <a href="${actionLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Chấp nhận lời mời</a>
      </div>
      <p>Liên kết này có hiệu lực trong 7 ngày.</p>
      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 30px 0;" />
      <p style="font-size: 12px; color: #666;">Nếu bạn không mong đợi email này, hãy bỏ qua.</p>
    </div>
  `;

  return {
    subject,
    html: htmlBody,
    text: textBody
  };
}

module.exports = {
  renderProjectInvite
};
