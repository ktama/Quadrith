# CLAUDE.md

このファイルは Claude Code が自動で読み込むプロジェクト規約です。作業前に必ず目を通してください。

## プロジェクト概要

重要度・緊急度・状態の3軸でタスクを管理する **Windows 向け Tauri 2 デスクトップアプリ**。
詳細: 設計 [doc/design.md](doc/design.md) / 仕様 [doc/requirements.md](doc/requirements.md) /
ユーザー向け [doc/manual.md](doc/manual.md) / 概要 [README.md](README.md)。

スタック: Tauri 2 + React 18 + TypeScript + Zustand + Tailwind CSS v4 + SQLite(tauri-plugin-sql)。

## コマンド

```sh
npm run tauri dev    # 開発実行(初回は Rust ビルドに数分)
npm test             # 単体・結合テスト(vitest)
npm run build        # フロントの型チェック + ビルド(tsc && vite build)
npm run tauri build  # 配布用ビルド(NSIS インストーラ)
cargo fmt --manifest-path src-tauri/Cargo.toml          # Rust 整形
cargo clippy --manifest-path src-tauri/Cargo.toml       # Rust lint
```

## アーキテクチャ(要点)

**ロジックは TS 側に寄せ、Rust は OS 連携のみ。** 層構成:
`components/`(UI) → `stores/`(Zustand) → `repositories/`(SQL 発行) → `lib/db.ts`(唯一の DB 接続)。
純粋ロジックは `lib/`(coords / layout / quadrant / reminders / stats / export など)。
Rust(`src-tauri/src/`)は tray / single-instance / 通知スケジューラ(scheduler.rs) /
任意パスのファイル I/O(fsops.rs)のみ。ファイル一覧は design.md §2 を参照。

## 必ず守るルール

- **スキーマ変更は [src/lib/migrations.ts](src/lib/migrations.ts) に version を追加**。過去のマイグレーションは
  絶対に編集しない(任意パスの古い DB を順次適用で開くため)。列を足したら `Task` 型 / `rowToTask` /
  `create` の INSERT / `lib/export.ts` の CSV 列 / **各テストの task ファクトリ**も忘れず更新する。
- リポジトリ・db・desktop 層は **throw せず `Result<T>`**([lib/result.ts](src/lib/result.ts))を返す。
- 書込は **楽観更新**(UI 即時反映 → 非同期で DB → 失敗時にロールバック + エラートースト)。
  `updatedAt` はストアで生成した値を repo へ渡して DB と一致させる。
- **任意パスのファイル I/O は plugin-fs ではなく Rust の fsops コマンド**経由
  ([lib/fsops.ts](src/lib/fsops.ts) → [src-tauri/src/fsops.rs](src-tauri/src/fsops.rs))。
  DB は Dropbox 等の任意パスに置けるため、plugin-fs(appdata 限定スコープ)は使わない。
- DB を開く前/開けない時に要る設定(`backupGenerations` / `backupDir` / `theme`)は
  DB 内 settings に加えて **settings.json にもミラー**する(ブートストラップ層が正)。
- スタイルは既存の Tailwind ユーティリティ流儀に合わせる。配色は [src/index.css](src/index.css) の
  `@theme` トークンで一括管理(アクセント=インディゴ、ステータス5色はユーザー設定値で独立)。
- ファイル参照は markdown リンク( `[path](path)` )で書く。

## テスト方針

- 新しいロジックは**純粋関数に切り出して** vitest でテスト(例: `switchPlan` / `windowClamp`)。
- マイグレーション SQL は [migrations.test.ts](src/lib/migrations.test.ts) が **better-sqlite3** の
  インメモリ DB で検証する。
- repo / store / DB 切替の live 結合テストは Tauri ランタイム依存のため無し(分岐を純粋関数化して担保)。

## 既知の落とし穴

- **`time` クレートは 0.3.47 固定**(Cargo.lock)。`cargo update` で `cookie` と衝突して壊れる。復旧:
  `cargo update --manifest-path src-tauri/Cargo.toml -p time --precise 0.3.47`
- **アイコン変更は差分ビルドで再埋め込みされない**ことがある。
  `cargo clean -p quadrith --manifest-path src-tauri/Cargo.toml` 後に再ビルド。
- メインウィンドウは `decorations:false`(カスタムタイトルバー)。ウィンドウ操作は
  `WindowControls` / `ResizeHandles`、ドラッグは `data-tauri-drag-region`。
- クイック追加ウィンドウ(label `quickadd`)は **DB に触れない**。`quick-add-submit` イベントで
  メインへ委譲(同一 DB への 2 接続を避ける)。`main.tsx` がウィンドウラベルで振り分ける。
- Rust 側の権限は [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) に追加が必要。

## 配布

- バンドルは **NSIS のみ・`currentUser`(管理者不要)**([tauri.conf.json](src-tauri/tauri.conf.json))。
- リリースは `vX.Y.Z` タグ push → [.github/workflows/release.yml](.github/workflows/release.yml) が
  自動ビルドしてドラフト作成。バージョンは tauri.conf.json / package.json / Cargo.toml の3つを揃える。
- 未署名のため初回起動時に SmartScreen 警告が出る(「詳細情報 →実行」で回避。README に記載)。
