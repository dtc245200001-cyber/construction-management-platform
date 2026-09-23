const express = require("express");
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const projectRoutes = require("./routes/projectRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// CORS
// =========================
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// =========================
// BODY PARSER
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// SESSION
// =========================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
    },
  })
);

// =========================
// ROUTES
// =========================
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/projects", projectRoutes);

// =========================
// SERVER
// =========================
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});