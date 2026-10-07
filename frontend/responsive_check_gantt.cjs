const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const viewports = [
    { width: 1920, height: 1080, name: 'desktop' },
    { width: 1024, height: 768, name: 'tablet-landscape' },
    { width: 768, height: 1024, name: 'tablet-portrait' },
    { width: 375, height: 667, name: 'mobile' },
  ];

  await page.goto('http://localhost:5173/gantt');
  await new Promise(r => setTimeout(r, 2000)); // wait for network and render

  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await new Promise(r => setTimeout(r, 1000));
    const file = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/responsive_gantt_${vp.name}_day.png`;
    await page.screenshot({ path: file });
    console.log(`Saved ${file}`);
    
    // click week mode
    await page.click('button:has-text("Chế độ Tuần")');
    await new Promise(r => setTimeout(r, 500));
    const fileWeek = `C:/Users/Admin/.gemini/antigravity-ide/brain/c1ec78b1-1cf9-4afc-a964-faedaac7dcdf/responsive_gantt_${vp.name}_week.png`;
    await page.screenshot({ path: fileWeek });
    console.log(`Saved ${fileWeek}`);
    
    // revert to day mode
    await page.click('button:has-text("Chế độ Ngày")');
    await new Promise(r => setTimeout(r, 500));
  }
  
  await browser.close();
})();
