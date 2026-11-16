// Explicit Cleric debug fixtures; real typing, healing, revival, normal attacks and combat ticks.
import assert from 'node:assert/strict';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const url=process.env.APP_URL??'http://127.0.0.1:4174/typinggame/';
const base=new URL('.',url).pathname;
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const results=[];
async function key(){
  await page.keyboard.press((await page.locator('.typing-line mark').textContent()).trim());
  await page.waitForTimeout(20);
}
async function fixture(mass){
  await page.goto(url);
  await page.evaluate(async({base,mass})=>{
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
    const buffs=['sacred-veil','divine-momentum','sacred-protection','divine-inspiration','resurrection','twin-miracle',
      'healing-prayer','sacred-healing','guardian-blessing',...(mass?['mass-healing']:[])];
    let state=startCombat(applyRunBuffs(createCombatState(['enemy_executioner','crypt-slime']),buffs.map(buffId=>({buffId,stacks:buffId==='divine-momentum'?2:1}))),0);
    state={...state,party:state.party.map(p=>({...p,currentHp:p.definitionId==='cleric'?10:0,abilityCharge:p.definitionId==='cleric'?48:0})),
      enemies:state.enemies.map(e=>({...e,currentHp:10000,actionRemainingMs:1e9}))};
    document.getElementById('root').style.display='none';
    const node=document.createElement('div');document.body.append(node);
    const root=createRoot(node);
    const render=()=>root.render(React.createElement('main',{className:'game-shell dungeon-shell dungeon-shell--combat'},
      React.createElement('header',{className:'topbar'},'CLERIC BUFF DEBUG'),
      React.createElement(BattleStage,{combat:state,onSelectEnemyTarget:id=>{state=selectEnemyTarget(state,id);render();}})));
    window.addEventListener('keydown',e=>{
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();state=moveEnemyTarget(state,e.key==='ArrowLeft'?'left':'right');}
      else state=handleCombatTyping(state,e.key,Date.now());
      render();
    });
    window.clericFixture={state:()=>state,tick:ms=>{state=tickCombat(state,ms,Date.now());render();},effective:()=>state.party.map(p=>getEffectiveCharacter(state,p.definitionId))};
    render();
  },{base,mass});
  await page.locator('.typing-line mark').waitFor();
}
try{
  for(const [width,height] of [[1920,1080],[1536,864],[1366,768]]){
    await page.setViewportSize({width,height});
    await fixture(true);
    assert.equal(await page.locator('[data-visual-state="down"]').count(),3);
    await key();await key();
    const state=await page.evaluate(()=>window.clericFixture.state());
    assert.equal(state.events.filter(e=>e.kind==='ally-ability-triggered'&&e.actorId==='cleric').length,1);
    assert.equal(state.events.filter(e=>e.kind==='ally-heal').length,8);
    assert.equal(state.events.filter(e=>e.wasRevived).length,3);
    assert(state.party.every(p=>p.currentHp>0));
    assert.equal(state.buffResources.timedCharacterModifiers.length,8);
    assert(state.buffResources.timedCharacterModifiers.every(e=>e.value===.3&&e.remainingMs===20000));
    assert.equal(state.party[2].abilityCharge,0);
    assert.equal(state.party[0].attackCharge,40);
    assert.equal(state.party[1].attackCharge,10); // 40 Momentum charge, one ready normal attack.
    assert.equal(await page.locator('[data-visual-state="down"]').count(),0);
    assert.equal(await page.locator('.combat-feedback--heal').filter({hasText:'REVIVE'}).count(),3);
    assert.equal(await page.locator('.combat-feedback--heal').count(),8);
    assert((await page.locator('.party-panel').textContent()).includes('DEF +30% 20.0s'));
    assert((await page.locator('.party-panel').textContent()).includes('ATK +30% 20.0s'));
    for(const selector of ['.typing-panel','.party-panel']){
      const r=await page.locator(selector).boundingBox();assert(r&&r.y>=0&&r.y+r.height<=height+1,`${selector} exceeds ${height}`);
    }
    const overflow=await page.locator('.gauge-label').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1));
    assert.equal(overflow,false,'Gauge labels must fit in their cards');
    await page.screenshot({path:`/tmp/cleric-buffs-${width}.png`});
    await page.evaluate(()=>window.clericFixture.tick(19999));
    assert((await page.evaluate(()=>window.clericFixture.state())).buffResources.timedCharacterModifiers.every(e=>e.remainingMs===1));
    await page.evaluate(()=>window.clericFixture.tick(1));
    assert.equal((await page.evaluate(()=>window.clericFixture.state())).buffResources.timedCharacterModifiers.length,0);
    await page.keyboard.press('ArrowRight');await key();
    assert.equal((await page.evaluate(()=>window.clericFixture.state())).typing.correctCharacterCount,3);
    await fixture(false);
    await key();await key();
    const single=await page.evaluate(()=>window.clericFixture.state());
    assert.equal(single.events.filter(e=>e.wasRevived).length,1);
    assert.deepEqual(single.events.filter(e=>e.kind==='ally-heal').map(e=>e.targetId),['warrior','warrior']);
    assert.equal(single.party[1].currentHp,0);
    assert.equal(single.party[3].currentHp,0);
    results.push({width,height,massRevived:3,healPulses:2,healEvents:8,singleTargetFixed:true,temporaryModifiers:8});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({fixture:'Cleric support + three Legendaries, real keyboard input and battle engine',results,errors},null,2));
}finally{await browser.close();}
