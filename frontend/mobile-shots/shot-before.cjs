const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const FE = "http://localhost:5173";
const OUT = process.argv[2] || "D:/construction-management-platform/frontend/mobile-shots/before";
fs.mkdirSync(OUT, { recursive: true });
// Credential test doc tu file tam (gitignored), khong hardcode de tranh lo lot khi commit.
const CREDS = JSON.parse(fs.readFileSync(path.join(__dirname, ".creds.json"), "utf8"));

// Route + tên file ảnh. Các route dashboard cần currentProjectId trong localStorage.
const ROUTES = [
  ["login", "/login"],
  ["home", "/"],
  ["public-projects", "/du-an"],
  ["public-detail", "/du-an/1"],
  ["projects", "/projects"],
  ["dashboard", "/dashboard"],
  ["wbs", "/wbs"],
  ["wbs-diagram", "/wbs-diagram"],
  ["schedule", "/schedule"],
  ["gantt", "/gantt"],
  ["warnings", "/warnings"],
  ["calendar", "/calendar"],
  ["field", "/field"],
  ["diary", "/diary"],
  ["members", "/members"],
  ["admin", "/admin"],
  ["invite-accept", "/invitations/xxx/accept"],
];

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const VW = parseInt(process.argv[3] || "375", 10);
  const VH = parseInt(process.argv[4] || "667", 10);
  await page.setViewport({ width: VW, height: VH, isMobile: true, hasTouch: true });

  // Đăng nhập 1 lần để lấy session cho các route cần auth
  await page.goto(`${FE}/login`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT, "01-login.png") });

  const emailInputs = await page.$$('form.nl-form-pane.nl-active input[type="email"]');
  if (emailInputs.length > 0) {
    await page.type('form.nl-form-pane.nl-active input[type="email"]', CREDS.email);
    await page.type('form.nl-form-pane.nl-active input[type="password"]', CREDS.password);
    await Promise.all([
      page.click("form.nl-form-pane.nl-active .nl-submit-btn"),
      page.waitForFunction('window.location.pathname.includes("/projects")', { timeout: 15000 }).catch(() => {}),
    ]);
    await new Promise((r) => setTimeout(r, 2000));
    console.log("after login, url =", page.url());
    const loginErr = await page
      .$eval(".nl-alert-error", (el) => el.textContent)
      .catch(() => "");
    if (loginErr) console.log("LOGIN ERROR SHOWN:", loginErr.trim());
  } else {
    console.log("no login form (maybe already logged in?), url =", page.url());
  }

  for (const [name, route] of ROUTES) {
    if (name === "login") continue;
    try {
      await page.goto(`${FE}${route}`, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 2000));
      // Ghi lại có tràn ngang không
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      console.log(`${name}: url=${page.url()} scrollW=${overflow.scrollW} clientW=${overflow.clientW} ${overflow.scrollW > overflow.clientW ? "OVERFLOW!" : "ok"}`);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    } catch (e) {
      console.log(`${name}: ERROR ${e.message}`);
    }
  }

  await browser.close();
  console.log("done ->", OUT);
})();
