# SHATTER ARENA

ブラウザで遊ぶ、3Dモデル選択式のオンライン対戦アリーナです。Soldier / Super Human / Thomas の3体から選び、同じ部屋コードを入力したプレイヤーと対戦できます。

## ローカルで起動

Node.js 20 以降を用意して、このフォルダで実行します。

```bash
npm install
npm start
```

ブラウザで http://localhost:3000 を開きます。別の端末から同じWi-Fiで遊ぶ場合は、ホストPCのLANアドレスとポート3000へアクセスしてください。参加者は同じ部屋コードを入力します。

## 操作

- WASD: 移動
- マウス: 照準（ゲーム画面をクリックしてマウスロック）
- 左クリック: 射撃
- 画面右上の「退出」: ロビーへ戻る

部屋ごとに最大12人まで参加できます。初期版では共有ルーム内の対戦、HP、撃破スコアを同期します。

## GitHub とオンライン公開

このプロジェクトはNode.jsサーバーが必要です。GitHub Pages単体ではSocket.IOサーバーが動かないため、GitHubにコードを置き、Node.jsのWebサービス（例: Render、Railway、Fly.io）へサーバーをデプロイしてください。ホストの設定で `npm install` と `npm start` を指定します。サービスが発行したHTTPS URLを開けば、別のネットワークのプレイヤーとも遊べます。

```bash
git init
git add .
git commit -m "Build Shatter Arena multiplayer game"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/shatter-arena.git
git push -u origin main
```

## アセット

3つのGLBは `public/assets/` に含めています。合計約52 MBです。GitHubの通常ファイル上限（100 MB）内ですが、今後モデルが増える場合はGit LFSを検討してください。モデルの利用・再配布条件を確認してから公開してください。

## 技術

- Three.js 0.180.0 / GLTFLoader
- Node.js + Express 5 + Socket.IO 4
- ゲーム状態は部屋ごとにサーバーが中継。プレイヤー移動、射撃クールダウン、被弾、撃破をサーバーで処理

このゲームは初期プロトタイプです。ランクマッチ、アカウント、永続統計、アンチチートは含みません。
