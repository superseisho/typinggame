// Optional: APP_URL / PLAYWRIGHT_MODULE as in verify-buff-run.mjs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Math.random = () => .12345);
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
  await page.locator('[data-room-type="battle"]').first().click();
  const current = page.locator('.typing-line mark');
  for (const key of 'yuushahaken') await page.keyboard.press(key);
  assert.equal(await current.textContent(), 'w');
  const before = Number(await page.locator('.miss-value').textContent());
  await page.keyboard.press('o');
  assert.equal(await current.textContent(), 'w');
  assert.equal(Number(await page.locator('.miss-value').textContent()), before + 1);
  assert.equal(await page.locator('.typing-panel.is-miss').count(), 1);
  await page.keyboard.press('w');
  assert.equal(await current.textContent(), 'o');
  await page.keyboard.press('o');
  assert.equal(await current.textContent(), 'k');
  assert.equal(Number(await page.locator('.miss-value').textContent()), before + 1);
  assert.deepEqual(errors, []);
  console.log('PASS: 勇者は剣を構えた — o is MISS without advancement; w → o completes を.');
} finally {
  await browser.close();
}
