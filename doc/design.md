# 3軸タスク管理アプリ 設計書(v1.0)

対応仕様書: 仕様書 v1.1

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────┐
│ Tauri アプリ(単一ウィンドウ + トレイ常駐)        │
│                                             │
│  ┌─ WebView(React + TS)─────────────────┐  │
│  │  UI層: View / Component               │  │
│  │  状態層: Zustand stores               │  │
│  │  データ層: Repository(SQL発行)        │  │
│  └────────────┬──────────────────────────┘  │
│               │ tauri-plugin-sql / IPC       │
│  ┌────────────┴──────────────────────────┐  │
│  │ Rust側(最小限)                        │  │
│  │  - マイグレーション定義(plugin-sql)     │  │
│  │  - トレイ・グローバルショートカット登録    │  │
│  │  - 通知スケジューラ                     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
        │                       │
   settings.json            tasks.db(SQLite)
  (%APPDATA%固定)           (ユーザー指定パス)
```

**設計方針: ロジックはTS側に寄せ、RustはOS連携のみ**
- CRUD・バックアップ(`VACUUM INTO`)・DBパス切替は、すべてTSのデータ層から tauri-plugin-sql 経由で実行する。Rustコードを最小化し、開発の主戦場をTSに統一する
- Rustが担うのは: マイグレーション定義、システムトレイ、グローバルショートカット、Windowsトースト通知、起動時自動実行の登録

### 使用プラグイン

| プラグイン | 用途 |
|---|---|
| tauri-plugin-sql | SQLite接続・マイグレーション |
| tauri-plugin-store | settings.json の読み書き |
| tauri-plugin-dialog | DBパス選択ダイアログ |
| tauri-plugin-global-shortcut | クイック追加ホットキー |
| tauri-plugin-notification | 期限・再確認日の通知 |
| tauri-plugin-autostart | Windows起動時の常駐 |
| tauri-plugin-fs / opener | バックアップ世代管理、フォルダを開く |

## 2. ディレクトリ構成

```
src/                          # フロントエンド
├── main.tsx
├── App.tsx                   # ルーティング(ビュー切替)
├── types/
│   └── models.ts             # Task, Tag, Settings, Status
├── lib/
│   ├── db.ts                 # DB接続マネージャ(load/close/切替)
│   ├── backup.ts             # VACUUM INTO + 世代管理
│   ├── coords.ts             # 正規化座標 ↔ ピクセル変換
│   └── layout.ts             # 衝突回避レイアウト・クラスタリング
├── repositories/
│   ├── taskRepo.ts           # tasksテーブルのCRUD
│   ├── tagRepo.ts
│   └── settingsRepo.ts       # DB内settingsテーブル
├── stores/
│   ├── taskStore.ts          # タスク一覧 + 操作(undo含む)
│   ├── settingsStore.ts      # 2層設定の統合窓口
│   └── uiStore.ts            # 選択中タスク、フィルタ、表示ビュー
├── components/
│   ├── matrix/
│   │   ├── MatrixView.tsx    # 軸・象限ラベル・D&D境界
│   │   ├── TaskCard.tsx
│   │   ├── ClusterBadge.tsx  # 「+N」表示と吹き出し
│   │   └── InboxLane.tsx
│   ├── panel/DetailPanel.tsx
│   ├── kanban/KanbanView.tsx
│   ├── archive/ArchiveView.tsx
│   ├── settings/SettingsView.tsx
│   ├── QuickAddPopup.tsx
│   └── common/(Toast, FilterChips など)
└── hooks/
    ├── useDragCard.ts        # pointerイベントによるドラッグ
    └── useUndoToast.ts

src-tauri/                    # Rust側
├── src/
│   ├── main.rs               # プラグイン登録・トレイ・ショートカット
│   ├── migrations.rs         # スキーママイグレーション定義
│   └── scheduler.rs          # 通知の定期チェック(1分間隔)
└── tauri.conf.json
```

## 3. 型定義(TS)

```typescript
export type Status = 'todo' | 'doing' | 'pending' | 'waiting' | 'done';

export interface Task {
  id: string;
  title: string;
  memo: string;
  importance: number | null;   // null = インボックス
  urgency: number | null;      // importanceと常に同時にnull
  status: Status;
  dueDate: string | null;      // 'YYYY-MM-DD'
  reviewAt: string | null;     // 'YYYY-MM-DD'
  createdAt: string;           // ISO 8601 (UTC)
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  tagIds: string[];            // JOIN結果を集約して保持
}

export interface Tag { id: string; name: string; color: string; }

// settings.json(ブートストラップ層)
export interface BootstrapSettings {
  dbPath: string;
  window: { x: number; y: number; width: number; height: number };
}

// DB内settingsテーブル(アプリ設定層)
export interface AppSettings {
  statusColors: Record<Status, string>;
  archiveAfterHours: number;        // 既定 24
  theme: 'light' | 'dark' | 'system';
  quickAddHotkey: string;           // 既定 'Ctrl+Shift+Space'
  autoStart: boolean;
  closeToTray: boolean;
  notifyTime: string;               // 'HH:mm' 既定 '09:00'
  backupGenerations: number;        // 既定 3
  backupDir: string | null;         // null = DBと同じフォルダ/backups
}
```

## 4. モジュール設計

### 4.1 db.ts(接続マネージャ)

唯一のDB接続保持者。他モジュールは必ずここ経由でアクセスする。

```typescript
getDb(): Promise<Database>          // 現在の接続(未接続なら settings.json のパスで load)
switchDbPath(newPath, mode): Promise<Result>
  // mode: 'move' | 'createNew' | 'openExisting' | 'overwrite'
closeDb(): Promise<void>            // PRAGMA wal_checkpoint(TRUNCATE) → close
```

`switchDbPath` の内部手順(仕様書 §7.3):
1. `closeDb()`(チェックポイントで -wal/-shm を単一ファイル化)
2. mode に応じてファイル操作(move: コピー → 新パスで開けることを確認 → 旧削除)
3. 新パスで `Database.load()` → マイグレーション自動適用
4. 失敗時: 旧パスで再 load し、エラーを返す(自動ロールバック)
5. 成功時: settings.json の dbPath を更新

### 4.2 taskRepo.ts

```typescript
findActive(): Promise<Task[]>       // deleted_at IS NULL かつ非アーカイブ
findArchived(): Promise<Task[]>     // done かつ completed_at + archiveAfterHours 経過
findTrashed(): Promise<Task[]>      // deleted_at IS NOT NULL
create(input): Promise<Task>        // 座標null(インボックス)で作成
update(id, patch): Promise<void>    // updated_at を常に更新
updatePosition(id, imp, urg): Promise<void>   // ドラッグ確定時専用(高頻度)
softDelete(id) / restore(id) / purge(id)
purgeExpired(): Promise<number>     // deleted_at + 30日経過を物理削除(起動時)
```

- 一覧取得は task_tags をJOINし、TS側で tagIds に集約
- `updatePosition` はドラッグ終了(pointerup)時のみ発行。ドラッグ中はstoreのローカル状態だけ更新し、DB書込はしない

### 4.3 layout.ts(衝突回避・クラスタリング)

入力: 表示対象タスクの正規化座標 + カードサイズ(px)+ コンテナサイズ(px)
出力: `{ taskId, x, y }[]`(描画座標)と `{ clusterId, x, y, taskIds }[]`

アルゴリズム(決定的であること = 再描画でカードが踊らない):
1. 正規化座標をピクセルへ変換
2. **クラスタ判定**: カード中心間距離 < カード幅×0.5 のものをUnion-Findでグループ化。グループサイズ ≥ 4 ならクラスタとして「+N」バッジ1つに集約
3. **重なり解消**(クラスタ化されなかった重なりに対して): id昇順に確定配置していき、既配置カードと交差する場合は黄金角スパイラル上で最近傍の空き位置を探索して配置(保存座標は不変)
4. 計算は `useMemo` で行い、依存はタスク座標リストとコンテナサイズのみ

### 4.4 taskStore.ts(Zustand)

```typescript
state: { tasks: Task[]; loading: boolean }
actions:
  load()                       // findActive + 起動時の purgeExpired
  add(title)                   // クイック追加(インボックスへ)
  patch(id, partial)           // 楽観更新 → repo.update、失敗時ロールバック
  moveTo(id, imp|null, urg|null)
  complete(id)                 // status='done', completedAt=now
  remove(id)                   // softDelete + undoスタックに積む
  undoRemove()                 // 直近の削除を restore
```

- 書込はすべて楽観更新(UI即時反映 → 非同期でDB → 失敗時に巻き戻し+トースト)

### 4.5 settingsStore.ts

- 初期化: tauri-plugin-store から BootstrapSettings、DBから AppSettings を読み統合
- AppSettings の更新は settingsRepo(DB)へ、dbPath/window は plugin-store へ振り分け
- ホットキー変更時は Rust 側へ再登録イベントを発行

### 4.6 通知スケジューラ(Rust: scheduler.rs)

- 1分間隔のtokioタスク。フロントから現在の `notifyTime` と「今日が due_date / review_at のタスク一覧」を受け取る方式ではなく、**Rust側でDBを直接読まない**設計を保つため、フロントが起動時と日付変更時に当日分の通知予定を `schedule_notifications` コマンドで登録する
- 通知済み管理: DB内 settings テーブルに `lastNotifiedDate` を記録し、同日二重通知を防ぐ

## 5. 主要処理フロー

### 5.1 起動シーケンス

```
1. Rust: プラグイン初期化、トレイ・ショートカット登録
2. TS:   settings.json 読込(なければ既定値で生成)
3. TS:   dbPath のファイル存在チェック
         └ 無い → 「探す/新規作成/既定に戻す」ダイアログ(仕様 §7.4)
4. TS:   バックアップ実行(VACUUM INTO → 世代superの削除)
         ※ plugin-sql のマイグレーションは load 時に走るため、
           バックアップは「旧DBファイルの単純コピー」を load 前に行う
           (WAL未接続状態なので安全にコピー可能)
5. TS:   Database.load() → マイグレーション自動適用
         └ 失敗 → バックアップから復元を提案するダイアログ
6. TS:   purgeExpired() → findActive() → 画面描画
7. TS:   当日の通知予定を Rust へ登録
```

※ 手順4の補足: 仕様書は `VACUUM INTO` を指定しているが、**load前はWAL非接続なので
ファイルコピーで整合性が取れる**。load後のバックアップ(設定画面からの手動実行)では
`VACUUM INTO` を使う。この差異は実装コメントに明記する。

### 5.2 ドラッグによる配置

```
pointerdown(カード) → uiStore.dragging = id
pointermove → ローカル座標を更新(DB書込なし、60fps描画)
pointerup
 ├ マトリクス内 → px→正規化変換 → taskStore.moveTo(id, imp, urg)
 ├ インボックスレーン上 → moveTo(id, null, null)
 └ 移動量が閾値未満 → クリック扱い → 詳細パネルを開く
```

### 5.3 削除とUndo

```
remove(id) → 楽観的にUI除去 → softDelete → Toast「削除しました [元に戻す]」(5s)
  ├ クリック → undoRemove() → restore → UI復帰
  └ タイムアウト → 何もしない(レコードは30日後にpurge)
```

### 5.4 アーカイブ判定

- DBにフラグは持たず、**表示時に計算**: `status='done' AND completed_at <= now - archiveAfterHours`
- マトリクスは findActive(上記を除外)、アーカイブビューは findArchived を表示
- 定時再評価: 1分ごとに現在時刻ベースで再フィルタ(taskStoreのセレクタ)

## 6. マイグレーション設計(Rust: migrations.rs)

```rust
vec![
  Migration {
    version: 1,
    description: "initial schema",
    sql: include_str!("../migrations/001_init.sql"),
    kind: MigrationKind::Up,
  },
  // 以降、スキーマ変更ごとに versionを増やして追記。既存ファイルは変更しない
]
```

- plugin-sql が user_version を管理し、未適用分のみ順次実行
- ルール: **過去のマイグレーションファイルは絶対に書き換えない**(任意パスの古いDBが順次適用に依存するため)

## 7. エラーハンドリング方針

| 種別 | 方針 |
|---|---|
| DB書込失敗 | 楽観更新をロールバックし、エラートースト表示 |
| DB破損・open失敗 | バックアップ一覧から復元するダイアログを表示 |
| DBパス切替失敗 | 旧パスへ自動ロールバック + 原因表示(権限/ロック等) |
| 通知・トレイ等のOS連携失敗 | 機能を無効化して継続(アプリは落とさない) |

- Repository層は例外をthrowせず `Result<T, AppError>` 型で返す。`AppError` は `{ code, message, cause }` の判別可能Union

## 8. テスト方針

- **単体**: coords.ts(座標変換の境界値)、layout.ts(決定性・クラスタ判定)、repositoryのSQL(better-sqlite3でインメモリ検証 or vitest + plugin-sqlモック)
- **結合**: switchDbPath の4モード×失敗系(コピー先権限なし等)
- **手動確認項目**: WALファイルを残した状態でのパス移動、マイグレーション失敗→復元、トレイ常駐中のホットキー

## 9. 実装順序(MVP内の推奨順)

1. スキーマ + マイグレーション基盤 + db.ts(土台)
2. taskRepo + taskStore + 一覧表示(リスト形式で仮表示)
3. MatrixView + ドラッグ配置(coords.ts)
4. 衝突回避レイアウト(layout.ts)
5. インボックスレーン + クイック追加(アプリ内ボタン版)
6. 詳細パネル + 状態管理 + フィルタ
7. 論理削除 + Undo + アーカイブ自動移動
8. 起動時バックアップ + 起動シーケンス仕上げ

→ 3〜4 が技術リスク最大のため、先にプロトタイプで操作感を検証することを推奨
