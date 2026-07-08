import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const logs = [];
page.on('console', msg => {
  const text = msg.text();
  logs.push(`[${msg.type()}] ${text}`);
});
page.on('pageerror', err => {
  logs.push(`[PAGE ERROR] ${err.message}`);
});

await page.goto('http://localhost:5173/src/demos/chii-island/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(8000);

// Get renderer stats
const renderStats = await page.evaluate(() => {
  const r = window.__renderer;
  if (!r) return null;
  return {
    calls: r.info.render.calls,
    triangles: r.info.render.triangles,
    points: r.info.render.points,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
  };
});

console.log('\n=== Renderer Stats ===');
if (renderStats) {
  console.log(`Draw calls: ${renderStats.calls}`);
  console.log(`Triangles: ${renderStats.triangles}`);
  console.log(`Geometries: ${renderStats.geometries}`);
} else {
  console.log('(renderer not exposed)');
}

// Check for errors
const errors = logs.filter(l =>
  l.includes('PAGE ERROR') ||
  l.includes('[error]') ||
  l.includes('Failed to load')
);

console.log('\n=== Errors ===');
if (errors.length > 0) {
  for (const e of errors) console.log(e);
} else {
  console.log('None');
}

// Init messages
const initMsgs = logs.filter(l =>
  l.includes('Studio models loaded') ||
  l.includes('SceneLayout') ||
  l.includes('Placed') ||
  l.includes('static entities') ||
  l.includes('model loaded')
);

console.log('\n=== Init Summary ===');
console.log(`Studio models: ${initMsgs.filter(m => m.includes('Studio models loaded')).map(m => m.match(/loaded: (.+)/)?.[1] || '').join('')}`);
console.log(`Scene plan: ${initMsgs.filter(m => m.includes('SceneLayout')).join('')}`);
console.log(`Static entities: ${initMsgs.filter(m => m.includes('Created')).join('')}`);
console.log(`Models loaded: ${initMsgs.filter(m => m.includes('model loaded')).length} entities`);

// Screenshot
await page.screenshot({ path: 'D:/workshop/developer_learn/agentland/agentworld-test/.claude/verify_optimized.png' });
console.log('\nScreenshot: .claude/verify_optimized.png');

await browser.close();
