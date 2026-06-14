# コントリビューションガイド

Quadrith への貢献に興味を持っていただきありがとうございます。

## 必要なもの

- **Node.js 22** 系
- **Rust**(stable)+ Windows ビルド環境(MSVC ツールチェイン)
- **WebView2 ランタイム**(Windows 11 は標準で同梱)

## セットアップと開発

```sh
npm install          # 依存関係のインストール
npm run tauri dev    # 開発実行(初回は Rust のビルドに数分)
npm test             # 単体・結合テスト(vitest)
npm run build        # フロントエンドの型チェック + ビルド
npm run tauri build  # 配布用ビルド(インストーラ)
```

## コーディング規約

- TypeScript は `strict`(`noUnusedLocals` 等も有効)。型エラーを残さないこと。
- 既存コードのスタイル(命名・コメント量・構成)に合わせる。整形は Prettier 設定([.prettierrc.json](.prettierrc.json))に準拠。
- Rust は `cargo fmt` 整形・`cargo clippy` で警告を確認。

## アーキテクチャの要点(詳細は [doc/design.md](doc/design.md))

- **ロジックは TS 側に寄せ、Rust は OS 連携のみ**。
- **スキーママイグレーションは TS 側**([src/lib/migrations.ts](src/lib/migrations.ts))で `PRAGMA user_version`
  により管理する。**過去のマイグレーションは絶対に書き換えない**。スキーマ変更は version を増やして追記する
  (任意パスの古い DB を順次適用で開くため)。
- 任意パス(Dropbox 等)のファイル I/O は Rust の `fsops` コマンド経由([src-tauri/src/fsops.rs](src-tauri/src/fsops.rs))。

## 注意点

- **`time` クレートは `0.3.47` に固定**しています(Cargo.lock 管理)。`cargo update` を実行すると
  `cookie` との非互換でビルドが壊れることがあります。壊れた場合は次で復旧してください:

  ```sh
  cargo update --manifest-path src-tauri/Cargo.toml -p time --precise 0.3.47
  ```

- アプリアイコンを変更したときは、差分ビルドだと実行ファイルへ再埋め込みされないことがあります。
  `cargo clean -p quadrith --manifest-path src-tauri/Cargo.toml` 後に再ビルドしてください。

## プルリクエスト

- ブランチを切って作業し、[PR テンプレート](.github/PULL_REQUEST_TEMPLATE.md)のチェック項目を満たしてください。
- CI(`npm run build` / `npm test` / `cargo fmt --check` / `cargo clippy`)が通ることを確認してください。
