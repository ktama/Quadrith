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

## 実装状況: フェーズ2

- [x] グローバルホットキーでのクイック追加(既定: `Ctrl+Shift+Space`、専用小ウィンドウ)
- [x] システムトレイ常駐(左クリックで表示、メニューから終了)・閉じるボタンでトレイへ最小化
- [x] 期限当日の通知(Windowsトースト、既定 9:00。Rust側スケジューラ + `lastNotifiedDate` で同日二重通知を防止)
- [x] アーカイブビュー(完了一覧・復元・ごみ箱からの復元/完全削除)
- [x] 状態別カンバンビュー(列間ドラッグで状態変更)
- [x] タグでの絞り込み・タイトル/メモの検索(全ビュー共通)
- [x] 密集時のクラスタ表示(同一箇所に4枚以上 →「+N」バッジ、クリックで吹き出し展開)

## 実装状況: フェーズ3(分析系)

- [x] 第2領域(重要×非緊急)の放置タスクリマインド(既定14日更新なしで検出)
- [x] 再確認日(review_at)による保留・待ちタスクの通知(期限通知と統合)
- [x] リマインドのアプリ内表示(ヘッダーのベル、期限/再確認/放置を1リストに集約)
- [x] 完了タスクの象限分布の統計(統計ビュー、緊急象限 Q1+Q3 の割合を可視化)
- [x] JSON / CSV エクスポート(論理削除分も含む全タスク・タグ、保存ダイアログ)

設定画面(DBパス切替・色カスタマイズ・ホットキー/通知時刻変更 UI)は未実装。
quickAddHotkey / notifyTime / closeToTray / staleQ2 のしきい値は既定値または
DB の settings テーブルの値を使用するため、設定画面実装前でも DB を直接編集すれば
変更できる(要再起動)。

## 設計書からの意図的な差異

- **マイグレーションは TS 側で実行**([src/lib/migrations.ts](src/lib/migrations.ts))。
  tauri-plugin-sql の Rust 側マイグレーションは接続文字列単位の静的登録のため、
  ユーザーが任意に変更できる DB パス(仕様 §6)に追従できない。
  仕様書 §3 の「`PRAGMA user_version` で差分適用」を TS 側で実装した。
- **起動時バックアップは単純ファイルコピー**([src/lib/backup.ts](src/lib/backup.ts))。
  DB を開く前(WAL 非接続)に実行するため整合性が取れる(設計書 §5.1 手順4の補足どおり)。
  load 後の手動バックアップ(フェーズ2)では `VACUUM INTO` を使うこと。
- 使用プラグインは sql / store / fs / global-shortcut / notification / dialog
  (+ tauri 本体の tray-icon)。opener / autostart は設定画面と同時に追加する。
- **エクスポートのファイル書込は Rust 側コマンド**(`save_text_file`)。保存先は
  ダイアログでユーザーが選ぶ任意パスで、appdata に限定される plugin-fs では
  書けないため、ファイル I/O を OS 連携として Rust の `std::fs` で行う。
  パス選択は tauri-plugin-dialog を使う。
- クイック追加は専用の小ウィンドウ(label: `quickadd`)で実装。メインと同じ
  バンドルを共用し、[main.tsx](src/main.tsx) でウィンドウラベルにより振り分ける。

## データ保存先

| 内容 | 場所 |
|---|---|
| ブートストラップ設定(dbPath) | `%APPDATA%/com.quadrith.app/settings.json` |
| タスク DB | `%APPDATA%/com.quadrith.app/tasks.db`(settings.json で変更可能・UI はフェーズ2) |
| 自動バックアップ | DB と同じフォルダの `backups/tasks_YYYYMMDD_HHMMSS.db` |
