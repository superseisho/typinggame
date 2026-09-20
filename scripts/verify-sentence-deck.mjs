// Real keyboard input and Dungeon transitions; only the initial Run seed is controlled.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:4174');
  // Find a deterministic run with Battle choices on both first floors, using the real generator.
  const plan = await page.evaluate(async () => {
    const { createDungeonRun, reduceDungeon } = await import('/src/game/dungeon/dungeonEngine.ts');
    const { getTypingDisplay } = await import('/src/game/typing/typingEngine.ts');
    const { TYPING_SENTENCES_BY_ID } = await import('/src/data/typingSentences.ts');
    for (let seed = 1; seed < 1000; seed++) {
      let run = createDungeonRun(seed, 'browser-plan');
      const option = run.roomOptions.find(o => o.type === 'battle');
      if (!option) continue;
      const order = run.combat.sentenceDeck.remainingSentenceIds.map(id => TYPING_SENTENCES_BY_ID[id].text);
      run = reduceDungeon(run, { type: 'choose', optionId: option.id, now: 1 });
      for (let i = 0; i < 1000 && run.runStatus === 'battle'; i++) {
        run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: i + 2 });
      }
      if (run.runStatus !== 'buff_reward') continue;
      const buffId = run.buffOptions[0];
      run = reduceDungeon(run, { type: 'choose-buff', buffId });
      run = reduceDungeon(run, { type: 'finish-buff' });
      if (run.runStatus === 'choosing' && run.roomOptions.some(o => o.type === 'battle')) return { seed, order };
    }
    throw Error('No suitable two-battle seed');
  });
  await page.evaluate(seed => Math.random = () => seed / 4294967296, plan.seed);
  await page.getByRole('button', { name: 'GAME START', exact: true }).click();
  const seen = [];
  const starts = [];
  for (let battle = 0; battle < 2; battle++) {
    await page.locator('[data-room-type="battle"]').first().click();
    await page.locator('.typing-line mark').waitFor();
    starts.push(await page.locator('.japanese-sentence').textContent());
    let previous = '';
    for (let input = 0; input < 1500; input++) {
      if (!(await page.locator('.dungeon-shell--combat').count())) break;
      const text = await page.locator('.japanese-sentence').textContent();
      if (text !== previous) {
        assert(!seen.includes(text), `Repeated sentence: ${text}`);
        assert.equal(text, plan.order[seen.length], 'Displayed sequence must match the Run deck');
        seen.push(text);
        previous = text;
      }
      const key = (await page.locator('.typing-line mark').textContent()).trim();
      assert(key, 'Active combat must have an input prompt');
      await page.keyboard.press(key);
      await page.waitForTimeout(18); // Let React commit before reading the next guide character.
    }
    await page.getByText('CHOOSE A BLESSING', { exact: true }).waitFor();
    if (battle === 0) {
      await page.locator('.buff-card').first().click();
      await page.getByText('Choose Your Path', { exact: true }).waitFor();
    }
  }
  assert.notEqual(starts[0], '勇者は剣を構えた');
  assert.notEqual(starts[0], starts[1]);
  assert(seen.length > 2, 'Must complete sentences as well as cross battles');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ seed: plan.seed, battles: 2, sentenceCount: seen.length, starts, seen, errors }, null, 2));
} finally {
  await browser.close();
}
