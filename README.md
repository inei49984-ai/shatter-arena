# SHATTER ARENA

Thomasを動かして自由に歩き回れる3Dロビーです。名前とIDを決めるだけで参加でき、アカウント登録やメールアドレスは不要です。

## ロビー

- プレイヤー名とIDはサーバー上で重複を防ぎます。IDは英数字と `_` の3〜16文字です。
- IDでフレンドを追加でき、オンライン状況を表示します。
- プロフィールはブラウザーに保存されます。フレンド情報はサーバーの稼働中データとして扱います。
- ThomasのGLBモデルは `public/assets/thomas_the_tank_engine.glb` にあります。ロード中は簡易モデルでロビーを表示し、読み込み後に差し替えます。

## 操作

- W / A / S / D または矢印キー: 移動
- マウスドラッグ: カメラ回転
- マウスホイール: ズーム
- スマートフォン: 左スティックで移動、画面ドラッグでカメラ

走行に合わせて車輪と連結棒が動き、煙が出ます。

## ローカル起動

Node.js 20以降で実行します。

```sh
npm install
npm start
```

`http://localhost:3000` を開きます。Three.jsはアプリと同じサーバーから配信します。

## 3Dモデルのクレジット

「Thomas The Tank Engine」 by Thomasxsonic, [Sketchfab](https://sketchfab.com/3d-models/thomas-the-tank-engine-a0a5d05905134036af684ac1254a75ea), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
