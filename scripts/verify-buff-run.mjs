// Optional browser regression; Playwright is a separate verification dependency.
// APP_URL=http://127.0.0.1:4173 PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs node scripts/verify-buff-run.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await page.addInitScript(() => Math.random = () => .12345);
const url = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const selectedBuffs = [];
async function fit() {
  assert.equal(await page.locator('.exploration-party').count(), 0);
  const bounds = await page.evaluate(() => ({
    height: innerHeight, pageHeight: document.documentElement.scrollHeight,
    abilityBottom: Math.max(...[...document.querySelectorAll('.ability-state')].map(el => el.getBoundingClientRect().bottom)),
    floor: !!document.querySelector('.dungeon-progress-header'), buffs: !!document.querySelector('.current-buffs'),
  }));
  assert(bounds.abilityBottom <= bounds.height, JSON.stringify(bounds));
  assert(bounds.pageHeight <= bounds.height + 1, JSON.stringify(bounds));
  assert.equal(bounds.floor, false); assert.equal(bounds.buffs, false);
  return bounds;
}
async function fight() {
  let keys = 0;
  while (await page.locator('.dungeon-shell--combat').count()) {
    await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
    await page.waitForTimeout(18);
    if (++keys > 1500) throw Error('Battle did not finish');
  }
  return keys;
}
async function blessing() {
  const section = page.getByRole('region', { name: 'Buff Reward' });
  await section.waitFor();
  assert.equal(await page.getByRole('button', { name: /次の階へ/ }).count(), 0);
  const cards = section.locator('.buff-card');
  assert.equal(await cards.count(), 3);
  const names = await cards.locator('h2').allTextContents();
  assert.equal(new Set(names).size, 3);
  const chosen = ['Swift Fingers', 'Power Rune', 'Vitality Rune', 'Healing Prayer'].find(name => names.includes(name)) ?? names[0];
  selectedBuffs.push(chosen);
  await page.getByRole('button', { name: `${chosen}を取得`, exact: true }).click();
  await page.getByRole('heading', { name: 'BLESSING ACQUIRED', exact: true }).waitFor();
  assert.equal(await section.locator('button:not(:disabled)').count(), 0);
  await section.waitFor({ state: 'detached' });
  if (await page.locator('.current-buffs').count()) {
    await page.locator('.current-buffs summary').click();
    assert((await page.locator('.current-buffs').textContent()).includes(chosen));
    await page.locator('.current-buffs summary').click();
  }
  return { names, chosen };
}
try {
  for (const [width, height] of [[1920, 1080], [1536, 864], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.getByRole('button', { name: 'GAME START', exact: true }).click();
    await page.locator('[data-room-type="battle"]').first().click();
    console.log('fit', width, height, await fit());
    await page.waitForTimeout(5100); // Exercise actual enemy damage and preserved HP.
    await fight();
    if (process.env.SCREENSHOT_DIR && width === 1366) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/buff-reward.png`, fullPage: true });
    console.log('reward', await blessing());
  }
  await page.goto(url);
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
  let rewards = 0, eliteSeen = false, thresholdReduced = false;
  for (let floor = 1; floor <= 10; floor++) {
    const options = await page.locator('[data-room-type]').evaluateAll(nodes => nodes.map(n => n.dataset.roomType));
    if (floor === 9) {
      assert.deepEqual(options, ['rest', 'shop']);
      await page.getByRole('heading', { name: 'Prepare for the Boss', exact: true }).waitFor();
      const bounds = await page.locator('.room-grid--pre-boss').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { center: rect.x + rect.width / 2, viewport: innerWidth / 2, columns: getComputedStyle(el).gridTemplateColumns.split(' ').length };
      });
      assert(Math.abs(bounds.center - bounds.viewport) < 2);
      assert.equal(bounds.columns, 2);
      console.log('pre-boss', options, bounds);
      for (const [width, height] of [[1920,1080], [1536,864], [1366,768]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate(() => {
          const party = document.querySelector('.exploration-party').getBoundingClientRect();
          const content = document.querySelector('.dungeon-room-content');
          const cards = [...document.querySelectorAll('.path-card')].map(el => {
            const r = el.getBoundingClientRect();
            const p = el.querySelector('p').getBoundingClientRect();
            const tags = el.querySelector('.path-card__features').getBoundingClientRect();
            return { width: r.width, height: r.height, gap: tags.top - p.bottom, overflow: el.scrollWidth > el.clientWidth };
          });
          return { cards, bottom: party.bottom, partyHeight: party.height,
            pageHeight: document.documentElement.scrollHeight, contentOverflow: content.scrollHeight - content.clientHeight };
        });
        assert.equal(layout.bottom, height - 10);
        assert.equal(layout.partyHeight, 202);
        assert(layout.pageHeight <= height && layout.contentOverflow <= 1, JSON.stringify(layout));
        for (const card of layout.cards) assert(card.width >= 320 && card.width <= 380 && card.height <= 260 && card.gap <= 12 && !card.overflow, JSON.stringify(card));
        console.log('pre-boss layout', width, height, layout);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pre-boss-${height}.png` });
      }
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pre-boss.png`, fullPage: true });
    }
    if (options.length) {
      const chosen = floor === 9 ? (process.env.PRE_BOSS_CHOICE ?? 'rest') : !eliteSeen && options.includes('elite') ? 'elite' : options.includes('battle') ? 'battle' : options.includes('rest') ? 'rest' : options[0];
      if (chosen === 'elite') eliteSeen = true;
      await page.locator(`[data-room-type="${chosen}"]`).first().click();
    }
    if (await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).count()) await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).click();
    if (await page.locator('.encounter-announcement').count()) await page.locator('.encounter-announcement').waitFor({ state: 'detached' });
    if (await page.getByRole('heading', { name: 'Rest', exact: true }).count()) await page.getByRole('button', { name: /Party Recovery/ }).click();
    if (await page.getByRole('heading', { name: 'Shop', exact: true }).count()) {
      await page.getByRole('button', { name: 'LEAVE SHOP →' }).click();
      continue;
    }
    if (await page.locator('.encounter-room').count()) {
      const freeBuff = page.getByRole('button', { name: /Study the Inscription/ });
      if (await freeBuff.count()) await freeBuff.click();
      else {
        const safeChoice = page.getByRole('button', { name: /LEAVE ALTAR|Refuse|Leave|Ignore It/ });
        await safeChoice.first().click();
      }
    }
    if (await page.locator('.dungeon-shell--combat').count()) {
      await fit();
      const thresholds = await page.locator('.threshold').allTextContents();
      if (floor > 1 && thresholds[0] === '83KEYS') thresholdReduced = true;
      console.log('floor', floor, 'thresholds', thresholds);
      await fight();
    }
    if (floor < 10) {
      if (await page.locator('.buff-reward').count()) {
        console.log('floor reward', floor, await blessing()); rewards++;
        if (await page.getByRole('button', { name: /CONTINUE/ }).count()) await page.getByRole('button', { name: /CONTINUE/ }).click();
      } else await page.getByRole('button', { name: /次の階へ|CONTINUE/ }).click();
    }
  }
  assert(eliteSeen); assert(rewards >= 3); assert(thresholdReduced);
  await page.getByRole('heading', { name: 'DUNGEON CLEAR', exact: true }).waitFor();
  assert.equal(await page.locator('.buff-reward').count(), 0);
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  assert(!saved.includes('activeBuffs')); assert(!saved.includes('runBuffs'));
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/buff-run-clear.png`, fullPage: true });
  await page.goto(url); await page.getByRole('button', { name: 'GAME START', exact: true }).click();
  assert((await page.locator('.current-buffs summary').textContent()).includes('BUFFS 0'));
  assert.deepEqual(errors, []);
  console.log('PASS', { rewards, eliteSeen, thresholdReduced, selectedBuffs, errors });
} finally {
  await browser.close();
}
