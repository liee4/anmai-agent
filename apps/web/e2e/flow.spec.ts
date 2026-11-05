import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/join/e2e-demo-access-token-2026-11-05-test-only'); });

test('imports history, reviews ordinary risk, asks after observation, then contacts relatives', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '监测与响应' })).toBeVisible();
  await page.getByRole('button', { name: '填入下一轮 14 天数据' }).click();
  await page.getByRole('button', { name: '导入并检查基线' }).click();
  await expect(page.getByText('v1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.getByText('模型建议短时观察')).toBeVisible();
  await expect(page.getByRole('button', { name: '我不舒服，需要亲属' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('模型建议短时观察')).toBeVisible();
  await page.waitForTimeout(1_100);
  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待佩戴者回应');
  await page.getByRole('button', { name: '我不舒服，需要亲属' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待主要亲属接管');
  await expect(page.locator('.contact-list').getByText('主要亲属', { exact: true })).toBeVisible();
  await expect(page.getByText('表示不舒服，需要亲属')).toBeVisible();
  await page.getByRole('button', { name: '明显恶化' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待其他亲属接管');
  await expect(page.getByText('其他亲属 1')).toBeVisible();
});

test('lets the wearer request relatives during model observation', async ({ page }) => {
  await page.goto('/');
  page.on('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '重置测试数据' }).click();
  await page.getByRole('button', { name: '填入下一轮 14 天数据' }).click();
  await page.getByRole('button', { name: '导入并检查基线' }).click();
  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.getByText('模型建议短时观察')).toBeVisible();
  await page.getByRole('button', { name: '我不舒服，需要亲属' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待主要亲属接管');
});

test('routes an initial severe signal directly to relatives and keeps the call simulated', async ({ page }) => {
  await page.goto('/');
  page.on('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '重置测试数据' }).click();
  await page.getByRole('button', { name: '明显恶化' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待主要亲属接管');
  await expect(page.getByRole('button', { name: '重播佩戴者警告' })).toBeVisible();
  await page.getByRole('button', { name: '无法接管' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('等待其他亲属接管');
  await page.getByRole('button', { name: '无法接管' }).click();
  await expect(page.locator('.response-panel .status')).toHaveText('模拟自动呼救');
  await expect(page.getByText('模拟自动呼救播报', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/anmai-severe-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/anmai-severe-mobile.png', fullPage: true });
});

test('keeps an observation visible when device data becomes untrusted', async ({ page }) => {
  await page.goto('/');
  page.on('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '重置测试数据' }).click();
  await page.getByRole('button', { name: '填入下一轮 14 天数据' }).click();
  await page.getByRole('button', { name: '导入并检查基线' }).click();
  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.getByText('模型建议短时观察')).toBeVisible();
  await page.getByRole('button', { name: '设备松动' }).click();
  await expect(page.locator('.monitor-panel .status')).toHaveText('数据不可信');
  await expect(page.getByText('数据中断或质量不足', { exact: false })).toBeVisible();
  await expect(page.locator('.response-panel .status')).toHaveText('暂无事件');
});

test('reports a lost request and allows the next simulated sample after reconnection', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/simulator/abnormal', route => route.abort('failed'));
  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Failed to fetch');
  await page.unroute('**/api/simulator/abnormal');
  await page.getByRole('button', { name: '持续异常', exact: true }).click();
  await expect(page.locator('.monitor-panel .status')).toHaveText('持续异常');
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
    await a.getByRole('button', { name: '填入下一轮 14 天数据' }).click();
    await a.getByRole('button', { name: 'Fake' }).click();
    await a.getByRole('button', { name: '导入并检查基线' }).click();
    await expect(a.getByText('v1', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'DeepSeek' }).click();
    await expect(a.locator('.baseline-panel')).toContainText('生成该版的模型');
    await expect(a.locator('.baseline-panel')).toContainText('fake');
    await expect(b.getByText('尚未生成')).toBeVisible();
  } finally { await first.close(); await second.close(); }
});
