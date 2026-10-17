const { spawn } = require("child_process");
const path = require("path");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", " Khởi động Construction Management Platform...");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

// 1. Chạy Backend
const backend = spawn(npmCmd, ["run", "dev"], {
  cwd: path.join(__dirname, "backend"),
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
});

backend.stdout.on("data", (data) => {
  process.stdout.write(`\x1b[34m[Backend]\x1b[0m ${data}`);
});

backend.stderr.on("data", (data) => {
  process.stderr.write(`\x1b[31m[Backend Error]\x1b[0m ${data}`);
});

// 2. Chạy Frontend
const frontend = spawn(npmCmd, ["run", "dev"], {
  cwd: path.join(__dirname, "frontend"),
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
});

frontend.stdout.on("data", (data) => {
  process.stdout.write(`\x1b[32m[Frontend]\x1b[0m ${data}`);
});

frontend.stderr.on("data", (data) => {
  process.stderr.write(`\x1b[33m[Frontend Error]\x1b[0m ${data}`);
});

function cleanup() {
  console.log("\n\x1b[33m%s\x1b[0m", "Đang dừng các dịch vụ...");
  try {
    if (isWin) {
      if (backend.pid) spawn("taskkill", ["/pid", backend.pid, "/f", "/t"]);
      if (frontend.pid) spawn("taskkill", ["/pid", frontend.pid, "/f", "/t"]);
    } else {
      backend.kill("SIGTERM");
      frontend.kill("SIGTERM");
    }
  } catch (err) {
    // ignore cleanup errors
  }
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
