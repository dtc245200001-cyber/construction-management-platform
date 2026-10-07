const puppeteer = require('puppeteer');

async function takeScreenshots() {
    const browser = await puppeteer.launch();
    
    // Helper function to setup page and login
    async function setupPage(width, height) {
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.goto('http://localhost:5173/login');
        await page.waitForSelector('input[type="email"]', {timeout: 5000});
        await page.type('input[type="email"]', 'test@example.com');
        await page.type('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate(() => { localStorage.setItem('currentProjectId', '13'); });
        await page.goto('http://localhost:5173/wbs');
        await new Promise(r => setTimeout(r, 2000));
        return page;
    }

    const dir = 'C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf';

    // 1. Vừa load trang (Desktop)
    let page = await setupPage(1280, 800);
    await page.screenshot({ path: `${dir}/wbs_after_1_initial.png` });
    
    // 2. Cuộn xuống giữa bảng rồi cuộn ngược lên (chứng minh banner không bị đè)
    // We scroll the table container
    await page.evaluate(() => {
        const container = document.querySelector('.overflow-y-auto.overflow-x-auto');
        if (container) container.scrollBy(0, 200);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `${dir}/wbs_after_2_scrolled.png` });
    await page.close();

    // 3. Cuộn ngang 1024px
    page = await setupPage(1024, 768);
    // Expand a category to ensure we have the action buttons
    try {
      await page.evaluate(() => {
          const btn = document.querySelector('td button');
          if(btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}
    
    await page.evaluate(() => {
        const container = document.querySelector('.overflow-x-auto');
        if (container) container.scrollTo(9999, 0); // scroll max right
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `${dir}/wbs_after_3_horizontal_1024.png` });
    await page.close();

    // 4. Cuộn ngang 375px
    page = await setupPage(375, 812);
    // Expand a category
    try {
      await page.evaluate(() => {
          const btn = document.querySelector('td button');
          if(btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}
    
    await page.evaluate(() => {
        const container = document.querySelector('.overflow-x-auto');
        if (container) container.scrollTo(9999, 0); // scroll max right
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `${dir}/wbs_after_3_horizontal_375.png` });
    await page.close();

    await browser.close();
    console.log('Done');
}

takeScreenshots();
