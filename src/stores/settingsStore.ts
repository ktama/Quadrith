// 2層設定の統合窓口(設計書 §4.5)
// MVP では AppSettings(DB内)の読み込みと更新のみ。dbPath 切替 UI はフェーズ2。

import { create } from "zustand";
import * as settingsRepo from "../repositories/settingsRepo";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/models";
import { useToastStore } from "./toastStore";

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  init: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  loaded: false,

  init: async () => {
    const res = await settingsRepo.loadAppSettings();
    if (res.ok) {
      set({ settings: res.value, loaded: true });
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
      set({ loaded: true }); // 既定値で続行
    }
  },

  update: async (key, value) => {
    const prev = get().settings;
    set({ settings: { ...prev, [key]: value } });
    const res = await settingsRepo.saveSetting(key, value);
    if (!res.ok) {
      set({ settings: prev });
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },
}));
