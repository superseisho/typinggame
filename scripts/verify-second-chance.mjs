// Optional real React/engine fixture for reward and Shop free-reroll transitions.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const url=process.env.APP_URL??'http://127.0.0.1:4174/typinggame/';
const base=new URL('.',url).pathname;
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(url);
  await page.evaluate(async base=>{
    const React=(await import(base+'node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import(base+'node_modules/.vite/deps/react-dom_client.js')).default;
    const {BuffReward}=await import(base+'src/components/dungeon/BuffReward.tsx');
    const {ShopRoom}=await import(base+'src/components/dungeon/ShopRoom.tsx');
    const {DungeonProgressHeader}=await import(base+'src/components/dungeon/DungeonProgressHeader.tsx');
    const {ExplorationPartyPanel}=await import(base+'src/components/dungeon/ExplorationPartyPanel.tsx');
    const {createDungeonRun,reduceDungeon}=await import(base+'src/game/dungeon/dungeonEngine.ts');
    let initial=createDungeonRun(42,'second-chance-debug');
    initial={...initial,activeBuffs:[{buffId:'second-chance',stacks:3}],gold:0,currentRoom:'battle',runStatus:'battle',combat:{...initial.combat,status:'victory'}};
    let run=reduceDungeon(initial,{type:'tick',deltaMs:50,now:1});
    document.getElementById('root').style.display='none';
    const node=document.createElement('div');document.body.append(node);let root=createRoot(node);
    const dispatch=action=>{run=reduceDungeon(run,action);render();};
    const render=()=>root.render(React.createElement('main',{className:'game-shell dungeon-shell dungeon-shell--exploration'},
      React.createElement('header',{className:'topbar'},'SECOND CHANCE DEBUG'),React.createElement(DungeonProgressHeader,{run}),
      React.createElement('div',{className:'dungeon-room-content'},run.currentRoom==='shop'
        ?React.createElement(ShopRoom,{run,onPurchase:(productId,targetId)=>dispatch({type:'purchase',productId,targetId}),onReroll:revision=>dispatch({type:'reroll-shop',revision}),onLeave:()=>dispatch({type:'leave-shop'})})
        :React.createElement(BuffReward,{run,onChoose:buffId=>dispatch({type:'choose-buff',buffId}),onReroll:revision=>dispatch({type:'reroll-buff-reward',revision})})),
      React.createElement(ExplorationPartyPanel,{combat:run.combat})));
    window.secondFixture={state:()=>run,shop:()=>{run=reduceDungeon({...run,runStatus:'choosing',gold:0,roomOptions:[{id:'test',type:'shop'}]},{type:'choose',optionId:'test',now:1});render();},
      remount:()=>{run=JSON.parse(JSON.stringify(run));root.unmount();root=createRoot(node);render();},
      fund:()=>{run={...run,gold:80};render();}};
    render();
  },base);
  let button=page.getByRole('button',{name:/REROLL/});await button.waitFor();
  const initial=await page.evaluate(()=>window.secondFixture.state());
  for(const remaining of [2,1,0]) {
    await button.click();await page.waitForTimeout(370);
    assert((await button.textContent()).includes(`FREE ${remaining} / 3`));
    assert.equal((await page.evaluate(()=>window.secondFixture.state())).activeBuffs[0].stacks,3);
  }
  assert(await button.isDisabled());
  const reward=await page.evaluate(()=>window.secondFixture.state());
  assert.equal(reward.gold,initial.gold);assert.equal(reward.buffRewardReroll.freeRerollsUsed,3);
  await page.evaluate(()=>window.secondFixture.remount());
  assert((await button.textContent()).includes('FREE 0 / 3'));assert(await button.isDisabled());
  await page.screenshot({path:'/tmp/second-chance-reward.png'});
  await page.evaluate(()=>window.secondFixture.shop());
  assert.equal(await page.locator('.shop-product').count(),8);
  assert((await button.textContent()).includes('FREE 3 / 3'));
  for(const remaining of [2,1,0]) {
    await button.click();await page.waitForTimeout(370);
    const state=await page.evaluate(()=>window.secondFixture.state());
    assert.equal(state.gold,0);assert.equal(state.shop.freeRerollsUsed,3-remaining);
    assert.equal(state.shop.items.length,8);
    if(remaining) assert((await button.textContent()).includes(`FREE ${remaining} / 3`));
  }
  assert((await button.textContent()).includes('40 Gold'));assert(await button.isDisabled());
  await page.evaluate(()=>window.secondFixture.remount());assert(await button.isDisabled());
  await page.evaluate(()=>window.secondFixture.fund());
  assert(!(await button.isDisabled()));await button.click();await page.waitForTimeout(370);
  const paid=await page.evaluate(()=>window.secondFixture.state());
  assert.equal(paid.gold,40);assert.equal(paid.shop.freeRerollsUsed,3);assert.equal(paid.shop.rerollCount,4);
  assert.equal(paid.buffRewardReroll.freeRerollsUsed,3);
  await page.screenshot({path:'/tmp/second-chance-shop.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({rewardFreeUses:3,shopFreeUses:3,zeroGoldFree:true,paidCost:40,remountPreservesUsage:true,stock:8,errors}));
} finally {await browser.close();}
