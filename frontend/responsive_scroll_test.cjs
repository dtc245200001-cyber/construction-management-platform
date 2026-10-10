const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport with small height to FORCE vertical scroll
  const viewports = [
    { width: 1920, height: 300, name: 'desktop' },
    { width: 1024, height: 300, name: 'tablet-landscape' },
    { width: 768, height: 300, name: 'tablet-portrait' },
    { width: 375, height: 300, name: 'mobile' },
  ];

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    // Assume already logged in or login logic needed?
    // Project is using localhost:5173, no auth required for direct test if we mock or if session persists? 
    // Wait, the previous test had login. Let's add login just in case.
    await page.goto('http://localhost:5173/login');
    await page.waitForSelector('input[type="email"]', {timeout: 5000}).catch(()=>console.log("no login"));
    
    // Check if login form is there
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await page.type('input[type="email"]', 'test@example.com');
      await page.type('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    await page.evaluate(() => {
       localStorage.setItem('currentProjectId', '13'); 
    });

    await page.goto('http://localhost:5173/gantt');
    await new Promise(r => setTimeout(r, 4000)); // wait for API and render

    for (const vp of viewports) {
      await page.setViewport(vp);
      await new Promise(r => setTimeout(r, 1000)); // wait for layout
      
      // Cuộn dọc 200px và ngang 50px (để test luôn cả sticky left và top)
      await page.evaluate(() => {
        const scrollContainer = document.querySelector('.overflow-auto.custom-scrollbar');
        if (scrollContainer) {
          scrollContainer.scrollBy(50, 200);
        }
      });
      await new Promise(r => setTimeout(r, 500)); // Wait for scroll render

      const file = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/gantt_scrolled_${vp.name}.png`;
      await page.screenshot({ path: file });
      console.log(`Saved ${file}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
