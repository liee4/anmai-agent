import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/join/e2e-demo-access-token-2026-11-05-test-only'); });

async function firstBaseline(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '导入首轮 14 天', exact: true }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v1');
}

test('guides repeated baseline imports and restarts after reset', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '一次异常体征，系统会怎样响应？' })).toBeVisible();
  await expect(page.locator('.journey-options button')).toHaveCount(7);
  await firstBaseline(page);
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-01 — 2026-10-14');
  const first = await page.locator('.cycle-comparison').innerText();
  await page.getByRole('button', { name: /继续导入下一轮 14 天/ }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v2');
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-15 — 2026-10-28');
  await expect(page.locator('.cycle-comparison')).toContainText('上轮');
  expect(await page.locator('.cycle-comparison').innerText()).not.toBe(first);
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '重置演示数据' }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('尚未生成个人基线');
  await firstBaseline(page);
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-01 — 2026-10-14');
});

test('shows model observation, wearer response and relative contact', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await expect(page.locator('.review-status')).toContainText('模型建议短时观察');
  await page.reload();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await expect(page.locator('.journey-options button.active')).toHaveText('异常 · 有回应');
  await expect(page.locator('.guided-main')).toContainText('本次模拟输入');
  await expect(page.getByRole('button', { name: '观察结束后，再输入持续异常' })).toBeEnabled();
  await page.getByRole('button', { name: '观察结束后，再输入持续异常' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('异常仍在持续，请佩戴者确认状态');
  await page.getByRole('button', { name: '我不舒服，需要亲属' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('基线学习已暂停');
  await expect(page.locator('.delivery-summary')).toContainText('主要亲属');
  await expect(page.locator('.evidence')).toContainText('表示不舒服，需要亲属');
  await page.getByRole('button', { name: '查看原始记录与演示设置' }).click();
  await expect(page.getByRole('button', { name: '填入下一轮 14 天数据' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入并检查基线' })).toBeDisabled();
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.getByRole('button', { name: '我已恢复，继续学习' })).toBeEnabled();
  await page.getByRole('button', { name: '我已恢复，继续学习' }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v1');
});

test('distinguishes normal activity and untrusted device data', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '正常静息' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('体征平稳');
  await page.getByRole('button', { name: '正常活动' }).click();
  await expect(page.locator('.guided-main')).toContainText('活动标记');
  await expect(page.locator('.guided-main')).toContainText('规则结果');
  await page.getByRole('button', { name: '设备松动', exact: true }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('数据不可信');
  await expect(page.locator('.guided-main')).toContainText('不会启动亲属联系');
});

test('explains that untrusted samples cannot resolve an active model observation', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await page.getByRole('button', { name: '设备松动', exact: true }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('当前设备数据不可信，观察仍在进行');
  await expect(page.locator('.guided-aside .statusline')).toContainText('需检查设备或提供新的有效数据');
  await expect(page.locator('.logic li').nth(2)).toContainText('此前异常已由模型复核');
  await expect(page.locator('.logic li').nth(2)).not.toHaveClass(/skipped/);
});

test('shows a no-response path and automatic contact after the wearer deadline', async ({ page }) => {
  const timers = await (await page.request.get('/api/settings/timers')).json();
  const updated = await page.request.put('/api/settings/timers', { data: { ...timers, wearerResponseSeconds: 1 } });
  expect(updated.ok()).toBe(true);
  await firstBaseline(page);
  await page.getByRole('button', { name: '异常 · 无回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await expect(page.getByRole('button', { name: '观察结束后，再输入持续异常' })).toBeEnabled();
  await page.getByRole('button', { name: '观察结束后，再输入持续异常' }).click();
  await expect(page.locator('.guided-main')).toContainText('保持无回应');
  await expect(page.getByRole('button', { name: '我没事，继续后台检测' })).toBeEnabled();
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管', { timeout: 10_000 });
});

test('routes severe risk to relatives and shows a simulated call on desktop and mobile', async ({ page }) => {
  await page.getByRole('button', { name: '明显恶化', exact: true }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await expect(page.locator('.guided-main')).toContainText('已跳过模型等待');
  await page.getByRole('button', { name: '无法接管，联系下一位' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('等待其他亲属接管');
  await page.getByRole('button', { name: '无法接管，联系下一位' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('模拟自动呼救');
  await page.getByRole('button', { name: '查看原始记录与演示设置' }).click();
  await expect(page.getByText('模拟自动呼救播报', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/anmai-guided-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.guided-main h2')).toBeVisible();
  await page.screenshot({ path: 'test-results/anmai-guided-mobile.png', fullPage: true });
});

test('reports a lost request and allows retry', async ({ page }) => {
  await page.route('**/api/simulator/abnormal', route => route.abort('failed'));
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.getByRole('alert')).toContainText('Failed to fetch');
  await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
  await page.unroute('**/api/simulator/abnormal');
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main')).toContainText('心率持续异常');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('isolates model modes and test data between two judges', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const a = await first.newPage();
    const b = await second.newPage();
    await a.goto('/join/e2e-demo-access-token-2026-11-05-test-only');
    await b.goto('/join/e2e-demo-access-token-2026-11-05-test-only');
    const sessionA = await (await first.request.get('/api/session')).json();
    const sessionB = await (await second.request.get('/api/session')).json();
    expect(sessionA.wearerId).not.toBe(sessionB.wearerId);
    await a.getByRole('button', { name: 'DeepSeek' }).click();
    await expect(a.getByRole('button', { name: 'DeepSeek' })).toBeDisabled();
    await expect(b.getByRole('button', { name: 'Fake' })).toBeDisabled();
    await a.getByRole('button', { name: 'Fake' }).click();
    await a.getByRole('button', { name: '导入首轮 14 天', exact: true }).click();
    await expect(a.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v1');
    await a.getByRole('button', { name: 'DeepSeek' }).click();
    await expect(a.locator('.baseline-strip')).toContainText('该版生成模型 fake');
    await expect(b.locator('.baseline-strip-copy>strong')).toHaveText('尚未生成个人基线');
  } finally { await first.close(); await second.close(); }
});
