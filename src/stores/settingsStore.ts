// 2層設定の統合窓口(設計書 §4.5)
// - AppSettings(DB内 settings テーブル)の読み込み・更新
// - dbPath(ブートストラップ層、settings.json)の表示と切替オーケストレーション
// テーマ適用は副作用としてここで行う。ホットキー再登録・autostart 同期は
// 循環 import を避けるため呼び出し側(SettingsView)が担う。

import { create } from "zustand";
import { backupNow } from "../lib/backup";
import { getDb, getDbPath, persistBackupGenerations, switchDbPath, type SwitchMode } from "../lib/db";
import { applyTheme } from "../lib/theme";
import { type Result } from "../lib/result";
import * as settingsRepo from "../repositories/settingsRepo";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/models";
import { useTagStore } from "./tagStore";
import { useTaskStore } from "./taskStore";
import { useToastStore } from "./toastStore";

interface SettingsState {
  settings: AppSettings;
  dbPath: string;
  loaded: boolean;
  init: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  changeDbPath: (newPath: string, mode: SwitchMode) => Promise<Result<void>>;
  runBackupNow: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  dbPath: "",
  loaded: false,

  init: async () => {
    const res = await settingsRepo.loadAppSettings();
    const settings = res.ok ? res.value : DEFAULT_APP_SETTINGS;
    if (!res.ok) useToastStore.getState().show(res.error.message, { kind: "error" });
    applyTheme(settings.theme);
    set({ settings, dbPath: getDbPath() ?? "", loaded: true });
  },

  update: async (key, value) => {
    const prev = get().settings;
    set({ settings: { ...prev, [key]: value } });
    if (key === "theme") applyTheme(value as AppSettings["theme"]);
    // 起動時バックアップが参照するため世代数はブートストラップ層にも反映する
    if (key === "backupGenerations") {
      await persistBackupGenerations(value as number);
    }
    const res = await settingsRepo.saveSetting(key, value);
    if (!res.ok) {
      set({ settings: prev });
      if (key === "theme") applyTheme(prev.theme);
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // DBパス切替(仕様書 §7.3)。成功したら全ストアを新 DB で読み直す。
  changeDbPath: async (newPath, mode) => {
    const res = await switchDbPath(newPath, mode);
    if (!res.ok) {
      useToastStore.getState().show(res.error.message, { kind: "error" });
      return res;
    }
    // 新 DB の内容で再読込(AppSettings → テーマも反映される)
    await get().init();
    await Promise.all([useTaskStore.getState().load(), useTagStore.getState().load()]);
    useToastStore.getState().show("DBの保存先を変更しました");
    return res;
  },

  runBackupNow: async () => {
    try {
      const { settings, dbPath } = get();
      const db = await getDb();
      await backupNow(db, dbPath, settings.backupDir, settings.backupGenerations);
      useToastStore.getState().show("バックアップを作成しました");
    } catch (e) {
      console.error("manual backup failed:", e);
      useToastStore.getState().show("バックアップの作成に失敗しました", { kind: "error" });
    }
  },
}));
