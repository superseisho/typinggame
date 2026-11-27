// Optional Shop debug fixture using the real generator, reducer, target picker and UI.
import assert from 'node:assert/strict';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const url=process.env.APP_URL??'http://127.0.0.1:4174/typinggame/';
const base=new URL('.',url).pathname;
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function fixture() {
  await page.goto(url);
  await page.evaluate(async base=>{
    const React=(await import(base+'node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import(base+'node_modules/.vite/deps/react-dom_client.js')).default;
    const {ShopRoom}=await import(base+'src/components/dungeon/ShopRoom.tsx');
    const {DungeonProgressHeader}=await import(base+'src/components/dungeon/DungeonProgressHeader.tsx');
    const {CurrentBuffs}=await import(base+'src/components/dungeon/CurrentBuffs.tsx');
    const {ExplorationPartyPanel}=await import(base+'src/components/dungeon/ExplorationPartyPanel.tsx');
    const {createDungeonRun,reduceDungeon}=await import(base+'src/game/dungeon/dungeonEngine.ts');
    const {applyRunBuffs}=await import(base+'src/game/buffs/runBuffManager.ts');
    const {getEffectiveCharacter}=await import(base+'src/game/buffs/buffModifiers.ts');
    const {recoverParty}=await import(base+'src/game/dungeon/roomResolver.ts');
    let run;
    for(let seed=0;seed<100;seed++) {
      const initial=createDungeonRun(seed,'shop-fixture');
      const chosen=reduceDungeon({...initial,runStatus:'choosing',roomOptions:[{id:'fixture',type:'shop'}]},{type:'choose',optionId:'fixture',now:1});
      if(chosen.shop.items.some(i=>i.type==='recovery'&&i.recoveryId==='revival-potion')) {run=chosen;break;}
    }
    run={...run,gold:3000,activeBuffs:[{buffId:'vitality-rune',stacks:3}],combat:applyRunBuffs({...run.combat,party:run.combat.party.map((p,i)=>({...p,currentHp:i===0||i===2?0:p.currentHp-10}))},[{buffId:'vitality-rune',stacks:3}])};
    document.getElementById('root').style.display='none';
    const node=document.createElement('div');document.body.append(node);
    const root=createRoot(node);
    const dispatch=action=>{run=reduceDungeon(run,action);render();};
    const render=()=>root.render(React.createElement('main',{className:'game-shell dungeon-shell dungeon-shell--exploration'},
      React.createElement('header',{className:'topbar'},'SHOP DEBUG'),
      React.createElement(DungeonProgressHeader,{run}),React.createElement(CurrentBuffs,{buffs:run.activeBuffs}),
      React.createElement('div',{className:'dungeon-room-content'},run.currentRoom==='shop'?React.createElement(ShopRoom,{run,
        onPurchase:(productId,targetId)=>dispatch({type:'purchase',productId,targetId}),
        onReroll:revision=>dispatch({type:'reroll-shop',revision}),onLeave:()=>dispatch({type:'leave-shop'})}):React.createElement('p',null,'LEFT SHOP')),
      React.createElement(ExplorationPartyPanel,{combat:run.combat})));
    window.shopFixture={state:()=>run,maxHp:id=>getEffectiveCharacter(run.combat,id).stats.maxHp,
      allAlive:()=>{run={...run,combat:recoverParty(run.combat,1,undefined,true)};render();}};
    render();
  },base);
  await page.locator('.shop-product').first().waitFor();
}
try {
  for(const [width,height,columns] of [[1920,1080,4],[1366,768,4],[820,1180,2],[390,844,1]]) {
    await page.setViewportSize({width,height});await fixture();
    const cards=page.locator('.shop-product');assert.equal(await cards.count(),8);
    const layout=await cards.evaluateAll(nodes=>nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop,overflow:n.scrollWidth>n.clientWidth+2})));
    assert.equal(new Set(layout.map(r=>r.x)).size,columns);
    assert.equal(new Set(layout.map(r=>r.y)).size,8/columns);
    assert(layout.every(r=>!r.overflow));
    const stock=(await page.evaluate(()=>window.shopFixture.state())).shop.items;
    assert(stock.slice(0,2).every(i=>i.type==='recovery'));assert(stock.slice(2).every(i=>i.type==='buff'));
    await page.screenshot({path:`/tmp/shop-eight-${width}.png`,fullPage:true});
    const revival=cards.filter({has:page.getByRole('heading',{name:'Revival Potion',exact:true})});
    await revival.click();assert.equal(await page.locator('.recovery-targets button').count(),2);
    assert((await page.locator('.recovery-targets').textContent()).includes('DOWN'));
    assert.equal((await page.evaluate(()=>window.shopFixture.state())).gold,3000);
    await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.shopFixture.state())).gold,3000);
    await revival.click();await page.locator('.recovery-targets button').filter({hasText:'騎士'}).click();
    const bought=await page.evaluate(()=>window.shopFixture.state());
    assert.equal(bought.gold,2820);
    assert.equal(bought.combat.party[0].currentHp,Math.ceil(await page.evaluate(()=>window.shopFixture.maxHp('warrior'))*.3));
    assert(bought.combat.events.some(e=>e.wasRevived&&e.targetId==='warrior'));
    assert.equal(await page.locator('[data-character-id="warrior"][data-visual-state="down"]').count(),0);
    assert((await revival.textContent()).includes('SOLD OUT'));assert(await revival.isDisabled());
    const buff=page.locator('.shop-product').nth(2);await buff.click();assert((await buff.textContent()).includes('SOLD OUT'));
    await page.getByRole('button',{name:/REROLL ·/}).click();
    const rerolled=await page.evaluate(()=>window.shopFixture.state());
    assert.equal(rerolled.gold,bought.gold-stock[2].price-40);
    assert.equal(rerolled.shop.rerollCount,1);assert.equal(rerolled.shop.items.length,8);
    assert.equal(rerolled.shop.items.filter(i=>i.type==='recovery').length,2);
    assert.equal(rerolled.shop.items.filter(i=>i.type==='buff').length,6);
    await page.getByRole('button',{name:'LEAVE SHOP →',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.shopFixture.state())).currentFloor,2);
    console.log(JSON.stringify({width,height,columns,rows:8/columns,revivedHp:bought.combat.party[0].currentHp,cancel:true,soldOut:true,reroll:true,exit:true}));
  }
  await fixture();await page.evaluate(()=>window.shopFixture.allAlive());
  const disabled=page.locator('.shop-product').filter({has:page.getByRole('heading',{name:'Revival Potion',exact:true})});
  assert(await disabled.isDisabled());assert((await disabled.textContent()).includes('蘇生対象なし'));
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
