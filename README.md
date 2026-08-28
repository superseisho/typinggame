# Echoes of the Deep

ローグライク×タイピングRPGの戦闘MVPです。日本語文章の読みをローマ字入力すると4人の攻撃ゲージが同時に進み、各キャラクターが固有の閾値とターゲットルールで自動攻撃します。その間も複数の敵が独立したクールダウンとSpecial Gaugeで行動します。

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
- `src/game/save`: UIや戦闘ルールから分離したSaveRepository
- `src/audio`: CombatEventを音へ変換するAudioManager、音声設定、React購読Hook
- `src/hooks`: ゲームエンジンとブラウザの時間・入力の接続
- `src/components`, `src/screens`: 表示と画面構成

現在の戦闘では墓所のスライムと回復役の墓守の呪術師が登場します。僧侶のHeal、敵Special警告、攻撃・被弾・回復・戦闘不能などはCombatEventを介してAudio Feedbackへ接続されます。音量とミュートは画面右上のAUDIOから変更でき、localStorageへ保存されます。

初期効果音はWeb Audioによる合成プレースホルダーです。正式素材への差し替え方法は `public/audio/README.md` を参照してください。
