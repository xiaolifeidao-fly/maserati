import axios from 'axios';
import { TbEngine } from '@src/browser/tb.engine';
import type { TaobaoFreightTemplateOption } from '../types/publish-task';
import { publishInfo, publishWarn } from './publish-logger';

export const TB_FREIGHT_TEMPLATE_PAGE =
  'https://qn.taobao.com/home.htm/consign-tools-group/freightTemplate/templateEdit?toolAuth=cm-tool-manage&pageVersion=V2';

export const TB_FREIGHT_TEMPLATE_LIST_PAGE =
  'https://qn.taobao.com/home.htm/consign-tools-group/freightTemplate';

export const TB_FREIGHT_TEMPLATE_CREATE_API =
  'https://adpmanager.taobao.com/user/normal_template_setting_action.do';

export const TB_FREIGHT_TEMPLATE_LIST_API =
  'https://adpmanager.taobao.com/user/normal_template_list.do';

export interface TaobaoFreightTemplateSession {
  cookieString: string;
  userAgent: string;
}

function isTaobaoLoginUrl(url: string): boolean {
  const text = String(url || '').toLowerCase();
  return text.includes('loginmyseller.taobao.com')
    || text.includes('login.taobao.com')
    || text.includes('/member/login');
}

export async function openTaobaoFreightTemplateSession(
  taskId: number | undefined,
  shopId: number,
): Promise<TaobaoFreightTemplateSession | null> {
  publishInfo(`[task:${taskId ?? 'ui'}] [freight-template] 打开运费模板页面`, {
    shopId,
    url: TB_FREIGHT_TEMPLATE_PAGE,
  });
  const engine = new TbEngine(String(shopId), true);
  try {
    const page = await engine.init(TB_FREIGHT_TEMPLATE_PAGE);
    if (!page) {
      publishWarn(`[task:${taskId ?? 'ui'}] [freight-template] TbEngine.init 返回 null，页面打开失败`, { shopId });
      return null;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const currentUrl = page.url();
    const cookies = await page.context().cookies([
      'https://qn.taobao.com',
      'https://taobao.com',
      'https://adpmanager.taobao.com',
    ]);
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const userAgent = await page.evaluate(() => (
      (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? ''
    )).catch(() => '');
    const tbTokenFound = cookies.some(c => c.name === '_tb_token_');

    publishInfo(`[task:${taskId ?? 'ui'}] [freight-template] cookie 读取结果`, {
      shopId,
      currentUrl,
      totalCookies: cookies.length,
      cookieNames: cookies.map(c => c.name),
      tbTokenFound,
      userAgent: userAgent ? userAgent.slice(0, 120) : '',
    });

    if (isTaobaoLoginUrl(currentUrl)) {
      publishWarn(`[task:${taskId ?? 'ui'}] [freight-template] 运费模板页被重定向到登录页，卖家后台会话失效`, {
        shopId,
        currentUrl,
        tbTokenFound,
        totalCookies: cookies.length,
      });
      return null;
    }

    if (!cookieString) {
      publishWarn(`[task:${taskId ?? 'ui'}] [freight-template] cookie 为空，无法请求列表`, {
        shopId,
        currentUrl,
      });
      return null;
    }

    return {
      cookieString,
      userAgent: userAgent || 'Mozilla/5.0',
    };
  } finally {
    await engine.closePage().catch(() => undefined);
  }
}

export async function listTaobaoFreightTemplates(params: {
  taskId?: number;
  name?: string;
  cookieString: string;
  userAgent: string;
  pageIndex?: number;
  pageSize?: number;
}): Promise<TaobaoFreightTemplateOption[]> {
  const {
    taskId,
    name,
    cookieString,
    userAgent,
    pageIndex = 1,
    pageSize = 50,
  } = params;

  const headers: Record<string, string> = {
    'accept': 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://qn.taobao.com',
    'pragma': 'no-cache',
    'referer': TB_FREIGHT_TEMPLATE_LIST_PAGE,
    'cookie': cookieString,
    'user-agent': userAgent || 'Mozilla/5.0',
  };

  publishInfo(`[task:${taskId ?? 'ui'}] [freight-template] 发起列表接口请求`, {
    api: TB_FREIGHT_TEMPLATE_LIST_API,
    params: {
      name: String(name ?? '').trim(),
      pageIndex,
      pageSize,
    },
    cookieLength: cookieString.length,
    userAgent: (userAgent || 'Mozilla/5.0').slice(0, 120),
  });

  let listResponse;
  try {
    listResponse = await axios.get(TB_FREIGHT_TEMPLATE_LIST_API, {
      params: { name: String(name ?? '').trim(), pageIndex, pageSize },
      headers,
    });
  } catch (axiosErr: unknown) {
    const isAxiosError = axiosErr !== null && typeof axiosErr === 'object' && 'response' in axiosErr;
    const axiosResponse = isAxiosError ? (axiosErr as { response?: { status?: number; data?: unknown } }).response : undefined;
    publishWarn(`[task:${taskId ?? 'ui'}] [freight-template] 列表接口异常`, {
      error: axiosErr instanceof Error ? axiosErr.message : String(axiosErr),
      httpStatus: axiosResponse?.status ?? null,
      responseBody: axiosResponse?.data ?? null,
    });
    return [];
  }

  const listData = listResponse.data as {
    success?: boolean;
    data?: Array<{ name?: string; templateId?: number | string }>;
    pageInfo?: { totalCount?: number };
    msg?: string;
  };
  const responseDataType = Array.isArray(listResponse.data) ? 'array' : typeof listResponse.data;
  const responseBodyPreview = typeof listResponse.data === 'string'
    ? listResponse.data.slice(0, 500)
    : JSON.stringify(listResponse.data ?? null).slice(0, 500);

  publishInfo(`[task:${taskId ?? 'ui'}] [freight-template] 列表接口响应`, {
    httpStatus: listResponse.status,
    contentType: listResponse.headers?.['content-type'] ?? null,
    responseDataType,
    responseKeys: listResponse.data && typeof listResponse.data === 'object' && !Array.isArray(listResponse.data)
      ? Object.keys(listResponse.data as Record<string, unknown>)
      : [],
    responseBodyPreview,
    success: listData?.success,
    msg: listData?.msg ?? null,
    totalCount: listData?.pageInfo?.totalCount ?? null,
    rawCount: (listData?.data ?? []).length,
    names: (listData?.data ?? []).map(t => t.name),
  });

  const templates = (listData?.data ?? [])
    .map(item => ({
      templateId: String(item.templateId ?? '').trim(),
      name: String(item.name ?? '').trim(),
    }))
    .filter(item => item.templateId !== '');

  publishInfo(`[task:${taskId ?? 'ui'}] [freight-template] 列表解析结果`, {
    count: templates.length,
    templates,
  });

  return templates;
}

export async function fetchTaobaoFreightTemplateIdByName(params: {
  taskId: number;
  templateName: string;
  cookieString: string;
  userAgent: string;
}): Promise<string | null> {
  const templates = await listTaobaoFreightTemplates({
    taskId: params.taskId,
    name: params.templateName,
    cookieString: params.cookieString,
    userAgent: params.userAgent,
    pageIndex: 1,
    pageSize: 50,
  });
  const matched = templates.find(t => t.name === params.templateName);
  return matched?.templateId ?? null;
}
