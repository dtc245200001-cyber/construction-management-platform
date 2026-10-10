const puppeteer = require('puppeteer');

const viewports = [
  { width: 1920, height: 1080, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet-landscape' },
  { width: 768, height: 1024, name: 'tablet-portrait' },
  { width: 375, height: 667, name: 'mobile' },
];

const paths = ['wbs', 'gantt'];

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    try {
      // Login
      await page.setViewport({ width: 1920, height: 1080 });
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
      
      for (const p of paths) {
        await page.goto(`http://localhost:5173/${p}`);
        await new Promise(r => setTimeout(r, 4000)); // wait for API
        
        for (const vp of viewports) {
          await page.setViewport(vp);
          await new Promise(r => setTimeout(r, 1000)); // wait for layout shift
          
          if (p === 'gantt') {
             // Day mode
             let file = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/responsive_${p}_${vp.name}_day_after.png`;
             await page.screenshot({ path: file });
             console.log(`Saved ${file}`);
             
             // Week mode
             await page.evaluate(() => {
               [...document.querySelectorAll('button')].find(b => b.textContent.includes('Chế độ Tuần'))?.click();
             });
             await new Promise(r => setTimeout(r, 500));
             file = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/responsive_${p}_${vp.name}_week_after.png`;
             await page.screenshot({ path: file });
             console.log(`Saved ${file}`);
             
             // Revert
             await page.evaluate(() => {
               [...document.querySelectorAll('button')].find(b => b.textContent.includes('Chế độ Ngày'))?.click();
             });
             await new Promise(r => setTimeout(r, 500));
          } else {
             const file = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/responsive_${p}_${vp.name}_after.png`;
             await page.screenshot({ path: file });
             console.log(`Saved ${file}`);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    
    await browser.close();
    console.log('Done');
})();
