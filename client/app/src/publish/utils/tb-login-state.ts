import type { Page } from "playwright";
import { requestBackend } from "@src/impl/shared/backend";
import { TbEngine } from "@src/browser/tb.engine";
import { LoginRequiredError } from "../core/errors";
import type { StepCode } from "../types/publish-task";

declare const window: any;
declare const document: any;

const TB_LOGIN_REQUIRED_MESSAGE = "未登录";
const TB_LOGIN_STATUS_PENDING = "PENDING";
const LOGIN_URL_KEYWORDS = [
  "login.taobao.com",
  "account.taobao.com",
  "passport.taobao.com",
  "member/login",
  "/login",
];
const LOGIN_TEXT_KEYWORDS = [
  "登录",
  "重新登录",
  "账号登录",
  "扫码登录",
  "请登录",
  "请先登录",
];

type TaobaoPageSnapshot = {
  url: string;
  title: string;
  text: string;
  actionLabels: string[];
};

export function getTbLoginRequiredMessage(): string {
  return TB_LOGIN_REQUIRED_MESSAGE;
}

export function isTbLoginRequiredMessage(message: unknown): boolean {
  return String(message ?? "").includes(TB_LOGIN_REQUIRED_MESSAGE);
}

export async function ensureTbShopLoggedIn(
  page: Page,
  stepCode: StepCode,
  shopId: number,
): Promise<void> {
  const snapshot = await capturePageSnapshot(page);
  if (!snapshot) {
    return;
  }
  if (isTaobaoLoginRequiredSnapshot(snapshot)) {
    await handleTbLoginRequired(stepCode, shopId, { pageSnapshot: snapshot });
  }
}

export async function handleTbLoginRequired(
  stepCode: StepCode,
  shopId: number,
  details?: Record<string, unknown>,
): Promise<never> {
  await markShopAsLoggedOut(shopId);
  clearCachedUploadHeaders(shopId);
  throw new LoginRequiredError(stepCode, shopId, details);
}

/**
 * 清除上传图片步骤缓存的浏览器 headers（含 Cookie）。
 *
 * 背景：图片上传命中缓存 headers 时不会重新提取 Cookie（见 upload-images.step.ts
 * getHeadersForUpload）。若缓存的 headers 是登录失效前抓取的旧 Cookie，
 * 用户重新登录后再次发布仍会复用这份旧 Cookie 而被判定为未登录，陷入循环踢出。
 * 因此一旦检测到需要重新登录，立即清空缓存，下次发布时回退为从最新会话提取 Cookie。
 */
function clearCachedUploadHeaders(shopId: number): void {
  if (!Number.isFinite(shopId) || shopId <= 0) {
    return;
  }
  try {
    const engine = new TbEngine(String(shopId), false);
    engine.clearHeader();
    engine.setValidateAutoTag(true);
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function handleTbMaybeLoginRequired(
  stepCode: StepCode,
  shopId: number,
  payload: unknown,
): Promise<void> {
  if (isTaobaoLoginRequiredPayload(payload)) {
    await handleTbLoginRequired(stepCode, shopId, { response: payload });
  }
}

async function markShopAsLoggedOut(shopId: number): Promise<void> {
  if (!Number.isFinite(shopId) || shopId <= 0) {
    return;
  }
  try {
    await requestBackend("PUT", `/shops/${shopId}`, {
      data: { loginStatus: TB_LOGIN_STATUS_PENDING },
    });
  } catch {
    // Ignore status sync failures and surface the main publish error.
  }
}

async function capturePageSnapshot(page: Page): Promise<TaobaoPageSnapshot | null> {
  try {
    return await page.evaluate(() => {
      const actionLabels = Array.from(
        document.querySelectorAll("button, a, input[type='button'], input[type='submit']"),
      )
        .slice(0, 30)
        .map((node) => {
          const element = node as { value?: string; textContent?: string };
          return element.value || element.textContent || "";
        })
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        url: window.location.href,
        title: document.title || "",
        text: document.body?.innerText?.slice(0, 4000) || "",
        actionLabels,
      };
    });
  } catch {
    return {
      url: page.url(),
      title: "",
      text: "",
      actionLabels: [],
    };
  }
}

function isTaobaoLoginRequiredSnapshot(snapshot: TaobaoPageSnapshot): boolean {
  if (containsLoginKeyword(snapshot.url)) {
    return true;
  }

  const combinedText = [
    snapshot.title,
    snapshot.text,
    snapshot.actionLabels.join(" "),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return LOGIN_TEXT_KEYWORDS.some((keyword) => combinedText.includes(keyword));
}

function isTaobaoLoginRequiredPayload(payload: unknown): boolean {
  if (typeof payload === "string") {
    return containsLoginKeyword(payload) || LOGIN_TEXT_KEYWORDS.some((keyword) => payload.includes(keyword));
  }
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const maybeUrl = [record.url, record.redirectUrl, record.loginUrl, record.successUrl]
    .map((value) => String(value ?? ""))
    .find((value) => containsLoginKeyword(value));
  if (maybeUrl) {
    return true;
  }

  const ret = record.ret;
  if (Array.isArray(ret) && ret.some((item) => containsLoginKeyword(String(item ?? "")))) {
    return true;
  }

  const serialized = JSON.stringify(payload);
  return containsLoginKeyword(serialized) || LOGIN_TEXT_KEYWORDS.some((keyword) => serialized.includes(keyword));
}

function containsLoginKeyword(value: string): boolean {
  const normalized = String(value ?? "").toLowerCase();
  return LOGIN_URL_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
