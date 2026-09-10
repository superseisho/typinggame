# Echoes of the Deep

ローグライク×タイピングRPGの1～10F探索MVPです。日本語文章の読みをローマ字入力すると4人の攻撃ゲージが同時に進み、各キャラクターが固有の閾値とターゲットルールで自動攻撃します。その間も複数の敵が独立したクールダウンとSpecial Gaugeで行動します。

## ダンジョンの遊び方

GAME START → 3択の部屋選択 → 部屋攻略 → 次の階へ進み、10Fのボスを倒すとDUNGEON CLEAR。全滅するとGAME OVERです。戦闘勝利後はGoldを受け取り、Buffを1つ選ぶと500msの取得演出を経て次の階へ進みます。非戦闘の部屋では「次の階へ」を押します。今回はNormal固定・Tier 1のみ。HPとDown状態、Goldと取得Buffをラン中に保持し、戦闘用ゲージ・Ability・コンボ・条件付きの一時強化は部屋を移るとリセットします。

- Battle: 通常敵のランダム編成、45～65 Gold。
- Elite Battle: エリート入り強編成、100～130 Gold。
- Rest: 生存者全員30%回復 / 生存者1人60%回復 / Down1人を30%で蘇生、いずれか1回。Reviveは対象不在でもdisabled表示。
- Shop: 50 Goldで20%、100 Goldで50%の単体回復。部屋ごとに各1個、即時使用。購入せず退出も可能。
- Treasure: 65%で80 Gold、それ以外は生存者全員10%回復。
- Ambush: 通常階で8%。1Fは選択を保証する安全階、ボス階でも奇襲は発生しません。
- 10F: 900msのボス予告後に自動開戦。550HPの固定ボスを撃破すると探索完了。

全快の味方やDownにポーションは使用できません。選択・購入・階層移動はエンジン側でも段階とIDを検証し、二重実行を防止します。

成績は全戦闘の合計（WPMは戦闘時間のみ）です。終了時に既存SaveRepositoryからlocalStorageへ最高到達階・クリア回数・履歴・タイピング成績を保存します。10F版の履歴にはmaxFloorを併記します。探索途中のセーブはありません。音量設定や既存装備データは保持します。

### 戦闘画面の高さ

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

`src/game/dungeon/dungeonConfig.ts` に階層上限・ボス階・安全階・奇襲率・回復量・Gold報酬・商品・敵編成を集約しています。部屋の出現比率は `src/data/rooms/roomDefinitions.ts`。敵の基礎数値は `src/data/enemies.ts` です。

1～10F内の階層倍率はありません。通常・Elite・Bossの固定データだけが異なります。30F化はmaxFloorとbossFloorsを変更可能ですが、現段階では全てTier 1の編成を使います。11F・21Fの強化は今後Tier別の敵編成テーブルを追加して切り替える想定です。装備ドロップ・11F以降の専用コンテンツ・難易度選択は未実装です。

`src/screens/CombatScreen.tsx` と `useCombat` は単体戦闘用として残し、共通の `BattleStage` を利用しています。現在のアプリの入口は `DungeonScreen` です。戦闘ルール・TypingEngineを探索UIへ移植していません。

## Run限定Buffと戦闘後の3択

Battle / Elite / Ambush勝利後は `buff_reward` に移行し、選ぶまで階層を進めません。1つ取得すると `buff_acquired` を500ms表示し、自動で次の階へ進みます。二重クリック・古い階層のイベント・無効なBuff IDをエンジンで拒否します。最終Bossは直接Clearとなります。将来の途中BossにはElite抽選を利用します。

| レアリティ | Battle / Ambush | Elite / 途中Boss |
| --- | ---: | ---: |
| Common | 55% | 20% |
| Uncommon | 30% | 40% |
| Rare | 13% | 30% |
| Epic | 2% | 10% |

各カードで取得可能なレアリティを重み付き抽選し、そのプールから1種類を選びます。選択済み候補・取得済みUnique・最大Stackは除外。空になったレアリティの重みは残りへ再配分するため、2・3枚目や取得状況に応じて実際の確率は変わります。候補が2個以下なら残りのみ表示し、0個なら追加60 Goldと通常の「次の階へ」を表示します。

### 初期Buff（20種類）

| 対象 | 名前 | 効果（1 Stack） |
| --- | --- | --- |
| 全員 | Power Rune | Attack +10% |
| 全員 | Vitality Rune | Max HP +10%、生存者の現在HPに最大HP増加分を加算 |
| 全員 | Swift Fingers | Attack必要文字数 −8% |
| 全員 | Calm Mind | ミス時の敵Special Gauge増加 −20% |
| 戦士 | Reinforced Shield | Guard成功時Max HPの5%回復 |
| 戦士 | Guardian Oath | Guard成功後、次の通常Attack +30%・1回消費 |
| 戦士 | Fortress | Guard成功後、次のミス時の敵全体Gauge増加を15軽減・1回消費 |
| 魔法使い | Arcane Power | 通常Attack +15% |
| 魔法使い | Wide Magic | 全体攻撃Ability威力 +25% |
| 魔法使い | Mana Surge | Ability必要連続正解数 −20% |
| 僧侶 | Healing Prayer | Heal基本回復量 +20% |
| 僧侶 | Sacred Healing | Healに対象Max HPの5%を追加 |
| 僧侶 | Guardian Blessing | 実際にHealされた味方の次の被ダメージ −25%・通常攻撃/SPECIAL共通 |
| 武闘家 | Focus | Attack +15% |
| 武闘家 | Endless Combo | Comboの上乗せ分を25%強化（×1.25なら×1.3125） |
| 武闘家 | Perfect Form | Combo中のAttack倍率をさらに20%強化、ミスで解除 |
| タイピング | Precision | ミス時の敵Special Gauge増加 −10% |
| タイピング | Flow | 50連続正解ごとに生存者のAttack Gauge +5文字 |
| タイピング | Perfect Rhythm | 50連続正解ごとに敵全体へ威力15の追加攻撃、防御適用 |
| 全員・Epic | Ascendant Rune | Attack +20%、Max HP +10% |

Guardian Oath / Fortress / Guardian Blessing / Ascendant RuneはUnique（1個）。他は最大3 Stack。同じ補正は基礎値に対して加算します（Power Rune ×2は+20%）。AttackとAbility必要文字数は端数切り上げ・最低5文字、ミスGauge倍率は最低10%。防御力は強化後の攻撃威力から引きます。Max HP増加でDownを蘇生しません。僧侶の追加回復・障壁は僧侶のHealが対象で、Restやポーションの割合回復は既存仕様です。

探索中の `BUFFS` を開くと取得一覧・Stack合計効果を確認できます。戦闘中には描画しないため、Partyのゲージ領域を圧迫しません。条件付き効果は既存のCombatEventによるログ・対象の短いBuff表示・SE、回復は実回復量の緑発光に接続します。

### ファイルと拡張方法

- `src/types/buffs.ts`: ID、表示名、説明、レアリティ、複数カテゴリ、複数Effect、Stack制約、任意Sound ID。Runには `{ buffId, stacks }` のみ保持。
- `src/data/buffs/buffDefinitions.ts`: 効果・条件・対象・数値のデータ。既存Effect型のBuffなら定義追加のみ。
- `src/game/buffs/buffConfig.ts`: 抽選比率、3候補、500ms演出、最低値、候補枯渇時のGold。
- `runBuffManager.ts`: 共通の追加・削除・取得可否判定、HPを保った戦闘への適用。将来Shop / Treasureもここを利用可能。
- `buffModifiers.ts`: 基礎Characterを変更せず最終Attack / Max HP / Threshold / Ability / Comboを計算。戦闘、Party UI、回復対象選択、Rest、Shopで共用。
- `buffEffectHandlers.ts`: Guard成功 / 実Heal / 正解Streakの同期ハンドラ。過去ログやReact再描画から再発動しない。新しい条件付き効果は型と専用ハンドラを追加。
- `buffRewards.ts`, `buffDescriptions.ts`: シード付き重複なし抽選、Stack効果の表示。
- `BuffReward.tsx`, `CurrentBuffs.tsx`, `styles/buffs.css`: 3択・取得演出・探索中の折りたたみ一覧。

取得Buffは探索終了時・新Run時に破棄し、localStorageには保存しません。Guard後の反撃・障壁・Gauge軽減などの消費待ち効果は戦闘内の `buffResources` に分離し、次戦闘へ持ち越しません。TypingEngineや立ち絵の状態切り替えルールには変更を加えていません。

`src/game/buffs/buffs.test.ts` では追加・Stack上限・Unique・抽選比率・枯渇・二重選択・最終Boss・Run終了・実ダメージ/回復/必要文字数・Guard/Combo/連続正解・SPECIAL軽減を検証します。既存の10F通しテストもBuff選択を含む経路へ更新しています。

任意のPlaywright環境向けに `scripts/verify-buff-run.mjs` も用意しています。開発サーバー起動後、`APP_URL` と必要なら `PLAYWRIGHT_MODULE`（Playwrightのindex.mjsへの絶対パス）を指定して実行できます。3つのPCサイズで実キー入力→Buff選択→10Fクリア→次Runを検証します。今回のブラウザ検証では7回取得（Healing Prayer ×2を含む）、戦士の必要文字数90→83、最終BossのBuff省略、保存データにRun Buffが残らないことを確認しました。1366×768でもAbility Gauge下端は約725pxで、戦闘中の見切れはありません。バランスと難易度ごとの最適化は今後の課題です。
