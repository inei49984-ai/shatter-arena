# SHATTER ARENA — THOMAS: FULL STEAM

Thomasを運転し、ドローンの群れを体当たりでアリーナの外へ吹き飛ばす3Dサバイバルゲームです。ホイールと連結ロッドの回転、走行に合わせた車体の揺れ、煙突から出る蒸気をリアルタイムで動かします。ウェーブが進むほど敵が速くなり、重装ドローンも出現します。ハイスコアはブラウザーに保存されます。

## 操作

- W / A / S / D または矢印キー: カメラ方向を基準に走行
- マウス左ドラッグ: カメラを回転
- マウス右ドラッグ: カメラをパン
- マウスホイール: カメラをズーム
- Space: 前方へ体当たり
- Q または Shift: 汽笛ブースト
- Esc: 一時停止
- スマートフォン: 左スティックで走行、1本指ドラッグでカメラ回転、画面上の RAM / WHISTLE ボタンで攻撃

## 起動

Node.js 20以降をインストールし、プロジェクトのルートで実行します。

```sh
npm install
npm start
```

`http://localhost:3000` を開きます。Three.jsのモジュールはjsDelivrから読み込みます。Render用の設定は `render.yaml` にあり、GitHubへpushすると接続済みのRenderサービスがデプロイします。

## 3Dモデルのクレジット

「Thomas The Tank Engine」 by Thomasxsonic, [Sketchfab](https://sketchfab.com/3d-models/thomas-the-tank-engine-a0a5d05905134036af684ac1254a75ea), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
