# 配布・公開の手順

## 1. 単体HTML

`release/Optimizer-Playground.html` を渡すだけで、計算・編集・比較ができます。外部フォント、CDN、分析サービスは使用していません。現代的なブラウザのCanvas、Web Worker、Blob URLが必要です。

投稿・共有URL・秘密キー削除を有効にするには、次のサーバーを配置してください。ローカルファイル版で共有ボタンが無効なのは、削除できない埋め込みURLへ無断で置き換えないための仕様です。

## 2. Nodeサーバー

Node.js 22以上で以下を実行します。

```sh
npm run build
npm start
```

`http://127.0.0.1:3000` で起動します。生成済み `dist/` がある配布版では `npm start` だけでも起動します。Nodeの依存パッケージのインストールは不要です。

外部公開例（Linux/macOS）：

```sh
HOST=0.0.0.0 PORT=3000 PUBLIC_ORIGIN=https://your-domain.example DATA_DIR=/srv/optimizer-data npm start
```

`your-domain.example` は運営者の実際のHTTPSオリジンに置き換えます。HTTPSを終端するリバースプロキシを手前に置き、`PUBLIC_ORIGIN` を一致させます。この値を他人のオリジンにしないでください。

| 環境変数 | 既定値 | 用途 |
|---|---|---|
| `HOST` | `127.0.0.1` | Listenアドレス |
| `PORT` | `3000` | HTTPポート |
| `DATA_DIR` | プロジェクト内 `data/` | 投稿保存先。公開静的ディレクトリの外に置く |
| `PUBLIC_ORIGIN` | 未設定 | 公開オリジン。公開時はHTTPSの正しい値を指定 |
| `MAX_POSTS` | `1000` | 保存投稿数の上限 |
| `POST_TTL_DAYS` | `30` | 投稿の保持日数 |

`.env.example` を用意しています。`npm start` 自体は `.env` を自動読込しないため、シェルで環境変数を渡すか、Nodeの `--env-file` を明示してください。

```sh
node --env-file=.env server/index.mjs
```

### 永続化と制約

投稿は `DATA_DIR` 内の個別JSONファイルに保存します。静的配信ディレクトリに保存してはいけません。サーバー再起動後も同じ永続ディレクトリを使用してください。期限切れの投稿は閲覧または新規投稿時に除去します。単一Nodeプロセスを前提としたファイル保存です。複数インスタンスや一時ファイルシステムのサーバーレス環境では、そのままでは永続性を保証できません。

大規模な公開サービス向けには、外部DB/オブジェクトストレージ、監視、通報・管理者削除、バックアップと削除方針、プロキシでの連投対策を別途設計してください。接続元IPの連投制限はソケットのアドレスを使い、任意の `X-Forwarded-For` を信用しません。共有プロキシの裏では同じ制限枠になる場合があります。

## 3. Docker（構成ファイル同梱、Docker実行未検証）

```sh
docker compose up --build
```

Composeは `127.0.0.1:3000` に公開し、名前付きボリュームで投稿を保持します。外部公開する場合はリバースプロキシと `PUBLIC_ORIGIN` を設定します。`docker compose down -v` は保存した投稿を消すため、通常の停止には `-v` を付けません。

## 4. GitHubの公開リポジトリ

この配布物はGitHubへ自動でアップロードされていません。ソースZIPを展開し、ライセンスと公開内容を確認してから新規リポジトリへ配置できます。

```sh
git init -b main
git add .
git commit -m "Initial browser optimizer playground"
# GitHub CLIを利用する場合。事前に自分のアカウントで認証する。
gh repo create optimizer-playground --public --source=. --remote=origin --push
```

既存リポジトリを置き換えるコマンドではありません。保存済み投稿、`.env`、削除キー、個人情報をコミットしないでください。`.gitignore` で `data/` と `.env` を除外しています。GitHub Pagesは静的配信なので、公開計算画面は配信できますが、このNode共有APIは実行できません。

## 5. 公開前の最低確認

`npm test` と `npm run build` を実行し、通常のChrome/Chromium環境で `npm run test:e2e` を通してください。特に投稿・新しい共有ページの表示・誤ったキーの拒否・正しいキーによる削除を、実際の公開HTTPSオリジンで再確認してください。
