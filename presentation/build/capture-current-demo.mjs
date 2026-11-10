import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const origin = 'http://127.0.0.1:3002';
async function captureStage(page, filename) {
  const bounds = await page.locator('.guided-body').boundingBox();
  if (!bounds) throw new Error('Guided demo is not visible');
  await page.screenshot({ path: path.join(assets, filename), clip: { x: bounds.x, y: bounds.y, width: bounds.width, height: Math.min(bounds.height, 540) } });
}
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(origin);
  await page.getByRole('heading', { name: '一次异常体征，系统会怎样响应？' }).waitFor();
  const reset = await page.request.post(`${origin}/api/simulator/reset`, { data: { wearerId: 'demo-wearer', confirmation: 'RESET_DEMO_DATA' } });
  if (!reset.ok()) throw new Error(`Demo reset: ${reset.status()}`);
  const review = await page.request.put(`${origin}/api/settings/risk-review`, { data: { observationSeconds: 1 } });
  if (!review.ok()) throw new Error(`Review timer: ${review.status()}`);
  const current = await (await page.request.get(`${origin}/api/settings/timers`)).json();
  const timers = await page.request.put(`${origin}/api/settings/timers`, { data: { ...current, wearerResponseSeconds: 300 } });
  if (!timers.ok()) throw new Error(`Wearer timer: ${timers.status()}`);
  await page.getByRole('button', { name: '导入首轮 14 天', exact: true }).click();
  await page.locator('.baseline-strip-copy>strong').filter({ hasText: '当前个人基线 v1' }).waitFor();
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await page.getByRole('button', { name: '观察结束后，再输入持续异常' }).click();
  await page.locator('.guided-main h2').filter({ hasText: '异常仍在持续，请佩戴者确认状态' }).waitFor();
  await page.getByLabel('也可以用文字描述目前的感受').fill('我没事，但胸口不舒服');
  await page.getByRole('button', { name: '理解我的回复' }).click();
  await page.getByRole('button', { name: '确认联系亲属' }).waitFor();
  await captureStage(page, 'demo-glass-wearer.png');
  await page.getByRole('button', { name: '确认联系亲属' }).click();
  await page.locator('.guided-main h2').filter({ hasText: '等待主要亲属接管' }).waitFor();
  await captureStage(page, 'demo-glass-relative.png');
  await page.request.post(`${origin}/api/simulator/reset`, { data: { wearerId: 'demo-wearer', confirmation: 'RESET_DEMO_DATA' } });
  console.log('Updated wearer and relative screenshots from local Fake demo.');
} finally { await browser.close(); }
