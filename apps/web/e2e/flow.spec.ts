import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/join/e2e-demo-access-token-2026-11-05-test-only'); });

async function firstBaseline(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '导入首轮 14 天', exact: true }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v1');
}

test('guides repeated baseline imports and restarts after reset', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '选择患者情景' })).toBeVisible();
  await expect(page.locator('.journey-options button')).toHaveCount(8);
  await expect(page.getByRole('button', { name: '导入首轮 14 天', exact: true })).toHaveCount(1);
  await expect(page.locator('.advanced-details')).not.toContainText('导入并检查基线');
  await firstBaseline(page);
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-01 — 2026-10-14');
  const first = await page.locator('.cycle-comparison').innerText();
  await page.getByRole('button', { name: /继续导入下一轮 14 天/ }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v2');
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-15 — 2026-10-28');
  await expect(page.locator('.cycle-comparison')).toContainText('上轮');
  expect(await page.locator('.cycle-comparison').innerText()).not.toBe(first);
  await page.getByText('使用自己的 JSON 数据导入基线').click();
  await page.getByRole('button', { name: '填入下一轮 14 天数据' }).click();
  await expect(page.locator('#vital-json')).not.toBeEmpty();
  await page.getByRole('button', { name: '导入并检查基线' }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v3');
  await expect(page.locator('#vital-json')).toBeEmpty();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '重置演示数据' }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('尚未生成个人基线');
  await firstBaseline(page);
  await expect(page.locator('.cycle-comparison')).toContainText('2026-10-01 — 2026-10-14');
});

test('replays attributed public measurements without baseline learning', async ({ page }) => {
  await page.getByRole('button', { name: '回放含缺测片段' }).click();
  await expect(page.locator('.public-replay-details')).toContainText('血氧缺测 13 秒');
  await expect(page.locator('.public-replay-details')).toContainText('活动、血压、位置未采集');
  await expect(page.locator('.guided-main')).toContainText('活动状态未知');
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('尚未生成个人基线');
  await expect(page.locator('.public-replay-details a')).toHaveAttribute('href', /physionet\.org/);
});

test('replays measured abnormal data through simulated relative contact', async ({ page }) => {
  await expect(page.getByRole('button', { name: '回放平稳记录' })).toHaveCount(0);
  await page.getByRole('button', { name: '真实数据回放' }).click();
  await expect(page.locator('.public-replay-details')).toContainText('bidmc_21');
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await expect(page.locator('.guided-main')).toContainText('已跳过模型等待');
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
  await page.getByRole('button', { name: '回放真实低血氧' }).click();
  await expect(page.locator('.public-replay-details')).toContainText('bidmc_32');
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
});

test('shows model observation, wearer response and relative contact', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await expect(page.locator('.review-status')).toContainText('模型建议短时观察');
  await expect(page.locator('.knowledge-sources')).toContainText('国家卫生健康委员会');
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
  await page.getByText('使用自己的 JSON 数据导入基线').click();
  await expect(page.getByRole('button', { name: '填入下一轮 14 天数据' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入并检查基线' })).toBeDisabled();
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.getByRole('button', { name: '我已恢复，继续学习' })).toBeEnabled();
  await page.getByRole('button', { name: '我已恢复，继续学习' }).click();
  await expect(page.locator('.baseline-strip-copy>strong')).toHaveText('当前个人基线 v1');
});

test('shows a text interpretation before the wearer confirms an emergency action', async ({ page }) => {
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('异常仍在持续，请佩戴者确认状态');
  await page.getByLabel('也可以用文字描述目前的感受').fill('我没事，但心脏有点疼');
  await page.getByRole('button', { name: '理解我的回复' }).click();
  await expect(page.locator('.wearer-reply-result')).toContainText('请确认是否立即联系亲属');
  await expect(page.locator('.wearer-reply-result')).toContainText('本地规则理解');
  await expect(page.locator('.guided-main h2')).toHaveText('异常仍在持续，请佩戴者确认状态');
  await page.getByRole('button', { name: '确认联系亲属' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
});

test('returns to scenario selection after ending a simulated event', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '明显恶化', exact: true }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
  await expect(page.locator('.guided-main h2')).toHaveText('输入一段模拟实时体征');
  await expect(page.getByRole('button', { name: '正常静息' })).toBeEnabled();
  await page.reload();
  await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
});

test('keeps an ordinary abnormal event summary visible after closing and resets the review step', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '异常 · 有回应' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('持续异常，模型建议短时观察');
  await page.getByRole('button', { name: '观察结束后，再输入持续异常' }).click();
  await page.getByRole('button', { name: '我不舒服，需要亲属' }).click();
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
  await expect(page.locator('.guided-main h2')).toHaveText('输入一段模拟实时体征');
  await expect(page.locator('.guided-main .evidence')).toContainText('等待下一段体征');
  await expect(page.locator('.guided-main .evidence')).not.toContainText('心率持续异常');
  await expect(page.locator('.completion-summary')).toContainText('持续异常');
  await expect(page.locator('.completion-summary')).toContainText('亲属已接管');
  await expect(page.locator('.completion-summary')).toBeInViewport();
  await page.waitForTimeout(1200);
  await expect(page.locator('.completion-summary')).toBeVisible();
  await page.getByRole('button', { name: '正常静息' }).click();
  await expect(page.locator('.completion-summary')).toHaveCount(0);
});

test('ignores an older asked review when no emergency event is active', async ({ page }) => {
  await firstBaseline(page);
  await page.route('**/api/dashboard/*', async route => {
    const response = await route.fetch();
    const dashboard = await response.json();
    if (!dashboard.event) dashboard.riskReview = { status: 'asked', provider: 'fake', decision: 'observe', reason: '此前已询问', deadlineAt: null, fallbackReason: null };
    await route.fulfill({ response, json: dashboard });
  });
  await page.reload();
  await expect(page.locator('.guided-main h2')).toHaveText('输入一段模拟实时体征');
  await expect(page.locator('.logic')).toContainText('当前无待处理模型复核');
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
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.locator('.completion-summary')).toContainText('已进入模拟自动呼救');
  await expect(page.locator('.completion-summary')).toBeInViewport();
});

test('keeps the previous scenario hidden while a new severe event loads', async ({ page }) => {
  await firstBaseline(page);
  await page.getByRole('button', { name: '明显恶化', exact: true }).click();
  await page.getByRole('button', { name: '亲属已接管' }).click();
  await page.getByRole('button', { name: '结束模拟事件' }).click();
  await expect(page.locator('.completion-summary')).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/dashboard/*', async route => { await held; await route.continue().catch(() => undefined); });
  try {
    const scenarioResponse = page.waitForResponse(response => response.url().endsWith('/api/simulator/worsening') && response.ok());
    await page.getByRole('button', { name: '输入明显恶化体征' }).click();
    await scenarioResponse;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('.completion-summary')).toHaveCount(0);
    await expect(page.locator('.journey-options button.active')).toHaveText('个人基线');
    await expect(page.locator('.risk-result')).toHaveCount(0);
  } finally {
    release();
    await page.unroute('**/api/dashboard/*');
  }
  await expect(page.locator('.guided-main h2')).toHaveText('等待主要亲属接管');
});

test('speaks the finished simulated call once at a faster rate', async ({ page }) => {
  await page.evaluate(() => {
    const calls: { text: string; rate: number }[] = [];
    Object.assign(window, { __anmaiSpeechCalls: calls });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(utterance: SpeechSynthesisUtterance) { calls.push({ text: utterance.text, rate: utterance.rate }); } } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { lang = ''; rate = 1; constructor(public text: string) {} } });
  });
  let callMessageReads = 0;
  let releaseGenerated!: () => void;
  const generatedGate = new Promise<void>(resolve => { releaseGenerated = resolve; });
  await page.route('**/api/dashboard/*', async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.event?.state === 'simulated_call') {
      callMessageReads += 1;
      if (callMessageReads > 1) await generatedGate;
      body.messages = { emergencyScript: callMessageReads === 1 ? '这里是准备稿。' : '这里是最终模拟呼救播报。', provider: 'fake', status: callMessageReads === 1 ? 'pending' : 'generated' };
    }
    await route.fulfill({ response, json: body });
  });
  await page.getByRole('button', { name: '明显恶化', exact: true }).click();
  await page.getByRole('button', { name: '无法接管，联系下一位' }).click();
  await page.getByRole('button', { name: '无法接管，联系下一位' }).click();
  await expect(page.locator('.guided-main h2')).toHaveText('模拟自动呼救');
  await expect.poll(() => callMessageReads).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  releaseGenerated();
  await expect.poll(() => callMessageReads).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('这里是最终模拟呼救播报。', { exact: false })).toBeAttached();
  const spoken = await page.evaluate(() => (window as typeof window & { __anmaiSpeechCalls: { text: string; rate: number }[] }).__anmaiSpeechCalls.filter(call => call.text.startsWith('这里是')));
  expect(spoken).toEqual([{ text: '这里是最终模拟呼救播报。', rate: 1.15 }]);
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
