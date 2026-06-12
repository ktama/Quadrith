# Quadrith

重要度・緊急度・状態の3軸でタスクを管理する Windows 向けデスクトップアプリ。
アイゼンハワーマトリクスの「どれからやるか」と、カンバンの「どこまで進んだか」を1画面で扱う。

仕様: [doc/requrements.md](doc/requrements.md) / 設計: [doc/design.md](doc/design.md)

## 技術スタック

Tauri 2.x / React 18 + TypeScript / Zustand / Tailwind CSS v4 / SQLite (tauri-plugin-sql)

## 開発

```sh
npm install        # 依存関係のインストール
npm run tauri dev  # 開発実行(初回は Rust のビルドに数分かかる)
npm test           # 単体テスト(coords / layout)
npm run build      # フロントエンドの型チェック + ビルド
npm run tauri build  # 配布用ビルド
```

## 実装状況: MVP(フェーズ1)

- [x] タスクの CRUD(削除は論理削除 + undo トースト、30日後に起動時物理削除)
- [x] マトリクス上のドラッグ配置と正規化座標(0.0〜1.0)の保存
- [x] カード重なりの衝突回避レイアウト(決定的・黄金角スパイラル)
- [x] インボックスレーン(未仕分けタスクの受け皿、クイック追加入力付き)
- [x] 5状態の管理と色分け・フィルタ(未着手/進行中/保留/待ち/完了)
- [x] 期限日・タグ・メモ・再確認日(詳細パネル)
- [x] 完了 → 24時間後にマトリクスから自動非表示(アーカイブ判定は表示時計算)
- [x] データのローカル保存(SQLite、既定: `%APPDATA%/com.quadrith.app/tasks.db`)
- [x] スキーママイグレーション基盤(`PRAGMA user_version`)
- [x] 起動時の自動バックアップ(`<DBフォルダ>/backups/` に3世代保持)

フェーズ2以降(トレイ常駐・グローバルホットキー・通知・アーカイブビュー・カンバン・
クラスタ表示・設定画面/DBパス切替)は未実装。

## 設計書からの意図的な差異

- **マイグレーションは TS 側で実行**([src/lib/migrations.ts](src/lib/migrations.ts))。
  tauri-plugin-sql の Rust 側マイグレーションは接続文字列単位の静的登録のため、
  ユーザーが任意に変更できる DB パス(仕様 §6)に追従できない。
  仕様書 §3 の「`PRAGMA user_version` で差分適用」を TS 側で実装した。
- **起動時バックアップは単純ファイルコピー**([src/lib/backup.ts](src/lib/backup.ts))。
  DB を開く前(WAL 非接続)に実行するため整合性が取れる(設計書 §5.1 手順4の補足どおり)。
  load 後の手動バックアップ(フェーズ2)では `VACUUM INTO` を使うこと。
- 使用プラグインは MVP に必要な sql / store / fs のみ。dialog / opener /
  global-shortcut / notification / autostart はフェーズ2で追加する。

## データ保存先

| 内容 | 場所 |
|---|---|
| ブートストラップ設定(dbPath) | `%APPDATA%/com.quadrith.app/settings.json` |
| タスク DB | `%APPDATA%/com.quadrith.app/tasks.db`(settings.json で変更可能・UI はフェーズ2) |
| 自動バックアップ | DB と同じフォルダの `backups/tasks_YYYYMMDD_HHMMSS.db` |
