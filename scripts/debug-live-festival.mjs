// Opt-in: creates one festival via the configured live backend in an isolated browser save.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
const output = '.agents/runtime';
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:800} });
  const title = '月下回声音乐会';
  page.on('response', async r => {
    const path = new URL(r.url()).pathname;
    if (r.request().method() === 'POST' && path.startsWith('/api/voxel/')) {
      console.log('backend', path, r.status());
      if (path.endsWith('/chat') && r.request().postData()?.includes('festivalBrief')) {
        try {
          const json = await r.json();
          console.log('planner', JSON.stringify(json.content || json.message || '').slice(0,6400));
        } catch { /* transport can return a stream */ }
      }
    }
  });
  await page.goto((process.env.CHII_VERIFY_ORIGIN || 'http://127.0.0.1:5173')+'/src/demos/chii-island/?church-town',{waitUntil:'domcontentloaded'});
  await page.locator('#chii-page-loader').waitFor({state:'hidden',timeout:90000});
  const open = async () => { await page.keyboard.press('Escape'); await page.locator('#btn-open-festival-book').click(); };
  await open(); await page.locator('[data-action=plan]').click();
  for (const [field,value] of Object.entries({title,theme:'在月下用身体打节拍，听伙伴们一呼一应',wish:'fangk挥手指挥，momo跳一段豪放的舞，其他伙伴用现有动作应和，不用新道具'})) {
    await page.locator('textarea[name='+field+']').fill(value); await page.locator('.fb-interview [type=submit]').click();
  }
  await page.locator('#festival-dialog').waitFor({state:'hidden'}); console.log('Brief submitted.');
  await open();
  await page.waitForFunction(title => !!document.querySelector('[data-action=retry]') || Array.from(document.querySelectorAll('.fb-entry strong')).some(e=>e.textContent===title), title,{timeout:900000});
  if (await page.locator('[data-action=retry]').count()) throw Error(await page.locator('.fb-job').innerText());
  await page.locator('.fb-entry').filter({hasText:title}).click();
  assert.equal(await page.locator('.fb-node').count(),7);
  await page.locator('[data-member=momo]').click();
  console.log('momo:', await page.locator('.fb-person').innerText());
  await page.locator('#festival-dialog').screenshot({path:output+'/live-festival-program.png'});
  await page.locator('[data-action=hold]').click();
  await page.waitForFunction(title=>window.__townSocialSystem?.activeActivity?.plan?.title===title,title,{timeout:30000});
  await page.waitForFunction(()=>window.__townSocialSystem?.activeActivity?.status==='performing',null,{timeout:160000});
  console.log('Live performance:',await page.evaluate(()=>window.__townSocialSystem.residentActivity()));
} finally { await browser.close(); }
