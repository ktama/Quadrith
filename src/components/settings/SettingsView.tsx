// 設定画面(仕様書 §7.2)
// データ / 表示 / 動作 の3セクション。AppSettings は settingsStore 経由で即時保存。
// DBパス切替は §7.3 の分岐(移動 / 新規作成 / 既存を開く / 上書き)を確認モーダルで扱う。

import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { fsExists } from "../../lib/fsops";
import { persistRedmineTracker, readRedmineTracker, type SwitchMode } from "../../lib/db";
import { registerQuickAddHotkey, revealInExplorer, syncAutostart } from "../../lib/desktop";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToastStore } from "../../stores/toastStore";
import {
  EFFORT_SIZES,
  type EffortSize,
  type RedminePriorityKey,
  STATUSES,
  STATUS_LABELS,
  type Status,
  type WeekStart,
} from "../../types/models";
import { TagManager } from "./TagManager";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]; // ISO 1..7

// Redmine 優先度マッピングの行(象限 + インボックス)
const REDMINE_PRIORITY_ROWS: { key: RedminePriorityKey; label: string }[] = [
  { key: "q1", label: "今すぐやる (重要×緊急)" },
  { key: "q2", label: "計画する (重要×非緊急)" },
  { key: "q3", label: "さばく・任せる (非重要×緊急)" },
  { key: "q4", label: "やめる候補 (非重要×非緊急)" },
  { key: "inbox", label: "インボックス (座標なし)" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800 shadow-sm">
      <h3 className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/70 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm text-slate-700 dark:text-slate-200">{label}</div>
        {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

interface PendingSwitch {
  newPath: string;
  exists: boolean;
}

export function SettingsView() {
  const settings = useSettingsStore((s) => s.settings);
  const dbPath = useSettingsStore((s) => s.dbPath);
  const update = useSettingsStore((s) => s.update);
  const changeDbPath = useSettingsStore((s) => s.changeDbPath);
  const runBackupNow = useSettingsStore((s) => s.runBackupNow);
  const show = useToastStore((s) => s.show);

  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const [hotkeyDraft, setHotkeyDraft] = useState(settings.quickAddHotkey);
  const [newCategory, setNewCategory] = useState("");
  // トラッカーは settings.json(ブートストラップ層)が正。マウント時に読み込む。
  const [trackerDraft, setTrackerDraft] = useState("");

  useEffect(() => {
    void readRedmineTracker().then(setTrackerDraft);
  }, []);

  const redmine = settings.redmineExport;

  const saveTracker = async () => {
    const v = trackerDraft.trim() || "タスク";
    setTrackerDraft(v);
    await persistRedmineTracker(v);
    show("トラッカー名を保存しました");
  };

  const updateRedmineStatus = (s: Status, value: string) =>
    void update("redmineExport", {
      ...redmine,
      statusMap: { ...redmine.statusMap, [s]: value },
    });

  const updateRedminePriority = (key: RedminePriorityKey, value: string) =>
    void update("redmineExport", {
      ...redmine,
      priorityMap: { ...redmine.priorityMap, [key]: value },
    });

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || settings.categories.includes(name)) {
      setNewCategory("");
      return;
    }
    void update("categories", [...settings.categories, name]);
    setNewCategory("");
  };

  const removeCategory = (name: string) =>
    void update(
      "categories",
      settings.categories.filter((c) => c !== name),
    );

  // DBの保存先フォルダを選び、対象パス(<dir>/tasks.db)の存在で分岐を決める(§7.3)
  const pickDbFolder = async () => {
    const dir = await open({ directory: true, title: "DBの保存先フォルダを選択" });
    if (typeof dir !== "string") return;
    const newPath = await join(dir, "tasks.db");
    if (newPath === dbPath) {
      show("現在と同じ保存先です");
      return;
    }
    setPending({ newPath, exists: await fsExists(newPath) });
  };

  const doSwitch = async (mode: SwitchMode) => {
    if (!pending) return;
    setBusy(true);
    await changeDbPath(pending.newPath, mode);
    setBusy(false);
    setPending(null);
  };

  const pickBackupDir = async () => {
    const dir = await open({ directory: true, title: "バックアップの保存先フォルダを選択" });
    if (typeof dir === "string") void update("backupDir", dir);
  };

  const applyHotkey = async () => {
    const hk = hotkeyDraft.trim();
    if (!hk || hk === settings.quickAddHotkey) return;
    const res = await registerQuickAddHotkey(hk);
    if (res.ok) {
      void update("quickAddHotkey", hk);
      show("ホットキーを変更しました");
    } else {
      setHotkeyDraft(settings.quickAddHotkey);
      show(res.error.message, { kind: "error" });
    }
  };

  const toggleAutostart = async (on: boolean) => {
    void update("autoStart", on);
    await syncAutostart(on);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-100">設定</h2>

        {/* データ */}
        <Section title="データ">
          <Row label="DBファイルの保存先" hint={dbPath || "(未接続)"}>
            <button
              className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600"
              onClick={() => void pickDbFolder()}
            >
              変更
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              disabled={!dbPath}
              onClick={() => dbPath && void revealInExplorer(dbPath)}
            >
              場所を開く
            </button>
          </Row>

          <Row label="自動バックアップの保持世代数" hint="起動時に古い世代を削除します">
            <input
              type="number"
              min={1}
              max={50}
              className="w-20 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.backupGenerations}
              onChange={(e) =>
                void update("backupGenerations", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </Row>

          <Row
            label="バックアップの保存先"
            hint={settings.backupDir ?? "DBと同じフォルダの backups/"}
          >
            <button
              className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600"
              onClick={() => void pickBackupDir()}
            >
              変更
            </button>
            {settings.backupDir && (
              <button
                className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600"
                onClick={() => void update("backupDir", null)}
              >
                既定に戻す
              </button>
            )}
            <button
              className="text-xs px-3 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-600"
              onClick={() => void runBackupNow()}
            >
              今すぐバックアップ
            </button>
          </Row>
        </Section>

        {/* 表示 */}
        <Section title="表示">
          <Row label="状態ごとの色">
            <div className="flex gap-2">
              {STATUSES.map((s: Status) => (
                <label key={s} className="flex flex-col items-center gap-1" title={STATUS_LABELS[s]}>
                  <input
                    type="color"
                    className="w-7 h-7 p-0 border border-slate-300 dark:border-slate-600 rounded cursor-pointer"
                    value={settings.statusColors[s]}
                    onChange={(e) =>
                      void update("statusColors", {
                        ...settings.statusColors,
                        [s]: e.target.value,
                      })
                    }
                  />
                  <span className="text-[10px] text-slate-400">{STATUS_LABELS[s]}</span>
                </label>
              ))}
            </div>
          </Row>

          <Row label="完了タスクをマトリクスから消すまでの時間" hint="この時間が過ぎるとアーカイブへ">
            <input
              type="number"
              min={1}
              className="w-20 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.archiveAfterHours}
              onChange={(e) =>
                void update("archiveAfterHours", Math.max(1, Number(e.target.value) || 1))
              }
            />
            <span className="text-xs text-slate-400">時間</span>
          </Row>

          <Row label="テーマ">
            <select
              className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.theme}
              onChange={(e) => void update("theme", e.target.value as typeof settings.theme)}
            >
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
              <option value="system">システム連動</option>
            </select>
          </Row>
        </Section>

        {/* タグ管理 */}
        <Section title="タグ">
          <TagManager />
        </Section>

        {/* カテゴリ(タスクに割当 / Redmine エクスポートのカテゴリ列, §4.8) */}
        <Section title="カテゴリ">
          <Row label="カテゴリ候補" hint="タスクの詳細パネルから割り当てられます">
            <div className="flex flex-col gap-2 items-end">
              {settings.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {settings.categories.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200"
                    >
                      {c}
                      <button
                        className="text-slate-400 hover:text-red-500 leading-none"
                        onClick={() => removeCategory(c)}
                        aria-label={`カテゴリ「${c}」を削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5 items-center">
                <input
                  className="w-40 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
                  placeholder="新しいカテゴリ"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCategory();
                  }}
                />
                <button
                  className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600"
                  onClick={addCategory}
                >
                  追加
                </button>
              </div>
            </div>
          </Row>
        </Section>

        {/* Redmine エクスポート(§4.8) */}
        <Section title="Redmine エクスポート">
          <Row
            label="トラッカー名"
            hint="Redmine に存在する名前に合わせてください(不一致だとインポート全体が失敗します)"
          >
            <input
              className="w-40 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={trackerDraft}
              onChange={(e) => setTrackerDraft(e.target.value)}
              onBlur={() => void saveTracker()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTracker();
              }}
            />
          </Row>

          <Row label="ステータスの対応" hint="左:本アプリの状態 / 右:Redmine のステータス名">
            <div className="flex flex-col gap-1.5">
              {STATUSES.map((s: Status) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-12 text-right">{STATUS_LABELS[s]}</span>
                  <input
                    className="w-32 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
                    value={redmine.statusMap[s]}
                    onChange={(e) => updateRedmineStatus(s, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </Row>

          <Row label="優先度の対応" hint="象限(重要度×緊急度)→ Redmine の優先度名">
            <div className="flex flex-col gap-1.5">
              {REDMINE_PRIORITY_ROWS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-44 text-right">{label}</span>
                  <input
                    className="w-32 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
                    value={redmine.priorityMap[key]}
                    onChange={(e) => updateRedminePriority(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </Row>

          <Row
            label="すべて「新規」で出力する"
            hint="Redmine のワークフロー上、新規チケットに他のステータスを設定できない場合に有効"
          >
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={redmine.forceNewStatus}
              onChange={(e) =>
                void update("redmineExport", { ...redmine, forceNewStatus: e.target.checked })
              }
            />
          </Row>

          <Row label="開始日の列を出力する" hint="作成日(日付)を Redmine の開始日として出力">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={redmine.includeStartDate}
              onChange={(e) =>
                void update("redmineExport", { ...redmine, includeStartDate: e.target.checked })
              }
            />
          </Row>

          <Row label="カテゴリの列を出力する">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={redmine.includeCategory}
              onChange={(e) =>
                void update("redmineExport", { ...redmine, includeCategory: e.target.checked })
              }
            />
          </Row>
        </Section>

        {/* Today / 工数 / 週次レビュー(§4.9〜4.11) */}
        <Section title="Today / 工数 / レビュー">
          <Row label="工数サイズの分換算" hint="S / M / L / XL に対応する分。容量・統計に反映">
            <div className="flex gap-2">
              {EFFORT_SIZES.map((sz: EffortSize) => (
                <label key={sz} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-400">{sz}</span>
                  <input
                    type="number"
                    min={1}
                    className="w-16 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
                    value={settings.effortMinutes[sz]}
                    onChange={(e) =>
                      void update("effortMinutes", {
                        ...settings.effortMinutes,
                        [sz]: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </Row>

          <Row label="1日の可処分時間" hint="Today の容量メーターの分母">
            <input
              type="number"
              min={1}
              className="w-20 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.dailyCapacityMinutes}
              onChange={(e) =>
                void update("dailyCapacityMinutes", Math.max(1, Number(e.target.value) || 1))
              }
            />
            <span className="text-xs text-slate-400">分</span>
          </Row>

          <Row
            label="Today に「今すぐやる」象限を含める"
            hint="重要×緊急のタスクを自動グループへ取り込みます"
          >
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={settings.todayIncludeUrgentQuadrant}
              onChange={(e) => void update("todayIncludeUrgentQuadrant", e.target.checked)}
            />
          </Row>

          <Row label="統計の週の起点">
            <select
              className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.weekStart}
              onChange={(e) => void update("weekStart", e.target.value as WeekStart)}
            >
              <option value="monday">月曜</option>
              <option value="sunday">日曜</option>
            </select>
          </Row>

          <Row label="週次レビューの毎週リマインド" hint="アプリ内バナーで通知します(既定オフ)">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={settings.weeklyReview.enabled}
              onChange={(e) =>
                void update("weeklyReview", { ...settings.weeklyReview, enabled: e.target.checked })
              }
            />
            <select
              className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 disabled:opacity-50"
              disabled={!settings.weeklyReview.enabled}
              value={settings.weeklyReview.weekday}
              onChange={(e) =>
                void update("weeklyReview", {
                  ...settings.weeklyReview,
                  weekday: Number(e.target.value),
                })
              }
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 disabled:opacity-50"
              disabled={!settings.weeklyReview.enabled}
              value={settings.weeklyReview.time}
              onChange={(e) =>
                void update("weeklyReview", { ...settings.weeklyReview, time: e.target.value })
              }
            />
          </Row>
        </Section>

        {/* 動作 */}
        <Section title="動作">
          <Row label="クイック追加のホットキー" hint="例: Ctrl+Shift+Space(変更は即時反映)">
            <input
              className="w-40 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={hotkeyDraft}
              onChange={(e) => setHotkeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyHotkey();
              }}
            />
            <button
              className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600"
              onClick={() => void applyHotkey()}
            >
              適用
            </button>
          </Row>

          <Row label="Windows 起動時に常駐を開始する">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={settings.autoStart}
              onChange={(e) => void toggleAutostart(e.target.checked)}
            />
          </Row>

          <Row label="閉じるボタンでトレイへ最小化する" hint="オフにすると閉じるボタンで終了します">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={settings.closeToTray}
              onChange={(e) => void update("closeToTray", e.target.checked)}
            />
          </Row>

          <Row label="通知の発火時刻" hint="期限日・再確認日の通知">
            <input
              type="time"
              className="text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={settings.notifyTime}
              onChange={(e) => void update("notifyTime", e.target.value)}
            />
          </Row>
        </Section>
      </div>

      {/* DBパス切替の確認モーダル(§7.3) */}
      {pending && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-100 mb-1">
              DBの保存先を変更
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300 break-all mb-4">
              {pending.newPath}
            </p>
            {pending.exists ? (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-200 mb-4">
                  この場所には既存のDBがあります。どうしますか?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    disabled={busy}
                    className="text-sm py-2 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                    onClick={() => void doSwitch("openExisting")}
                  >
                    既存のデータを開く
                  </button>
                  <button
                    disabled={busy}
                    className="text-sm py-2 rounded bg-red-50 dark:bg-red-900/40 hover:bg-red-100 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 disabled:opacity-50"
                    onClick={() => void doSwitch("overwrite")}
                  >
                    現在のデータで上書きする
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-200 mb-4">
                  現在のデータを新しい場所へ移動しますか?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    disabled={busy}
                    className="text-sm py-2 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                    onClick={() => void doSwitch("move")}
                  >
                    現在のデータを移動する
                  </button>
                  <button
                    disabled={busy}
                    className="text-sm py-2 rounded bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    onClick={() => void doSwitch("createNew")}
                  >
                    空のDBを新規作成する
                  </button>
                </div>
              </>
            )}
            <button
              disabled={busy}
              className="w-full text-xs py-2 mt-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
              onClick={() => setPending(null)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
