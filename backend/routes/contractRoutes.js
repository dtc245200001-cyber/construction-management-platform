const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Import kết nối cơ sở dữ liệu

// authenticateToken là hàm middleware kiểm tra token đăng nhập
// Hàm này sẽ giải mã token và gắn thông tin người dùng vào req.user
const authenticateToken = require('../middleware/auth');

// API Lấy thông tin chi tiết một hợp đồng
router.get('/contracts/:contractId', authenticateToken, async (req, res) => {
    try {
        const contractId = req.params.contractId; // Lấy ID hợp đồng từ URL
        const currentUserId = req.user.id; // Lấy ID người dùng từ Token đã giải mã

        // Chạy câu lệnh truy vấn có khóa INNER JOIN
        const result = await db.query(
            `SELECT c.* 
       FROM contracts c
       INNER JOIN project_members pm ON c.project_id = pm.project_id
       WHERE pm.user_id = $1 AND c.id = $2`,
            [currentUserId, contractId] // Truyền tham số an toàn
        );

        // Nếu kết quả trả về rỗng -> Người dùng không có quyền hoặc hợp đồng không tồn tại
        if (result.rows.length === 0) {
            return res.status(403).json({
                message: 'Bạn không có quyền xem dữ liệu hợp đồng này hoặc dữ liệu không tồn tại.'
            });
        }

        // Nếu qua được cổng bảo vệ, trả dữ liệu về cho Frontend
        res.json(result.rows[0]);

    } catch (error) {
        console.error('Lỗi truy vấn cơ sở dữ liệu:', error);
        res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
    }
});

module.exports = router;