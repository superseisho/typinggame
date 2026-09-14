// Run against Vite with optional PLAYWRIGHT_MODULE and APP_URL.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.APP_URL ?? 'http://127.0.0.1:4173';
async function start(seed) {
  await page.goto(url);
  await page.evaluate(seed => Math.random = () => seed / 4294967296, seed);
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
}
async function check(name) {
  await page.locator('.exploration-party img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  const metrics = () => page.evaluate(() => {
    const content = document.querySelector('.dungeon-room-content');
    const party = document.querySelector('.exploration-party');
    const cr = content.getBoundingClientRect(), pr = party.getBoundingClientRect();
    const room = content.querySelector('.dungeon-room')?.getBoundingClientRect();
    const outside = [...content.querySelectorAll('button,h1,h2,p,small')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && (r.top < cr.top - 1 || r.bottom > cr.bottom + 1);
    }).map(el => el.textContent);
    return { page: document.documentElement.scrollHeight, height: innerHeight,
      contentHeight: content.clientHeight, contentScrollHeight: content.scrollHeight,
      partyHeight: party.clientHeight, partyScrollHeight: party.scrollHeight,
      y: scrollY, contentY: content.scrollTop, partyY: party.scrollTop,
      top: pr.top, bottom: pr.bottom, roomGap: room ? pr.top - room.bottom : null, outside };
  });
  const before = await metrics();
  assert(before.page <= before.height + 1, JSON.stringify(before));
  assert(before.contentScrollHeight <= before.contentHeight + 1, JSON.stringify(before));
  assert(before.partyScrollHeight <= before.partyHeight + 1, JSON.stringify(before));
  assert(before.bottom <= before.height, JSON.stringify(before));
  assert.equal(before.bottom, before.height - 10, 'Party bottom must stay unchanged');
  assert.equal(before.partyHeight, 202, 'Party size must stay unchanged');
  if (before.roomGap !== null) assert(before.roomGap >= 0 && before.roomGap <= 16, JSON.stringify(before));
  assert.deepEqual(before.outside, [], JSON.stringify(before));
  assert.equal(await page.locator('.exploration-party img').count(), 4);
  const cards = await page.locator('.path-card').evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect();
    const description = card.querySelector('p').getBoundingClientRect();
    const tags = card.querySelector('.path-card__features').getBoundingClientRect();
    return { height: r.height, gap: tags.top - description.bottom,
      overflow: card.scrollWidth > card.clientWidth,
      tags: card.querySelectorAll('.path-card__features > span').length };
  }));
  for (const card of cards) {
    assert(card.height <= 260 && card.gap <= 12 && !card.overflow && card.tags >= 2, JSON.stringify(card));
  }
  if (cards.length) assert(Math.max(...cards.map(c => c.height)) - Math.min(...cards.map(c => c.height)) < 1);
  for (const selector of ['.dungeon-room-content', '.exploration-party', '.dungeon-progress-header']) {
    await page.locator(selector).hover();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(80);
    assert.deepEqual(await metrics(), before, `${name}: downward wheel moved UI`);
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(80);
    assert.deepEqual(await metrics(), before, `${name}: wheel moved UI`);
  }
  console.log('PASS', name, before.height, 'content', before.contentHeight, 'party', before.top, before.bottom);
}
try {
  await page.goto(url);
  const seeds = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const found = {};
    for (let seed = 0; seed < 10000; seed++) {
      const run = createDungeonRun(seed, 'layout');
      for (const option of run.roomOptions) {
        found[option.type] ??= seed;
        if (option.type === 'event') {
          const event = reduceDungeon(run, { type: 'choose', optionId: option.id, now: 0 });
          found['event-' + event.encounter.definitionId] ??= seed;
        }
      }
      if (Object.keys(found).length === 12) return found;
    }
    throw Error('Missing room seeds');
  });
  for (const [width, height] of [[1920,1080], [1536,864], [1366,768]]) {
    await page.setViewportSize({ width, height });
    await start(seeds.battle); await check('Room Selection');
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/selection-${height}.png` });
    for (const type of ['rest', 'shop', 'treasure', 'altar', ...Object.keys(seeds).filter(k => k.startsWith('event-'))]) {
      await start(seeds[type]);
      await check('Path choices: ' + type);
      await page.locator(`[data-room-type="${type.startsWith('event-') ? 'event' : type}"]`).first().click();
      await check(type);
      if (process.env.SCREENSHOT_DIR && height === 768 && ['shop','altar'].includes(type)) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/layout-${type}.png` });
      if (type === 'altar') {
        await page.getByRole('button', { name: /Blood Offering/ }).click(); await check('Buff Reward');
      }
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
