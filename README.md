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

## 実装状況: フェーズ4(設定画面)

ヘッダー右の歯車から開く。AppSettings は変更時に即時保存(楽観更新)。

- [x] **DBファイルの保存先の変更**(仕様書 §7.3): フォルダ選択 → 対象 `<dir>/tasks.db` の
  有無で分岐(なし=移動 / 空で新規作成、あり=既存を開く / 上書き)。切替失敗時は
  旧パスへ自動ロールバック。「場所を開く」でエクスプローラ表示
- [x] 自動バックアップの保持世代数・保存先、「今すぐバックアップ」(`VACUUM INTO`)
- [x] 状態ごとの色のカスタマイズ
- [x] 完了→アーカイブまでの時間
- [x] テーマ(ライト / ダーク / システム連動。主要画面をダーク対応)
- [x] クイック追加ホットキーの変更(即時に再登録)
- [x] Windows 起動時の常駐(autostart)
- [x] 閉じるボタンの挙動(終了 / トレイへ最小化)
- [x] 通知の発火時刻

## 実装状況: 堅牢性(仕様の取りこぼし対応)

監査で見つかった「仕様に明記されているが未実装だった」項目を補完済み。

- [x] **起動時にDBが見つからない場合のダイアログ**(仕様書 §7.4 / §5.1-3):
  保存済みパスのファイルが無ければ「探す / この場所に新規作成 / 既定に戻す」を提示。
  クラウド同期フォルダ未マウント時に空DBを黙って作る事故を防ぐ
  ([lib/db.ts](src/lib/db.ts) `checkDbAvailability` / `recoverDbPath`)
- [x] **DB open / マイグレーション失敗時のバックアップ復元画面**(仕様書 §7 / §5.1-5):
  `backups/` の一覧から選んで復元 → 再試行([lib/backup.ts](src/lib/backup.ts) `listBackups` / `restoreBackup`)
- [x] **ウィンドウ位置・サイズの保存/復元**(設計書 §3 `BootstrapSettings.window`):
  settings.json に物理座標で保存([lib/windowState.ts](src/lib/windowState.ts))
- [x] **カード右クリックメニュー**(仕様書 §4.2): 状態変更 / インボックスへ戻す / 削除
  ([components/common/CardContextMenu.tsx](src/components/common/CardContextMenu.tsx))

## 実装状況: 仕上げ

- [x] **メモの Markdown 表示**(仕様書 §4.3「Markdown可だとなお良い」):
  詳細パネルのメモを編集/プレビュー切替に。react-markdown + remark-gfm(GFM:
  表・打ち消し・タスクリスト対応)、`dangerouslySetInnerHTML` 不使用で XSS 安全
  ([components/panel/MemoField.tsx](src/components/panel/MemoField.tsx))
- [x] **ダーク配色の網羅** — 詳細パネル/統計/カード/期限バッジ等の残りの明色面に
  ダーク variant を付与。全サーフェスがライト/ダークで一貫

これで仕様書・設計書の機能項目を **すべて実装完了**(フェーズ1〜3 + 設定機能 §7 +
起動時の堅牢性 §7.4 + 仕上げ)。

## 設計書からの意図的な差異

- **マイグレーションは TS 側で実行**([src/lib/migrations.ts](src/lib/migrations.ts))。
  tauri-plugin-sql の Rust 側マイグレーションは接続文字列単位の静的登録のため、
  ユーザーが任意に変更できる DB パス(仕様 §6)に追従できない。
  仕様書 §3 の「`PRAGMA user_version` で差分適用」を TS 側で実装した。
- **バックアップは2種**([src/lib/backup.ts](src/lib/backup.ts))。起動時は DB を開く前
  (WAL 非接続)なので単純ファイルコピー、設定画面からの手動バックアップは load 後なので
  `VACUUM INTO`(設計書 §5.1 手順4の補足どおり)。世代数は DB を開く前に必要なため
  ブートストラップ層(settings.json)にも保持する。
- **任意パスのファイル I/O は Rust 側コマンドに集約**([src-tauri/src/fsops.rs](src-tauri/src/fsops.rs))。
  DB は Dropbox 等の任意の場所(仕様書 §7.4)に置けるが、plugin-fs は appdata 等に
  スコープが限定されるため、バックアップ・DBパス切替・エクスポートのファイル操作は
  `std::fs` を使う。パス/フォルダ選択は tauri-plugin-dialog。
- 使用プラグイン: sql / store / fs / global-shortcut / notification / dialog /
  opener / autostart(+ tauri 本体の tray-icon)。
- クイック追加は専用の小ウィンドウ(label: `quickadd`)で実装。メインと同じ
  バンドルを共用し、[main.tsx](src/main.tsx) でウィンドウラベルにより振り分ける。

## データ保存先

| 内容 | 場所 |
|---|---|
| ブートストラップ設定(dbPath) | `%APPDATA%/com.quadrith.app/settings.json` |
| タスク DB | 既定 `%APPDATA%/com.quadrith.app/tasks.db`(設定画面から任意の場所へ変更可能) |
| 自動バックアップ | 既定は DB と同じフォルダの `backups/tasks_YYYYMMDD_HHMMSS.db`(設定で変更可能) |
