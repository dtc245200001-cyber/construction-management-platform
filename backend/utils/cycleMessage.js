"use strict";

/**
 * Định dạng mảng tên công việc thành câu thông báo vòng phụ thuộc tiếng Việt.
 * @param {string[]} names Mảng tên các công việc theo thứ tự chờ (không lặp lại việc đầu ở cuối)
 * @returns {string} Câu thông báo
 */
function formatCycleSentence(names) {
  if (!names || names.length === 0) {
    return "";
  }

  const safeNames = names.map(name => {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return "(công việc không tên)";
    }
    // Lọc bỏ #id nếu vô tình lọt vào (dù người gọi đã phải xử lý trước)
    // Nhưng yêu cầu là "Thiếu tên thì dùng (công việc không tên), không dùng #id."
    // Xử lý đơn giản: nếu chuỗi bắt đầu bằng # và là số, đổi thành không tên.
    if (/^#\d+$/.test(name.trim())) {
      return "(công việc không tên)";
    }
    return name.trim();
  });

  if (safeNames.length === 1) {
    return `Công việc "${safeNames[0]}" không thể chờ chính nó.`;
  }

  let sentence = "";
  for (let i = 0; i < safeNames.length; i++) {
    const current = safeNames[i];
    const next = safeNames[(i + 1) % safeNames.length];
    
    if (i === 0) {
      sentence += `Công việc "${current}" chờ "${next}"`;
    } else if (i === safeNames.length - 1) {
      sentence += `, "${current}" lại chờ "${next}".`;
    } else {
      sentence += `, "${current}" chờ "${next}"`;
    }
  }

  return sentence;
}

module.exports = {
  formatCycleSentence
};
