# Echoes of the Deep

ローグライク×タイピングRPGの1～10F探索MVPです。日本語文章の読みをローマ字入力すると4人の攻撃ゲージが同時に進み、各キャラクターが固有の閾値とターゲットルールで自動攻撃します。その間も複数の敵が独立したクールダウンとSpecial Gaugeで行動します。

## ダンジョンの遊び方

GAME START → 3択の部屋選択 → 部屋攻略 → 「次の階へ」を繰り返し、10Fのボスを倒すとDUNGEON CLEAR。全滅するとGAME OVERです。今回はNormal固定・Tier 1のみ。HPとDown状態、Goldをラン中に保持し、戦闘用ゲージ・Ability・コンボは部屋を移るとリセットします。

- Battle: 通常敵のランダム編成、45～65 Gold。
- Elite Battle: エリート入り強編成、100～130 Gold。
- Rest: 生存者全員30%回復 / 生存者1人60%回復 / Down1人を30%で蘇生、いずれか1回。Reviveは対象不在でもdisabled表示。
- Shop: 50 Goldで20%、100 Goldで50%の単体回復。部屋ごとに各1個、即時使用。購入せず退出も可能。
- Treasure: 65%で80 Gold、それ以外は生存者全員10%回復。
- Ambush: 通常階で8%。1Fは選択を保証する安全階、ボス階でも奇襲は発生しません。
- 10F: 900msのボス予告後に自動開戦。550HPの固定ボスを撃破すると探索完了。

全快の味方やDownにポーションは使用できません。選択・購入・階層移動はエンジン側でも段階とIDを検証し、二重実行を防止します。

成績は全戦闘の合計（WPMは戦闘時間のみ）です。終了時に既存SaveRepositoryからlocalStorageへ最高到達階・クリア回数・履歴・タイピング成績を保存します。10F版の履歴にはmaxFloorを併記します。探索途中のセーブはありません。音量設定や既存装備データは保持します。

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

1～10F内の階層倍率はありません。通常・Elite・Bossの固定データだけが異なります。30F化はmaxFloorとbossFloorsを変更可能ですが、現段階では全てTier 1の編成を使います。11F・21Fの強化は今後Tier別の敵編成テーブルを追加して切り替える想定です。Buff・装備ドロップ・11F以降の専用コンテンツ・難易度選択は未実装です。

`src/screens/CombatScreen.tsx` と `useCombat` は単体戦闘用として残し、共通の `BattleStage` を利用しています。現在のアプリの入口は `DungeonScreen` です。戦闘ルール・TypingEngineを探索UIへ移植していません。
