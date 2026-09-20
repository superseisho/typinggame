// Real randomized Dungeon entry and real timers/input. Only the initial RNG seed is controlled.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless:true,args:['--no-sandbox'] });
const page = await browser.newPage();
const url = process.env.APP_URL ?? 'http://127.0.0.1:4174';
const errors = [];
page.on('pageerror',error => errors.push(error.message));
const hp = () => page.locator('.party-panel .progress--health').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
async function correct() {
  const count = Number(await page.locator('.typing-stats strong').first().textContent());
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  if (await page.locator('.dungeon-shell--combat').count()) {
    await page.waitForFunction(n => Number(document.querySelector('.typing-stats strong')?.textContent) === n + 1,count);
  }
}
try {
  await page.goto(url);
  const {seed, damage} = await page.evaluate(async () => {
    const { createDungeonRun,reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { CHARACTERS_BY_ID } = await import('/src/data/characters.ts');
    const plans = { enemy_executioner:'skill_heavy_attack',enemy_cultist:'skill_empower',enemy_wraith:'skill_curse' };
    for (let n = 0; n < 200000; n++) {
      const seed = Math.imul(n,2654435761) >>> 0;
      const run = createDungeonRun(seed,'tactical');
      const option = run.roomOptions.find(o => o.type === 'battle');
      if (!option) continue;
      const state = reduceDungeon(run,{type:'choose',optionId:option.id,now:1}).combat;
      if (state.enemies.length !== 3 || new Set(state.enemies.map(e => e.definitionId)).size !== 3) continue;
      if (state.enemies.every(e => plans[e.definitionId] && e.nextActionSkillId === plans[e.definitionId])) {
        return { seed, damage:Math.round(24 * 1.8 * 1.3) - CHARACTERS_BY_ID.warrior.stats.defense };
      }
    }
    throw Error('No random mixed demonstration seed');
  });
  for (const [width,height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({width,height});
    await page.goto(url);
    await page.evaluate(seed => Math.random = () => seed / 4294967296,seed);
    await page.getByRole('button',{name:'GAME START',exact:true}).click();
    await page.locator('[data-room-type="battle"]').first().click();
    const executioner = page.locator('[data-enemy-id^="enemy_executioner-"]');
    const cultist = page.locator('[data-enemy-id^="enemy_cultist-"]');
    const wraith = page.locator('[data-enemy-id^="enemy_wraith-"]');
    for (const [card,name,time] of [[executioner,'Heavy Attack',11.5],[cultist,'Empower',8.5],[wraith,'Curse',8]]) {
      assert.equal(await card.locator('.next-action strong').textContent(),name);
      const remaining = parseFloat(await card.locator('.gauge-label strong').nth(1).textContent());
      // HP is the first gauge label, ACTION the second.
      assert(remaining > time - 1 && remaining <= time, `${name}: ${remaining}`);
    }
    const before = await hp();
    assert.equal(before.length,4);
    await cultist.locator('.enemy-target-hitarea').click();
    const ids = await page.locator('.enemy-unit').evaluateAll(nodes => nodes.map(n => n.dataset.enemyId));
    const selected = await cultist.getAttribute('data-enemy-id');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.is-targeted').getAttribute('data-enemy-id'),ids[(ids.indexOf(selected)+1)%3]);
    await page.waitForFunction(() => document.querySelector('.typing-curse')?.textContent.includes('CURSED'),undefined,{timeout:10000});
    await correct();
    assert.equal(await page.locator('.typing-curse').count(),1);
    await page.waitForFunction(() => document.querySelector('[data-enemy-id^="enemy_executioner-"] .status-chips')?.textContent.includes('1.30'));
    await page.screenshot({path:`/tmp/tactical-enemies-${width}.png`});
    await page.waitForFunction(() => document.querySelector('[data-enemy-id^="enemy_executioner-"] .enemy-skill-feedback')?.textContent === 'HEAVY ATTACK');
    assert.equal((await hp())[0],before[0] - damage);
    assert(!(await executioner.locator('.status-chips').textContent()).includes('EMPOWER'));
    const expected = (await page.locator('.typing-line mark').textContent()).trim();
    await page.keyboard.press(expected === 'z' ? 'q' : 'z');
    await page.waitForFunction(() => !document.querySelector('.typing-curse'));
    const gauges = await page.locator('.enemy-unit .progress--special span').evaluateAll(nodes => nodes.map(n => parseFloat(n.style.width)));
    const maxima = ids.map(id => id.startsWith('enemy_executioner-') ? 175 : id.startsWith('enemy_cultist-') ? 200 : 150);
    gauges.forEach((percent,i) => assert(Math.abs(percent - 35 / maxima[i] * 100) < .01));
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight
      && [...document.querySelectorAll('.enemy-unit, .typing-panel, .party-panel')].every(n => n.getBoundingClientRect().bottom <= innerHeight)));
    for (let i = 0; i < 800 && await page.locator('.dungeon-shell--combat').count(); i++) await correct();
    assert.equal(await page.getByText('CHOOSE A BLESSING',{exact:true}).count(),1);
    console.log(JSON.stringify({width,height,seed,heavy:true,empower:true,curse:true,victory:true}));
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
