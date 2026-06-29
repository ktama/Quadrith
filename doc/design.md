# 3軸タスク管理アプリ 設計書(v2.2 / as-built)

対応仕様書: 仕様書 v1.4
このドキュメントは**現在の実装に同期**している。v1.0 からの設計判断の変更点は各節の「実装メモ」に記す。

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────┐
│ Tauri アプリ(メインウィンドウ + トレイ常駐)     │
│                + クイック追加ウィンドウ          │
│                                             │
│  ┌─ WebView(React + TS)─────────────────┐  │
│  │  UI層: View / Component               │  │
│  │  状態層: Zustand stores               │  │
│  │  データ層: Repository(SQL発行)        │  │
│  │  ロジック層: lib/(座標/レイアウト/      │  │
│  │            リマインド/統計/エクスポート) │  │
│  └────────────┬──────────────────────────┘  │
│               │ tauri-plugin-sql / IPC       │
│  ┌────────────┴──────────────────────────┐  │
│  │ Rust側(OS連携のみ)                    │  │
│  │  - システムトレイ / single-instance     │  │
│  │  - 通知スケジューラ(scheduler.rs)      │  │
│  │  - 任意パスのファイルI/O(fsops.rs)     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
        │                       │
   settings.json            tasks.db(SQLite)
  (%APPDATA%固定)           (ユーザー指定パス)
```

**設計方針: ロジックはTS側に寄せ、RustはOS連携のみ**
- CRUD・バックアップ・DBパス切替・**スキーママイグレーション**は、すべてTS側で実行する。
- Rustが担うのは: システムトレイ、グローバルショートカット登録、Windowsトースト通知の発火、
  起動時自動実行(autostart)の登録、**任意パスのファイルI/O**(fsops コマンド)、多重起動防止。

**実装メモ(v1.0 からの変更)**
- **マイグレーションは Rust ではなく TS 側**([src/lib/migrations.ts](../src/lib/migrations.ts))。
  tauri-plugin-sql の Rust 側マイグレーションは接続文字列単位の静的登録で、ユーザーが任意に
  変更できる DB パス(仕様 §6/§7)に追従できないため。`PRAGMA user_version` を TS で管理する。
- **ファイルI/Oは Rust の fsops コマンドに集約**([src-tauri/src/fsops.rs](../src-tauri/src/fsops.rs))。
  DB は Dropbox 等の任意パス(仕様 §7.4)に置けるが、tauri-plugin-fs はスコープが appdata 等に
  限定されるため、バックアップ・DBパス切替・エクスポートのファイル操作は `std::fs` で行う。
- グローバルショートカットの登録・「閉じる→トレイ」・autostart の有効化は **TS から制御**する
  (ロジックを TS に寄せる方針。Rust はプラグインを登録するだけ)。

### 使用プラグイン

| プラグイン                   | 用途                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| tauri-plugin-sql (sqlite)    | SQLite 接続(マイグレーションは TS 側で実行)                         |
| tauri-plugin-store           | settings.json の読み書き                                            |
| tauri-plugin-fs              | appdata 配下のディレクトリ確認等(限定利用)                          |
| tauri-plugin-dialog          | DBパス/バックアップ先のフォルダ選択・エクスポートの保存ダイアログ   |
| tauri-plugin-global-shortcut | クイック追加ホットキー                                              |
| tauri-plugin-notification    | 期限・再確認日の通知                                                |
| tauri-plugin-opener          | DBフォルダをエクスプローラで開く / メモ内リンクを外部ブラウザで開く |
| tauri-plugin-autostart       | Windows 起動時の常駐                                                |
| tauri-plugin-single-instance | 多重起動防止(2つ目は既存ウィンドウをフォーカス)                     |

## 2. ディレクトリ構成(実体)

```
src/                              # フロントエンド
├── main.tsx                      # フォント読込 + ウィンドウラベルで main/quickadd を振り分け
├── App.tsx                       # 起動シーケンス・ビュー切替・カスタムタイトルバー
├── index.css                     # デザイントークン(@theme)・Markdown/スクロールバー
├── types/
│   └── models.ts                 # Task, Tag, Status, EffortSize, AppSettings, WeeklyReviewSetting, BootstrapSettings, WindowState
├── lib/
│   ├── db.ts                     # DB接続マネージャ(load/close/切替/存在チェック/復元)
│   ├── migrations.ts             # スキーママイグレーション(user_version, TS実行)
│   ├── backup.ts                 # 起動時コピー + 手動 VACUUM INTO + 世代管理 + 復元
│   ├── fsops.ts                  # 任意パスのファイルI/O(Rust fsops コマンドのラッパ)
│   ├── coords.ts                 # 正規化座標 ↔ ピクセル変換
│   ├── layout.ts                 # 衝突回避レイアウト + クラスタリング(computeMatrixLayout)
│   ├── quadrant.ts               # 象限判定(>=0.5)
│   ├── archive.ts                # アーカイブ判定(表示時計算)
│   ├── taskFilters.ts            # 状態/タグ/検索の共通フィルタ
│   ├── reminders.ts              # 期限/再確認日/放置(Q2)リマインドの統合
│   ├── stats.ts                  # 象限分布統計 + 深掘り指標(週次スループット/遵守率など, §12)
│   ├── effort.ts                 # 工数(Tシャツサイズ)↔分の換算(純粋関数, §12)
│   ├── today.ts                  # Today のグループ分け/並び/繰り越し/容量集計(純粋関数, §12)
│   ├── review.ts                 # 週次レビューの各ステップ抽出/リマインド要否(純粋関数, §12)
│   ├── recurrence.ts             # 定期タスク: 次回発生日の計算・生成判定(純粋関数)
│   ├── export.ts                 # JSON/CSV 整形(純粋関数)
│   ├── exportFile.ts             # 保存ダイアログ + 書込
│   ├── redmineExport.ts          # Redmine 取込用 CSV の対象選定 + 整形(純粋関数, §11)
│   ├── notifications.ts          # 通知予定を Rust スケジューラへ登録
│   ├── desktop.ts                # ホットキー再登録 / 閉じる→トレイ / autostart / reveal
│   ├── theme.ts                  # テーマ適用(html.dark + color-scheme + system監視)
│   ├── tagColors.ts              # タグ色のコントラスト判定・既定色(純粋関数)
│   ├── windowState.ts            # ウィンドウ位置・サイズの保存/復元
│   ├── windowClamp.ts            # 復元位置をモニタ内にクランプ(純粋関数)
│   ├── switchPlan.ts             # DBパス切替モード→ファイル操作の決定(純粋関数)
│   ├── commandPalette.ts         # コマンドパレットの絞り込み/並べ替え(純粋関数)
│   ├── selection.ts              # 複数選択集合のトグル(純粋関数)
│   ├── result.ts                 # Result<T, AppError>
│   └── dragTargets.ts            # ドロップ先(マトリクス/インボックス)のDOM登録
├── repositories/
│   ├── taskRepo.ts               # tasks テーブルのCRUD
│   ├── templateRepo.ts           # recurring_templates / template_tags のCRUD
│   ├── tagRepo.ts                # tags / task_tags(作成/改名/色/削除/付替)
│   └── settingsRepo.ts           # DB内 settings テーブル
├── stores/
│   ├── taskStore.ts              # タスク一覧 + 操作(undo, stripTag 含む)
│   ├── templateStore.ts          # 繰り返しひな型一覧 + 操作 + 発生分の生成
│   ├── tagStore.ts               # タグ一覧 + 操作
│   ├── settingsStore.ts          # 2層設定の統合窓口 + DBパス切替 + 手動バックアップ
│   ├── uiStore.ts                # ビュー/選択/フィルタ/検索/ドラッグ/コンテキストメニュー
│   └── toastStore.ts             # トースト(undo ボタン含む)
├── components/
│   ├── matrix/{MatrixView, TaskCard, ClusterBadge, InboxLane}.tsx
│   ├── panel/{DetailPanel, MemoField}.tsx     # MemoField は Markdown 編集/プレビュー
│   ├── kanban/KanbanView.tsx
│   ├── recurring/{RecurringView, RecurrenceForm}.tsx  # ひな型一覧・新規/編集モーダル・頻度フォーム
│   ├── today/TodayView.tsx                       # Today(2グループ + 容量メーター, §12)
│   ├── review/ReviewWizard.tsx                   # 週次レビュー(6ステップ)+ ReviewBanner(§12)
│   ├── archive/ArchiveView.tsx
│   ├── stats/StatsView.tsx
│   ├── settings/{SettingsView, TagManager}.tsx
│   ├── QuickAddPopup.tsx                        # quickadd ウィンドウ(DBに触れない)
│   └── common/{Toast, FilterChips, HeaderControls, Reminders, CommandPalette, BulkActionBar,
│               ColorPicker, StartupDialogs, CardContextMenu, WindowControls, ResizeHandles}.tsx
└── hooks/
    └── useDragCard.ts            # pointer イベントによるドラッグ(undo は store 側)

src-tauri/src/                    # Rust側
├── main.rs                       # エントリ(lib::run 呼び出し)
├── lib.rs                        # プラグイン登録・トレイ・single-instance・setup
├── scheduler.rs                  # 通知スケジューラ(30秒間隔の tokio タスク)
└── fsops.rs                      # 任意パスのファイルI/O コマンド
src-tauri/capabilities/default.json  # 権限(main/quickadd)
src-tauri/tauri.conf.json            # main は decorations:false(カスタムタイトルバー)
```

**実装メモ**: 設計 v1.0 の `src-tauri/src/migrations.rs`・`hooks/useUndoToast.ts` は不採用。
マイグレーションは TS、Undo は taskStore + toastStore で実装。

## 3. 型定義(TS, [models.ts](../src/types/models.ts))

```typescript
export type Status = 'todo' | 'doing' | 'pending' | 'waiting' | 'done';

export interface Task {
  id: string;
  title: string;
  memo: string;                // Markdown 可
  importance: number | null;   // null = インボックス
  urgency: number | null;      // importance と常に同時に null
  status: Status;
  dueDate: string | null;      // 'YYYY-MM-DD'
  reviewAt: string | null;     // 'YYYY-MM-DD'
  createdAt: string;           // ISO 8601 (UTC)
  updatedAt: string;
  lastProgressAt: string;      // 状態変更など「進捗」の日時(放置リマインド基準, migration v2)
  completedAt: string | null;
  deletedAt: string | null;
  templateId: string | null;   // 生成元の繰り返しひな型(null=通常タスク, migration v3)
  category: string | null;     // 任意カテゴリ(Redmine エクスポート用, migration v4, §4.8)
  effortSize: EffortSize | null; // 工数(Tシャツサイズ, migration v5, §4.10/§12)。null=未見積り
  todayDate: string | null;    // 「今日やる」予定日 'YYYY-MM-DD'(migration v6, §4.9/§12)
  todayOrder: number | null;   // グループB(選択)の手動並び(migration v6)
  tagIds: string[];            // JOIN結果を集約して保持
}

export interface Tag { id: string; name: string; color: string; }

// 定期タスクのひな型(migration v3)。発生日に Task を生成する。仕様 §4.7
export type RecurFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface RecurringTemplate {
  id: string;
  title: string;
  memo: string;
  importance: number | null;   // 実体へ継承(importance と urgency は常に同時に null)
  urgency: number | null;
  freq: RecurFreq;
  interval: number;            // N日/N週/Nヶ月/N年ごと(>=1)
  byweekday: number[];         // weekly用: ISO 1=月〜7=日(複数可)
  bymonthday: number | null;   // monthly用: 1〜31(該当日なき月は末日丸め)
  anchorDate: string;          // 'YYYY-MM-DD' 起点日
  nextDue: string;             // 'YYYY-MM-DD' 次に生成すべき発生日
  active: boolean;             // false=停止
  createdAt: string;
  updatedAt: string;
  category: string | null;     // 実体へ継承するカテゴリ(migration v4, §4.8)
  effortSize: EffortSize | null; // 実体へ継承する工数(migration v5, §4.10/§12)
  tagIds: string[];
}

// settings.json(ブートストラップ層)。DB を開く前/開けない時にも必要な値を持つ。
export interface WindowState { x: number; y: number; width: number; height: number; }
export interface BootstrapSettings {
  dbPath: string;
  window?: WindowState;
  // DB を開く前に必要なため AppSettings からミラーされるキー:
  //   backupGenerations, backupDir, theme
}

// DB内 settings テーブル(アプリ設定層)。AppSettings を 1キー1JSON で保存。
export interface AppSettings {
  statusColors: Record<Status, string>;
  archiveAfterHours: number;        // 既定 24
  theme: 'light' | 'dark' | 'system';
  quickAddHotkey: string;           // 既定 'Ctrl+Shift+Space'
  autoStart: boolean;               // 既定 false
  closeToTray: boolean;             // 既定 true
  notifyTime: string;               // 'HH:mm' 既定 '09:00'
  backupGenerations: number;        // 既定 3
  backupDir: string | null;         // null = DBと同じフォルダ/backups
  categories: string[];             // カテゴリ候補(§4.8)
  redmineExport: RedmineMapping;    // statusMap/priorityMap/forceNewStatus/includeStartDate/includeCategory(§4.8/§11)
  effortMinutes: Record<EffortSize, number>; // 工数サイズ→分(§4.10/§12)。既定 15/60/180/480
  dailyCapacityMinutes: number;     // Today 容量メーターの分母(§4.9)。既定 360
  todayIncludeUrgentQuadrant: boolean; // Today に Q1 を自動取り込み(§4.9)。既定 true
  weekStart: 'monday' | 'sunday';   // 統計の週起点(§4.11)。既定 'monday'
  weeklyReview: WeeklyReviewSetting; // 毎週リマインド(enabled/weekday/time, §4.11)。既定オフ
  lastReviewAt: string | null;      // 前回レビュー日時 ISO(記録のみ, §4.11)
}
```

**実装メモ**: `backupGenerations` / `backupDir` / `theme` は「DB を開く前(起動時バックアップ)」
「DB を開けない時(復元画面・FOUC防止)」に参照するため、DB 内 settings に加えて settings.json
へもミラーする(ブートストラップ層が正)。書込は settingsStore.update が両層へ振り分ける。

## 4. モジュール設計

### 4.1 db.ts(接続マネージャ, [db.ts](../src/lib/db.ts))

唯一のDB接続保持者。他モジュールは必ず getDb() 経由でアクセスする。

```typescript
getDb(): Promise<Database>            // 失敗した open はキャッシュしない(復元・再試行のため)
getDbPath(): string | null            // 現在開いているパス(UI表示用)
getStoredDbPath(): Promise<string>    // settings.json のパス(未接続でも参照可)
checkDbAvailability(): Promise<{status:'ready'} | {status:'missing', path}>  // §7.4
recoverDbPath(mode, locatedPath?)     // 'locate' | 'createNew' | 'resetDefault'
switchDbPath(newPath, mode): Promise<Result>  // 'move'|'createNew'|'openExisting'|'overwrite'
closeDb(): Promise<void>              // PRAGMA wal_checkpoint(TRUNCATE) → close
getBackupDir(): Promise<string>       // backupDir ?? <DBフォルダ>/backups
persistBackupGenerations / persistBackupDir / persistThemePref / readThemePref
```

`switchDbPath` の内部手順(仕様書 §7.3。モード別のファイル操作は `planSwitch` が決定):
1. `closeDb()`(チェックポイントで -wal/-shm を単一ファイル化)
2. `planSwitch(mode)` に従いファイル操作(overwrite: 既存削除→コピー / move: コピー)
3. 新パスで `Database.load()` → `applyMigrations`
4. 失敗時: 旧パスで再 load し、エラーを返す(自動ロールバック)
5. 成功時: settings.json の dbPath を更新。move のときのみ旧3ファイルを削除

### 4.2 taskRepo.ts([taskRepo.ts](../src/repositories/taskRepo.ts))

```typescript
findAllAlive(): Promise<Result<Task[]>>   // deleted_at IS NULL(アーカイブ済み含む)
findAll(): Promise<Result<Task[]>>        // 論理削除分も含む全件(エクスポート用)
findTrashed(): Promise<Result<Task[]>>    // deleted_at IS NOT NULL
create(input): Promise<Result<Task>>      // 座標null(インボックス)で作成
update(id, patch, updatedAt?)             // updatedAt は呼び出し側が渡す(楽観更新と一致)
updatePosition(id, imp, urg, updatedAt?)  // ドラッグ確定時専用。lastProgressAt は据置
softDelete(id, now?) / restore(id, updatedAt?) / purge(id)
purgeExpired(): Promise<Result<number>>   // deleted_at + 30日経過を物理削除(起動時)
```

- 一覧取得は `group_concat` で task_tags を集約し、TS側で tagIds に展開。
- アクティブ / アーカイブ / インボックスの振り分けは **取得後に表示時計算**(findActive/findArchived
  という別クエリは持たない)。
- `updatePosition` はドラッグ終了(pointerup)時のみ発行。配置変更は「進捗」ではないため
  `last_progress_at` を更新しない。
- `updatedAt` はストアの楽観更新値と DB を一致させるため、呼び出し側のタイムスタンプを受け取る。

### 4.3 layout.ts(衝突回避・クラスタリング, [layout.ts](../src/lib/layout.ts))

`computeMatrixLayout(items, w, h)` → `{ cards: {id,x,y}[], clusters: {id,x,y,taskIds}[] }`

1. 正規化座標をピクセルへ変換
2. **クラスタ判定**: カード中心間距離 < カード幅×0.5 を Union-Find でグループ化。サイズ ≥ 4 で
   「+N」バッジに集約([ClusterBadge.tsx](../src/components/matrix/ClusterBadge.tsx))
3. **重なり解消**: id昇順に確定配置、交差する場合は黄金角スパイラルで最近傍の空きへ(保存座標不変)
4. 決定的(再描画でカードが踊らない)。`useMemo` で計算、依存は座標リストとコンテナサイズのみ

### 4.4 taskStore.ts(Zustand, [taskStore.ts](../src/stores/taskStore.ts))

```typescript
state: { tasks: Task[]; trashed: Task[]; loading: boolean; lastRemoved: Task | null }
actions:
  load()                       // purgeExpired + findAllAlive
  add(title)                   // クイック追加(インボックスへ)
  patch(id, partial)           // 楽観更新 → repo.update(同一timestamp)、失敗時ロールバック
  moveTo(id, imp|null, urg|null)
  setStatus(id, status)        // status + completedAt + lastProgressAt を更新(=進捗)
  setTags(id, tagIds)
  remove(id) / undoRemove()    // softDelete + undoトースト / restore
  loadTrashed() / restoreFromTrash(id) / purgeForever(id)
  stripTag(tagId)              // タグ削除時にメモリ上の全タスクから除去
```

- 書込はすべて楽観更新(UI即時反映 → 非同期でDB → 失敗時に巻き戻し+トースト)。

### 4.5 settingsStore.ts / tagStore.ts

- **settingsStore**: `init()` で AppSettings(DB)+ dbPath(settings.json)を読み、テーマを適用。
  `update(key, value)` は DB(settingsRepo)へ保存し、theme/backupGenerations/backupDir は
  settings.json へもミラー。`changeDbPath()` は db.switchDbPath 後に全ストアを再読込。
  `runBackupNow()` は getBackupDir + backupNow(VACUUM INTO)。
- **tagStore**: `create/rename/recolor/remove`。remove 時は taskStore.stripTag とフィルタ解除も行う。

### 4.6 通知スケジューラ([scheduler.rs](../src-tauri/src/scheduler.rs) / [notifications.ts](../src/lib/notifications.ts))

- **Rust 側は DB を読まない**。フロントが起動時・タスク変更時(1秒デバウンス)・日付変更時に
  `schedule_notifications(notifyTime, titles, alreadyNotified)` で「今日リマインドすべきタスク名」を登録。
- 対象は**日付ベースのリマインド = 期限当日/超過 + 再確認日到来**(`notifiableReminders`)。放置(stale)は
  アプリ内表示のみで通知には載せない。
- Rust は **30秒間隔**の tokio タスクで、notifyTime を過ぎたら1回だけトーストを発火し、`due-notified`
  イベントをフロントへ返す。フロントが DB の `lastNotifiedDate` を更新し同日二重通知(再起動含む)を防ぐ。

**実装メモ**: 設計 v1.0 は「1分間隔」だったが、発火遅延を抑えるため **30秒間隔**に変更。

## 5. 主要処理フロー

### 5.1 起動シーケンス([App.tsx](../src/App.tsx))

```
1. Rust:  プラグイン初期化、トレイ・single-instance 登録
2. TS:    テーマを settings.json のキャッシュから先行適用(FOUC防止)
3. TS:    ウィンドウ位置・サイズ復元(モニタ外なら中央へクランプ)
4. TS:    checkDbAvailability(保存パスのファイル存在チェック)
          └ 無い → DbMissingDialog「探す/この場所に新規作成/既定に戻す」(仕様 §7.4)
5. TS:    settingsStore.init() → getDb()
            ├ メインウィンドウのみ: 起動時バックアップ(WAL非接続なのでファイルコピー)
            └ Database.load() → applyMigrations(user_version 差分適用)
          └ 失敗 → DbErrorScreen(backups 一覧から復元 → 再試行)(仕様 §5.1-5)
6. TS:    taskStore.load(purgeExpired → findAllAlive) / tagStore.load
7. TS:    OS連携の登録(ホットキー/autostart/閉じる→トレイ/通知リスナ/ウィンドウ監視)
8. TS:    当日の通知予定を Rust へ登録
```

※ 補足: 起動時バックアップは load 前(WAL 非接続)なのでファイルコピーで整合する。設定画面からの
手動バックアップ(load 後)は `VACUUM INTO` を使う。世代数・保存先は settings.json から解決する。

### 5.2 ドラッグによる配置([useDragCard.ts](../src/hooks/useDragCard.ts))

```
pointerdown(カード) → uiStore.dragging = id
pointermove → ローカル座標を更新(DB書込なし、オーバーレイ描画)
pointerup
 ├ マトリクス内 → px→正規化変換 → taskStore.moveTo(id, imp, urg)
 ├ インボックスレーン上 → moveTo(id, null, null)
 └ 移動量が閾値(5px)未満 → クリック扱い → 詳細パネルを開く
```

### 5.3 削除とUndo / 5.4 アーカイブ判定

- 削除: 楽観的にUI除去 → softDelete → Toast「削除しました [元に戻す]」(5s)。タイムアウトで放置
  (30日後に purgeExpired で物理削除)。
- アーカイブ: DBにフラグを持たず**表示時に計算**(`status='done' AND completed_at <= now - archiveAfterHours`)。
  1分ごとに uiStore.now を更新して再評価([archive.ts](../src/lib/archive.ts))。

### 5.5 クイック追加(2ウィンドウ構成)

- `quickadd` ウィンドウ(decorations:false, 既定非表示)。ホットキーで表示。
- **DB に触れず**、Enter で `quick-add-submit` イベントを emit → メインウィンドウが受信して
  taskStore.add で作成(同一DBへ2本目の接続を張らないため)。

### 5.6 リマインド([reminders.ts](../src/lib/reminders.ts))

3種を1リストに統合: `due`(期限当日/超過) / `review`(再確認日到来かつ保留・待ち) /
`stale`(第2領域=重要×非緊急を `last_progress_at` 基準で14日以上放置)。
ヘッダーのベル([Reminders.tsx](../src/components/common/Reminders.tsx))で一覧表示、通知は due+review のみ。

### 5.7 定期タスクの生成([recurrence.ts](../src/lib/recurrence.ts) / templateStore)

仕様 §4.7。**Rust は不使用**(ロジックは TS に寄せる方針)。アーカイブ判定(§5.4)と同じく
起動時と日付変更(`uiStore.now`)を契機に評価する。

```
契機: 起動シーケンス(§5.1 の load 後)/ 日付変更監視
templateStore.generateDue(today):
  for t of 全 active テンプレート:
    if t.nextDue > today: continue                 // まだ発生していない
    if 当該テンプレ由来の未完了タスクが存在: 生成せず nextDue だけ前進  // 溜め込み防止
    else:
      occ = occurrencesUpTo(t, today)              // recurrence.ts(純粋関数)
      taskStore で 1 件生成(dueDate = occ の直近, 座標/タグ/メモ/title を継承,
                            status='todo', templateId=t.id)   // まとめて1件
    t.nextDue = nextOccurrenceAfter(t, today)       // recurrence.ts(純粋関数)
    templateRepo.update(t)
```

純粋関数(vitest 対象):
- `nextOccurrenceAfter(template, date)`: freq/interval/byweekday/bymonthday と anchorDate から
  `date` より後の最初の発生日を返す。monthly は該当日なき月を末日に丸める。
- `occurrencesUpTo(template, today)`: `nextDue`〜`today` の発生回数(>=1 の判定と直近日に使用)。

生成された実体は通常タスクなので、通知・統計・アーカイブ・カンバンは既存のまま機能する。
完了しても即時に次回を作らず、次の `nextDue` 到来時に上記フローで生成する。
ひな型作成直後にも `generateDue` を1回呼び、発生日を過ぎているものは即座に実体化する。
詳細パネルヘッダーの🔁ボタン(モーダル)から既存タスクをひな型化する場合は `skipAnchorOccurrence`
で初期 `nextDue` を anchor の翌日以降に置き、当日タスクとの二重生成を避ける。

## 6. マイグレーション設計([migrations.ts](../src/lib/migrations.ts))

```typescript
const MIGRATIONS = [
  { version: 1, description: 'initial schema',  statements: [...] },
  { version: 2, description: 'add last_progress_at', statements: [
      `ALTER TABLE tasks ADD COLUMN last_progress_at TEXT`,
      `UPDATE tasks SET last_progress_at = updated_at WHERE last_progress_at IS NULL`,
  ]},
  // v3: 定期タスク。recurring_templates / template_tags / tasks.template_id を追加
  { version: 3, description: 'add recurring task templates', statements: [/* 仕様 §3 v3 参照 */] },
  // v4: Redmine エクスポート用カテゴリ。tasks.category / recurring_templates.category を追加(§4.8)
  { version: 4, description: 'add category for Redmine export', statements: [
      `ALTER TABLE tasks ADD COLUMN category TEXT`,
      `ALTER TABLE recurring_templates ADD COLUMN category TEXT`,
  ]},
  // v5: 工数(Tシャツサイズ)。tasks/recurring_templates に effort_size を追加(§4.10 / §12)
  { version: 5, description: 'add effort size', statements: [/* effort_size + CHECK */] },
  // v6: Today(今日やる)。tasks.today_date / today_order + index を追加(§4.9 / §12)
  { version: 6, description: 'add today planning', statements: [/* today_date, today_order, idx */] },
];
// applyMigrations: PRAGMA user_version を読み、未適用分のみ順次 execute → user_version 更新
```

- ルール: **過去のマイグレーションは絶対に書き換えない**(任意パスの古いDBが順次適用に依存)。
- 変更はすべて version を増やして追記する。

## 7. エラーハンドリング方針

| 種別                              | 方針                                     | 実装                      |
| --------------------------------- | ---------------------------------------- | ------------------------- |
| DB書込失敗                        | 楽観更新をロールバックし、エラートースト | 各 store の action        |
| DBファイル未検出(起動時)          | 探す/新規作成/既定に戻す ダイアログ      | DbMissingDialog           |
| DB破損・open/マイグレーション失敗 | バックアップ一覧から復元 → 再試行        | DbErrorScreen             |
| DBパス切替失敗                    | 旧パスへ自動ロールバック + 原因表示      | db.switchDbPath           |
| 通知・トレイ等のOS連携失敗        | 機能を無効化して継続(アプリは落とさない) | desktop.ts / scheduler.rs |

- Repository / db / desktop 層は例外を throw せず `Result<T, AppError>` を返す
  ([result.ts](../src/lib/result.ts))。`AppError = { code, message, cause }`。

## 8. テスト方針([*.test.ts](../src/lib/), vitest)

- **純粋関数の単体**(149テスト): coords / layout(決定性・クラスタ) / quadrant / reminders /
  stats(象限分布 + 週次指標) / effort / today(グループ/繰り越し/容量) / review(抽出/リマインド) /
  export(CSV整形) / redmineExport / recurrence / tagColors / commandPalette / selection /
  switchPlan(切替モードの分岐) / windowClamp(モニタ外復元) / result。
- **マイグレーションの結合**: [migrations.test.ts](../src/lib/migrations.test.ts) が **better-sqlite3**
  のインメモリDBに MIGRATIONS を適用し、スキーマ・CHECK制約(status / effort_size)・`group_concat` タグ集約を検証。
- **手動確認項目**: 枠なしウィンドウのドラッグ/リサイズ/スナップ、WAL を残した状態の
  パス移動、マイグレーション失敗→復元、トレイ常駐中のホットキー、通知の発火。
- repo / store / db.switchDbPath の live 結合テストは Tauri ランタイム依存のため未整備
  (分岐ロジックを switchPlan 等の純粋関数に切り出して担保)。

## 9. UI / デザインシステム([index.css](../src/index.css))

- **方向性**: 高密度プロツール(Linear 風)、インディゴアクセント、ダーク基調も映える。
- **トークン**: Tailwind v4 `@theme` で slate/blue ランプ・影・フォントを一括再定義。各
  コンポーネントは既存の Tailwind ユーティリティのまま、配色が全体で切り替わる。ステータス
  5色はユーザー設定値なので独立。
- **フォント**: Inter(可変)+ Noto Sans JP を `@fontsource` でオフライン同梱(仕様 §6)。
- **テーマ**: クラス方式(`html.dark`)+ `color-scheme`。system はメディアクエリ監視([theme.ts](../src/lib/theme.ts))。
- **カスタムタイトルバー**: メインは `decorations:false`。ヘッダーが最小化/最大化/閉じるを兼ね
  ([WindowControls.tsx](../src/components/common/WindowControls.tsx))、`data-tauri-drag-region` で移動、
  [ResizeHandles.tsx](../src/components/common/ResizeHandles.tsx) で縁リサイズを保証。閉じるは
  closeToTray 判定を通る。
- **グラス**: ポップオーバー/コンテキストメニュー/モーダル/トーストに `backdrop-blur`。
- **アプリアイコン**: ヘッダーロゴ(2×2象限モチーフ)と同一デザイン([src-tauri/icons/](../src-tauri/icons/))。

## 10. 実装フェーズ実績(履歴)

- フェーズ1(MVP): CRUD+Undo / ドラッグ配置 / 衝突回避 / インボックス / 5状態+フィルタ /
  期限・タグ・メモ / アーカイブ自動移動 / SQLite / マイグレーション基盤 / 起動時バックアップ。
- フェーズ2: ホットキー / トレイ / 通知 / アーカイブ・ごみ箱 / カンバン / 検索・タグ絞り込み /
  クラスタ(+N)。
- フェーズ3: 放置リマインド / 再確認日通知(統合) / 象限統計 / JSON・CSV エクスポート。
- 設定機能(§7): 設定画面全項目 / DBパス切替4モード+ロールバック。
- 堅牢性: DB未検出ダイアログ / バックアップ復元 / ウィンドウ位置記憶 / 右クリックメニュー /
  多重起動防止 / 任意パス対応のファイルI/O。
- 仕上げ: メモ Markdown / タグ管理 / 放置リマインドの `last_progress_at` 基準化 / デザイン刷新
  (トークン・フォント・カスタムタイトルバー・グラス)。
- フェーズ4(定期タスク): 繰り返しひな型(固定スケジュール型・毎日/週/月/年)/ 発生日の自動生成
  (まとめて1件・未完了時は重複生成しない)/ 専用ビュー・詳細パネルの🔁モーダル・カードの🔁(§4.7 / §5.7)。
- フェーズ5(Redmine エクスポート): 期間指定の取込用 CSV 出力(未完了 + 繰り返し展開)/ ステータス・優先度
  マッピング設定 / トラッカー名(settings.json) / カテゴリ(migration v4・タスク割当)・開始日の任意列(§4.8 / §11)。
- フェーズ6(Today / 工数 / 週次レビュー): Today ビュー(2グループ + 理由バッジ + 容量メーター・繰り越し)/
  工数 Tシャツサイズ(migration v5・バッジ表示・ひな型継承)/ 統計の深化(週次指標 8 種)/ 操作できる
  週次レビュー・ウィザード(6 ステップ)+ アプリ内リマインド。migration v6(今日やる)。純粋関数は
  effort / today / stats(追記)/ review に集約し vitest で検証(§12)。

## 11. Redmine エクスポート(実装済み)

仕様 §4.8。フェーズ A(出力)・B(マッピング設定 UI)・C(任意フィールド: 開始日/カテゴリ)実装済み。既存のエクスポート基盤(§4 の
[export.ts](../src/lib/export.ts) 純粋関数 + [exportFile.ts](../src/lib/exportFile.ts) 保存フロー +
[StatsView.tsx](../src/components/stats/StatsView.tsx) UI)を踏襲し、別系統の整形関数を足す。
**ロジックは純粋関数に切り出して vitest で検証**(設計方針 §1 / CLAUDE.md)。

### 11.1 モジュール構成

```
src/lib/redmineExport.ts        # 純粋関数: 対象選定 + 行展開 + CSV整形(新規)
src/lib/exportFile.ts           # 期間引数つき保存関数を追加(既存に追記)
src/components/stats/StatsView.tsx  # 「Redmine CSV」ボタン + 期間入力(既存に追記)
src/types/models.ts             # AppSettings.redmineExport(フェーズB)
```

### 11.2 純粋関数(redmineExport.ts)

```typescript
// マッピング(設定値, models.ts の RedmineMapping)+ トラッカー(settings.json)
export interface RedmineExportConfig extends RedmineMapping {  // RedmineMapping = statusMap/priorityMap/forceNewStatus
  tracker: string;                                  // settings.json の redmineTracker(既定 'タスク')
}
export interface Period { from: string; to: string; }  // 'YYYY-MM-DD'(両端含む)

// 出力対象の行を決定する(実体優先 + ひな型の欠損補完)。
selectRedmineRows(
  tasks: Task[], templates: RecurringTemplate[], period: Period,
): RedmineRow[];

// RedmineRow[] を CSV 文字列へ(BOM は付けない。付与は exportFile 側)。
buildRedmineCsv(rows: RedmineRow[], tags: Tag[], config: RedmineExportConfig): string;
```

`selectRedmineRows` の手順:

```
1. 未完了タスク(status≠done かつ deletedAt=null)に絞る
2. 通常タスク(templateId=null): dueDate が [from,to] 内のものを行化
3. 繰り返し実体(templateId≠null): dueDate が [from,to] 内のものを行化し、
   (templateId, dueDate) を「実体あり発生日」集合へ記録
4. active な各ひな型: nextOnOrAfter を from から繰り返し呼んで [from,to] 内の発生日を列挙し、
   3 の集合に無い発生日だけ行化(title/memo/座標/タグをひな型から継承, status='todo')
```

- 期間内発生日の列挙は [recurrence.ts](../src/lib/recurrence.ts) の `nextOnOrAfter(t, cursor)` を
  `cursor = from → 返値+1日` で回し、返値が `to` を超えたら停止(`addDaysStr` で前進)。
- 優先度は `quadrantOf`([quadrant.ts](../src/lib/quadrant.ts))、座標 null は `'inbox'` キー。
- 説明はタグありのとき末尾へ `\n\n---\nタグ: A, B` を補記。CSV エスケープは export.ts の
  `csvEscape`(`"` 囲み・`""`)を共用。ヘッダーは日本語列名・改行は CRLF。

### 11.3 保存フロー(exportFile.ts)

`exportRedmineCsv(period)`: トラッカーを settings.json(`redmineTracker`、既定 'タスク')から読み、
マッピング既定値(フェーズ A は定数)と合わせて `RedmineExportConfig` を構成 →
taskRepo.findAll / templateRepo.findAll / tagRepo.findAll → `selectRedmineRows` → 0 件なら警告で中断 →
`buildRedmineCsv` → 先頭に BOM(`﻿`)→ 保存ダイアログ(`quadrith_redmine_YYYY-MM-DD.csv`)→
`saveTextFile`(Rust fsops)。層は throw せず `Result<string | null>`(キャンセルは `ok(null)`)。

### 11.4 設定

- **トラッカー名は settings.json(ブートストラップ層)に `redmineTracker` として持たせ、ユーザーが
  直接編集可能**(既定 'タスク')。Redmine 環境ごとに異なり、不一致だとインポート全体が失敗するため
  設定ファイルで早期に変更可能とする。読み書きは [db.ts](../src/lib/db.ts) の
  `readRedmineTracker` / `persistRedmineTracker`(theme 等と同じ settings.json 経由)。
  `BootstrapSettings` に `redmineTracker?: string` を追加。設定画面([SettingsView.tsx](../src/components/settings/SettingsView.tsx))
  からも編集できる(値は settings.json が正)。
- **ステータス/優先度マッピング + 「全て新規にする」トグル**は `AppSettings.redmineExport`
  (`RedmineMapping` = statusMap / priorityMap / forceNewStatus)として **DB 内 settings に 1 キー JSON** で
  保持。DB を開く前には使わないので settings.json ミラー不要、列追加もないのでマイグレーション不要。
  型・既定値(`RedmineMapping` / `DEFAULT_REDMINE_MAPPING`)は [models.ts](../src/types/models.ts) に定義し
  (型循環を避けるため redmineExport.ts から参照)、`DEFAULT_APP_SETTINGS.redmineExport` に組み込む。
  旧 DB・将来の状態/象限追加に備え、[settingsRepo.ts](../src/repositories/settingsRepo.ts) で
  statusColors と同様にネストも既定値とディープマージする。設定画面でマッピングを編集。
- `forceNewStatus` は Redmine ワークフロー(新規チケットに「新規」以外を設定不可な環境)対策で、
  有効時は `buildRedmineCsv` が全行を `statusMap.todo` で出力する。

### 11.6 任意フィールド(フェーズ C: 開始日・カテゴリ)

- **カテゴリはタスクの新フィールド**(`Task.category` / `RecurringTemplate.category`, migration v4)。
  候補は `AppSettings.categories: string[]` で管理([SettingsView](../src/components/settings/SettingsView.tsx))。
  割当 UI は詳細パネル([DetailPanel](../src/components/panel/DetailPanel.tsx))の `<select>`、
  繰り返しは [RecurringView](../src/components/recurring/RecurringView.tsx) のフォーム。候補から外れた
  既存値も選択肢に残す。ひな型のカテゴリは生成実体・エクスポート展開行へ継承する(importance/tags と同様)。
- **開始日**は `createdAt` の日付(`isoDate` = ISO 先頭10文字)。ひな型展開行は発生分に作成日がないため空。
- `buildRedmineCsv` は `includeStartDate` / `includeCategory` に応じて「開始日」「カテゴリ」列を
  `期日` の後ろへ動的に付加する(Redmine 取込は列位置非依存だが日本語ヘッダーで対応付けを容易にする)。
- 既存の JSON/CSV 全体エクスポート([export.ts](../src/lib/export.ts))にも `category` 列を追加。

### 11.5 テスト(redmineExport.test.ts)

象限→優先度 / 状態マッピング / 期間境界(from・to の両端) / 繰り返し展開(日週月年・複数発生) /
実体優先+発生日スキップ(二重計上しない) / 期日なし除外 / タグ補記 / CSV エスケープ / 0 件・大量。

## 12. Today / 工数 / 週次レビュー(実装済み・フェーズ6)

仕様 §4.9〜4.11 の設計。3機能は軽く連動する(Today の容量が工数に依存し、週次レビューが
Today・工数・統計を束ねる)。**設計方針は既存どおり**: ロジックは純粋関数に切り出して vitest で検証し
(§1 / §8 / CLAUDE.md)、Rust は不使用、書込は楽観更新(§4.4)。下記は実装に同期している。

### 12.1 モジュール構成(追加)

```
src/lib/effort.ts               # EffortSize↔分の換算(純粋関数, 新規)
src/lib/today.ts                # Today のグループ分け・並び・繰り越し・容量集計(純粋関数, 新規)
src/lib/stats.ts                # 追加指標(スループット/作成vs完了/リードタイム/遵守率…)を追記
src/lib/review.ts              # 週次レビューの各ステップ対象抽出・リマインド要否(純粋関数, 新規)
src/components/today/TodayView.tsx          # Today ビュー(2グループ + 容量メーター, 新規)
src/components/review/ReviewWizard.tsx      # 操作できる週次レビュー・オーバーレイ(新規)
src/components/stats/StatsView.tsx          # 追加指標の可視化(既存に追記)
src/components/panel/DetailPanel.tsx        # 工数 S/M/L/XL セレクト(既存に追記)
src/components/recurring/RecurrenceForm.tsx # ひな型の工数(既存に追記)
src/components/matrix/TaskCard.tsx          # 工数バッジ(既存に追記)
src/stores/taskStore.ts                     # today_date/today_order/effort_size 操作 + 繰り越し(追記)
src/stores/uiStore.ts                       # View に "today" 追加 + reviewOpen(追記)
src/stores/settingsStore.ts                 # lastReviewAt の保存(追記)
src/types/models.ts                         # EffortSize / AppSettings 追加キー(追記)
src/lib/migrations.ts                       # v5(effort_size)/ v6(today_date,today_order)(追記)
```

### 12.2 型定義の追加([models.ts](../src/types/models.ts))

```typescript
export type EffortSize = "S" | "M" | "L" | "XL";
export const EFFORT_SIZES: EffortSize[] = ["S", "M", "L", "XL"];

export interface Task {
  // …既存…
  effortSize: EffortSize | null;   // null = 未見積り(migration v5)
  todayDate: string | null;        // 'YYYY-MM-DD' 「今日やる」予定日。null = 未指定(migration v6)
  todayOrder: number | null;       // グループB の手動並び。null = 未指定(migration v6)
}

export interface RecurringTemplate {
  // …既存…
  effortSize: EffortSize | null;   // 実体へ継承(migration v5)
}

export type WeekStart = "monday" | "sunday";
export interface WeeklyReviewSetting {
  enabled: boolean;                // 既定 false
  weekday: number;                 // ISO 1=月〜7=日。既定 1(月)
  time: string;                    // 'HH:mm'。既定 '09:00'
}

export interface AppSettings {
  // …既存…
  effortMinutes: Record<EffortSize, number>;  // 既定 { S:15, M:60, L:180, XL:480 }
  dailyCapacityMinutes: number;               // 既定 360
  todayIncludeUrgentQuadrant: boolean;        // 既定 true(Q1 を自動グループへ)
  weekStart: WeekStart;                        // 既定 'monday'
  weeklyReview: WeeklyReviewSetting;           // 既定 { false, 1, '09:00' }
  lastReviewAt: string | null;                 // 前回レビュー日時 ISO。既定 null
}
```

- `DEFAULT_APP_SETTINGS` に上記既定値を追加。旧 DB 互換のため [settingsRepo.ts](../src/repositories/settingsRepo.ts)
  で `effortMinutes` / `weeklyReview` のネストも `statusColors` と同様に既定値とディープマージする(§11.4 と同じ方針)。
- `todayOrder` は手動並びの整数。並べ替え時にグループBを 0,1,2… へ振り直す(疎な採番はしない)。

### 12.3 マイグレーション(v5 / v6, [migrations.ts](../src/lib/migrations.ts))

```typescript
// v5: 工数(Tシャツサイズ)。実体とひな型に effort_size を追加
{ version: 5, description: 'add effort size', statements: [
    `ALTER TABLE tasks ADD COLUMN effort_size TEXT
       CHECK (effort_size IS NULL OR effort_size IN ('S','M','L','XL'))`,
    `ALTER TABLE recurring_templates ADD COLUMN effort_size TEXT
       CHECK (effort_size IS NULL OR effort_size IN ('S','M','L','XL'))`,
]},
// v6: Today(今日やる)。予定日と手動並びを追加
{ version: 6, description: 'add today planning', statements: [
    `ALTER TABLE tasks ADD COLUMN today_date  TEXT`,    // 'YYYY-MM-DD'。null=未指定
    `ALTER TABLE tasks ADD COLUMN today_order INTEGER`, // グループB手動並び
    `CREATE INDEX idx_tasks_today ON tasks(today_date) WHERE deleted_at IS NULL`,
]},
```

- **過去のマイグレーションは書き換えない**(§6 / CLAUDE.md)。列追加に伴い `TaskRow` / `rowToTask` /
  `CreateTaskInput`(必要なら)/ `TaskPatch` + `COLUMN_MAP`(`effort_size` / `today_date` / `today_order` を追加)/
  `create` の INSERT / [export.ts](../src/lib/export.ts) の CSV 列 / **各テストの task ファクトリ**を更新する。
- 工数・今日やるの書込は既存 `taskRepo.update(id, patch, updatedAt?)`(§4.2)経由。専用クエリは作らない。

### 12.4 工数([effort.ts](../src/lib/effort.ts))

```typescript
export const DEFAULT_EFFORT_MINUTES: Record<EffortSize, number> = { S: 15, M: 60, L: 180, XL: 480 };

// 未見積りは null(合計に算入しない)。設定 map を渡して追従させる。
export function effortMinutes(size: EffortSize | null, map: Record<EffortSize, number>): number | null {
  return size === null ? null : map[size];
}
```

- 入力 UI: 詳細パネルの S/M/L/XL セグメント(+「未見積り」で null へ)→ `taskStore.patch(id, { effortSize })`。
  複数選択は [BulkActionBar](../src/components/common/BulkActionBar.tsx) に一括設定を足す。ひな型は
  [RecurrenceForm](../src/components/recurring/RecurrenceForm.tsx) に追加し、生成時に実体へ継承(§5.7 の
  importance/tags/category と同じ経路)。
- 表示: [TaskCard](../src/components/matrix/TaskCard.tsx) に工数バッジ(期限バッジの並び)。**カードサイズは不変**
  (layout.ts は触らない)。

### 12.5 Today([today.ts](../src/lib/today.ts) / TodayView)

純粋関数(vitest 対象):

```typescript
export type TodayBadge = "overdue" | "due-today" | "doing" | "review" | "urgent" | "pick";

export interface TodayCard { task: Task; badges: TodayBadge[]; }
export interface TodayGroups { auto: TodayCard[]; picks: TodayCard[]; }

// today: 'YYYY-MM-DD'。auto は規定順、picks は today_order 順。
// auto に入るタスクは picks から除外し、auto 側カードに "pick" バッジを足す(二重表示しない)。
export function todayGroups(tasks: Task[], today: string, includeUrgent: boolean): TodayGroups;

// グループA の主要素ソートキー(バッジは複数でも、並びはこの優先度で決まる)
//   overdue(期限古い順) < due-today < doing < review < urgent
// グループB は today_order 昇順。

// 未完了の「今日やる」で today_date < today のものを today へ繰り越す(order は保持)。
// 返り値は更新が必要な差分のみ(楽観更新で patch する)。
export function carryOverToday(tasks: Task[], today: string): { id: string; todayDate: string }[];

export interface CapacitySummary {
  estimatedMinutes: number;  // Today 表示中・未完了・見積りありの合計
  capacityMinutes: number;   // 設定 dailyCapacityMinutes
  remainingMinutes: number;  // capacity - estimated(負なら超過)
  over: boolean;
  unestimatedCount: number;  // Today 表示中・未完了・未見積りの件数
}
export function capacitySummary(
  groups: TodayGroups, effortMap: Record<EffortSize, number>, capacity: number,
): CapacitySummary;
```

判定の整合:
- `overdue`=`dueDate < today` / `due-today`=`dueDate === today` / `doing`=`status==='doing'` /
  `review`=`reviewAt <= today`(到来。仕様 §4.9 で「今日」から拡張、[reminders.ts](../src/lib/reminders.ts) の
  `review` と同義だが Today では保留・待ち以外でも到来していれば出す) / `urgent`=`includeUrgent &&
  taskQuadrant(t)==='q1'`。いずれも `deletedAt==null && status!=='done'` が前提。
- **グループA判定は reminders と重複する**ため、`due`/`review` の素の述語を `reminders.ts` と共有できる形に
  切り出す(両者が同じ述語を呼ぶ。閾値や日付表現を二重定義しない)。

繰り越し・容量の発火点:
- `taskStore.load()` 後と**日付変更監視**で `carryOverToday` を実行。日付変更は [App.tsx](../src/App.tsx) の
  `setInterval`(§5.4 / §5.7、`lastDate !== today` 分岐)に相乗りし、既存の `generateDue` と並べて呼ぶ。
- TodayView は `todayGroups` を `useMemo`(依存=tasks/today/設定)で算出。容量メーターは `capacitySummary`、
  超過時に赤(index.css のステータス色ではなくアクセント/危険色トークン)。
- 操作は既存ストアを再利用: 状態変更・完了(undo, §5.3)・詳細表示・「今日やる」解除(`patch(id,{todayDate:null,
  todayOrder:null})`)。グループB の並べ替えはポインタ D&D で `todayOrder` を 0..n に振り直して一括 patch。
- コマンドパレット([CommandPalette](../src/components/common/CommandPalette.tsx))に「Today へ移動」「選択中を
  今日やるに追加/解除」を追加(commandPalette.ts のフィルタはそのまま)。

### 12.6 統計の深化([stats.ts](../src/lib/stats.ts) 追記)

既存 `completionStats` は維持。週バケットの基準関数を足し、指標ごとに純粋関数を追加(すべて vitest)。

```typescript
// ローカル日付 'YYYY-MM-DD' を、週起点に揃えた週頭の 'YYYY-MM-DD' へ丸める。
export function weekStartOf(date: string, weekStart: WeekStart): string;

export interface ThroughputBucket { week: string; count: number; minutes: number; }      // 完了スループット
export interface CreatedCompleted { week: string; created: number; completed: number; diff: number; }
export interface BalanceBucket { week: string; ratio: Record<Quadrant, number>; }         // 象限バランス推移
export interface AdherenceBucket { week: string; planned: number; completed: number; ratio: number; }

export function throughputByWeek(tasks, effortMap, weekStart): ThroughputBucket[];
export function createdVsCompletedByWeek(tasks, weekStart): CreatedCompleted[];
export function q2LeadTimeMedianDays(tasks): number | null;     // 完了Q2の (completedAt-createdAt) 中央値
export function q2StaleTop(tasks, nowMs, limit): { task: Task; days: number }[]; // 未完了Q2の放置上位
export function oldestTodos(tasks, limit): Task[];               // 未着手を createdAt 昇順
export function planAdherenceByWeek(tasks, weekStart): AdherenceBucket[];
export function unestimatedRatio(tasks): { total: number; unestimated: number; ratio: number };
```

集計の前提(仕様 §4.11):
- 対象は**有効タスク + アーカイブ済み完了タスク**。アーカイブはフラグを持たず表示時計算(§5.4)なので、
  統計も `findAllAlive`(論理削除を除く全件)を入力に使えば足りる(`deletedAt==null` で除外済み)。
- 日付はローカル日付化(`isoDate` 相当で先頭10文字 or ローカル変換)してから週へ丸める。
- **計画遵守率(緩い定義)**: 各週で `planned` = `todayDate` がその週に入るタスク数、`completed` = そのうち
  `status==='done' && localDate(completedAt) === todayDate`。繰り越しで `todayDate` は最後に計画した日へ
  更新済みなので「最後に計画した日に完了できたか」を測れる。
- 放置閾値は `STALE_Q2_DAYS`(14, [reminders.ts](../src/lib/reminders.ts))を共用し、`q2StaleTop` のしきい表示にも使う。

### 12.7 週次レビュー(ReviewWizard / [review.ts](../src/lib/review.ts))

操作できるオーバーレイ。状態機械はコンポーネント側(`step` / `skipped`)、各ステップの**対象抽出**は純粋関数。

```typescript
export type ReviewStep = "summary" | "due" | "stale" | "review" | "inbox" | "plan";
export const REVIEW_STEPS: ReviewStep[] = ["summary","due","stale","review","inbox","plan"];

// 各ステップが扱うタスク集合(読み取り専用の抽出。操作は既存ストアで行う)。
export function dueBacklog(tasks, today, weekStart): Task[];   // 期限超過 + 今週期限の未完了
export function staleQ2(tasks, nowMs, staleDays): Task[];      // 第2領域で放置 or 未進捗
export function reviewBacklog(tasks, today): Task[];           // 保留・待ちで reviewAt<=today or 未設定
export function inboxTasks(tasks): Task[];                     // importance/urgency が null
// plan ステップは候補一覧(第2領域・未着手など)から「今日やる」を付ける UI。
```

- UI: モーダルではなく全面オーバーレイ。ヘッダーに進捗(`step n / 6`)と「次へ / 戻る / スキップ」。各ステップは
  対象リスト + その場操作(期限変更・完了・状態変更・象限割当・工数設定・「今日やる」設定)を既存コンポーネント
  (DetailPanel の部品 / インライン操作)で提供。すべて楽観更新で即反映。
- ステップ1「振り返り」は §12.6 の関数(今週/先週比・象限バランス・計画遵守率)を表示。
- 完了時に `settingsStore.update('lastReviewAt', nowISO)`。起動時は「前回レビュー: ◯日前」を Today/統計に出す。
- 起動は Today / 統計のボタン + コマンドパレット(`uiStore.reviewOpen` をトグル)。

リマインド(Rust 改修なし、アプリ内バナー):

```typescript
// 当週の対象曜日を過ぎ、かつ当週まだレビューしていなければ true。
export function dueForWeeklyReview(
  setting: WeeklyReviewSetting, today: string, lastReviewAt: string | null, weekStart: WeekStart,
): boolean;
```

- `weeklyReview.enabled` のとき、起動時と日付変更監視(§5.4 の `setInterval`)で `dueForWeeklyReview` を評価し、
  真ならヘッダー/Today にバナーを出す(`time` は当日内の表示順序の目安。OS トースト発火は将来 scheduler 拡張)。
- 既存の通知(§4.6, due/review)とは独立。scheduler.rs / notifications.ts は変更しない。

### 12.8 設定([settingsStore.ts](../src/stores/settingsStore.ts) / [SettingsView.tsx](../src/components/settings/SettingsView.tsx))

- 追加キーはすべて **DB 内 settings**(AppSettings)で完結。DB を開く前に要る値ではないため settings.json
  ミラーは不要(§3 実装メモの判断と同じ)。`settingsStore.update(key, value)` をそのまま使う。
- 設定画面に節を追加: 工数(S/M/L/XL の分)/ Today(可処分時間・Q1 自動取り込み)/ 統計(週起点)/
  週次レビュー(毎週リマインドの有無・曜日・時刻)。`lastReviewAt` は表示のみ(記録用、ユーザー編集不可)。

### 12.9 テスト(vitest)

- `effort.test.ts`: 換算・未見積り null・設定変更追従。
- `today.test.ts`: グループ分け(複数バッジ)/ 規定順ソート / picks の today_order 順 / auto と picks の重複排除 /
  繰り越し差分(完了済みは据置)/ 容量集計(未見積り別建て・超過)。
- `stats.test.ts`(追記): 週丸め(月/日起点・年跨ぎ)/ スループット(件数+分)/ 作成vs完了 / Q2リードタイム中央値
  (偶数件)/ 計画遵守率(繰り越し後の todayDate 基準)/ 未見積り率 / 放置上位。
- `review.test.ts`: 各ステップの対象抽出境界 / `dueForWeeklyReview`(曜日前後・当週レビュー済み・無効時)。
- `migrations.test.ts`(追記): v5/v6 適用後のスキーマ・`effort_size` CHECK 制約・`today_*` 列・インデックス。
