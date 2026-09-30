# Echoes of the Deep

ローグライク×タイピングRPGの1～10F探索MVPです。日本語文章の読みをローマ字入力すると4人の攻撃ゲージが同時に進み、各キャラクターが固有の閾値とターゲットルールで自動攻撃します。その間も複数の敵が独立したクールダウンとSpecial Gaugeで行動します。

## ダンジョンの遊び方

GAME START → 3択の部屋選択 → 部屋攻略 → 次の階へ進み、10Fのボスを倒すとDUNGEON CLEAR。全滅するとGAME OVERです。通常戦闘勝利後はGoldを受け取り、Buffを1つ選ぶと500msの取得演出を経て次の階へ進みます。ShopはLEAVE SHOPで進行。Rest・TreasureのGold/回復・罠戦闘勝利では「次の階へ」で結果を確認して進みます。今回はNormal固定・Tier 1のみ。HPとDown状態、Goldと取得Buffをラン中に保持し、戦闘用ゲージ・Ability・コンボ・条件付きの一時強化は部屋を移るとリセットします。

- Battle: 通常敵のランダム編成、45～65 Gold。
- Elite Battle: エリート入り強編成、100～130 Gold。
- Rest: 生存者全員30%回復 / 生存者1人60%回復 / Down1人を30%で蘇生、いずれか1回。Reviveは対象不在でもdisabled表示。
- Shop: 入室時に回復2商品＋Buff2商品を抽選。単体30%/60%、全体20%の回復とBuff販売。Rerollは40 Gold。購入せず退出も可能。
- Treasure: OPEN TREASUREで一度だけ開封。無料Buff30%、大量Gold25%、全体回復20%、Rare以上Buff15%、罠戦闘10%。蘇生はありません。
- Event: 5種類の出来事から抽選。直前と同じEventは除外。Gold・HP・Buff・何もせず退出から行動を選び、結果画面のCONTINUEで進行します。
- Altar: 生存者の最大HP20%を犠牲（最低HP1）にするか、150 Goldを支払い、Rare以上のBuffを1つ選択。無料でLeaveも可能。取得後はCONTINUEまで階層を維持します。
- Ambush: 通常階で8%。1Fは選択を保証する安全階。ボス階とその直前階では奇襲抽選を行いません。
- 9F: 「BOSS AHEAD / Prepare for the Boss」を表示し、Rest / Shopの固定2択。Restは行動・結果確認後、ShopはLEAVE SHOPで10Fへ進みます。`floorRules.ts`の次階Boss判定を共通利用するため、bossFloorsを拡張すれば19F / 29Fにも適用されます。
- 10F: 900msのボス予告後に自動開戦。550HPの固定ボスを撃破すると探索完了。

全快の味方やDownにポーションは使用できません。選択・購入・階層移動はエンジン側でも段階とIDを検証し、二重実行を防止します。

### Event / Altarの設定と拡張

`src/game/dungeon/encounterConfig.ts` に通常Roomの重み（Battle 35 / Elite 12 / Rest 12 / Shop 10 / Treasure 10 / Event 15 / Altar 6、合計100）と代償・回復量・報酬確率を集約しています。通常3択の重複上限・Ambush・9F固定2択・10F Bossは維持します。

`src/data/rooms/encounterDefinitions.ts` の5 Event:

- Mysterious Traveler: 100 GoldでBuff選択、またはRefuse。
- Abandoned Camp: 生存者20%回復、60～120 Gold、またはLeave。
- Bloodstained Chest: Openで70%は100～180 Gold、30%は生存者に最大HP10%ダメージ。Leaveも可能。ダメージは戦闘不能・全滅の可能性あり。
- Healing Fountain: 生存者25%回復、50～100 Gold、またはLeave。
- Ancient Inscription: 無料Buff選択、またはIgnore It。

通常Event BuffはCommon / Uncommon / Rare / Epic / Legendaryが49 / 32 / 15 / 3 / 1。AltarはBlood OfferingでRare / Epic / Legendaryが75 / 20 / 5、Gold Offeringで85 / 10 / 5。取得可能なレアリティの中で再配分し、既存Buff候補生成・Stack上限・Unique除外を共用します。候補不足は少数候補、0個は既存の60 Gold代替報酬です。犠牲確定後は選び直せません。

`types/encounters.ts` のRequirementとEffectでGold、HP条件、単体/全体回復・ダメージ、重み付き結果、Buff、無効果を表現し、`encounterEngine.ts` が処理します。Reactは条件と結果を表示するだけです。入室時のIDと選択済みID・costPaid・resolvedをRunへ保存し、Buff取得後も共通の部屋完了・CONTINUEを経て1階だけ進みます。蘇生や恒久デメリットは追加していません。

回帰テストは `src/game/dungeon/encounters.test.ts`。任意のPlaywright環境で `scripts/verify-event-altar.mjs` を実行すると、開始seedを変えた実UI操作で全Event、両Offering、支払い、Blood後のCamp回復、3つのPC画面サイズを検証できます（`APP_URL` / `PLAYWRIGHT_MODULE` は既存ブラウザ検証と同様）。

成績は全戦闘の合計（WPMは戦闘時間のみ）です。終了時に既存SaveRepositoryからlocalStorageへ最高到達階・クリア回数・履歴・タイピング成績を保存します。10F版の履歴にはmaxFloorを併記します。探索途中のセーブはありません。音量設定や既存装備データは保持します。

### 戦闘画面の高さ

探索画面は親の `DungeonScreen` が共通の `ExplorationPartyPanel` を管理します。Room Selection / Rest / Shop / Treasure / Event / Altarと探索報酬画面に同じ4人・128px高の立ち絵・現在HPを下部表示し、Room内容だけを切り替えます。通常PC（幅1100px以上・高さ720px以上）では100dvh内でHeader・Room Content・Partyの高さを配分し、Room Contentのoverflowはclip（スクロールコンテナにしない）とします。カード・Headerの余白を詰め、操作が見切れないことを計測して検証します。Shopの回復対象選択は商品一覧の領域を置き換え、購入通知は操作欄へ表示します。

中央の部屋パネルも残り高さへ伸ばし、タイトルと操作を縦方向中央にまとめます。Room Selectionは通常3択・Boss前2択とも共通のRoomCardを使い、内容量に応じた高さ・機能タグ・ENTER CTAで情報をまとめます。カードや説明文は余剰高さへ引き伸ばしません。Partyの位置・立ち絵サイズは維持し、部屋パネルとの間隔を一定にします。

小さなウィンドウ・拡大表示では操作を失わないため内容領域のスクロールを残します。BUFFS一覧は明示的に開いたオーバーレイ内だけスクロール可能です。通常探索画面のホイール移動・見切れ・Party位置・部屋パネルとの間隔の回帰確認は `scripts/verify-exploration-layout.mjs`（Playwright）で実行できます。

画像は既存Resolverのexplorationモードと共通画像マッピングで決定します。Buff込み最大HPに対する最新HPからnormal / low_hp / downを即時反映し、戦闘用の被弾・Ability transientや残存Guard/Combo状態は表示しません。戦闘中・戦闘予告中は探索Panelを出さず、既存BattleStageのPartyのみを使用します。探索用の表示条件は `game/dungeon/explorationDisplay.ts` に集約しています。

`DungeonProgressHeader` は探索・休憩・買い物・報酬・戦闘予告・リザルトで表示し、`runStatus === 'battle'` では描画しません。通常・Elite・奇襲・Bossに共通です。敵欄の階層補助テキストも戦闘中は部屋名だけになります。戦闘開始時には先頭へスクロール位置を戻します。

戦闘中のヘッダーをコンパクトにし、PCの低いviewportでは余白を整理します。高さ800px以下ではBattle Recordを上部AUDIO横の開閉式オーバーレイへ移し、ログを展開してもゲージを押し下げません。立ち絵の高さ・タイピング文字サイズ・ゲージの太さは維持しています。小さな画面やブラウザ拡大時は無理にクリップせずスクロールを許可します。

## 起動

Node.js 22以上を用意し、プロジェクト直下で実行します。

```bash
npm install
npm run dev
```

ターミナルに表示されたURL（通常は `http://localhost:5173`）をブラウザで開いてください。

## 検証

```bash
npm run test
npm run build
```

## 設計

- `src/types`: ゲーム全体のTypeScript型
- `src/data`: キャラクター、敵、文章、調整値の定義
- `src/game/typing`: 候補集合による日本語ローマ字入力エンジン
- `src/game/combat`: 複数敵、ターゲット、Special Abilityを扱う戦闘エンジン
- `src/game/dungeon`: 型付きコマンドによる探索遷移、シード付き部屋抽選、回復・購入処理
- `src/data/rooms`: 固定表示名・説明・危険度・抽選比率
- `src/game/save`: UIや戦闘ルールから分離したSaveRepository
- `src/audio`: CombatEventを音へ変換するAudioManager、音声設定、React購読Hook
- `src/hooks`: ゲームエンジンとブラウザの時間・入力の接続
- `src/components`, `src/screens`: 表示と画面構成

現在の戦闘では墓所のスライムと回復役の墓守の呪術師が登場します。僧侶のHeal、敵Special警告、攻撃・被弾・回復・戦闘不能などはCombatEventを介してAudio Feedbackへ接続されます。音量とミュートは画面右上のAUDIOから変更でき、localStorageへ保存されます。

初期効果音はWeb Audioによる合成プレースホルダーです。正式素材への差し替え方法は `public/audio/README.md` を参照してください。

## ダンジョンの拡張・調整

### タイピング文章とShuffle Bag

`src/data/typingSentences.ts` の既存12件と `src/data/typingSentences/additional.ts` の188件を合わせ、全200件を `TYPING_SENTENCES` として公開します。難易度1/2/3は60/80/60件で、出題確率は全件同等です。

`src/game/typing/sentenceDeck.ts` は既存 `randomStep` を使うFisher–Yates Shuffle Bagです。Run seedから独立した文章用seedを作り、`CombatState.sentenceDeck` の残りID・直前ID・RNG状態を `freshCombat()` で次Battleへ引き継ぎます。Battle開始と文章完成後の表示時に消費するため、未完成のまま勝利した文章も再出題しません。探索・戦闘予告中や、文章完成と同時に勝利した際の未表示文章は消費しません。

200件を使い切ると再Shuffleし、直前の文章と新Cycleの先頭が一致する場合は入れ替えます。NEW EXPEDITIONではDeckを新規作成し、永続Saveには保存しません。文章選択はReact描画や敵・Room抽選のRNGから独立しています。ローマ字入力ルールとTyping UIは変更していません。

`sentenceDeck.test.ts` / `sentenceRun.test.ts` はデータ件数・一意性・再現性・Cycle境界・Battle間引き継ぎを検証し、既存 `typingEngine.test.ts` は全200件をCompileして完走します。`scripts/verify-sentence-deck.mjs` は実ブラウザで2戦をプレイし、実際に表示された文章順とDeckを比較します。

`src/game/dungeon/dungeonConfig.ts` に階層上限・ボス階・安全階・奇襲率・Rest回復量・戦闘Gold報酬を集約しています。敵抽選は `enemyEncounterConfig.ts`、Shopは `shopConfig.ts`、Treasureは `treasureConfig.ts` に分離しています。部屋の出現比率は `src/data/rooms/roomDefinitions.ts`。敵の基礎数値は `src/data/enemies.ts` です。

1～10F内の階層倍率はありません。通常・Elite・Bossの固定データだけが異なります。30F化はmaxFloorとbossFloorsを変更可能ですが、現段階では全てTier 1の編成を使います。11F・21Fの強化は今後Tier別の敵編成テーブルを追加して切り替える想定です。装備ドロップ・11F以降の専用コンテンツ・難易度選択は未実装です。

`src/screens/CombatScreen.tsx` と `useCombat` は単体戦闘用として残し、共通の `BattleStage` を利用しています。現在のアプリの入口は `DungeonScreen` です。戦闘ルール・TypingEngineを探索UIへ移植していません。

敵カード全体のクリック、または戦闘中の左右方向キーで共有TARGETを切り替えられます。`CombatState.targetEnemyId` は敵のinstanceIdを保持し、`combat/enemyTarget.ts` が選択・生存確認・先頭の生存敵へのフォールバックを担当します。左右キーは表示配列順に生存敵だけを循環し、同じ `selectEnemyTarget()` を利用します。全員の通常Attackはこの対象へ、Mage全体Abilityは全生存敵へ作用します。対象撃破時は同じ入力処理内で再選択し、戦闘終了時はnull、新戦闘開始時は先頭の生存敵になります。クリックはフォーカスを奪わず、TARGET枠・マーカーは立ち絵モーションから分離しています。`scripts/verify-enemy-target.mjs` で実UIのクリック／左右キー→タイピング→ダメージ→自動再選択を3サイズで検証できます。

左右キーは既存の `useDungeon` / `useCombat` の入力listener内で `combatKeyboard.ts` がTypingEngineより先に消費します。長押しrepeatは移動せず消費し、1押下1移動です。探索・戦闘終了後・フォーム操作・IME変換・修飾キー併用・オーディオ設定表示中は捕捉しません。オーディオ設定などキーボードを占有するUIには `data-combat-input-blocker` を付けます。数字・上下・Tab・WASD等のTarget割り当てはありません。

## Run限定Buffと戦闘後の3択

Battle / Elite / Ambush勝利後は `buff_reward` に移行し、選ぶまで階層を進めません。1つ取得すると `buff_acquired` を500ms表示し、自動で次の階へ進みます。二重クリック・古い階層のイベント・無効なBuff IDをエンジンで拒否します。最終Bossは直接Clearとなります。将来の途中BossにはElite抽選を利用します。

| レアリティ | Battle / Ambush | Elite / 途中Boss |
| --- | ---: | ---: |
| Common | 54% | 18% |
| Uncommon | 30% | 40% |
| Rare | 13% | 30% |
| Epic | 2% | 10% |
| Legendary | 1% | 2% |

各カードで取得可能なレアリティを重み付き抽選し、そのプールから1種類を選びます。選択済み候補・取得済みUnique・最大Stackは除外。空になったレアリティの重みは残りへ再配分するため、2・3枚目や取得状況に応じて実際の確率は変わります。候補が2個以下なら残りのみ表示し、0個なら追加60 Goldと通常の「次の階へ」を表示します。

### Run Buff（34種類）

| 対象 | 名前 | 効果（1 Stack） |
| --- | --- | --- |
| 全員 | Power Rune | Attack +5% |
| 全員 | Vitality Rune | Max HP +5%、生存者の現在HPに最大HP増加分を加算 |
| 全員 | Swift Fingers | Attack必要文字数 −5% |
| 全員 | Calm Mind | ミス時の敵Special Gauge増加 −20% |
| 戦士 | Reinforced Shield | Guard成功時Max HPの5%回復 |
| 戦士 | Guardian Oath | Guard成功後、次の通常Attack +30%・1回消費 |
| 戦士 | Fortress | Guard成功後、次のミス時の敵全体Gauge増加を15軽減・1回消費 |
| 魔法使い | Arcane Power | 通常Attack +15% |
| 魔法使い | Wide Magic | 全体攻撃Ability威力 +25% |
| 魔法使い | Mana Surge | Ability必要正解文字数 −20% |
| 僧侶 | Healing Prayer | Heal基本回復量 +20% |
| 僧侶 | Sacred Healing | Healに対象Max HPの5%を追加 |
| 僧侶 | Guardian Blessing | 実際にHealされた味方の次の被ダメージ −25%・通常攻撃/SPECIAL共通 |
| 武闘家 | Focus | Attack +15% |
| 武闘家 | Endless Combo | Comboの上乗せ分を25%強化（×1.25なら×1.3125） |
| 武闘家 | Perfect Form | Combo中のAttack倍率をさらに20%強化、ミスで解除 |
| タイピング | Precision | ミス時の敵Special Gauge増加 −10% |
| タイピング | Flow | 50連続正解ごとに生存者のAttack Gauge +5文字 |
| タイピング | Perfect Rhythm | 50連続正解ごとに敵全体へ威力15の追加攻撃、防御適用 |
| 全員・Common | Defense Rune | Defense +5% |
| 全員・Uncommon | Greater Power / Vitality / Defense Rune（3種） | 各Attack / Max HP / Defense +10% |
| 全員・Rare | Superior Power / Vitality / Defense Rune（3種） | 各Attack / Max HP / Defense +15% |
| 全員・Rare | Lightning Fingers | Attack必要文字数 −10% |
| タイピング・Epic | Vital Rhythm | 100連続正解ごとに生存Partyを各Max HPの5%回復 |
| タイピング・Epic | Seal Rhythm | 100連続正解ごとに生存EnemyのGaugeを各最大値の10%減少 |
| 全員・Epic | Ascendant Rune | Attack / Max HP / Defense +20% |
| タイピング・Legendary | Unbroken Focus | Stackごとに1 Charge、ミスの戦闘ペナルティを防ぐ。消費から30秒で個別回復 |
| 全員・Legendary | Reaper's Blessing | 直接攻撃が対象ごとに5%で即死。Boss本体・Buff追加攻撃は除外 |
| 全員・Legendary | Echoing Assault | 通常Attackごとに30%で全体攻撃。Abilityは除外 |
| 全員・Legendary | Overdrive | 正解入力の基本Attack / Ability ChargeとGUARDの文完成進行が2倍。最大1 Stack |

Guardian Oath / Fortress / Guardian Blessing / Ascendant Rune / Reaper's Blessing / Echoing Assault / OverdriveはUnique（1個）。他は最大3 Stack。同じ補正は基礎値に対して加算します（Power Rune ×2は+10%）。AttackとAbility必要文字数は端数切り上げ・最低5文字、ミスGauge倍率は最低10%。DefenseもEffective Characterで基礎値へ倍率を適用して四捨五入し、既存の敵通常Attack / Heavy Attackから引きます。敵Specialの固定ダメージは従来どおりです。Max HP増加でDownを蘇生しません。

Unbroken FocusはTyping Missを記録し、入力位置を維持したまま通常Missペナルティの前で早期終了します。Combo / Fighter状態 / 敵Gauge / Curse / Gauge Shieldは保持。Charge残時間は `buffResources.focusRechargeMs` で個別管理し、Combat Tickのみで減算、Battle開始時にFull Chargeです。Timeoutとは別処理です。UIはFOCUS残Charge数とPROTECTEDを既存行に表示します。

直接攻撃は `resolveEnemyDamage()` の明示的なフラグでBuff追加Damageと区別します。Echoは通常Attackごとに1回、Reaperは生存・非Bossの実被弾対象ごとに判定。Coverがあれば即死判定も実際にかばったEnemyへ移り、Boss本体は判定自体を行いません。専用 `buffRngState` はEncounter seedから初期化し、敵AI / 出題 / Room RNGを進めません。Seal RhythmはGaugeのみ減少し、すでに予告済みのSpecialをキャンセルしません。

探索中の `BUFFS` を開くと取得一覧・Stack合計効果を確認できます。戦闘中には描画しないため、Partyのゲージ領域を圧迫しません。条件付き効果は既存のCombatEventによるログ・対象の短いBuff表示・SE、回復は実回復量の緑発光に接続します。

### ファイルと拡張方法

- `src/types/buffs.ts`: ID、表示名、説明、レアリティ、複数カテゴリ、複数Effect、Stack制約、任意Sound ID。Runには `{ buffId, stacks }` のみ保持。
- `src/data/buffs/buffDefinitions.ts`: 効果・条件・対象・数値のデータ。既存Effect型のBuffなら定義追加のみ。
- `src/game/buffs/buffConfig.ts`: 抽選比率、3候補、500ms演出、最低値、候補枯渇時のGold。
- `runBuffManager.ts`: 共通の追加・削除・取得可否判定、HPを保った戦闘への適用。Battle / Shop / Treasureで共用。
- `buffModifiers.ts`: 基礎Characterを変更せず最終Attack / Max HP / Defense / Threshold / Ability / Comboを計算。戦闘、Party UI、回復対象選択、Rest、Shopで共用。
- `buffEffectHandlers.ts`: Guard成功 / 実Heal / 正解Streakの同期ハンドラ。過去ログやReact再描画から再発動しない。新しい条件付き効果は型と専用ハンドラを追加。
- `buffRewards.ts`, `buffDescriptions.ts`: シード付き重複なし抽選、Stack効果の表示。
- `BuffReward.tsx`, `CurrentBuffs.tsx`, `styles/buffs.css`: 3択・取得演出・探索中の折りたたみ一覧。

取得Buffは探索終了時・新Run時に破棄し、localStorageには保存しません。Guard後の反撃・障壁・Gauge軽減などの消費待ち効果は戦闘内の `buffResources` に分離し、次戦闘へ持ち越しません。TypingEngineや立ち絵の状態切り替えルールには変更を加えていません。

`src/game/buffs/buffs.test.ts` では追加・Stack上限・Unique・抽選比率・枯渇・二重選択・最終Boss・Run終了・実ダメージ/回復/必要文字数・Guard/Combo/連続正解・SPECIAL軽減を検証します。既存の10F通しテストもBuff選択を含む経路へ更新しています。

任意のPlaywright環境向けに `scripts/verify-buff-run.mjs` も用意しています。開発サーバー起動後、`APP_URL` と必要なら `PLAYWRIGHT_MODULE`（Playwrightのindex.mjsへの絶対パス）を指定して実行できます。過去の通し検証用スクリプトなので、調整値の変更時は期待値も確認してください。

Global / Legendary拡張は `globalLegendary.test.ts` で倍率・HP増加・100 Streak・Protected Miss・独立Recharge・即死免疫・AoE・報酬・Shopを検証します。`scripts/verify-legendary-buffs.mjs` は通常Dungeonの固定Seedから実入力でLegendary報酬を取得し、次BattleでProtected MissとCharge切れの通常Missを確認します。Shopは資金付きデバッグ条件で実コンポーネントと購入/Reroll処理を使用。1920×1080 / 1536×864 / 1366×768で報酬・Typing UIを確認し、全605テストとビルドが成功しています。

## Shop / Treasure

### Shop：Goldで必要なものを選ぶ

`shopConfig.ts` の設定から入室時に4商品（回復2＋Buff2）を抽選し、`run.shop` に固定します。回復プールはSmall Potion（60 Gold / 生存者1人30%）、Large Potion（100 Gold / 生存者1人60%）、Party Potion（120 Gold / 生存者全員20%）。単体商品は購入前に対象を選択し、Down・全快を対象から除外。全体回復もDownを蘇生しません。

Buff価格はCommon 100 / Uncommon 140 / Rare 200 / Epic 280 / Legendary 400 Gold。抽選比率は44 / 35 / 17 / 3 / 1でRerollも共通です。共通Buff生成器で同一商品内の重複・取得済みUnique・最大Stackを除外します。取得可能なBuffが不足したときは未陳列の回復商品で補完し、それも不足した場合は4個未満になります。

購入はGoldの支払い・効果適用・SOLD OUT化を1つの純粋な状態更新で処理します。売り切れは暗転、Gold不足は赤系価格と `Not enough Gold` 表示。購入してもShopには残り、複数商品を購入できます。Rerollは固定40 Goldで売り切れも含め全商品を再抽選。新しい陳列では再度同じ商品が出る可能性があります。Reroll時は商品IDの世代を更新し、旧商品の遅延クリックを拒否。350msのUI入力抑制も加えています。`LEAVE SHOP` は購入不要で直接次Floorへ進みます。

### Treasure：無料の報酬、ただし罠の危険

入室時には報酬を与えず、`OPEN TREASURE` で次の結果を1回だけ抽選します。

| 結果 | 確率 | 処理 |
| --- | ---: | --- |
| 無料Buff | 30% | 共通3択。Common / Uncommon / Rare / Epic / Legendary = 44 / 35 / 17 / 3 / 1 |
| 大量Gold | 25% | 150～250 Goldを加算し、確認後に次Floor |
| Party Heal | 20% | 生存者の最大HP30%回復。実回復イベント・緑発光を再利用 |
| Rare以上Buff | 15% | Rare / Epic / Legendary = 82 / 15 / 3の3択。低レアは混ざらない |
| Trap Battle | 10% | 750msのTRAP警告後、通常相当の敵と既存Combatで戦闘 |

設定・結果確率・Buff比率・Gold範囲・回復量・罠報酬は `treasureConfig.ts` に集約しています。罠の敵抽選は `enemyEncounterConfig.ts` で通常戦と共通管理します。Buff候補不足時は残りのみ表示、0候補なら60 Goldへ置換し、確認後に進みます（Rare宝箱でも低レアへは置き換えません）。

罠は `currentRoom: 'treasure'` のまま `combatSource: 'treasure_trap'` として識別。HP / Down / Run Buffを引き継ぎ、勝利報酬は10～25 Goldのみ。元の宝箱報酬も戦闘後Buffも付与せず、Treasureとして履歴に1回記録します。敗北は通常と同じGame Over。戦闘中の階層ヘッダーは罠でも非表示です。

### 状態と検証

- `src/types/rooms.ts`: `ShopItem`（回復 / Buffの判別共用体）、`ShopState`（在庫・Reroll世代）、`TreasureState`（開封・結果・解決済み）。
- `shopEngine.ts`: 商品生成・取得可否・購入。UI再描画では生成しません。
- `treasureEngine.ts`: シード付き結果抽選。DungeonEngineが結果を状態に保存してから処理します。
- `ShopRoom.tsx` / `TreasureRoom.tsx`: 商品・対象選択・宝箱表示。Buff画面は既存 `BuffReward` を再利用。
- `shopTreasure.test.ts`: 商品生成、重複排除、価格、購入、対象、Gold不足、売り切れ、Reroll世代、宝箱確率、二重開封、Rare制約、回復、罠の勝敗と報酬抑制。
- `scripts/verify-shop-treasure.mjs`: 決定的な開始seedで宝箱5結果、戦闘→宝箱Gold→Shopで複数購入・Reroll・退出、罠全滅を実ブラウザ検証。確率設定自体は変更しません。Playwright環境・起動方法は上のブラウザ検証と共通です。

部屋状態・在庫ID・Reroll世代・開封フラグ・Run/Floorトークンを確認し、古い入力や二重操作を拒否します。階層進行はDungeonEngineの共通処理だけで行います。蘇生はRest専用のままです。今後は価格バランス、商品のロック・割引、Treasure専用の敵などを追加できます。

Shop / Treasure拡張後の確認：自動テスト172件、TypeScript/Viteビルド成功。Chromiumで宝箱5結果、Buff＋Small Potionの購入、Reroll、罠勝利・全滅を確認しました。開始seedを変えた複数の探索で検証し、10Fクリアの既存回帰シナリオも成功。1920×1080 / 1536×864 / 1366×768で戦闘ゲージの見切れ、ブラウザエラー、画像読込エラーはありません。部屋の価値・価格・Trap率の体感バランスは継続調整が必要です。

## Enemy Skill / Guardian / Shaman

- `src/data/enemies.ts` の `ENEMY_DEFINITIONS` が全15体の唯一の性能データ。通常・Elite・Bossをそれぞれ完全な独立オブジェクトとして記述し、他EnemyのSpreadや倍率による自動生成はしない。`ENEMIES_BY_ID` はこの配列だけを索引化する。出現分類・weightは既存の `enemyEncounterConfig.ts` のID参照で管理する。`enemies.test.ts` は既存9体の実効値のスナップショット、全ID重複・参照・データ独立性を検証する。バランスを意図的に変更した際はスナップショット差分を確認して更新する。
- `src/data/enemySkills.ts`: Skill ID・効果・使用条件・対象と調整値。`EnemyDefinition.skills` はSkill ID・抽選weight・Enemy固有の `actionTimeMs` を保持する。Skill再使用Cooldownは存在しない。既存SPECIALゲージは別経路で維持。
- `enemySkillEngine.ts`: 戦闘開始時と各通常行動の解決後、使用条件を満たすSkillをシード付き加重抽選。個体の `nextActionSkillId` と `actionDurationMs` / `actionRemainingMs` を同時に設定する。時間はBindingの `actionTimeMs × actionTimeMultiplier`。速度Modifierは次Cycleの計画時に適用する。満了時は保存済みSkillを実行し、使用不能ならAttack優先の決定的Fallbackを待ち時間なしで実行する。描画・Typing・Target変更では再抽選しない。
- Guardian（`enemy_guardian`）: Attack70 / Cover30、準備時間はAttack5秒・Cover8秒。Coverには生存仲間が必要。`cover.remainingHits` は3へrefreshし、加算しない。条件を満たせば連続Coverも可能。
- Shaman（`enemy_shaman`）: Attack65 / Heal35、準備時間はAttack6.5秒・Heal10秒。生存・負傷Enemyの最低HP割合へ最大HP25%回復（自身可、同率は表示順）。全快時は使わず、蘇生しない。負傷Enemyが残れば連続Healも可能。
- `enemyDamage.ts`: 味方通常Attack・Mage AoE・Streak追加Damageの共通経路。攻撃開始時に全HitのoriginalTarget→receiverをsnapshot。最初の生存Cover中Guardianが肩代わりし、他Guardianへの連鎖はしない。直接Guardianを殴るHitはCoverを消費しない。
- AoEはCover残り1でも全Hitを固定したGuardianへ送る。途中でHP0になっても残りHitを元の敵へ戻さず、0実ダメージとして記録。各Hit後ではなく攻撃全体の終了後に回数をclampし、死亡通知・Cover/予定Action/状態cleanup・Auto Retargetを実行。選択中の生存Enemy IDは維持。
- Enemy個体IDは定義ID＋編成slotの一意ID。複数同種でもHP、予定Action・準備時間・残り時間、Coverを別管理し、次戦闘へ持ち越さない。UIのACTIONゲージは現在の `actionDurationMs` を分母とし、NEXTと同じ予定Skillの進行を表示する。
- `EnemyPanel.tsx` のNEXTは、予定IDからSkillDefinitionのnameを表示（Attack / Cover / Heal）。全Skill一覧は表示せず、死亡時は「—」。SPECIALは独立系統のまま、NEXTを上書きしない。`EnemySkillFeedback.tsx` は実行時に短いSkill名を表示。Heal実対象には緑発光と回復数値、Cover中はShield ×N。AoE数値はHit別に表示。TargetマーカーとPortraitのtransformから分離し、敵3体はPCで横一列。

### Random Encounter

Tier 1通常Pool（Battle / Ambush / Treasure Trap）にはExecutioner・Cultist・Wraithを各weight15で登録。Elite Poolには独立DefinitionのElite Executioner・Elite Cultist・Elite Wraithを各weight25で登録。1～3体の独立抽選・同種重複・既存weight・固定Bossを維持する。

- Executioner: Attack5.5秒／Heavy Attack11.5秒。Heavyは既存通常攻撃経路で基礎Attack×攻撃Modifier×1.8×Empowerを丸めてDefense計算へ渡す。Guard・Shield・Target Cursor・Damage Eventも共通。Specialは最低HP割合の味方へ44ダメージ。
- Cultist: Attack6秒／Empower8.5秒。自分以外の生存・未強化Enemyから実効Attack最大（同率は表示順）へ、次の通常攻撃系Skill×1.30を付与。個体の `nextAttackEmpowerMultiplier` に保存し、通常攻撃系Skillでのみ消費。Dark Ritualは生存Enemy全員へ×1.35。付与は常に `max(現在値, 新値)` とし、乗算Stackしない。
- Wraith: Attack4.5秒／Curse8秒。`ENEMY_SKILL_CONFIG.wraith` に `curseDurationMs: 10000` / `curseMissGaugeBonus: 10` を集約。Combat共通の `typingCurseRemainingMs` / `typingCurseBonus` で管理し、Combat Tickで時間を減らす。持続中の全Missで `(基礎Miss増加 + Curse) × 既存軽減 − Gauge Shield`（下限0）を全生存Enemyへ適用。Miss・Correct・術者死亡では解除しない。時間切れでBonusも0に戻し、通常Curseが再び候補になる。再付与は非Stackで10秒へRefresh。Soul Erosionは生存Party全体16ダメージ＋同じ共通処理でCurse付与／Refresh。UIもCombat Stateの残り秒数を表示する。
- 新EliteのHP / Attack / DefenseはExecutioner 203/30/5、Cultist 173/16/5、Wraith 143/21/4。Skill・Action Time・Specialは通常版と同じ（Curseも共通Config）。個体Rewardは通常版の1.5倍を明示。Dungeonで実際に得るGoldは既存のElite Room設定100～130、Buffも既存のElite抽選を使用する。
- `enemyCombatEffects.ts` が通常Skill／Special共通のEmpower・Curse付与処理。Enemy ID分岐は使わない。Battle開始時に両状態を初期化。Special発動後のゲージ0リセットは維持。
- UI: CSS立ち絵3種類、EnemyのEMPOWER状態チップ、Typing見出し行のCURSED警告。NEXTはSkill Definition名をそのまま表示。
- `tacticalEnemies.test.ts` とEncounter回帰テストで発動時間・倍率・Guard・Shield・非Stack・Miss軽減・Curse持続/更新/解除・Special・単体/混成/重複抽選を検証。`scripts/verify-tactical-enemies.mjs` は通常戦とElite戦で実際に抽選される3体混成seedを探し、3解像度でNEXT→Curse→Empower→Heavy Attack→複数Miss→時間切れ→Victoryを実入力で確認する（固定編成や戦闘State注入はしない）。Playwright環境変数は既存検証スクリプトと共通。

`enemyEncounterConfig.ts` と `enemyEncounterGenerator.ts` でTier別の個体数・Enemy Poolを管理。Battle / Ambush / Treasure Trapは1・2・3体を30/45/25、Eliteは20/45/35で抽選し、各slotを独立に重複あり抽選。Eliteは固定の強化版定義だけを抽選し、Floor単位のStat scalingはしない。通常戦の固定Compositionは撤去。Bossは別の `BOSS_ENCOUNTERS`（現状Tier1のCrypt Warden）を使用する。

追加テストは `enemySkills.test.ts`、`enemyEncounterGenerator.test.ts`、`actionTime.test.ts`。Cover3/2/1/0、途中死亡、個別Hit、4キャラ通常Attack、Mage AoE、回復条件・対象・上限、加重抽選、重複編成、再入室拒否、Skill固有の発動時刻・連続使用・速度Modifier・Fallback・ゲージ表示を検証。`scripts/verify-enemy-skills.mjs` は実Dungeonを固定seedで開始し、クリック＋左右キー、Cover、Heal、文字入力からVictoryまでを3解像度で検証する。Playwright環境と `APP_URL` は既存スクリプトと同じ形式。

今回の確認結果: 269テスト成功（26件追加）、TypeScript/Viteビルド成功。Chromiumの1920×1080 / 1536×864 / 1366×768で3体戦のCover・Heal・Victory、クリック/左右キー・入力継続・Auto Retarget、スクロール/ゲージ見切れなしを確認。既存通しプレイスクリプトも1F→Buff取得→Elite→9F Rest/Shop→10F Boss→Dungeon Clear→新RunのBuff0まで成功。重複Guardian/ShamanやElite3体の難易度バランスは今後の調整対象。

NEXT予告対応: `plannedEnemyAction.test.ts` に初期計画、予定4パターンの実行、個体独立性、Fallback、SPECIAL/Typing/Targetからの独立性、死亡時消去の10テストを追加（全279件成功）。Chromiumの上記3解像度でNEXT Cover→Cover、NEXT Heal→Heal→NEXT Attack、Victoryと既存ターゲット操作の回帰検証に成功。TypeScript/Viteビルド成功。

## Character Abilityの蓄積

Mage / Clericは `correct-characters` Triggerと各個体の既存 `abilityCharge` を使用。生存中の正解1文字で基本+1（Overdriveで+2）、Missでは維持し、実効Threshold以上で発動・0リセットします。Mageは30 Charge（Mana Surgeで24）、Clericは50 Charge。全快時のHealも発動分のChargeを消費しますが、実回復なしのHeal Eventは発生させません。PartyPanelも同じChargeを表示し、次戦闘へは持ち越しません。

Overdriveは `correct-input-charge-multiplier` Effectの値2を `getCorrectInputChargeMultiplier()` から参照します。将来の倍率は1を超える分を加算して合成できます。Knightも戦闘用 `abilityCharge` に文完成ごとに通常+1 / Overdrive +2を加算し、3以上でGUARDを1回付与して余剰を保持します（Overdriveでは1文目2/3、2文目発動後1/3）。通常Attackも既存どおり閾値を引いて余剰を保持。Flowの追加Chargeは倍率対象外です。

実入力数・完成文数・Combo・Fighterの20/40/80判定・50/100文字Streak・WPM/Accuracyは増幅しません。通常Miss / Protected MissはCharge +0。Overdriveは既存Legendaryの全報酬・Shop抽選へ自動参加し、価格400 Goldと取得済み除外を共用します。`overdrive.test.ts` の14テストを含め全619テスト・ビルド成功。

KnightのCompleted Prompt方式、FighterのCombo方式、Flow / Perfect Rhythmの `perfect-streak` は従来どおりです。Character用ChargeとTypingの連続正解数は独立しており、MissによるFighter解除・敵SPECIAL増加は維持します。`abilityCharge.test.ts` にMiss保持、発動・消費、Down、UI描画、Mana Surge、Streak Buff、階層遷移の回帰テストを追加しました。
