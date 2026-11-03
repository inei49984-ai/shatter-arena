# Tomas Fight

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

`npm run app` でElectron版を起動します。APIサーバーだけをローカルで試す場合は `npm start` です。

## 配布とオンライン通信

- Windows版はElectronでパッケージし、GitHub Releasesから配布します。
- ダウンロードページはGitHub Pagesの `docs/` から公開します。
- Renderの既存 `shatter-arena` サービスはプロフィール、フレンド、オンラインプレイヤー位置のAPI/WebSocketだけを提供します。
- クライアントはHTTPS / WSSだけに接続します。Renderは外部HTTPS接続をTLSで終端します。
- GitHub ActionsはインストーラーのSHA-256チェックサムとビルド証明をReleaseに付けます。
- 今のプロフィールとフレンド情報はサーバーのメモリ上にあり、Renderの再起動時に消えます。

## 3Dモデルのクレジット

「Thomas The Tank Engine」 by Thomasxsonic, [Sketchfab](https://sketchfab.com/3d-models/thomas-the-tank-engine-a0a5d05905134036af684ac1254a75ea), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
