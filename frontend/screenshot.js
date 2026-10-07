import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Login
    await page.goto('http://localhost:5173/login');
    await page.waitForSelector('input[name="email"]');
    await page.type('input[name="email"]', 'test@example.com');
    await page.type('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Set project ID in localStorage
    await page.evaluate(() => {
       localStorage.setItem('currentProjectId', '13'); // huong project
    });
    
    // Go to gantt
    await page.goto('http://localhost:5173/gantt', { waitUntil: 'networkidle0' });
    
    await page.waitForSelector('svg', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000)); // wait for full render
    
    const screenshotPath = 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/gantt_screenshot.png';
    await page.screenshot({ path: screenshotPath });
    
    await browser.close();
    console.log("Screenshot saved to: " + screenshotPath);
  } catch (err) {
    console.error(err);
  }
})();
