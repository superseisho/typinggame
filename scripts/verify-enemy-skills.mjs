// Real seeded dungeon entry, real timer ticks and keyboard/mouse input; no injected React state.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const url = process.env.APP_URL ?? 'http://127.0.0.1:4174';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const hp = () => page.locator('.enemy-unit .progress--enemy').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
async function key() {
  const before = Number(await page.locator('.typing-stats strong').first().textContent());
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  if (await page.locator('.dungeon-shell--combat').count()) {
    await page.waitForFunction(n => Number(document.querySelector('.typing-stats strong')?.textContent) === n + 1, before);
  }
}
try {
  await page.goto(url);
  const seed = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { tickCombat } = await import('/src/game/combat/combatEngine.ts');
    for (let n = 0; n < 100000; n++) {
      const seed = Math.imul(n, 2654435761) >>> 0;
      const run = createDungeonRun(seed, 'skills');
      const option = run.roomOptions.find(o => o.type === 'battle');
      if (!option) continue;
      const entered = reduceDungeon(run, { type: 'choose', optionId: option.id, now: 1 });
      let combat = entered.combat;
      if (combat.enemies.map(e => e.definitionId).join() !== 'enemy_guardian,enemy_shaman,crypt-slime') continue;
      for (let t = 0; t < 5000; t += 50) combat = tickCombat(combat, 50, t);
      if (!combat.enemies[0].cover) continue;
      // Ensure this reproducible encounter will demonstrate healing after our hit.
      combat = { ...combat, enemies: combat.enemies.map((e,i) => i ? e : { ...e, currentHp: e.currentHp - 20 }) };
      for (let t = 5000; t < 6500; t += 50) combat = tickCombat(combat, 50, t);
      if (combat.enemies[1].nextActionSkillId === 'skill_heal') return seed;
    }
    throw Error('No demonstration seed found');
  });
  for (const [width,height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({ width,height });
    await page.goto(url);
    await page.evaluate(seed => Math.random = () => seed / 4294967296, seed);
    await page.getByRole('button', { name: 'GAME START', exact: true }).click();
    await page.locator('[data-room-type="battle"]').first().click();
    const cards = page.locator('.enemy-unit');
    assert.equal(await cards.count(), 3);
    assert.deepEqual(await cards.locator('.next-action strong').allTextContents(), ['Cover', 'Attack', 'Attack']);
    assert.equal(await page.locator('.enemy-skill-feedback').count(), 0, 'Skills shown before execution');
    const bounds = await cards.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom }; }));
    assert(bounds.every(r => r.y === bounds[0].y), 'Three enemies must share a row');
    for (let i = 1; i < bounds.length; i++) assert(bounds[i-1].right <= bounds[i].x);
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight
      && [...document.querySelectorAll('.ability-state')].every(n => n.getBoundingClientRect().bottom <= innerHeight)));
    await cards.nth(1).locator('.enemy-target-hitarea').click();
    const misses = await page.locator('.miss-value').textContent();
    await page.keyboard.press('ArrowRight');
    assert((await page.locator('.is-targeted').getAttribute('data-enemy-id')).startsWith('crypt-slime'));
    await page.keyboard.press('ArrowLeft');
    assert((await page.locator('.is-targeted').getAttribute('data-enemy-id')).startsWith('enemy_shaman'));
    assert.equal(await page.locator('.miss-value').textContent(), misses);
    assert.deepEqual(await cards.locator('.next-action strong').allTextContents(), ['Cover', 'Attack', 'Attack']);
    for (let i = 0; i < 29; i++) await key();
    const expected = (await page.locator('.typing-line mark').textContent()).trim();
    await page.keyboard.press(expected === 'z' ? 'q' : 'z'); // Mage retains charge despite this miss
    await page.waitForFunction(() => document.querySelector('.enemy-cover-counter')?.textContent === 'Shield ×3', undefined, { timeout: 10000 });
    const before = await hp();
    await key(); // Mage AoE plus normal attack, all redirected to Guardian
    const after = await hp();
    assert(after[0] < before[0]);
    assert.deepEqual(after.slice(1), before.slice(1));
    assert.equal(await page.locator('.enemy-cover-counter').count(), 0); // AoE consumes 2, normal hit consumes 1
    assert.equal(await cards.first().locator('.enemy-skill-feedback').textContent(), 'COVER');
    assert.equal(await cards.first().locator('.next-action strong').textContent(), 'Attack');
    assert((await page.locator('.is-targeted').getAttribute('data-enemy-id')).startsWith('enemy_shaman'));
    await page.waitForFunction(() => document.querySelectorAll('.next-action strong')[1]?.textContent === 'Heal');
    await page.waitForFunction(() => [...document.querySelectorAll('.enemy-skill-feedback')].some(e => e.textContent === 'HEAL'), undefined, { timeout: 10000 });
    assert((await hp())[0] > after[0]);
    assert.equal(await cards.first().locator('.enemy-heal-flash').count(), 1);
    assert.equal(await cards.nth(1).locator('.enemy-skill-feedback').textContent(), 'HEAL');
    assert.equal(await cards.nth(1).locator('.next-action strong').textContent(), 'Attack');
    await page.screenshot({ path: `/tmp/enemy-skills-${width}.png` });
    // Continue actual typing through AoE / auto-retarget and into the victory reward.
    for (let i = 0; i < 800 && await page.locator('.dungeon-shell--combat').count(); i++) await key();
    assert.equal(await page.getByText('CHOOSE A BLESSING', { exact: true }).count(), 1);
    console.log(JSON.stringify({ width,height,seed,coveredNormal:true,heal:true,victory:true }));
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
