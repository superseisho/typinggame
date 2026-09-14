// Real dungeon UI, deterministic encounter selection, no injected combat state.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const url = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const errors = [];
page.on('pageerror', e => errors.push(e.message));
async function key() {
  const before = Number(await page.locator('.typing-stats strong').first().textContent());
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  if (await page.locator('.dungeon-shell--combat').count()) {
    await page.waitForFunction(n => Number(document.querySelector('.typing-stats strong')?.textContent) === n + 1, before);
  }
}
const hp = () => page.locator('.enemy-unit .progress--enemy').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
try {
  await page.goto(url);
  const seed = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    for (let seed = 0; seed < 10000; seed++) {
      const run = createDungeonRun(seed, 'target');
      const choice = run.roomOptions.find(o => o.type === 'battle');
      if (choice && reduceDungeon(run, { type: 'choose', optionId: choice.id, now: 1 }).combat.enemies.length === 2) return seed;
    }
    throw Error('No multi-enemy encounter');
  });
  for (const [width, height] of [[1920,1080], [1536,864], [1366,768]]) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.evaluate(seed => Math.random = () => seed / 4294967296, seed);
    await page.getByRole('button', { name: 'GAME START', exact: true }).click();
    await page.locator('[data-room-type="battle"]').first().click();
    const cards = page.locator('.enemy-unit');
    const ids = await cards.evaluateAll(nodes => nodes.map(n => n.dataset.enemyId));
    assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'), ids[0]);
    const originalRects = await cards.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }));
    const misses = await page.locator('.miss-value').textContent();
    await page.locator('.dungeon-audio').focus();
    for (const index of [1,0,1]) {
      // The overlay covers portrait/name/HP, not just a tiny marker.
      await cards.nth(index).locator('.enemy-target-hitarea').click({ position: { x: 40, y: 65 } });
      assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'), ids[index]);
      assert.equal(await page.locator('.enemy-target-marker').count(), 1);
      assert.equal(await page.locator('.miss-value').textContent(), misses);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON'), false);
    }
    assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })), originalRects);
    const bounds = await page.evaluate(() => {
      const marker = document.querySelector('.enemy-target-marker').getBoundingClientRect();
      const card = document.querySelector('.is-targeted').getBoundingClientRect();
      return { height: innerHeight, page: document.documentElement.scrollHeight,
        partyBottom: Math.max(...[...document.querySelectorAll('.ability-state')].map(n => n.getBoundingClientRect().bottom)),
        markerInside: marker.top >= card.top && marker.bottom <= card.bottom && marker.left >= card.left && marker.right <= card.right };
    });
    assert(bounds.page <= height && bounds.partyBottom <= height && bounds.markerInside, JSON.stringify(bounds));
    for (let i = 0; i < 29; i++) await key();
    // Reset perfect streak so the first normal attack can be checked without AoE.
    const expected = (await page.locator('.typing-line mark').textContent()).trim();
    await page.keyboard.press(expected === 'z' ? 'q' : 'z');
    const before = await hp();
    await key();
    const after = await hp();
    assert.equal(after[0], before[0]);
    assert(after[1] < before[1], 'Normal attack did not hit selected enemy');
    assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'), ids[1]);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/enemy-target-${height}.png` });
    let count = 0;
    while (!(await cards.nth(1).getAttribute('class')).includes('is-defeated')) {
      await key();
      if (++count > 500) throw Error('Selected enemy did not die');
    }
    assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'), ids[0]);
    await cards.nth(1).click();
    assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'), ids[0]);
    while (await page.locator('.dungeon-shell--combat').count()) {
      await key();
      if (++count > 1000) throw Error('Battle did not finish');
    }
    assert.equal(await page.locator('.enemy-target-marker').count(), 0);
    console.log('PASS target selection, typing, damage, retarget, victory', width, height, bounds);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
