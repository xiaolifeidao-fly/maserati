import axios from 'axios';
import type { Page } from 'playwright';
import type { TbDraftContext } from '../types/draft';
import {
  publishInfo,
  publishTaobaoRequestLog,
  publishTaobaoResponseLog,
  summarizeForLog,
} from './publish-logger';
import { handleTbLoginRequired, handleTbMaybeLoginRequired } from './tb-login-state';
import { StepCode } from '../types/publish-task';
import { PublishError } from '../core/errors';

declare const navigator: any;

const TB_DRAFT_UPDATE_URL = 'https://item.upload.taobao.com/sell/draftOp/update.json';
const TB_DRAFT_DELETE_URL = 'https://item.upload.taobao.com/sell/draftOp/delete.json';
const TB_DRAFT_LIST_URL = 'https://item.upload.taobao.com/sell/draftList.json';
const TB_PUBLISH_URL = 'https://item.upload.taobao.com/sell/v2/submit.htm';
const TB_CRO_RULE_ASYNC_CHECK_URL = 'https://item.upload.taobao.com/sell/v2/asyncOpt.htm';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJsonObjectLike(value: unknown): Record<string, unknown> | undefined {
  const directRecord = asRecord(value);
  if (directRecord) {
    return directRecord;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const tryParseObject = (input: string): Record<string, unknown> | undefined => {
    const trimmed = input.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseJsonObjectLike(parsed);
    } catch {
      return undefined;
    }
  };

  const trimmed = value.trim();
  const attempts = new Set<string>([trimmed]);

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    attempts.add(trimmed.slice(1, -1));
  }

  if (trimmed.includes('\\"')) {
    attempts.add(trimmed.replace(/\\"/g, '"'));
  }

  for (const attempt of attempts) {
    const parsed = tryParseObject(attempt);
    if (parsed) {
      return parsed;
    }

    const normalized = attempt.trim();
    if (!normalized) {
      continue;
    }

    const wrapped = normalized.startsWith('{') ? normalized : `{${normalized}}`;
    const wrappedParsed = tryParseObject(wrapped);
    if (wrappedParsed?.descRepublicOfSell && asRecord(wrappedParsed.descRepublicOfSell)) {
      return asRecord(wrappedParsed.descRepublicOfSell);
    }
    if (wrappedParsed?.descPageCommitParam || wrappedParsed?.descPageRenderParam || wrappedParsed?.descPageRenderModel) {
      return wrappedParsed;
    }
  }

  return undefined;
}

function normalizeJsonObjectString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = parseJsonObjectLike(trimmed);
    if (parsed) {
      return JSON.stringify(parsed);
    }

    return trimmed;
  }

  const record = parseJsonObjectLike(value);
  if (record) {
    return JSON.stringify(record);
  }

  return undefined;
}

function normalizeDescRepublicPayload(jsonBody: Record<string, unknown>): void {
  const descRepublic = parseJsonObjectLike(jsonBody.descRepublicOfSell);
  if (!descRepublic) {
    return;
  }

  const commitParam = parseJsonObjectLike(descRepublic.descPageCommitParam) ?? {};
  const renderParam = parseJsonObjectLike(descRepublic.descPageRenderParam) ?? {};
  const renderModel = parseJsonObjectLike(descRepublic.descPageRenderModel) ?? {};
  const descPageDO = parseJsonObjectLike(renderModel.descPageDO) ?? {};

  const templateContent =
    normalizeJsonObjectString(commitParam.templateContent)
    ?? JSON.stringify({ groups: [], sellergroups: [] });

  const editRst =
    normalizeJsonObjectString(descPageDO.editRst)
    ?? templateContent;

  commitParam.templateContent = templateContent;
  descPageDO.editRst = editRst;
  renderModel.descPageDO = descPageDO;

  jsonBody.descRepublicOfSell = {
    ...descRepublic,
    descPageCommitParam: commitParam,
    descPageRenderParam: renderParam,
    descPageRenderModel: renderModel,
  };
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

function buildDescRepublicDebugInfo(jsonBody: Record<string, unknown>): Record<string, unknown> {
  const descRepublic = parseJsonObjectLike(jsonBody.descRepublicOfSell);
  const commitParam = parseJsonObjectLike(descRepublic?.descPageCommitParam);
  const renderParam = parseJsonObjectLike(descRepublic?.descPageRenderParam);
  const renderModel = parseJsonObjectLike(descRepublic?.descPageRenderModel);
  const descPageDO = parseJsonObjectLike(renderModel?.descPageDO);
  const templateContent = commitParam?.templateContent;
  const editRst = descPageDO?.editRst;

  const inspectJsonString = (value: unknown) => {
    if (typeof value !== 'string') {
      return {
        type: typeof value,
        length: 0,
        startsWithBrace: false,
        parseOk: false,
        groupsCount: undefined,
        sellergroupsCount: undefined,
      };
    }

    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const groups = Array.isArray(parsed?.groups) ? parsed.groups.length : undefined;
      const sellergroups = Array.isArray(parsed?.sellergroups) ? parsed.sellergroups.length : undefined;
      return {
        type: 'string',
        length: value.length,
        startsWithBrace: trimmed.startsWith('{'),
        parseOk: true,
        groupsCount: groups,
        sellergroupsCount: sellergroups,
      };
    } catch {
      return {
        type: 'string',
        length: value.length,
        startsWithBrace: trimmed.startsWith('{'),
        parseOk: false,
        groupsCount: undefined,
        sellergroupsCount: undefined,
        preview: trimmed.slice(0, 120),
      };
    }
  };

  return {
    exists: Boolean(descRepublic),
    descRepublicType: typeof jsonBody.descRepublicOfSell,
    commitParamKeys: commitParam ? Object.keys(commitParam) : [],
    renderParamKeys: renderParam ? Object.keys(renderParam) : [],
    renderModelKeys: renderModel ? Object.keys(renderModel) : [],
    templateContent: inspectJsonString(templateContent),
    editRst: inspectJsonString(editRst),
    templateEqualsEditRst:
      typeof templateContent === 'string'
      && typeof editRst === 'string'
      && templateContent === editRst,
  };
}

function assertDescRepublicPayload(jsonBody: Record<string, unknown>): void {
  normalizeDescRepublicPayload(jsonBody);

  const descRepublic = asRecord(jsonBody.descRepublicOfSell);
  if (!descRepublic) {
    throw new PublishError(
      StepCode.FILL_DRAFT,
      '淘宝详情数据异常：descRepublicOfSell 不是对象',
      false,
      { descRepublicOfSell: summarizeForLog(jsonBody.descRepublicOfSell) },
    );
  }

  const commitParam = asRecord(descRepublic.descPageCommitParam);
  const renderModel = asRecord(descRepublic.descPageRenderModel);
  const descPageDO = asRecord(renderModel?.descPageDO);
  const templateContent = commitParam?.templateContent;
  const editRst = descPageDO?.editRst;

  const ensureJsonString = (fieldName: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new PublishError(
        StepCode.FILL_DRAFT,
        `淘宝详情数据异常：${fieldName} 为空或不是字符串`,
        false,
        { [fieldName]: summarizeForLog(value) },
      );
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not-object');
      }
    } catch {
      throw new PublishError(
        StepCode.FILL_DRAFT,
        `淘宝详情数据异常：${fieldName} 不是合法 JSON 对象字符串`,
        false,
        {
          [fieldName]: {
            length: value.length,
            preview: value.trim().slice(0, 120),
          },
        },
      );
    }
  };

  ensureJsonString('descPageCommitParam.templateContent', templateContent);
  ensureJsonString('descPageRenderModel.descPageDO.editRst', editRst);
}

export function buildDraftJsonBody(
  draftContext: TbDraftContext,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  let base: Record<string, unknown>;
  let baseSource: string;
  const pageJson = asRecord(draftContext.pageJsonData) ?? {};
  const models = asRecord(pageJson.models) ?? {};
  const globalModel = asRecord(models.global);
  const globalValue = asRecord(globalModel?.value) ?? {};

  if (draftContext.updateDraftJsonBody) {
    // 已有草稿优先使用从 draftOp/update.json 请求中拦截的 jsonBody
    base = { ...draftContext.updateDraftJsonBody };
    baseSource = 'updateDraftJsonBody';
  } else if (draftContext.addDraftJsonBody) {
    // 新建草稿优先使用从 draftOp/add.json 请求中拦截的 jsonBody（页面实际提交数据，最准确）
    base = { ...draftContext.addDraftJsonBody };
    baseSource = 'addDraftJsonBody';
  } else {
    // 回退：从 window.Json.models 重建
    const formValues = asRecord(models.formValues) ?? {};
    base = {
      ...globalValue,
      ...formValues,
      icmp_global: { ...globalValue },
    };
    baseSource = 'fallback(window.Json.models)';
  }

  // [LOGISTICS-DEBUG] 记录 base 来源及 tbExtractWay 原始值，以及 patch 中的值
  publishInfo('[buildDraftJsonBody] [LOGISTICS] tbExtractWay merge', {
    baseSource,
    base_tbExtractWay: summarizeForLog(base['tbExtractWay'] ?? null),
    patch_tbExtractWay: summarizeForLog(payload['tbExtractWay'] ?? null),
  });

  const merged = deepMergeDraftPayload(base, payload);
  const numericCatId = toNumericCatId(draftContext.catId);

  normalizeDescRepublicPayload(merged);

  // [LOGISTICS-DEBUG] 记录 merge 后结果
  publishInfo('[buildDraftJsonBody] [LOGISTICS] tbExtractWay after merge', {
    merged_tbExtractWay: summarizeForLog(merged['tbExtractWay'] ?? null),
  });

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

  merged.shopping_title = '';

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

function buildDefaultGlobalExtendInfo(startTraceId?: string): Record<string, unknown> {
  return {
    startTraceId: startTraceId?.trim() || `draft-cleanup-${Date.now()}`,
    skuDecoupling: 'true',
    noIcmp: 'true',
  };
}

function buildDraftSubmitFormData(
  draftContext: TbDraftContext,
  jsonBody: Record<string, unknown>,
  globalExtendInfo: Record<string, unknown>,
): Record<string, string> {
  const capturedForm = draftContext.updateDraftRequestForm ?? draftContext.addDraftRequestForm ?? {};

  return {
    ...capturedForm,
    id: draftContext.draftId ?? capturedForm.id ?? '',
    dbDraftId: draftContext.draftId ?? capturedForm.dbDraftId ?? '',
    jsonBody: JSON.stringify(jsonBody),
    globalExtendInfo: JSON.stringify(globalExtendInfo),
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

export interface TaobaoDraftListItem {
  id?: string | number;
  name?: string;
  time?: string;
  lastModify?: string;
  deleteUrl?: string;
  loadUrl?: string;
}

export interface TaobaoDraftListResponse extends NormalizedTbResponse {
  count?: number;
  infoMsg?: string;
  list?: TaobaoDraftListItem[];
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
  const descRepublicDebug = buildDescRepublicDebugInfo(jsonBody);
  publishInfo(`[task:${taskId}] [submit-draft-direct] descRepublicOfSell precheck`, descRepublicDebug);
  assertDescRepublicPayload(jsonBody);
  const globalExtendInfo = buildGlobalExtendInfo(draftContext);
  const data = buildDraftSubmitFormData(draftContext, jsonBody, globalExtendInfo);

  publishTaobaoRequestLog(taskId, 'submit-draft-direct', {
    url: `${TB_DRAFT_UPDATE_URL}?catId=${draftContext.catId}`,
    method: 'POST',
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
      reusedCapturedFormKeys: Object.keys(draftContext.updateDraftRequestForm ?? draftContext.addDraftRequestForm ?? {}),
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

export async function syncCustomSalePropsToTaobao(
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
    jsonBody: JSON.stringify(jsonBody),
    globalExtendInfo: JSON.stringify(globalExtendInfo),
  };
  const requestUrl = `${TB_CRO_RULE_ASYNC_CHECK_URL}?optType=croRuleAsyncCheck&catId=${draftContext.catId}`;

  publishTaobaoRequestLog(taskId, 'sync-custom-sale-props', {
    url: requestUrl,
    method: 'POST',
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: draftContext.itemId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
    },
  });

  const response = await axios.post<string>(requestUrl, data, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝自定义销售属性接口');
  const normalized = normalizeTbCroRuleResponse(rawData);
  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, normalized);

  publishTaobaoResponseLog(taskId, 'sync-custom-sale-props', {
    url: requestUrl,
    method: 'POST',
    status: response.status,
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: draftContext.itemId,
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

export async function listTaobaoDrafts(
  taskId: number,
  shopId: number,
  page: Page,
  catId: string,
  startTraceId?: string,
): Promise<TaobaoDraftListResponse> {
  let headers: Record<string, string>;
  try {
    headers = await buildTaobaoHeaders(page, page.url() || `${TB_PUBLISH_URL}?catId=${catId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cookie')) {
      await handleTbLoginRequired(StepCode.FILL_DRAFT, shopId);
    }
    throw error;
  }

  const globalExtendInfo = buildDefaultGlobalExtendInfo(startTraceId);
  const requestUrl = `${TB_DRAFT_LIST_URL}?catId=${encodeURIComponent(catId)}&globalExtendInfo=${encodeURIComponent(JSON.stringify(globalExtendInfo))}`;

  publishTaobaoRequestLog(taskId, 'list-drafts-before-create', {
    url: requestUrl,
    method: 'GET',
    catId,
    input: {
      headers: summarizeForLog(headers),
      globalExtendInfo: summarizeForLog(globalExtendInfo),
    },
  });

  const response = await axios.get<string>(requestUrl, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝草稿列表接口') as TaobaoDraftListResponse;
  const normalized = normalizeTbResponse(rawData) as TaobaoDraftListResponse;
  normalized.count = typeof rawData.count === 'number' ? rawData.count : Number(rawData.count ?? 0);
  normalized.infoMsg = typeof rawData.infoMsg === 'string' ? rawData.infoMsg : '';
  normalized.list = Array.isArray(rawData.list) ? rawData.list : [];
  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, normalized);

  publishTaobaoResponseLog(taskId, 'list-drafts-before-create', {
    url: requestUrl,
    method: 'GET',
    status: response.status,
    catId,
    output: {
      rawData: summarizeForLog(rawData),
      normalized: summarizeForLog({
        count: normalized.count,
        infoMsg: normalized.infoMsg,
        list: normalized.list,
        success: normalized.success,
        message: normalized.message,
      }),
    },
  });

  return normalized;
}

export async function deleteTaobaoDraftById(
  taskId: number,
  shopId: number,
  page: Page,
  catId: string,
  draftId: string,
  startTraceId?: string,
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

  const requestUrl = `${TB_DRAFT_DELETE_URL}?dbDraftId=${encodeURIComponent(draftId)}&catId=${encodeURIComponent(catId)}`;
  const data = {
    globalExtendInfo: JSON.stringify(buildDefaultGlobalExtendInfo(startTraceId)),
  };

  publishTaobaoRequestLog(taskId, 'delete-draft-before-create', {
    url: requestUrl,
    method: 'POST',
    catId,
    draftId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
    },
  });

  const response = await axios.post<string>(requestUrl, data, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝删除草稿接口');
  const normalized = normalizeTbResponse(rawData);
  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, normalized);

  publishTaobaoResponseLog(taskId, 'delete-draft-before-create', {
    url: requestUrl,
    method: 'POST',
    status: response.status,
    catId,
    draftId,
    output: {
      rawData: summarizeForLog(rawData),
      normalized: summarizeForLog(normalized),
    },
  });

  return normalized;
}

export async function deleteTaobaoDraft(
  taskId: number,
  shopId: number,
  page: Page,
  draftContext: TbDraftContext,
): Promise<NormalizedTbResponse> {
  if (!draftContext.draftId?.trim() || !draftContext.catId?.trim()) {
    return { success: true, type: 'success' };
  }

  let headers: Record<string, string>;
  try {
    headers = await buildTaobaoHeaders(page, page.url() || 'https://item.upload.taobao.com/sell/v2/draft.htm');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cookie')) {
      await handleTbLoginRequired(StepCode.PUBLISH, shopId);
    }
    throw error;
  }

  const requestUrl = `${TB_DRAFT_DELETE_URL}?dbDraftId=${encodeURIComponent(draftContext.draftId)}&catId=${encodeURIComponent(draftContext.catId)}`;
  const data = {
    globalExtendInfo: JSON.stringify(buildGlobalExtendInfo(draftContext)),
  };

  publishTaobaoRequestLog(taskId, 'delete-draft-after-publish', {
    url: requestUrl,
    method: 'POST',
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: draftContext.itemId,
    input: {
      headers: summarizeForLog(headers),
      data: summarizeForLog(data),
    },
  });

  const response = await axios.post<string>(requestUrl, data, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.PUBLISH, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝删除草稿接口');
  const normalized = normalizeTbResponse(rawData);
  await handleTbMaybeLoginRequired(StepCode.PUBLISH, shopId, normalized);

  publishTaobaoResponseLog(taskId, 'delete-draft-after-publish', {
    url: requestUrl,
    method: 'POST',
    status: response.status,
    catId: draftContext.catId,
    draftId: draftContext.draftId,
    itemId: draftContext.itemId,
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

export interface AsyncOptCatPropItem {
  name: string;
  uiType?: string;
  label?: string;
  required?: boolean;
  parent?: string;
  dataSource?: Array<{ value?: string | number; text?: string }>;
}

export async function fetchTbCatPropAsyncOpt(
  taskId: number,
  shopId: number,
  page: Page,
  draftContext: TbDraftContext,
  catPropValues: Record<string, unknown>,
): Promise<AsyncOptCatPropItem[]> {
  const catId = draftContext.catId;
  const itemId = draftContext.itemId ?? '';
  const referer = page.url() || 'https://item.upload.taobao.com/sell/v2/draft.htm';

  let headers: Record<string, string>;
  try {
    headers = await buildTaobaoHeaders(page, referer);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cookie')) {
      await handleTbLoginRequired(StepCode.FILL_DRAFT, shopId);
    }
    throw error;
  }

  const jsonBodyObj: Record<string, unknown> = {
    global: { catId, id: itemId },
    catProp: catPropValues,
  };
  const globalExtendInfoObj: Record<string, unknown> = {
    startTraceId: draftContext.startTraceId,
    skuDecoupling: 'true',
    noIcmp: 'true',
  };
  const data = {
    jsonBody: JSON.stringify(jsonBodyObj),
    globalExtendInfo: JSON.stringify(globalExtendInfoObj),
  };
  const requestUrl = `${TB_CRO_RULE_ASYNC_CHECK_URL}?optType=taobaoCatProp&editType=editTypeLog&catId=${catId}&id=${itemId}&requiredKey=title-foodPrdLicense-globalStock-images-id`;

  publishTaobaoRequestLog(taskId, 'fetch-cat-prop-async-opt', {
    url: requestUrl,
    method: 'POST',
    catId,
    draftId: draftContext.draftId,
    itemId,
    input: { data: summarizeForLog(data) },
  });

  const response = await axios.post<string>(requestUrl, data, {
    headers,
    timeout: 30000,
    responseType: 'text',
    transformResponse: [raw => raw],
  });

  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, response.data);
  const rawData = parseTaobaoResponseText(response.data, '淘宝商品属性扩展接口');
  await handleTbMaybeLoginRequired(StepCode.FILL_DRAFT, shopId, rawData);

  publishTaobaoResponseLog(taskId, 'fetch-cat-prop-async-opt', {
    url: requestUrl,
    method: 'POST',
    status: response.status,
    catId,
    draftId: draftContext.draftId,
    itemId,
    output: { rawData: summarizeForLog(rawData) },
  });

  // Parse catProps from noIcmp.models[name==="catProp"].dataSource
  const noIcmp = asRecord(rawData['noIcmp']);
  const models = noIcmp?.models;
  if (Array.isArray(models)) {
    const catPropModel = (models as Array<Record<string, unknown>>).find(m => m.name === 'catProp');
    if (catPropModel) {
      const dataSource = catPropModel.dataSource;
      if (Array.isArray(dataSource)) {
        return dataSource as AsyncOptCatPropItem[];
      }
    }
  }

  // Fallback: icmp.components.catProp.props.dataSource
  const icmp = asRecord(rawData['icmp']);
  const components = asRecord(icmp?.components);
  const catPropComponent = asRecord(components?.catProp);
  const props = asRecord(catPropComponent?.props);
  const ds = props?.dataSource;
  if (Array.isArray(ds)) {
    return ds as AsyncOptCatPropItem[];
  }

  return [];
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

export function normalizeTbCroRuleResponse(data: NormalizedTbResponse): NormalizedTbResponse {
  const result = normalizeTbResponse(data);
  const models = asRecord(result.models);
  const globalMessage = asRecord(models?.globalMessage);
  const globalType = globalMessage?.type;

  if (typeof globalType === 'string' && globalType.trim()) {
    result.type = globalType.trim();
  }

  if (!result.message) {
    const messageList = Array.isArray(globalMessage?.message) ? globalMessage?.message : [];
    const firstMessage = asRecord(messageList[0]);
    const nestedMessage = globalMessage?.msg ?? firstMessage?.msg;
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
