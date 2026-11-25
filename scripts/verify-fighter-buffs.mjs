// Explicit combat fixture, real keyboard input, shared engine and actual combat UI.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const url=process.env.APP_URL??'http://127.0.0.1:4174/typinggame/';
const base=new URL('.',url).pathname;
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function input(miss=false) {
  const current=(await page.locator('.typing-line mark').textContent()).trim();
  await page.keyboard.press(miss?(current==='z'?'q':'z'):current);
  await page.waitForTimeout(10);
}
try {
  for(const [width,height] of [[1920,1080],[1536,864],[1366,768]]) {
    await page.setViewportSize({width,height});
    await page.goto(url);
    await page.evaluate(async base=>{
      const reactModule=await import(base+'node_modules/.vite/deps/react.js');
      const clientModule=await import(base+'node_modules/.vite/deps/react-dom_client.js');
      const React=reactModule.default??reactModule;
      const {createRoot}=clientModule.default??clientModule;
      const {BattleStage}=await import(base+'src/components/BattleStage.tsx');
      const {createCombatState}=await import(base+'src/game/combat/createCombatState.ts');
      const {applyRunBuffs}=await import(base+'src/game/buffs/runBuffManager.ts');
      const {startCombat,resolveReadyAllyAttacks}=await import(base+'src/game/combat/combatEngine.ts');
      const {handleCombatTyping}=await import(base+'src/game/combat/handleCombatTyping.ts');
      const {getComboView,getNormalAttackHitCount}=await import(base+'src/game/combat/fighterCombo.ts');
      const {getEffectiveCharacter}=await import(base+'src/game/buffs/buffModifiers.ts');
      const {selectEnemyTarget}=await import(base+'src/game/combat/enemyTarget.ts');
      let state=startCombat(applyRunBuffs(createCombatState(['enemy_executioner','enemy_guardian','crypt-warden']),[
        {buffId:'leg-sweep',stacks:3},{buffId:'combo-acceleration',stacks:2},{buffId:'relentless-fists',stacks:2},
        {buffId:'limit-break',stacks:3},{buffId:'combo-resilience',stacks:1},{buffId:'unbroken-focus',stacks:1},
      ]),0);
      state={...state,enemies:state.enemies.map(e=>({...e,currentHp:1000000,actionRemainingMs:1e9,actionDurationMs:1e9}))};
      document.getElementById('root').style.display='none';
      const node=document.createElement('div');document.body.append(node);
      const root=createRoot(node);
      const render=()=>root.render(React.createElement('main',{className:'game-shell dungeon-shell dungeon-shell--combat'},
        React.createElement('header',{className:'topbar'},'FIGHTER BUFF DEBUG'),
        React.createElement(BattleStage,{combat:state,onSelectEnemyTarget:id=>{state=selectEnemyTarget(state,id);render();}})));
      window.addEventListener('keydown',e=>{state=handleCombatTyping(state,e.key,Date.now());render();});
      window.fighterFixture={state:()=>state,combo:()=>getComboView(state,'martial-artist'),
        threshold:()=>getEffectiveCharacter(state,'martial-artist').attackThreshold,
        hitCount:()=>getNormalAttackHitCount(state,'martial-artist'),
        attack:()=>{state=resolveReadyAllyAttacks({...state,events:[],party:state.party.map(p=>({...p,attackCharge:p.definitionId==='martial-artist'?getEffectiveCharacter(state,'martial-artist').attackThreshold:0}))},Date.now());render();}};
      render();
    },base);
    await page.locator('.typing-line mark').waitFor();
    for(let i=0;i<200;i++) await input();
    assert.equal((await page.evaluate(()=>window.fighterFixture.combo())).stage,6);
    assert.equal(await page.evaluate(()=>window.fighterFixture.threshold()),5);
    assert((await page.locator('.party-panel').textContent()).includes('S6/6'));
    assert((await page.locator('.party-panel').textContent()).includes('3 HIT'));
    const before=await page.evaluate(()=>window.fighterFixture.state());
    await page.evaluate(()=>window.fighterFixture.attack());
    const attacked=await page.evaluate(()=>window.fighterFixture.state());
    assert.equal(attacked.events.filter(e=>e.kind==='ally-attack'&&e.actorId==='martial-artist').length,3);
    assert.equal(attacked.enemies[0].actionRemainingMs-before.enemies[0].actionRemainingMs,18000);
    assert.equal(attacked.enemies[0].nextActionSkillId,before.enemies[0].nextActionSkillId);
    await input(true); // Unbroken Focus has priority.
    assert.equal((await page.evaluate(()=>window.fighterFixture.combo())).count,200);
    for(const count of [160,120,80,40]) {
      await input(true);
      assert.equal((await page.evaluate(()=>window.fighterFixture.combo())).count,count);
      assert.equal((await page.evaluate(()=>window.fighterFixture.state())).typing.currentCombo,0);
      assert.equal(await page.evaluate(()=>window.fighterFixture.hitCount()),count>=80?3:1);
    }
    assert((await page.locator('.combat-feedback--debuff').allTextContents()).includes('COMBO DOWN'));
    assert.equal((await page.evaluate(()=>window.fighterFixture.state())).typing.missCount,5);
    for(const selector of ['.typing-panel','.party-panel']) {
      const r=await page.locator(selector).boundingBox();
      assert(r&&r.y>=0&&r.y+r.height<=height+1,`${selector} exceeds ${width}x${height}`);
    }
    assert.equal(await page.locator('.gauge-label').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1)),false);
    await page.screenshot({path:`/tmp/fighter-buffs-${width}.png`});
    console.log(JSON.stringify({width,height,realCorrect:200,protectedMiss:1,resilienceMisses:4,finalStage:2,finalCount:40,globalStreak:0,legSweepDelayMs:18000}));
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
