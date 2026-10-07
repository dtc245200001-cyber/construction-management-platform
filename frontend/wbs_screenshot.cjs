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
    
    // Go to WBS
    await page.goto('http://localhost:5173/wbs');
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/wbs_initial.png' });
    
    // Scroll down by 100px
    await page.evaluate(() => window.scrollBy(0, 100));
    await new Promise(r => setTimeout(r, 500));
    
    await page.screenshot({ path: 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/wbs_scrolled.png' });
    
    // Scroll a specific container if window doesn't scroll
    await page.evaluate(() => {
       const el = document.querySelector('.overflow-x-auto');
       if (el) el.scrollBy(0, 100);
       const main = document.querySelector('main');
       if (main) main.scrollBy(0, 100);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/wbs_container_scrolled.png' });
    
    await browser.close();
    console.log('Done');
})();
