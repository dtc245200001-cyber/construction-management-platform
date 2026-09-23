const express = require("express");
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");

const categoryRoutes = require("./routes/categoryRoutes");
const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép frontend localhost:5173 gọi backend localhost:3000
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// Đọc dữ liệu từ request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 60 * 60 * 1000,
    },
  })
);

// Route đăng nhập
app.use("/api/auth", authRoutes);

app.use("/api", categoryRoutes);
// Kiểm tra backend
app.get("/", (req, res) => {
  res.json({
    message: "Backend is running!",
  });
});

// Kiểm tra PostgreSQL
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "PostgreSQL connected!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});