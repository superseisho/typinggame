// Real Dungeon reward -> acquisition -> protected typo. Shop uses an explicit funded debug fixture.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const url = process.env.APP_URL ?? 'http://127.0.0.1:4174';
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const stats = () => page.locator('.typing-stats strong').allTextContents();
const gauges = () => page.locator('.progress--special > span').evaluateAll(nodes => nodes.map(n => parseFloat(n.style.width)));
async function correct() {
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  await page.waitForTimeout(20);
}
try {
  await page.goto(url);
  const seed = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { getTypingDisplay } = await import('/src/game/typing/typingEngine.ts');
    for (let i = 1; i < 10000; i++) {
      const seed = Math.imul(i, 2654435761) >>> 0;
      let run = createDungeonRun(seed, 'verify');
      const option = run.roomOptions.find(o => o.type === 'battle');
      if (!option) continue;
      run = reduceDungeon(run, { type: 'choose', optionId: option.id, now: 1 });
      for (let key = 0; key < 600 && run.runStatus === 'battle'; key++) run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: key + 2 });
      if (!run.buffOptions.includes('unbroken-focus')) continue;
      run = reduceDungeon(run, { type: 'choose-buff', buffId: 'unbroken-focus' });
      run = reduceDungeon(run, { type: 'finish-buff' });
      if (run.runStatus === 'choosing' && run.roomOptions.some(o => o.type === 'battle')) return seed;
    }
    throw Error('Could not find deterministic Legendary reward fixture');
  });
  await page.evaluate(seed => Math.random = () => seed / 4294967296, seed);
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
  await page.locator('[data-room-type="battle"]').first().click();
  for (let i = 0; i < 1000 && await page.locator('.typing-line mark').count(); i++) await correct();
  const reward = page.getByRole('button', { name: 'Unbroken Focusを取得' });
  await reward.waitFor();
  assert((await reward.getAttribute('class')).includes('rarity-legendary'));
  for (const [width, height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({ width, height });
    const rect = await reward.boundingBox();
    assert(rect && rect.y >= 0 && rect.y + rect.height <= height);
    await page.screenshot({ path: `/tmp/legendary-reward-${width}.png` });
  }
  await reward.click();
  await page.getByText('Choose Your Path', { exact: true }).waitFor();
  await page.locator('[data-room-type="battle"]').first().click();
  for (let i = 0; i < 10; i++) await correct();
  const before = await stats();
  const gaugeBefore = await gauges();
  assert(gaugeBefore.length > 0);
  const position = await page.locator('.typing-line').textContent();
  const typo = (await page.locator('.typing-line mark').textContent()).trim() === 'z' ? 'q' : 'z';
  await page.keyboard.press(typo);
  await page.getByText('PROTECTED', { exact: true }).waitFor();
  const protectedStats = await stats();
  assert.equal(Number(protectedStats[1]), Number(before[1]) + 1);
  assert.equal(protectedStats[2], before[2]);
  assert.equal(await page.locator('.typing-line').textContent(), position);
  assert.deepEqual(await gauges(), gaugeBefore);
  for (const [width,height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({ width,height });
    const rect = await page.locator('.typing-panel').boundingBox();
    assert(rect && rect.y >= 0 && rect.y + rect.height <= height);
    await page.screenshot({ path: `/tmp/legendary-protected-${width}.png` });
  }
  await page.keyboard.press(typo);
  await page.waitForTimeout(30);
  assert.equal((await stats())[2], '0');
  assert((await gauges()).some((g, i) => Number(g) > Number(gaugeBefore[i])));
  await correct();
  assert.equal((await stats())[2], '1');

  // Funded debug Shop, using actual generator, component, purchase and reroll logic.
  await page.goto(url);
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = reactModule.default ?? reactModule;
    const { createRoot } = clientModule.default ?? clientModule;
    const { ShopRoom } = await import('/src/components/dungeon/ShopRoom.tsx');
    const { CurrentBuffs } = await import('/src/components/dungeon/CurrentBuffs.tsx');
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { generateShop } = await import('/src/game/dungeon/shopEngine.ts');
    const { BUFFS_BY_ID } = await import('/src/data/buffs/buffDefinitions.ts');
    let run = { ...createDungeonRun(1, 'funded-shop'), currentRoom: 'shop', runStatus: 'room', gold: 1000 };
    for (let seed = 0; seed < 10000; seed++) {
      const stock = generateShop({ ...run, rngState: Math.imul(seed,2654435761) >>> 0 });
      if (stock.shop.items.some(p => p.type === 'buff' && BUFFS_BY_ID[p.buffId].rarity === 'legendary')) {
        run = { ...run, shop: stock.shop, rngState: stock.seed }; break;
      }
    }
    document.getElementById('root').style.display = 'none';
    const node = document.createElement('div'); document.body.append(node);
    const root = createRoot(node);
    const dispatch = action => { run = reduceDungeon(run, action); render(); };
    const render = () => root.render(React.createElement('main', { className: 'game-shell dungeon-shell' },
      React.createElement(CurrentBuffs, { buffs: run.activeBuffs }),
      React.createElement(ShopRoom, { run, onPurchase: productId => dispatch({ type: 'purchase', productId }),
        onReroll: revision => dispatch({ type: 'reroll-shop', revision }), onLeave: () => {} })));
    render();
  });
  const product = page.locator('.shop-product.rarity-legendary').first();
  await product.waitFor();
  assert((await product.textContent()).includes('400 Gold'));
  await product.click();
  assert((await product.textContent()).includes('SOLD OUT'));
  assert((await page.locator('.shop-room').textContent()).includes('600 GOLD'));
  await page.locator('.current-buffs summary').click();
  assert.equal(await page.locator('.current-buffs .rarity-legendary').count(), 1);
  await page.screenshot({ path: '/tmp/legendary-shop-1366.png' });
  await page.getByRole('button', { name: /REROLL/ }).click();
  await page.waitForTimeout(50);
  assert((await page.locator('.shop-room').textContent()).includes('560 GOLD'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ seed, realDungeon: 'Legendary reward acquired, protected miss and subsequent ordinary miss verified', shop: 'funded debug fixture: 400 Gold purchase, sold-out, inventory, reroll verified', sizes: ['1920x1080','1536x864','1366x768'], errors }, null, 2));
} finally { await browser.close(); }
