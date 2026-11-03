# THOMAS: KNOCKBACK EXPRESS

Thomasを運転し、SoldierとSuper Humanを体当たりでアリーナの外へ吹き飛ばす一人用3Dアーケードゲームです。効果音とオリジナルBGMはWeb Audioで合成し、声は端末の日本語読み上げ機能を使います。

## 操作

- W / S: 前進・後退
- A / D: 左右に方向転換
- Space または左クリック: 体当たり
- Q: 汽笛ブースト（クールダウンあり）
- マウス右ドラッグ: カメラを回転
- マウスホイール: カメラ距離

Thomasの車輪はモデル内の各車輪グループの中心を回転軸として回し、走行速度とブーストに応じて回転します。SoldierとSuper Humanは骨格アニメーションで関節を動かします。

音楽・効果音・音声はロビーのボタンで個別ではなくまとめてON/OFFできます。音が出ない場合は、ゲーム内ボタンを押して音を有効にしてください。声はOS/ブラウザーに日本語音声がある場合に再生されます。

## Windowsで起動

1. [GitHubリポジトリ](https://github.com/inei49984-ai/shatter-arena) の **Code → Download ZIP** からZIPをダウンロードします。
2. ZIPを右クリックし、**すべて展開** を選びます。
3. [Node.js公式サイト](https://nodejs.org/)からLTS版をインストールします。
4. 展開したフォルダの `public` 内にある `start-game.bat` をダブルクリックします。初回起動後、デスクトップにショートカットが作成されます。

手動起動する場合は、プロジェクトのルートで以下を実行します。

```powershell
npm.cmd install
npm.cmd start
```

終了時は `public/stop-game.bat` を使います。Windowsの実行ポリシーで `npm` が止められる場合は、PowerShellでは `npm.cmd` と入力してください。

## オンライン公開

Node.js対応のホストにこのリポジトリをデプロイすると、公開URLでゲームを配信できます。Renderの無料インスタンスは無通信時にスリープすることがあり、起動に時間がかかる場合があります。GitHubへの更新が公開サイトへ反映されない場合は、Renderで **Manual Deploy → Deploy latest commit** を実行してください。

## PWA

HTTPSのサイトはPCやスマートフォンへアプリのようにインストールできます。ゲームプレイにはインターネット接続が必要です。

## アセット

3Dアセットは `public/assets/` にあります。配布・公開前に各モデルのライセンス条件を確認してください。
