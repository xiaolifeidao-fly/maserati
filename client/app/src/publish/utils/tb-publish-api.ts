import axios from 'axios';
import type { Page } from 'playwright';
import type { TbDraftContext } from '../types/draft';
import {
  publishTaobaoRequestLog,
  publishTaobaoResponseLog,
  summarizeForLog,
} from './publish-logger';
import { handleTbLoginRequired, handleTbMaybeLoginRequired } from './tb-login-state';
import { StepCode } from '../types/publish-task';
import { PublishError } from '../core/errors';

declare const navigator: any;

const TB_DRAFT_UPDATE_URL = 'https://item.upload.taobao.com/sell/draftOp/update.json';
const TB_PUBLISH_URL = 'https://item.upload.taobao.com/sell/v2/submit.htm';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function deepMergeDraftPayload(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    const baseValue = result[key];
    if (Array.isArray(value)) {
      result[key] = value;
      continue;
    }
    const baseObject = asRecord(baseValue);
    const valueObject = asRecord(value);
    if (baseObject && valueObject) {
      result[key] = deepMergeDraftPayload(baseObject, valueObject);
      continue;
    }
    result[key] = value;
  }

  return result;
}

function toNumericCatId(catId: unknown): number | string {
  if (typeof catId === 'number' && Number.isFinite(catId)) {
    return catId;
  }

  if (typeof catId === 'string') {
    const trimmed = catId.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return typeof catId === 'string' ? catId.trim() : String(catId ?? '');
}

export function buildDraftJsonBody(
  draftContext: TbDraftContext,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  let base: Record<string, unknown>;
  const pageJson = asRecord(draftContext.pageJsonData) ?? {};
  const models = asRecord(pageJson.models) ?? {};
  const globalModel = asRecord(models.global);
  const globalValue = asRecord(globalModel?.value) ?? {};

  if (draftContext.updateDraftJsonBody) {
    // 已有草稿优先使用从 draftOp/update.json 请求中拦截的 jsonBody
    base = { ...draftContext.updateDraftJsonBody };
  } else if (draftContext.addDraftJsonBody) {
    // 新建草稿优先使用从 draftOp/add.json 请求中拦截的 jsonBody（页面实际提交数据，最准确）
    base = { ...draftContext.addDraftJsonBody };
  } else {
    // 回退：从 window.Json.models 重建
    const formValues = asRecord(models.formValues) ?? {};
    base = {
      ...globalValue,
      ...formValues,
      icmp_global: { ...globalValue },
    };
  }

  const merged = deepMergeDraftPayload(base, payload);
  const numericCatId = toNumericCatId(draftContext.catId);

  merged.catId = numericCatId;
  const icmpGlobal = asRecord(merged.icmp_global);
  if (icmpGlobal) {
    icmpGlobal.catId = numericCatId;
  }
  if (draftContext.draftId) {
    merged.dbDraftId = draftContext.draftId;
    merged['draft-btn'] = draftContext.draftId;
  }
  if (draftContext.itemId) {
    merged.id = draftContext.itemId;
  } else if (globalValue.id != null) {
    merged.id = globalValue.id;
  }

  return merged;
}

function buildGlobalExtendInfo(draftContext: TbDraftContext): Record<string, unknown> {
  const pageJson = asRecord(draftContext.pageJsonData) ?? {};
  const models = asRecord(pageJson.models) ?? {};
  const globalModel = asRecord(models.global);
  const globalExtendInfo = globalModel?.globalExtendInfo ?? asRecord(globalModel?.value)?.globalExtendInfo;

  if (typeof globalExtendInfo === 'string' && globalExtendInfo.trim()) {
    try {
      const parsed = JSON.parse(globalExtendInfo) as Record<string, unknown>;
      return {
        ...parsed,
        startTraceId: draftContext.startTraceId,
      };
    } catch {
      // ignore invalid cached payload and fall back to defaults
    }
  }

  return {
    startTraceId: draftContext.startTraceId,
    skuDecoupling: 'true',
    noIcmp: 'true',
  };
}

export interface NormalizedTbResponse extends Record<string, unknown> {
  captchaUrl?: string;
  validateUrl?: string;
  itemId?: string;
  draftId?: string;
  dbDraftId?: string | number;
  successUrl?: string;
  type?: string;
  success?: boolean;
  retCode?: string;
  message?: string;
  nonJson?: boolean;
  rawTextSnippet?: string;
}

function buildRawTextSnippet(rawText: string): string {
  return String(rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function buildNonJsonResponse(apiName: string, rawText: string): NormalizedTbResponse {
  return {
    type: 'error',
    success: false,
    nonJson: true,
    rawTextSnippet: buildRawTextSnippet(rawText),
    message: `${apiName} 返回非JSON数据，可能已掉线或解析失败`,
  };
}

export function parseTaobaoResponseText(rawText: string, apiName: string): NormalizedTbResponse {
  try {
    return JSON.parse(rawText) as NormalizedTbResponse;
  } catch {
    return buildNonJsonResponse(apiName, rawText);
  }
}

export function summarizeTbFailureForResult(response: NormalizedTbResponse): Record<string, unknown> {
  return {
    type: response.type,
    success: response.success,
    retCode: response.retCode,
    message: response.message,
    captchaUrl: response.captchaUrl,
    validateUrl: response.validateUrl,
    draftId: response.draftId,
    itemId: response.itemId,
    nonJson: response.nonJson,
    rawTextSnippet: response.rawTextSnippet,
    data: summarizeForLog(response.data),
  };
}

export async function submitDraftToTaobao(
  taskId: number,
  shopId: number,
  page: Page,
  draftContext: TbDraftContext,
  payload: Record<string, unknown>,
): Promise<NormalizedTbResponse> {
  let headers: Record<string, string>;
  try {
    headers = await buildTaobaoHeaders(page, page.url() || 'https://item.upload.taobao.com/sell/v2/draft.htm');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cookie')) {
      await handleTbLoginRequired(StepCode.FILL_DRAFT, shopId);
    }
    throw error;
  }
  const jsonBody = buildDraftJsonBody(draftContext, payload);
  const globalExtendInfo = buildGlobalExtendInfo(draftContext);
  const data = {
    id: draftContext.draftId,
    dbDraftId: draftContext.draftId,
    jsonBody: JSON.stringify(jsonBody),
    globalExtendInfo: JSON.stringify(globalExtendInfo),
  };

  publishTaobaoRequestLog(taskId, 'submit-draft-direct', {
    url: `${TB_DRAFT_UPDATE_URL}?catId=${draftContext.catId}`,
    method: 'POST',
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
    },
  });

  const response = await axios.post<string>(
    `${TB_DRAFT_UPDATE_URL}?catId=${draftContext.catId}`,
    data,
    {
      headers,
      timeout: 30000,
      responseType: 'text',
      transformResponse: [raw => raw],
    },
  );

  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝更新草稿接口');
  const normalized = normalizeTbDraftResponse(rawData);
  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, normalized);
  publishTaobaoResponseLog(taskId, 'submit-draft-direct', {
    url: `${TB_DRAFT_UPDATE_URL}?catId=${draftContext.catId}`,
    method: 'POST',
    status: response.status,
    catId: draftContext.catId,
    draftId: normalized.draftId ?? draftContext.draftId,
    itemId: normalized.itemId,
    output: {
      rawData: summarizeForLog(rawData),
      normalized: summarizeForLog(normalized),
    },
  });
  return normalized;
}

export async function publishToTaobao(
  taskId: number,
  shopId: number,
  page: Page,
  draftContext: TbDraftContext,
): Promise<NormalizedTbResponse> {
  let headers: Record<string, string>;
  try {
    headers = await buildTaobaoHeaders(page, page.url() || 'https://item.upload.taobao.com/sell/v2/draft.htm');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cookie')) {
      await handleTbLoginRequired(StepCode.PUBLISH, shopId);
    }
    throw error;
  }
  const jsonBody = buildDraftJsonBody(draftContext, {
    ...(draftContext.submitPayload ?? {}),
    fakeCreditSubmit: true,
  });
  const globalExtendInfo = buildGlobalExtendInfo(draftContext);

  const data = {
    catId: draftContext.catId,
    jsonBody: JSON.stringify(jsonBody),
    copyItemMode: 0,
    globalExtendInfo: JSON.stringify(globalExtendInfo),
  };

  publishTaobaoRequestLog(taskId, 'final-publish-direct', {
    url: TB_PUBLISH_URL,
    method: 'POST',
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: draftContext.itemId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
    },
  });

  const response = await axios.post<string>(TB_PUBLISH_URL, data, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.PUBLISH, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝发布商品接口');
  const normalized = normalizeTbPublishResponse(rawData);
  await handleTbMaybeLoginRequired(StepCode.PUBLISH, shopId, normalized);
  publishTaobaoResponseLog(taskId, 'final-publish-direct', {
    url: TB_PUBLISH_URL,
    method: 'POST',
    status: response.status,
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: normalized.itemId ?? draftContext.itemId,
    output: {
      rawData: summarizeForLog(rawData),
      normalized: summarizeForLog(normalized),
    },
  });
  return normalized;
}

export function assertTbDraftSubmitSuccess(
  stepCode: StepCode,
  response: NormalizedTbResponse,
  fallbackMessage: string,
): void {
  if (response.type === 'warning') {
    throw new PublishError(
      stepCode,
      response.message ?? fallbackMessage,
      false,
      summarizeTbFailureForResult(response),
    );
  }

  if (response.type === 'error' || response.success === false) {
    throw new PublishError(
      stepCode,
      response.message ?? fallbackMessage,
      false,
      summarizeTbFailureForResult(response),
    );
  }
}

async function buildTaobaoHeaders(page: Page, referer: string): Promise<Record<string, string>> {
  const context = page.context();
  const cookies = await context.cookies([
    'https://taobao.com',
    'https://www.taobao.com',
    'https://myseller.taobao.com',
    'https://item.upload.taobao.com',
  ]);
  if (!cookies.length) {
    throw new Error('无法获取淘宝登录态 Cookie');
  }

  const { userAgent, csrfToken } = await page.evaluate(() => {
    const pageGlobal = globalThis as {
      navigator?: {
        userAgent?: string;
      };
      window?: {
        csrfToken?: {
          tokenValue?: string;
        };
      };
      csrfToken?: {
        tokenValue?: string;
      };
    };

    return {
      userAgent: pageGlobal.navigator?.userAgent ?? '',
      csrfToken: pageGlobal.window?.csrfToken?.tokenValue ?? pageGlobal.csrfToken?.tokenValue ?? '',
    };
  });

  if (!csrfToken) {
    throw new Error('无法获取淘宝页面 x-xsrf-token');
  }

  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
    Origin: 'https://item.upload.taobao.com',
    Referer: referer,
    'User-Agent': userAgent,
    'X-Requested-With': 'XMLHttpRequest',
    'x-xsrf-token': csrfToken,
  };
}

function normalizeTbResponse(data: NormalizedTbResponse): NormalizedTbResponse {
  const result = { ...(data ?? {}) };
  const ret = Array.isArray((result as any).ret) ? (result as any).ret : [];
  const firstRet = typeof ret[0] === 'string' ? ret[0] : '';
  const retCode = firstRet.split('::')[0]?.trim();

  if (retCode) {
    result.retCode = retCode;
  }

  if (retCode === 'FAIL_SYS_USER_VALIDATE') {
    result.captchaUrl = String((result as any).data?.url ?? '');
    result.validateUrl = result.captchaUrl;
  }

  const inferredSuccess = inferTbSuccess(result);
  if (typeof inferredSuccess === 'boolean') {
    result.success = inferredSuccess;
  }

  const message = extractTbMessage(result);
  if (message) {
    result.message = message;
  }

  return result;
}

export function normalizeTbDraftResponse(data: NormalizedTbResponse): NormalizedTbResponse {
  const result = normalizeTbResponse(data);
  const payload = (result.data ?? {}) as Record<string, unknown>;

  if (result.dbDraftId != null && String(result.dbDraftId).trim()) {
    result.draftId = String(result.dbDraftId);
  } else if (result.draftId != null && String(result.draftId).trim()) {
    result.draftId = String(result.draftId);
  } else if (payload?.dbDraftId != null && String(payload.dbDraftId).trim()) {
    result.draftId = String(payload.dbDraftId);
  } else if (payload?.draftId != null && String(payload.draftId).trim()) {
    result.draftId = String(payload.draftId);
  }

  if (!result.message) {
    const nestedMessage = payload?.message ?? payload?.msg ?? payload?.errorMsg;
    if (nestedMessage != null && String(nestedMessage).trim()) {
      result.message = String(nestedMessage);
    }
  }

  const inferredSuccess = inferTbSuccess(result);
  if (typeof inferredSuccess === 'boolean') {
    result.success = inferredSuccess;
  }

  return result;
}

function normalizeTbPublishResponse(data: NormalizedTbResponse): NormalizedTbResponse {
  const result = normalizeTbResponse(data);
  const models = (result as any).models;
  const globalMessage = models?.globalMessage;

  if (globalMessage?.type) {
    result.type = String(globalMessage.type);
  }
  if (globalMessage?.successUrl) {
    result.successUrl = String(globalMessage.successUrl);
    const match = result.successUrl.match(/primaryId=(\d+)/);
    if (match?.[1]) {
      result.itemId = match[1];
    }
  }
  const message =
    models?.formError?.tbExtractWay?.itemMessage?.template?.message?.[0]?.msg
    ?? globalMessage?.message?.[0]?.msg
    ?? models?.warning?.diagnoseViolationWarning?.tipsContent;
  if (message) {
    result.message = String(message);
  }

  return result;
}

function inferTbSuccess(result: Record<string, unknown>): boolean | undefined {
  if (result.type === 'success') {
    return true;
  }
  if (result.type === 'warning' || result.type === 'error') {
    return false;
  }

  if (typeof result.success === 'boolean') {
    return result.success;
  }

  const nestedSuccess = (result.data as Record<string, unknown> | undefined)?.success;
  if (typeof nestedSuccess === 'boolean') {
    return nestedSuccess;
  }

  const retCode = typeof result.retCode === 'string' ? result.retCode : '';
  if (retCode.startsWith('SUCCESS')) {
    return true;
  }
  if (retCode.startsWith('FAIL')) {
    return false;
  }

  if (typeof result.successUrl === 'string' && result.successUrl) {
    return true;
  }
  if (typeof result.itemId === 'string' && result.itemId) {
    return true;
  }
  if (typeof result.draftId === 'string' && result.draftId) {
    return true;
  }

  return undefined;
}

function extractTbMessage(result: Record<string, unknown>): string | undefined {
  const ret = Array.isArray(result.ret) ? result.ret : [];
  const firstRet = typeof ret[0] === 'string' ? ret[0] : '';
  if (firstRet.includes('::')) {
    const [, ...rest] = firstRet.split('::');
    const message = rest.join('::').trim();
    if (message) {
      return message;
    }
  }

  const payload = (result.data ?? {}) as Record<string, unknown>;
  const candidates = [
    payload?.message,
    payload?.msg,
    payload?.errorMsg,
    result.message,
  ];

  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim()) {
      return String(candidate);
    }
  }

  return undefined;
}
