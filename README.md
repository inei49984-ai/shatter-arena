# SHATTER ARENA

ブラウザで遊ぶ、3Dモデル選択式のオンライン対戦アリーナです。Soldier / Super Human / Thomas の3体から選び、同じ部屋コードを入力したプレイヤーと対戦できます。

## ダウンロードしてWindowsで起動

### 1. ZIPをダウンロード

1. [SHATTER ARENAのGitHubページ](https://github.com/inei49984-ai/shatter-arena)を開きます。
2. 緑色の **Code** ボタンを押します。
3. **Download ZIP** を選び、ダウンロードが終わるまで待ちます。
4. ダウンロードした `shatter-arena-main.zip` を右クリックし、**すべて展開** を選びます。
5. 展開してできた `shatter-arena-main` フォルダを開きます。

### 2. Node.jsをインストール

1. [Node.js公式サイト](https://nodejs.org/)を開き、LTS版をダウンロードしてインストールします。
2. インストール後、開いているPowerShellやターミナルがあれば一度閉じて、開き直します。

### 3. ゲームを起動

1. 展開した `shatter-arena-main` フォルダを開き、`public` フォルダを開きます。
2. `start-game.bat` をダブルクリックします。初回は必要な部品を自動で準備し、ブラウザでゲームを開きます。
3. 初回起動時にデスクトップへ **Shatter Arena** ショートカットを作成します。次回からはショートカットをダブルクリックすれば起動できます。

起動に失敗した場合は、エラーが出た画面を確認してください。手動で起動するときは、展開したプロジェクトの一番外側のフォルダでPowerShellを開き、次を実行します。

```powershell
npm.cmd install
npm.cmd start
```

ゲームを終了するときは `public/stop-game.bat` をダブルクリックします。手動起動した場合はPowerShellで `Ctrl+C` を押します。

### 4. 友達と遊ぶ

同じWi-Fi内なら、起動したサーバーのログに表示される `LAN play: http://...:3000` のアドレスを友達に伝え、全員がその同じアドレスを開いて、同じ部屋コードを入力します。**友達のPCで `localhost` を開くと、その友達自身のPCにつながります。** Windowsファイアウォールが通信を尋ねたら、プライベートネットワークでのアクセスを許可します。

離れた場所の友達と遊ぶには、ゲームサーバーをインターネット上のNode.js対応サービスに配置し、その公開URLを全員で開く必要があります。GitHubにコードを置いただけではゲームサーバーは公開されません。詳しくは下の「GitHubとオンライン公開」を参照してください。

## 操作

- WASD: 移動
- A: 左へ移動 / D: 右へ移動
- マウス: 照準（ゲーム画面をクリックしてマウスロック）
- 左クリック: 射撃
- 画面右上の「退出」: ロビーへ戻る

部屋ごとに最大12人まで参加できます。初期版では共有ルーム内の対戦、HP、撃破スコアを同期します。

## 自動更新チェック

ゲームは5分ごとにGitHubの最新版を確認します。更新があると「更新が来てます。アップデートしてください。」と表示されます。**アップデートする**を押すと、最新版を取得してゲームファイルと必要なパッケージを更新し、サーバーを再起動します。ページは新しいサーバーへ自動で再接続します。更新中はPowerShellを閉じないでください。

ホスティングサービス上のゲームは、GitHubへの更新後にホスト側が再デプロイします。この場合、ゲーム内の自己更新ボタンは表示しません。

## GitHubとオンライン公開

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
