# 3軸タスク管理アプリ 仕様書(v1.2 / as-built)

このドキュメントは**現在の実装に同期**している。設計の詳細は [design.md](./design.md) を参照。
当初仕様(v1.1)からの変更・追加は各節の「実装メモ」に記す。

## 1. コンセプト

重要度・緊急度・状態の3軸でタスクを管理するWindows向けデスクトップアプリ。
メイン画面は重要度×緊急度の2Dマトリクスとし、第3軸の「状態」は色とフィルタで表現する。
アイゼンハワーマトリクスの「どれからやるか」と、カンバンの「どこまで進んだか」を1画面で扱えることが価値。

## 2. 技術スタック

| 項目           | 選定(採用)                 | 備考                                 |
| -------------- | -------------------------- | ------------------------------------ |
| フレームワーク | Tauri 2.x                  | 軽量・低メモリで常駐に向く           |
| フロントエンド | React 18 + TypeScript      | 型安全                               |
| D&D            | 自前の pointer events      | 自由座標配置に最適(dnd-kit は不採用) |
| 状態管理       | Zustand                    | 小規模に適したシンプルさ             |
| DB             | SQLite(tauri-plugin-sql)   | ローカル完結。マイグレーションはTS側 |
| スタイリング   | Tailwind CSS v4            | デザイントークンを `@theme` で集約   |
| フォント       | Inter + Noto Sans JP(同梱) | オフライン(§6)。`@fontsource`        |

**実装メモ**: 自由座標配置は「pointer イベント + 座標の正規化保存」を自前実装(dnd-kit 不採用)。
UI は「高密度プロツール(Linear 風)/ インディゴアクセント / ライト・ダーク両対応(カスタム
タイトルバー)」の方向で実装。詳細は design.md §9。

## 3. データモデル

スキーマは [migrations.ts](../src/lib/migrations.ts) が管理(`PRAGMA user_version`、現行 **v3**)。

```sql
-- v1: 初期スキーマ
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,        -- UUID
  title       TEXT NOT NULL,
  memo        TEXT NOT NULL DEFAULT '',-- Markdown 可
  importance  REAL,                    -- 0.0〜1.0(縦軸)。NULL = インボックス(未仕分け)
  urgency     REAL,                    -- 0.0〜1.0(横軸)。NULL = インボックス(未仕分け)
  status      TEXT NOT NULL
              CHECK (status IN ('todo','doing','pending','waiting','done')),
  due_date    TEXT,                    -- 'YYYY-MM-DD'(日付のみ)
  review_at   TEXT,                    -- 'YYYY-MM-DD' 再確認日(保留・待ちの死蔵防止)
  created_at  TEXT NOT NULL,           -- ISO 8601(UTC)
  updated_at  TEXT NOT NULL,           -- ISO 8601(UTC)
  completed_at TEXT,                   -- 完了日時(アーカイブ判定用)
  deleted_at  TEXT,                    -- 論理削除日時。NULL = 有効
  CHECK ((importance IS NULL) = (urgency IS NULL))
);
CREATE INDEX idx_tasks_status ON tasks(status)  WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due    ON tasks(due_date) WHERE deleted_at IS NULL;

CREATE TABLE tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL  -- HEX
);
CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );  -- アプリ設定(JSON文字列)

-- v2: 放置リマインドの基準列を追加
ALTER TABLE tasks ADD COLUMN last_progress_at TEXT;  -- 「進捗」のあった日時(状態変更で更新)

-- v3: 定期タスク(繰り返し)。§4.7 参照
ALTER TABLE tasks ADD COLUMN template_id TEXT;       -- 生成元ひな型(NULL=通常タスク)。🔁表示・シリーズ追跡用
CREATE TABLE recurring_templates (
  id          TEXT PRIMARY KEY,        -- UUID
  title       TEXT NOT NULL,
  memo        TEXT NOT NULL DEFAULT '',
  importance  REAL,                    -- 実体へ継承(同じ象限に配置)
  urgency     REAL,
  freq        TEXT NOT NULL
              CHECK (freq IN ('daily','weekly','monthly','yearly')),
  interval    INTEGER NOT NULL DEFAULT 1,  -- N日/N週/Nヶ月/N年ごと
  byweekday   TEXT,                    -- weekly用: '1,3,5'(月水金。ISO 1=月〜7=日)
  bymonthday  INTEGER,                 -- monthly用: 1〜31(該当日なき月は末日丸め)
  anchor_date TEXT NOT NULL,           -- 起点日 'YYYY-MM-DD'(interval/yearly の基準)
  next_due    TEXT NOT NULL,           -- 次に生成すべき発生日 'YYYY-MM-DD'
  active      INTEGER NOT NULL DEFAULT 1,  -- 0=停止
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE template_tags (
  template_id TEXT NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, tag_id)
);
```

設計ポイント:
- importance / urgency は **0.0〜1.0の正規化座標**。象限判定は `>= 0.5`([quadrant.ts](../src/lib/quadrant.ts))。
- **座標がNULLのタスクはインボックス(未仕分け)**。マトリクスへドラッグした時点で座標が付く。
- 状態は5状態の enum: 未着手 / 進行中 / 保留 / 待ち / 完了。
- **削除は論理削除**(`deleted_at`)。30日経過分は起動時に物理削除(`purgeExpired`)。
- `due_date` / `review_at` は**日付のみ(ローカル日付)**。通知は当日の指定時刻(既定 9:00)に発火。
- `last_progress_at` は**状態変更**でのみ更新(ドラッグ・タグ編集では据置)。放置リマインドの基準。
- **定期タスク**: `recurring_templates` がひな型を保持し、発生日に通常 `tasks` を1件生成する。
  生成された実体は普通のタスク(通知・統計・アーカイブに乗る)で、`template_id` で生成元を辿れる。§4.7。
- **スキーマ管理**: `PRAGMA user_version` の差分マイグレーションを起動時に TS 側で順次適用。
  任意パスの古い DB を開く仕様のため必須。**過去のマイグレーションは書き換えない**。

**実装メモ**: `task_tags` の CASCADE は接続プール環境で確実に効かせるため、タグ/タスク削除時に
リポジトリ側で `task_tags` も明示削除する。

## 4. 画面仕様

### 4.1 メイン画面(マトリクスビュー) — 実装済み

- 縦軸: 重要度(上が高)、横軸: 緊急度(右が高)。中央に十字境界線、4象限に薄いラベル。
  - 右上「今すぐやる」/ 左上「計画する」/ 右下「さばく・任せる」/ 左下「やめる候補」
- タスクカード: タイトル + 状態色 + 期限バッジ(期限切れ=赤 / 接近=橙)。
- ドラッグで任意位置に配置 → importance/urgency を即時保存。クリックで詳細パネル(右サイド)。
- **インボックスレーン**: マトリクス下部に座標NULLのタスクを横並び。双方向ドラッグで仕分け/差し戻し。
  クイック追加用の入力欄も併設。
- **カードの重なり処理**: 保存座標は変えず描画時のみ衝突回避(黄金角スパイラル)。ホバー/選択を
  最前面に。同一箇所に4枚以上で「+N」クラスタ → クリックで吹き出し展開。

### 4.2 状態の表現(第3軸) — 実装済み

| 状態   | 既定色 | マトリクス上の扱い                                   |
| ------ | ------ | ---------------------------------------------------- |
| 未着手 | グレー | 表示                                                 |
| 進行中 | 青     | 表示(枠を強調)                                       |
| 保留   | 黄     | 表示(半透明)                                         |
| 待ち   | 紫     | 表示(半透明)                                         |
| 完了   | 緑     | 完了後 archiveAfterHours(既定24h)で非表示→アーカイブ |

- ヘッダーに状態フィルタ(トグルチップ、複数選択可)+ タグ絞り込み + 検索。
- **カードの右クリックメニュー**(状態変更 / インボックスへ戻す / 削除)または詳細パネルから状態変更。
- 補助ビューとして「状態別カンバン」タブ(列間ドラッグで状態変更)。

### 4.3 詳細パネル — 実装済み

- タイトル、**メモ(Markdown 対応: 編集/プレビュー切替、リンクは外部ブラウザで開く)**、期限日、タグ、状態。
- **再確認日(review_at)**: 状態を「保留」「待ち」にすると設定欄を表示。当日に通知(死蔵防止)。
- **繰り返し**: パネルヘッダーの🔁ボタンから、表示中のタスクをひな型化(モーダルで頻度・間隔・曜日/日付を設定、§4.7)。
- 作成日・更新日の表示、削除ボタン。
- **削除は論理削除**。削除直後に「元に戻す」付きトーストを5秒表示(undo)。

### 4.4 クイック追加 — 実装済み

- グローバルホットキー(既定 `Ctrl+Shift+Space`)で専用ウィンドウを表示。
- タイトルを入力して Enter → **インボックスに未着手で追加**(座標NULL)。後でマトリクスへ仕分け。

**実装メモ**: クイック追加ウィンドウは DB に触れず、イベントでメインへ追加を委譲(DB接続を1本に保つ)。

### 4.5 アーカイブビュー — 実装済み

- 完了から archiveAfterHours 経過したタスク一覧(完了日の新しい順、検索・タグ絞り込み可)。
- 「復元」: 進行中に戻し、元の座標でマトリクスへ再表示。
- 論理削除したタスクは「ごみ箱」タブで復元 or 完全削除(30日で自動消去)。
- 統計機能の集計対象。

### 4.6 統計ビュー — 実装済み(フェーズ3)

- 完了タスクの象限分布を 2×2 で可視化。緊急象限(今すぐやる+さばく)の割合をヘッドライン表示。
- 同画面から JSON / CSV エクスポート(論理削除分も含む全タスク・タグ、保存ダイアログ)。

### 4.7 定期タスク(繰り返し) — 実装済み(フェーズ4)

定期的に発生するタスクを毎回手で作る手間をなくす。**ひな型(`recurring_templates`)を登録すると、
発生日に通常タスクを自動生成**する方式。生成された実体はただのタスクなので、既存の通知・統計・
アーカイブ・カンバンがそのまま機能する(これらの機能は改修不要)。

**繰り返しパターン(v1)** — 基準は**固定スケジュール型**(前回完了が遅れても次回日付は固定):

| freq      | 指定                       | 例                                  |
| --------- | -------------------------- | ----------------------------------- |
| `daily`   | interval(N日ごと)          | 毎日 / 3日ごと                      |
| `weekly`  | byweekday(複数可)+ interval | 毎週月水金 / 隔週月曜               |
| `monthly` | bymonthday + interval      | 毎月1日 / 2ヶ月ごと25日             |
| `yearly`  | anchor_date の月日         | 毎年4月1日                          |

- 該当日が無い月(例: 31日指定の2月)は**その月の末日に丸める**。

**生成ロジック**(純粋関数に切り出して vitest で検証。Rust は不使用):

- **トリガ**: 起動シーケンス(§5.1)+ 日付変更監視(アーカイブ判定と同じ `uiStore.now`)。
- **まとめて1件**: アプリ未起動などで `next_due` から今日までに複数回該当しても、**実体は1件だけ**生成。
  `due_date` は直近の発生日、`next_due` は今日より後の最初の発生日へ前進(溜め込まない)。
- **重複防止**: そのひな型由来で**未完了の実体が既にある場合は生成しない**(`next_due` だけ前進)。
- 生成時は `importance`/`urgency`/タグ/メモ/タイトルをひな型から継承(=同じ象限へ配置)、
  `status='todo'`、`template_id` を設定。完了しても即時生成せず、次の `next_due` 到来時に生成する。
- **詳細パネルから既存タスクをひな型化した場合**、そのタスク自身が起点日(anchor)当日ぶんを担うため、
  最初の生成は**翌日以降の発生日から**(当日の重複生成を防ぐ)。専用ビューでの新規作成は起点日当日から。

**管理 UI**:

- 詳細パネルヘッダーの🔁ボタン → モーダルで、表示中のタスクをひな型化(§4.3)。
- **定期タスク専用ビュー**: ひな型の一覧・頻度表示・新規作成・編集・停止/再開・削除を管理。
- マトリクスのカードに繰り返しアイコン(🔁、`template_id != NULL`)。

**編集・停止・削除**:

- ひな型の編集は**次回生成以降のみ**反映(生成済みの実体は独立した通常タスクとして残る)。
- 「繰り返しを停止」= `active=0`(ひな型は残り再開可)。「シリーズ削除」= ひな型削除
  (`template_tags` は CASCADE、生成済みの実体は残す)。
- 実体単体の編集・削除・完了は既存の通常タスクと同じ。

**既存機能との整合**: 通知(due/review)・統計・アーカイブ・カンバンは改修不要。
エクスポート([export.ts](../src/lib/export.ts))の CSV に `template_id` 列を追加する。

## 5. 機能要件(実装状況)

### MVP(フェーズ1)
- [x] タスクのCRUD(削除は論理削除 + undoトースト)
- [x] マトリクス上のドラッグ配置と座標保存
- [x] カード重なりの衝突回避レイアウト
- [x] インボックスレーン(未仕分けタスクの受け皿)
- [x] 5状態の管理と色分け・フィルタ
- [x] 期限日・タグ・メモ
- [x] 完了→アーカイブの自動移動
- [x] データのローカル保存(SQLite)
- [x] スキーママイグレーション基盤(`PRAGMA user_version`)
- [x] 起動時の自動バックアップ(DBコピーを3世代保持)

### フェーズ2
- [x] グローバルホットキーでのクイック追加
- [x] システムトレイ常駐・最小化
- [x] 期限接近の通知(Windowsトースト)
- [x] アーカイブビュー(完了一覧・復元・ごみ箱)
- [x] 状態別カンバンビュー
- [x] タグでの絞り込み・検索
- [x] 密集時のクラスタ表示(「+N」まとめ)

### フェーズ3(分析系)
- [x] 第2領域(重要×非緊急)の放置タスクリマインド(`last_progress_at` 基準、既定14日)
- [x] 再確認日(review_at)による保留・待ちタスクの通知(期限通知と統合)
- [x] 完了タスクの象限分布の統計
- [x] JSON/CSVエクスポート

### フェーズ4(定期タスク)
- [x] 繰り返しひな型(`recurring_templates`)の登録・編集・停止/再開・削除(§4.7)
- [x] 発生日の自動生成(固定スケジュール型 / まとめて1件 / 未完了時は重複生成しない)
- [x] 詳細パネルの🔁ボタン(モーダル) + 定期タスク専用ビュー + カードの🔁アイコン
- [x] マイグレーション v3(`recurring_templates` / `template_tags` / `tasks.template_id`)
- [x] エクスポート CSV に `template_id` 列を追加

### 仕様外の追加実装(堅牢性・運用)
- [x] 起動時にDBが見つからない場合のリカバリダイアログ(探す/新規作成/既定に戻す)
- [x] DB open/マイグレーション失敗時のバックアップ復元画面
- [x] ウィンドウ位置・サイズの保存/復元(モニタ外クランプ)
- [x] 多重起動防止(2つ目は既存ウィンドウをフォーカス)
- [x] タグの管理(リネーム・色変更・削除)
- [x] カスタムタイトルバー / デザイントークン / 同梱フォント

## 6. 非機能要件

- 起動時間: 2秒以内 / 常駐時メモリ: 100MB以下を目標(実測 概ね 35〜55MB)。
- データはすべてローカル保存。**外部通信なし**(フォントも同梱、リンクは明示操作で外部ブラウザ)。
- DBファイルの保存先はユーザーが任意に設定可能(§7)。初期値 `%APPDATA%/com.quadrith.app/tasks.db`。

## 7. 設定機能

### 7.1 設定の保存方式(2層構成)

| 層                   | 保存先                                           | 内容                                                                                                    |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| ブートストラップ設定 | `%APPDATA%/com.quadrith.app/settings.json`(固定) | dbPath、ウィンドウ位置・サイズ、+ DBを開く前に必要な設定のミラー(backupGenerations / backupDir / theme) |
| アプリ設定           | SQLite内 `settings` テーブル                     | 色・表示・動作など(AppSettings を 1キー1JSON)                                                           |

```json
// settings.json の例
{
  "dbPath": "D:/Dropbox/tasks/tasks.db",
  "window": { "x": 100, "y": 100, "width": 1280, "height": 800 },
  "backupGenerations": 3,
  "theme": "dark"
}
```

**実装メモ**: `backupGenerations` / `backupDir` / `theme` は「DBを開く前(起動時バックアップ)」や
「DBを開けない時(復元画面・起動時のテーマ適用)」に参照するため、DB内 settings に加えて
settings.json へもミラーする(ブートストラップ層が正)。

### 7.2 設定画面の項目 — すべて実装済み

**データ**: DB保存先の表示・変更(フォルダ選択)・「場所を開く」/ 自動バックアップの保持世代数・
保存先 / 「今すぐバックアップ」(VACUUM INTO)。
**表示**: 状態ごとの色 / 完了→アーカイブまでの時間 / テーマ(ライト/ダーク/システム連動)/ タグ管理。
**動作**: クイック追加ホットキー(即時再登録)/ Windows起動時の常駐 / 閉じるボタンの挙動(終了 or
トレイへ最小化)/ 通知の発火時刻。

### 7.3 DBパス変更時の挙動 — 実装済み([db.ts](../src/lib/db.ts) `switchDbPath`)

フォルダ選択後、対象 `<dir>/tasks.db` の有無で分岐:
1. **存在しない** → 「現在のデータを移動 / 空で新規作成 / キャンセル」
2. **既存DBがある** → 「既存を開く(既定) / 上書き / キャンセル」
3. 切替前に旧DBをフラッシュ(closeDb)。失敗時は旧パスへ自動ロールバック。

### 7.4 設計上の注意(実装に反映済み)

- DBパスをDropbox等のクラウド同期フォルダに置ける(同時起動は非対応 → single-instance で防止)。
- 起動時にDBが見つからない場合はリカバリダイアログ(§5 / DbMissingDialog)。
- SQLiteの一時ファイル(-wal, -shm)も同フォルダに生成されるため、移動時は3ファイルセットで扱う。
- **自動バックアップ**: 起動時はDBを開く前(WAL非接続)なのでファイルコピー、設定画面からの手動は
  `VACUUM INTO`。世代数超過分は削除。保存先は設定の `backupDir`(既定はDBと同じフォルダの `backups/`)。
- **マイグレーション前にもバックアップを取得**し、失敗時は復元画面から旧状態へ戻して起動継続。
- 任意パスのファイル操作は appdata 限定の plugin-fs ではなく Rust の fsops コマンドで実行。

## 8. 検討済み・保留事項

- **3D表示**: 不採用。状態は色+フィルタで表現。
- **重要度・緊急度の段階入力**: 連続値ドラッグを採用。数値直接入力UIは無し。
- **サブタスク**: 対象外。
- **クラウド同期**: DBファイルをクラウドストレージ経由で同期する運用で代替(同時起動は非対応)。
- **データのインポート**: 未実装(エクスポートは実装済み)。将来 JSON 取込を検討。
- **DB内設定とミラーの将来統合**: 現状は backupGenerations/backupDir/theme を2層に持つ。整理は将来課題。
