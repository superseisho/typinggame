// Optional Playwright verification against Vite, using real UI with reproducible run seeds.
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
async function room(type) { await page.locator(`[data-room-type="${type}"]`).first().click(); }
async function fit() {
  assert.equal(await page.locator('.typing-panel, .ability-state, .enemy-card').count(), 0);
  const bounds = await page.evaluate(() => ({ height: innerHeight, bottom: document.querySelector('.exploration-party').getBoundingClientRect().bottom, scrollWidth: document.documentElement.scrollWidth, width: innerWidth }));
  assert.equal(await page.locator('.exploration-party img').count(), 4);
  assert(await page.locator('.exploration-party img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)));
  assert(bounds.bottom <= bounds.height, JSON.stringify(bounds));
  assert(bounds.scrollWidth <= bounds.width, JSON.stringify(bounds));
  const content = await page.locator('.dungeon-room-content').evaluate(el => ({ scroll: el.scrollTop, client: el.clientHeight, total: el.scrollHeight }));
  assert.equal(content.scroll, 0, JSON.stringify(content));
  if (await page.locator('.encounter-room').count()) assert(content.total <= content.client + 1, JSON.stringify(content));
}
async function blessing(rare = false) {
  assert.equal(await page.locator('.buff-card').count(), 3);
  await fit();
  if (rare) assert.equal(await page.locator('.rarity-common, .rarity-uncommon').count(), 0);
  assert.equal(await page.getByRole('button', { name: /CONTINUE/ }).count(), 0);
  await page.locator('.buff-card').first().click();
  await page.locator('.buff-reward').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /CONTINUE/ }).waitFor();
  await fit();
}
try {
  await page.goto(url);
  const fixtures = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const found = {};
    const choose = (run, type) => {
      const option = run.roomOptions.find(option => option.type === type);
      return option ? reduceDungeon(run, { type: 'choose', optionId: option.id, now: 1 }) : null;
    };
    for (let seed = 0; seed < 60000; seed++) {
      const initial = createDungeonRun(seed, 'fixtures');
      const event = choose(initial, 'event');
      if (event) found[event.encounter.definitionId] ??= seed;
      let altar = choose(initial, 'altar');
      if (altar) {
        found.altar ??= seed;
        if (found.bloodCamp === undefined) {
          altar = reduceDungeon(altar, { type: 'encounter-choice', choiceId: 'blood', now: 1 });
          altar = reduceDungeon(altar, { type: 'choose-buff', buffId: altar.buffOptions[0] });
          altar = reduceDungeon(altar, { type: 'finish-buff' });
          altar = reduceDungeon(altar, { type: 'advance' });
          const camp = choose(altar, 'event');
          if (camp?.encounter.definitionId === 'camp') found.bloodCamp = seed;
        }
      }
      if (found.goldAltar === undefined || found.paidTraveler === undefined) {
        let treasure = choose(initial, 'treasure');
        if (treasure) {
          treasure = reduceDungeon(treasure, { type: 'open-treasure' });
          if (treasure.treasure.outcome === 'gold') {
            treasure = reduceDungeon(treasure, { type: 'advance' });
            if (choose(treasure, 'altar')) found.goldAltar ??= seed;
            if (choose(treasure, 'event')?.encounter.definitionId === 'traveler') found.paidTraveler ??= seed;
          }
        }
      }
      if (Object.keys(found).length === 9) return found;
    }
    throw Error(`Missing fixtures ${JSON.stringify(found)}`);
  });
  console.log('seeds', fixtures);
  for (const [width, height] of [[1920, 1080], [1536, 864], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    await start(fixtures.altar); await room('altar'); await fit();
    assert(await page.getByRole('button', { name: /Gold Offering/ }).isDisabled());
    await page.getByRole('button', { name: /Blood Offering/ }).click();
    await blessing(true);
    assert((await page.locator('.floor-meter').textContent()).includes('01'));
    await page.getByRole('button', { name: /CONTINUE/ }).click();
    console.log('PASS Altar / result fit', width, height);
  }
  for (const [id, title, action] of [
    ['traveler', 'Mysterious Traveler', 'Refuse'], ['camp', 'Abandoned Camp', 'Search the Camp'],
    ['chest', 'Bloodstained Chest', 'Open'], ['fountain', 'Healing Fountain', 'Fill a Bottle'],
    ['inscription', 'Ancient Inscription', 'Study the Inscription'],
  ]) {
    await start(fixtures[id]); await room('event');
    await page.getByRole('heading', { name: title, exact: true }).waitFor(); await fit();
    if (id === 'traveler') assert(await page.getByRole('button', { name: /Pay 100 Gold/ }).isDisabled());
    if (process.env.SCREENSHOT_DIR && id === 'camp') await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/event.png` });
    await page.getByRole('button', { name: new RegExp(action) }).click();
    if (id === 'inscription') await blessing();
    await page.getByRole('button', { name: /CONTINUE/ }).waitFor(); await fit();
    console.log('PASS Event', id);
  }
  await start(fixtures.bloodCamp); await room('altar');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/altar.png` });
  await page.getByRole('button', { name: /Blood Offering/ }).click(); await blessing(true);
  await page.getByRole('button', { name: /CONTINUE/ }).click(); await room('event');
  const hpBefore = await page.locator('.exploration-party [role="progressbar"]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
  await page.getByRole('button', { name: /Take a Rest/ }).click();
  const hpAfter = await page.locator('.exploration-party [role="progressbar"]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
  assert(hpAfter.some((hp, i) => hp > hpBefore[i]));
  console.log('PASS Blood cost → Camp heal', hpBefore, hpAfter);
  for (const [key, type, action, cost] of [['goldAltar', 'altar', 'Gold Offering', 150], ['paidTraveler', 'event', 'Pay 100 Gold', 100]]) {
    await start(fixtures[key]); await room('treasure');
    await page.getByRole('button', { name: 'OPEN TREASURE', exact: true }).click();
    await page.getByRole('button', { name: /次の階へ/ }).click(); await room(type);
    const before = await gold();
    await page.getByRole('button', { name: new RegExp(action) }).click();
    assert.equal(await gold(), before - cost); await blessing(type === 'altar');
    assert.equal(await gold(), before - cost);
    console.log('PASS paid choice', action);
  }
  await start(fixtures.altar); await room('altar'); await page.getByRole('button', { name: /LEAVE ALTAR/ }).click();
  assert.equal(await gold(), 0); assert.equal(await page.locator('.buff-reward').count(), 0);
  await page.getByRole('button', { name: /CONTINUE/ }).click();
  assert.deepEqual(errors, []);
  console.log('PASS Event / Altar browser checks', { errors });
} finally { await browser.close(); }
