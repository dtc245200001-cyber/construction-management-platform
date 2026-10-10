const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Login
    await page.goto('http://localhost:5173/login');
    await page.waitForSelector('input[type="email"]', {timeout: 5000});
    await page.type('input[type="email"]', 'test@example.com');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Set project ID in localStorage
    await page.evaluate(() => {
       localStorage.setItem('currentProjectId', '13'); // huong project
    });
    
    // Go to gantt
    await page.goto('http://localhost:5173/gantt');
    await new Promise(r => setTimeout(r, 4000)); // wait for API and SVG to render
    
    await page.screenshot({ path: 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/gantt_screenshot_real.png' });
    await browser.close();
    console.log('Done');
})();
