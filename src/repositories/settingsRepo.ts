// DB内 settings テーブル(アプリ設定層、仕様書 §7.1)
// key ごとに JSON 文字列を保存する。

import { getDb } from "../lib/db";
import { err, ok, type Result } from "../lib/result";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_EFFORT_MINUTES,
  DEFAULT_REDMINE_MAPPING,
  DEFAULT_WEEKLY_REVIEW,
  type AppSettings,
  type EffortSize,
  type RedmineMapping,
  type WeeklyReviewSetting,
} from "../types/models";

export async function loadAppSettings(): Promise<Result<AppSettings>> {
  try {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings`,
    );
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value);
      } catch {
        // 壊れた値は無視して既定値にフォールバック
      }
    }
    const storedRedmine = stored.redmineExport as Partial<RedmineMapping> | undefined;
    const merged: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...stored,
      statusColors: {
        ...DEFAULT_APP_SETTINGS.statusColors,
        ...(stored.statusColors as Record<string, string> | undefined),
      },
      // 旧DB・将来の状態/象限追加に備えてネストも既定値とマージする
      redmineExport: {
        ...DEFAULT_REDMINE_MAPPING,
        ...storedRedmine,
        statusMap: { ...DEFAULT_REDMINE_MAPPING.statusMap, ...storedRedmine?.statusMap },
        priorityMap: { ...DEFAULT_REDMINE_MAPPING.priorityMap, ...storedRedmine?.priorityMap },
      },
      effortMinutes: {
        ...DEFAULT_EFFORT_MINUTES,
        ...(stored.effortMinutes as Partial<Record<EffortSize, number>> | undefined),
      },
      weeklyReview: {
        ...DEFAULT_WEEKLY_REVIEW,
        ...(stored.weeklyReview as Partial<WeeklyReviewSetting> | undefined),
      },
    };
    return ok(merged);
  } catch (e) {
    return err("DB_READ", "設定の読み込みに失敗しました", e);
  }
}

// AppSettings に属さない内部状態(lastNotifiedDate 等)の読み書き
export async function getRawSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = ?`,
      [key],
    );
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].value) as string;
  } catch (e) {
    console.error("getRawSetting failed:", e);
    return null;
  }
}

export async function setRawSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)],
    );
  } catch (e) {
    console.error("setRawSetting failed:", e);
  }
}

export async function saveSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)],
    );
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "設定の保存に失敗しました", e);
  }
}
