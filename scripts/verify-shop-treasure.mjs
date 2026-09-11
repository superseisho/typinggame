// Optional Playwright regression; uses deterministic starting seeds, never changes game configs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const url = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const gold = async () => Number((await page.locator('.expedition-bar > strong').textContent()).match(/\d+/)[0]);
async function start(seed) {
  await page.goto(url);
  await page.evaluate(seed => Math.random = () => seed / 4294967296, seed);
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
}
async function choose(type) { await page.locator(`[data-room-type="${type}"]`).first().click(); }
async function fight() {
  for (let i = 0; await page.locator('.dungeon-shell--combat').count(); i++) {
    assert(i < 1500);
    await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
    await page.waitForTimeout(15);
  }
}
try {
  await page.goto(url);
  const fixtures = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { getTypingDisplay } = await import('/src/game/typing/typingEngine.ts');
    const found = {};
    for (let seed = 0; seed < 20000; seed++) {
      let run = createDungeonRun(seed, 'fixture');
      const chest = run.roomOptions.find(option => option.type === 'treasure');
      if (chest) {
        run = reduceDungeon(run, { type: 'choose', optionId: chest.id, now: 1 });
        run = reduceDungeon(run, { type: 'open-treasure' });
        found[run.treasure.outcome] ??= seed;
      }
      if (found.shop === undefined) {
        run = createDungeonRun(seed, 'fixture');
        const battle = run.roomOptions.find(option => option.type === 'battle');
        if (!battle) continue;
        run = reduceDungeon(run, { type: 'choose', optionId: battle.id, now: 1 });
        for (let i = 0; i < 1000 && run.runStatus === 'battle'; i++) run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: i + 2 });
        if (run.runStatus !== 'buff_reward') continue;
        run = reduceDungeon(run, { type: 'choose-buff', buffId: run.buffOptions[0] });
        run = reduceDungeon(run, { type: 'finish-buff' });
        const option = run.roomOptions.find(option => option.type === 'treasure');
        if (!option) continue;
        run = reduceDungeon(run, { type: 'choose', optionId: option.id, now: 1 });
        run = reduceDungeon(run, { type: 'open-treasure' });
        if (run.treasure.outcome !== 'gold') continue;
        run = reduceDungeon(run, { type: 'advance' });
        const shop = run.roomOptions.find(option => option.type === 'shop');
        if (!shop) continue;
        run = reduceDungeon(run, { type: 'choose', optionId: shop.id, now: 1 });
        if (run.shop.items.some(item => item.type === 'recovery' && item.recoveryId === 'small-potion') && run.shop.items.some(item => item.type === 'buff' && item.price === 100) && run.gold >= 200) found.shop = seed;
      }
      if (Object.keys(found).length === 6) return found;
    }
    throw Error('Fixture seeds not found');
  });
  console.log('seeds', fixtures);
  for (const outcome of ['buff', 'gold', 'party_heal', 'rare_buff', 'trap_battle']) {
    await start(fixtures[outcome]); await choose('treasure');
    assert.equal(await gold(), 0);
    assert.equal(await page.getByRole('button', { name: /次の階へ/ }).count(), 0);
    if (process.env.SCREENSHOT_DIR && outcome === 'gold') await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/treasure-open.png`, fullPage: true });
    await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).click();
    if (outcome === 'trap_battle') {
      await page.getByRole('heading', { name: 'TRAP!', exact: true }).waitFor();
      await page.locator('.encounter-announcement').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.dungeon-progress-header').count(), 0);
      await fight();
      assert.equal(await page.locator('.buff-reward').count(), 0);
      assert((await gold()) >= 10 && (await gold()) <= 25);
    } else if (outcome === 'buff' || outcome === 'rare_buff') {
      assert.equal(await page.locator('.buff-card').count(), 3);
      if (outcome === 'rare_buff') {
        assert.equal(await page.locator('.buff-card.rarity-common, .buff-card.rarity-uncommon').count(), 0);
        await page.getByRole('heading', { name: 'RARE TREASURE!', exact: true }).waitFor();
      }
      await page.locator('.buff-card').first().click();
      await page.locator('.buff-reward').waitFor({ state: 'detached' });
      assert((await page.locator('.current-buffs summary').textContent()).includes('BUFFS 1'));
    } else {
      if (outcome === 'gold') assert((await gold()) >= 150 && (await gold()) <= 250);
      else assert.equal(await gold(), 0);
    }
    console.log('PASS Treasure', outcome);
  }
  await start(fixtures.shop); await choose('battle');
  // Make real misses to exercise SPECIAL, heal and carry damaged HP into the shop.
  for (let i = 0; i < 4; i++) await page.keyboard.press('x');
  await page.waitForTimeout(1200); await fight();
  await page.locator('.buff-card').first().click(); await page.locator('.buff-reward').waitFor({ state: 'detached' });
  await choose('treasure'); await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).click();
  await page.getByRole('button', { name: /次の階へ/ }).click(); await choose('shop');
  const before = await gold();
  const cardsBefore = await page.locator('.shop-product').allTextContents();
  assert.equal(cardsBefore.length, 4);
  // Unrelated React rerender must not regenerate stock.
  await page.locator('.current-buffs summary').click(); await page.locator('.current-buffs summary').click();
  assert.deepEqual(await page.locator('.shop-product').allTextContents(), cardsBefore);
  const common = page.locator('.shop-product.rarity-common').first();
  await common.click();
  assert.equal(await gold(), before - 100);
  assert((await common.textContent()).includes('SOLD OUT')); assert(await common.isDisabled());
  const potion = page.locator('.shop-product').filter({ has: page.getByRole('heading', { name: 'Small Potion', exact: true }) });
  assert(!(await potion.isDisabled()), 'Real combat should leave a recovery target');
  await potion.click(); await page.locator('.recovery-targets button').first().click();
  assert.equal(await gold(), before - 160);
  assert.equal(await page.locator('.shop-product.is-sold').count(), 2);
  const oldIds = await page.locator('[data-shop-item]').evaluateAll(nodes => nodes.map(node => node.dataset.shopItem));
  await page.getByRole('button', { name: /REROLL ·/ }).click();
  assert.equal(await gold(), before - 200);
  const newIds = await page.locator('[data-shop-item]').evaluateAll(nodes => nodes.map(node => node.dataset.shopItem));
  assert(newIds.every(id => !oldIds.includes(id)));
  assert.equal(await page.locator('.shop-product.is-sold').count(), 0);
  assert(await page.locator('.shop-product.is-unaffordable').count() > 0);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/shop-rerolled.png`, fullPage: true });
  await page.getByRole('button', { name: 'LEAVE SHOP →' }).click();
  assert((await page.locator('.floor-meter strong').textContent()).includes('04'));
  console.log('PASS Shop: buff + potion, stock, atomic Gold, reroll and leave');
  // Accelerated real browser timers to check trap defeat without a long idle wait.
  await start(fixtures.trap_battle); await page.clock.install(); await choose('treasure');
  await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).click();
  await page.clock.runFor(800);
  await page.clock.runFor(600000);
  await page.getByRole('heading', { name: 'GAME OVER', exact: true }).waitFor();
  assert.equal(await page.locator('.buff-reward').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Trap defeat; no browser/asset errors');
} finally { await browser.close(); }
