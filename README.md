# SHATTER ARENA

Thomasとフレンドが集まる3Dロビーから始まるゲームです。ロビーで「スタート」を押すと、Thomasを自由に走らせて遊べます。

## ロビーとプロフィール

- メールアドレスやアカウント登録は不要です。プレイヤー名とIDを決めて参加します。
- 名前とIDはサーバー上で重複を防ぎます。IDは英数字と `_` の3〜16文字です。
- IDでフレンドを追加でき、オンライン状況を表示します。
- プロフィールはブラウザーに保存されます。フレンド情報はサーバーの稼働中データとして扱います。

## 操作

ロビー画面ではThomasは待機しています。「スタート」を押すと移動できるようになります。

- W / A / S / D または矢印キー: 移動
- マウスドラッグ: カメラ回転
- マウスホイール: ズーム
- Esc または「ロビーに戻る」: ロビーへ戻る
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
