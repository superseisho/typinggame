// Explicit all-Buff debug fixture. Uses real components, typing, target actions and combat ticks.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const url = process.env.APP_URL ?? 'http://127.0.0.1:4174/typinggame/';
const base = new URL('.', url).pathname;
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
try {
  for (const [width, height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({ width,height });
    await page.goto(url);
    await page.evaluate(async base => {
      const react = await import(base + 'node_modules/.vite/deps/react.js');
      const client = await import(base + 'node_modules/.vite/deps/react-dom_client.js');
      const React = react.default ?? react;
      const { createRoot } = client.default ?? client;
      const { BattleStage } = await import(base + 'src/components/BattleStage.tsx');
      const { createCombatState } = await import(base + 'src/game/combat/createCombatState.ts');
      const { applyRunBuffs } = await import(base + 'src/game/buffs/runBuffManager.ts');
      const { startCombat,tickCombat } = await import(base + 'src/game/combat/combatEngine.ts');
      const { handleCombatTyping } = await import(base + 'src/game/combat/handleCombatTyping.ts');
      const { selectEnemyTarget, moveEnemyTarget } = await import(base + 'src/game/combat/enemyTarget.ts');
      const ids = ['shield-wall','guardians-grace','shield-momentum','retribution','rallying-aegis','relentless-advance',
        'twin-aegis','perfect-bastion','overdrive','reinforced-shield','guardian-oath','fortress'];
      let state = startCombat(applyRunBuffs(createCombatState(['enemy_executioner','crypt-slime']), ids.map(buffId => ({ buffId,stacks:1 }))), 0);
      state = { ...state, party: state.party.map(p => ({ ...p,currentHp:30 })), enemies:state.enemies.map(e => ({ ...e,currentHp:10000,actionRemainingMs:1e9 })) };
      document.getElementById('root').style.display = 'none';
      const node = document.createElement('div'); document.body.append(node);
      const root = createRoot(node);
      const render = () => root.render(React.createElement('main', { className:'game-shell dungeon-shell dungeon-shell--combat' },
        React.createElement('header', { className:'topbar' }, 'KNIGHT BUFF DEBUG'),
        React.createElement(BattleStage, { combat:state,onSelectEnemyTarget:id => { state=selectEnemyTarget(state,id); render(); } })));
      window.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); state=moveEnemyTarget(state,event.key==='ArrowLeft'?'left':'right');
        } else state=handleCombatTyping(state,event.key,Date.now());
        render();
      });
      const interval = setInterval(() => { state=tickCombat(state,50,Date.now()); render(); },50);
      window.knightFixture = {
        state: () => state,
        attack: () => { state=tickCombat({ ...state,enemies:state.enemies.map((e,i)=>i?e:{...e,nextActionSkillId:'skill_heavy_attack',actionRemainingMs:0}) },1,Date.now()); render(); },
        stop: () => clearInterval(interval),
      };
      render();
    }, base);
    await page.locator('.typing-line mark').waitFor();
    for (let key=0; key<100; key++) {
      if (await page.evaluate(() => window.knightFixture.state().typing.completedSentences > 0)) break;
      await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
      await page.waitForTimeout(15);
    }
    assert.equal(await page.evaluate(() => window.knightFixture.state().party[0].guardCharges),2);
    assert((await page.locator('.party-panel').textContent()).includes('GUARD ×2'));
    const chosen = page.locator('.enemy-target-hitarea').nth(1);
    await chosen.click();
    const before = await page.evaluate(() => window.knightFixture.state());
    assert.equal(Object.keys(before.buffResources.timedPartyModifiers).length,0);
    await page.evaluate(() => window.knightFixture.attack());
    await page.waitForTimeout(60);
    const after = await page.evaluate(() => window.knightFixture.state());
    assert.equal(after.party[0].guardCharges,1);
    assert.equal(after.buffResources.attackThresholdReduction,10);
    assert(after.buffResources.timedPartyModifiers.attack.remainingMs > 19000);
    assert(after.buffResources.timedPartyModifiers.defense.remainingMs > 19000);
    assert.equal(after.buffResources.counters.warrior,.3);
    assert.equal(after.buffResources.gaugeShield,15);
    assert(after.party.every((p,i)=>p.currentHp>before.party[i].currentHp));
    assert(after.events.some(e=>e.abilityId==='retribution' && e.targetId===before.enemies[0].instanceId));
    assert.equal(after.targetEnemyId,before.targetEnemyId);
    assert((await page.locator('.party-panel').textContent()).includes('GUARD ×1'));
    for (const selector of ['.typing-panel','.party-panel','.party-grid','.enemy-grid']) {
      if (!(await page.locator(selector).count())) continue;
      const bounds = await page.locator(selector).boundingBox();
      assert(bounds && bounds.y>=0 && bounds.y+bounds.height<=height+1,`${selector} exceeds ${height}`);
    }
    await page.screenshot({path:`/tmp/knight-buffs-${width}.png`});
    await page.evaluate(() => window.knightFixture.attack());
    await page.waitForTimeout(40);
    const second = await page.evaluate(() => window.knightFixture.state());
    assert.equal(second.party[0].guardCharges,0);
    assert.equal(second.buffResources.attackThresholdReduction,20);
    assert.equal(second.party[0].statuses.includes('ability:guard'),false);
    assert.equal(second.events.filter(e=>e.kind==='ally-guard-consumed').length,2);
    await page.keyboard.press('ArrowLeft');
    const targetAfterArrow=await page.evaluate(()=>window.knightFixture.state().targetEnemyId);
    assert.notEqual(targetAfterArrow,second.targetEnemyId);
    await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
    await page.waitForTimeout(30);
    assert((await page.evaluate(()=>window.knightFixture.state().typing.correctCharacterCount))>second.typing.correctCharacterCount);
    await page.evaluate(()=>window.knightFixture.stop());
    results.push({width,height,guards:2,counter:true,heal:true,partyModifiers:true,thresholdReduction:20});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({fixture:'all Buffs, real typing + Heavy Attack ticks',results,errors},null,2));
} finally { await browser.close(); }
