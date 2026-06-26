import fs from "fs";
import path from "path";
import { dialog } from "electron";
import { SystemSettingsApi, type ChromePathSelectResult, type ChromePathSetting } from "@eleapi/system-settings/system-settings.api";
import { loadChromePath, saveChromePath, clearChromePath } from "@src/browser/engine";

function normalizeChromePath(chromePath: string): string {
  return String(chromePath || "").trim();
}

function validateChromePath(chromePath: string): string {
  const normalized = normalizeChromePath(chromePath);
  if (!normalized) {
    throw new Error("请选择本机的 chrome.exe 文件");
  }
  if (!fs.existsSync(normalized)) {
    throw new Error("Chrome 文件不存在，请重新选择本机的 chrome.exe 文件");
  }
  const stat = fs.statSync(normalized);
  if (!stat.isFile()) {
    throw new Error("请选择 Chrome 可执行文件，而不是文件夹");
  }
  const filename = path.basename(normalized).toLowerCase();
  if (process.platform === "win32" && filename !== "chrome.exe") {
    throw new Error("请选择本机的 chrome.exe 文件");
  }
  return normalized;
}

export class SystemSettingsImpl extends SystemSettingsApi {
  async getChromePathSetting(): Promise<ChromePathSetting> {
    return { chromePath: loadChromePath() };
  }

  async selectChromeExecutable(): Promise<ChromePathSelectResult> {
    const result = await dialog.showOpenDialog({
      title: "请选择本机的 chrome.exe 文件",
      properties: ["openFile"],
      buttonLabel: "选择 Chrome",
      filters: process.platform === "win32"
        ? [{ name: "Chrome executable", extensions: ["exe"] }]
        : [{ name: "Chrome executable", extensions: ["app", "exe", "*"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { cancelled: true };
    }
    return {
      cancelled: false,
      chromePath: result.filePaths[0],
    };
  }

  async saveChromePathSetting(chromePath: string): Promise<ChromePathSetting> {
    const normalized = validateChromePath(chromePath);
    saveChromePath(normalized);
    return { chromePath: normalized };
  }

  async clearChromePathSetting(): Promise<ChromePathSetting> {
    clearChromePath();
    return {};
  }
}
