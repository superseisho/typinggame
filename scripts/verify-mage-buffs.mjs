// Explicit Mage-Buff debug fixture, with actual typing, combat ticks and rendered game UI.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage();
const url = process.env.APP_URL ?? 'http://127.0.0.1:4174/typinggame/';
const base = new URL('.',url).pathname;
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const results=[];
async function correct() {
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  await page.waitForTimeout(20);
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
      const {startCombat,tickCombat}=await import(base+'src/game/combat/combatEngine.ts');
      const {handleCombatTyping}=await import(base+'src/game/combat/handleCombatTyping.ts');
      const {selectEnemyTarget,moveEnemyTarget}=await import(base+'src/game/combat/enemyTarget.ts');
      const {getEffectiveCharacter}=await import(base+'src/game/buffs/buffModifiers.ts');
      const buffs=['arcane-veil','frostbind','arcane-burn','arcane-barrage','infinite-arcana','mana-surge','wide-magic','arcane-power'];
      let state=startCombat(applyRunBuffs(createCombatState(['enemy_executioner','enemy_guardian','crypt-warden']),buffs.map(buffId=>({buffId,stacks:1}))),0);
      state={...state,enemies:state.enemies.map(e=>({...e,currentHp:10000,actionRemainingMs:15000,actionDurationMs:15000,nextActionSkillId:'skill_attack'}))};
      document.getElementById('root').style.display='none';
      const node=document.createElement('div');document.body.append(node);
      const root=createRoot(node);
      const render=()=>root.render(React.createElement('main',{className:'game-shell dungeon-shell dungeon-shell--combat'},
        React.createElement('header',{className:'topbar'},'MAGE BUFF DEBUG'),
        React.createElement(BattleStage,{combat:state,onSelectEnemyTarget:id=>{state=selectEnemyTarget(state,id);render();}})));
      window.addEventListener('keydown',e=>{
        if(e.key==='ArrowLeft'||e.key==='ArrowRight') {e.preventDefault();state=moveEnemyTarget(state,e.key==='ArrowLeft'?'left':'right');}
        else state=handleCombatTyping(state,e.key,Date.now());
        render();
      });
      window.mageFixture={state:()=>state,attack:()=>getEffectiveCharacter(state,'mage').stats.attack,
        tick:ms=>{state=tickCombat(state,ms,Date.now());render();}};
      render();
    },base);
    await page.locator('.typing-line mark').waitFor();
    for(let i=0;i<23;i++)await correct();
    assert.equal((await page.evaluate(()=>window.mageFixture.state())).buffResources.nextNormalAoe.mage,undefined);
    const before=await page.evaluate(()=>({state:window.mageFixture.state(),attack:window.mageFixture.attack()}));
    await correct();
    const first=await page.evaluate(()=>window.mageFixture.state());
    assert.equal(first.buffResources.nextNormalAoe.mage,true);
    assert.equal(first.buffResources.abilityAttackGrowth.mage,.3);
    assert(first.enemies.every(e=>e.pendingFrostDelayMs===2000&&e.burn.damage===Math.round(before.attack*.1)));
    assert(first.enemies.every((e,i)=>e.nextActionSkillId===before.state.enemies[i].nextActionSkillId));
    assert((await page.locator('.party-panel').textContent()).includes('BARRAGE READY'));
    assert((await page.locator('.party-panel').textContent()).includes('ARCANA +30%'));
    assert((await page.locator('.enemy-panel').textContent()).includes('BURN') || await page.locator('.status-chips').filter({hasText:'BURN'}).count()>0);
    const selected=first.targetEnemyId;
    const attackPower=await page.evaluate(()=>window.mageFixture.attack());
    for(const selector of ['.typing-panel','.party-panel']) {
      const r=await page.locator(selector).boundingBox();assert(r&&r.y>=0&&r.y+r.height<=height+1,`${selector} outside viewport`);
    }
    const chipOverflow=await page.locator('.status-chips').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1));
    assert.equal(chipOverflow,false);
    await page.screenshot({path:`/tmp/mage-buffs-${width}.png`});
    await page.evaluate(()=>window.mageFixture.tick(2200));
    const burned=await page.evaluate(()=>window.mageFixture.state());
    assert(burned.enemies.every((e,i)=>first.enemies[i].currentHp-e.currentHp===2*first.enemies[i].burn.damage));
    assert(burned.enemies.every(e=>e.pendingFrostDelayMs===0));
    for(let i=0;i<6;i++)await correct();
    const barrage=await page.evaluate(()=>window.mageFixture.state());
    assert.equal(barrage.buffResources.nextNormalAoe.mage,false);
    assert.equal(barrage.targetEnemyId,selected);
    assert.equal(barrage.events.filter(e=>e.kind==='ally-attack'&&e.actorId==='mage').length,3);
    for(let i=0;i<18;i++)await correct();
    const recast=await page.evaluate(()=>window.mageFixture.state());
    assert.equal(recast.buffResources.nextNormalAoe.mage,true);
    assert.equal(recast.buffResources.abilityAttackGrowth.mage,.6);
    assert(recast.enemies.every(e=>e.burn.damage===Math.round(attackPower*.1)&&e.burn.remainingMs===5000));
    await page.evaluate(()=>window.mageFixture.tick(5000));
    assert((await page.evaluate(()=>window.mageFixture.state())).enemies.every(e=>e.burn===null));
    await page.keyboard.press('ArrowRight');
    await correct();
    assert.equal((await page.evaluate(()=>window.mageFixture.state())).typing.correctCharacterCount,49);
    results.push({width,height,casts:2,barrage:true,burnTicks:true,frost:true,growth:.6});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({fixture:'five Mage Buffs plus original Mage Buffs, real typing / variable combat ticks',results,errors},null,2));
} finally {await browser.close();}
