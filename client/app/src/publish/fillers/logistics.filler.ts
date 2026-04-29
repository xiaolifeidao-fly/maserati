import type { IFiller, FillerContext } from './filler.interface';
import { requestBackend } from '@src/impl/shared/backend';
import { publishInfo, publishWarn } from '../utils/publish-logger';
import { TbEngine } from '@src/browser/tb.engine';
import { PublishError } from '../core/errors';
import { StepCode } from '../types/publish-task';
import axios from 'axios';

declare const navigator: { userAgent: string };

interface AddressDTO {
  id: number;
  countryCode: string;
  provinceCode: string;
  cityCode: string;
  cityName: string;
}

interface AddressTemplateDTO {
  id: number;
  platformShopId: string;
  addressId: number;
  templateId: string;
}

/** window.Json logisticsSubItems 中 name="template" 的单条模板选项 */
interface TemplateOption {
  value: string;
  text: string;
}

/**
 * LogisticsFiller — 物流/运费填充器
 *
 * 填充内容：
 *  - tbExtractWay      运费模板
 *  - deliveryTimeType  发货时间（固定当日发货）
 *  - shippingArea      发货地（城市）
 *
 * tbExtractWay 选模板优先级：
 *  1. product.logistics.templateId（源商品直接带了模板ID）
 *  2. shipFrom 关键词与 window.Json 模板列表 text 字段精确匹配
 *  3. 服务端 address_template 表中按 platformShopId 存储的 templateId（需在模板列表中验证存在）
 *  4. 调用淘宝 adpmanager 接口动态创建运费模板，创建成功后写回服务端缓存
 */
export class LogisticsFiller implements IFiller {
  readonly fillerName = 'LogisticsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { taskId, shopId, platformShopId, product, draftPayload, tbWindowJson } = ctx;
    const { logistics } = product;

    // ── 打印原始物流数据，便于排查数据来源问题 ──────────────────────────────────
    publishInfo(`[task:${taskId}] [LogisticsFiller] ① 原始 logistics 数据`, {
      taskId,
      logistics,
    });

    // ── 从 window.Json 提取模板列表 ───────────────────────────────────────────
    const templateOptions = extractTemplateOptions(tbWindowJson);
    publishInfo(`[task:${taskId}] [LogisticsFiller] ② window.Json 模板列表`, {
      taskId,
      tbWindowJsonExists: tbWindowJson !== undefined,
      logisticsSubItemsCount: tbWindowJson?.logisticsSubItems?.length ?? 0,
      templateCount: templateOptions.length,
      options: templateOptions,
    });

    // ── shipFrom 关键词归一化 ──────────────────────────────────────────────────
    const shipFromFromLogistics = String(logistics.shipFrom ?? '').trim();
    const shipFromFromAttributes = getAttributeValue(product.attributes, '发货地');
    const rawShipFrom = shipFromFromLogistics || shipFromFromAttributes || '北京市';
    const shipFromKeyword = getKeywords(rawShipFrom);
    publishInfo(`[task:${taskId}] [LogisticsFiller] ③ shipFrom 关键词`, {
      taskId,
      rawShipFrom: logistics.shipFrom ?? null,
      attributeShipFrom: shipFromFromAttributes || null,
      source: shipFromFromLogistics ? 'logistics.shipFrom' : shipFromFromAttributes ? 'attributes.发货地' : 'default',
      normalized: rawShipFrom,
      keyword: shipFromKeyword,
    });

    // ── 查询发货地址（供 shippingArea 和动态创建模板共用）────────────────────────
    // 用 shipFromKeyword（切割后的第一段）查询，避免原始串含分号/逗号导致 LIKE 匹配失败
    const address = await queryAddressByKeywords(taskId, shipFromKeyword);
    publishInfo(`[task:${taskId}] [LogisticsFiller] ④ 服务端地址查询`, {
      taskId,
      keywords: shipFromKeyword,
      found: Boolean(address),
      address: address ?? null,
    });

    // ── tbExtractWay 解析（按优先级依次尝试）────────────────────────────────────
    publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤ 开始解析 templateId`, {
      taskId,
      p1_productTemplateId: logistics.templateId ?? null,
      p2_keyword: shipFromKeyword,
      p2_templateOptions: templateOptions,
      platformShopId: platformShopId || null,
      p3_addressFound: Boolean(address),
      existingTbExtractWay: draftPayload['tbExtractWay'] ?? null,
    });

    let resolvedTemplateId: string | null = null;

    // 优先级 1：源商品直接带了 templateId
    if (logistics.templateId) {
      resolvedTemplateId = String(logistics.templateId);
      publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤-P1 hit: product.templateId`, {
        taskId,
        templateId: resolvedTemplateId,
      });
    } else {
      publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤-P1 miss: product.templateId 为空`, { taskId });
    }

    // 优先级 2：keyword 与 window.Json 模板列表 text 精确匹配
    if (!resolvedTemplateId) {
      resolvedTemplateId = matchTemplateByText(shipFromKeyword, templateOptions);
      if (resolvedTemplateId) {
        publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤-P2 hit: keyword 精确匹配`, {
          taskId,
          keyword: shipFromKeyword,
          templateId: resolvedTemplateId,
        });
      } else {
        publishWarn(`[task:${taskId}] [LogisticsFiller] ⑤-P2 miss: keyword 未匹配任何模板`, {
          taskId,
          keyword: shipFromKeyword,
          availableTexts: templateOptions.map(o => o.text),
        });
      }
    }

    // 优先级 3：通过淘宝接口动态创建运费模板
    if (!resolvedTemplateId) {
      if (!address) {
        publishWarn(`[task:${taskId}] [LogisticsFiller] ⑤-P3 skip: address 为 null，无法创建模板`, { taskId });
      } else {
        publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤-P3 start: 调用淘宝创建运费模板`, {
          taskId,
          templateName: shipFromKeyword,
          addressId: `${address.countryCode},${address.provinceCode},${address.cityCode}`,
        });
        resolvedTemplateId = await createTaobaoShippingTemplate(
          taskId,
          shopId,
          platformShopId,
          shipFromKeyword,
          address,
        );
        if (resolvedTemplateId) {
          publishInfo(`[task:${taskId}] [LogisticsFiller] ⑤-P3 hit: 淘宝接口创建成功`, {
            taskId,
            templateId: resolvedTemplateId,
          });
        } else {
          publishWarn(`[task:${taskId}] [LogisticsFiller] ⑤-P3 miss: 淘宝接口未返回 templateId`, { taskId });
        }
      }
    }

    // ── 写入 tbExtractWay ─────────────────────────────────────────────────────
    if (!resolvedTemplateId) {
      publishWarn(`[task:${taskId}] [LogisticsFiller] ⑥ 所有优先级均未找到运费模板，终止发布`, {
        taskId,
        shipFromKeyword,
        templateOptions,
      });
      throw new PublishError(
        StepCode.FILL_DRAFT,
        `未找到运费模板，发货地：${shipFromKeyword}`,
        false,
        { shipFromKeyword, templateOptions },
      );
    }

    draftPayload['tbExtractWay'] = {
      template: resolvedTemplateId,
      value: ['2'],
    };
    publishInfo(`[task:${taskId}] [LogisticsFiller] ⑥ tbExtractWay 写入成功`, {
      taskId,
      tbExtractWay: draftPayload['tbExtractWay'],
    });

    // ── deliveryTimeType ──────────────────────────────────────────────────────
    draftPayload['deliveryTimeType'] = { value: '0' };
    publishInfo(`[task:${taskId}] [LogisticsFiller] ⑦ deliveryTimeType 写入`, { taskId });

    // ── shippingArea ──────────────────────────────────────────────────────────
    const hasShippingAreaComponent = Boolean(tbWindowJson?.components['shippingArea']);
    publishInfo(`[task:${taskId}] [LogisticsFiller] ⑧ shippingArea`, {
      taskId,
      hasShippingAreaComponent,
      addressFound: Boolean(address),
    });

    if (!hasShippingAreaComponent) {
      publishInfo(`[task:${taskId}] [LogisticsFiller] ⑧ 无 shippingArea 组件，跳过`, { taskId });
      return;
    }

    draftPayload['shippingArea'] = {
      type: '1',
      warehouseType: '1',
      value: address
        ? { text: address.cityName, value: address.cityCode }
        : {},
    };

    publishInfo(`[task:${taskId}] [LogisticsFiller] ⑧ shippingArea 写入`, {
      taskId,
      shippingArea: draftPayload['shippingArea'],
    });
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 从发货地址字符串中提取第一个关键词
 * 与旧代码 getKeywords 逻辑一致：遇到分号/全角分号/全角逗号/半角逗号时取首段
 */
function getKeywords(keywords: string): string {
  if (keywords.includes(';')) return keywords.split(';')[0];
  if (keywords.includes('；')) return keywords.split('；')[0];
  if (keywords.includes('，')) return keywords.split('，')[0];
  if (keywords.includes(',')) return keywords.split(',')[0];
  return keywords;
}

function getAttributeValue(
  attributes: FillerContext['product']['attributes'],
  name: string,
): string {
  const matched = attributes.find(attr => String(attr.name ?? '').trim() === name);
  return String(matched?.value ?? '').trim();
}

/**
 * 从 tbWindowJson.logisticsSubItems 中提取 name="template" 的模板选项列表
 */
function extractTemplateOptions(
  tbWindowJson: FillerContext['tbWindowJson'],
): TemplateOption[] {
  const subItems = tbWindowJson?.logisticsSubItems ?? [];
  const templateSubItem = subItems.find(item => item.name === 'template');
  if (!templateSubItem) return [];

  return templateSubItem.dataSource
    .map(option => ({
      value: String(option.value ?? '').trim(),
      text: String(option.text ?? '').trim(),
    }))
    .filter(option => option.value !== '');
}

/**
 * 用发货地关键词与模板列表 text 字段精确匹配（旧代码 getTemplateIdByKeywords 核心）
 * 例：shipFromKeyword="北京市" 匹配 templateOption.text="北京市" → 返回其 value
 */
function matchTemplateByText(keyword: string, templateOptions: TemplateOption[]): string | null {
  if (!keyword) return null;
  const matched = templateOptions.find(opt => opt.text === keyword);
  return matched?.value ?? null;
}

/**
 * 通过关键词查询服务端地址库，返回第一条匹配记录（含完整地区编码）
 *
 * 搜索策略（按顺序，命中即返回）：
 *  1. 原词 — 如 "北京市" "沧州市"
 *  2. 去除前 2 字 — 处理"省市拼接"格式，如 "河北沧州" → "沧州"
 *  3. 去除前 3 字 — 处理三字省份，如 "内蒙古包头" → "包头"
 */
async function queryAddressByKeywords(taskId: number, keywords: string): Promise<AddressDTO | null> {
  const attempts: string[] = [keywords];
  if (keywords.length > 2) attempts.push(keywords.slice(2));   // 去掉 2 字省份前缀
  if (keywords.length > 3) attempts.push(keywords.slice(3));   // 去掉 3 字省份前缀（内蒙古等）

  for (const kw of attempts) {
    const result = await trySingleAddressQuery(taskId, kw);
    if (result) {
      if (kw !== keywords) {
        publishInfo(`[task:${taskId}] [LogisticsFiller] /addresses 备用关键词命中`, {
          taskId,
          original: keywords,
          used: kw,
        });
      }
      return result;
    }
  }
  return null;
}

async function trySingleAddressQuery(taskId: number, keywords: string): Promise<AddressDTO | null> {
  try {
    const result = await requestBackend<{ data: AddressDTO[]; total: number }>(
      'GET',
      '/addresses',
      { params: { keywords, pageSize: '1', pageIndex: '1' } },
    );
    publishInfo(`[task:${taskId}] [LogisticsFiller] /addresses 查询`, {
      taskId,
      keywords,
      total: result.total ?? 0,
      found: Boolean(result.data?.[0]),
    });
    return result.data?.[0] ?? null;
  } catch (err) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] /addresses 请求异常`, {
      taskId,
      keywords,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

const TB_FREIGHT_TEMPLATE_PAGE =
  'https://qn.taobao.com/home.htm/consign-tools-group/freightTemplate/templateEdit?toolAuth=cm-tool-manage&pageVersion=V2';

const TB_FREIGHT_TEMPLATE_API =
  'https://adpmanager.taobao.com/user/normal_template_setting_action.do';

/**
 * 通过淘宝 qn.taobao.com 运费模板页面动态创建运费模板
 *
 * 流程：
 *  1. 用 TbEngine 打开 qn.taobao.com 运费模板编辑页，获取 _tb_token_ cookie 及完整 cookie 串
 *  2. 以地址编码（countryCode,provinceCode,cityCode）为 addressId 调用淘宝创建接口
 *  3. 成功后将 templateId 写回服务端 address_template 缓存表
 */
async function createTaobaoShippingTemplate(
  taskId: number,
  shopId: number,
  platformShopId: string,
  templateName: string,
  address: AddressDTO,
): Promise<string | null> {
  publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 打开运费模板页面`, {
    taskId,
    shopId,
    url: TB_FREIGHT_TEMPLATE_PAGE,
  });
  const engine = new TbEngine(String(shopId), true);
  try {
    const page = await engine.init(TB_FREIGHT_TEMPLATE_PAGE);
    if (!page) {
      publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: TbEngine.init 返回 null，页面打开失败`, { taskId });
      return null;
    }

    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 页面已打开，等待加载`, { taskId });
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);

    const currentUrl = page.url();
    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 页面加载完成`, {
      taskId,
      currentUrl,
    });

    // _tb_token_ 直接从 cookie 中读取
    const cookies = await page.context().cookies([
      'https://qn.taobao.com',
      'https://taobao.com',
      'https://adpmanager.taobao.com',
    ]);
    const tbToken = cookies.find(c => c.name === '_tb_token_')?.value ?? '';
    const cookieNames = cookies.map(c => c.name);
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: cookie 读取结果`, {
      taskId,
      totalCookies: cookies.length,
      cookieNames,
      tbTokenFound: Boolean(tbToken),
      tbTokenValue: tbToken ? `${tbToken.slice(0, 4)}...` : null,
    });

    if (!tbToken) {
      publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: cookie 中无 _tb_token_，可能未登录`, { taskId });
      return null;
    }

    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '');

    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 发起 POST 请求`, {
      taskId,
      api: TB_FREIGHT_TEMPLATE_API,
      templateName,
      addressId: `${address.countryCode},${address.provinceCode},${address.cityCode}`,
      userAgent: userAgent.slice(0, 80),
    });

    const templateId = await postTaobaoAddressTemplate({
      tbToken,
      cookieString,
      userAgent,
      templateName,
      address,
      taskId,
    });

    if (!templateId) {
      publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: POST 未返回 templateId`, { taskId });
      return null;
    }

    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 创建成功`, {
      taskId,
      templateId,
    });

    if (platformShopId) {
      await saveAddressTemplate(taskId, platformShopId, address.id, templateId);
    }

    return templateId;
  } catch (err) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: 未捕获异常`, {
      taskId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return null;
  } finally {
    await engine.closePage().catch(() => undefined);
  }
}

/**
 * 调用淘宝 normal_template_setting_action.do 创建运费模板，返回 templateId
 */
async function postTaobaoAddressTemplate(params: {
  tbToken: string;
  cookieString: string;
  userAgent: string;
  templateName: string;
  address: AddressDTO;
  taskId: number;
}): Promise<string | null> {
  const { tbToken, cookieString, userAgent, templateName, address, taskId } = params;
  const addressId = `${address.countryCode},${address.provinceCode},${address.cityCode}`;

  const headers: Record<string, string> = {
    'accept': 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'origin': 'https://qn.taobao.com',
    'pragma': 'no-cache',
    'referer': TB_FREIGHT_TEMPLATE_PAGE,
    'cookie': cookieString,
    'user-agent': userAgent || 'Mozilla/5.0',
  };

  const body = new URLSearchParams({
    _tb_token_: tbToken,
    addressId,
    bearFreight: '2',
    editSource: '2',
    limitType: '0',
    pageVersion: 'V2',
    templateName,
    toolAuth: 'cm-tool-manage',
    valuation: '0',
    normalTemplate: JSON.stringify({
      checkboxGroup: [
        {
          template: {
            defaultConfig: [
              { name: 'startStandard', addonAfter: '{unit}内', value: '1' },
              { name: 'startFee', addonAfter: '元，', value: '' },
              { name: 'addStandard', label: '每增加', addonAfter: '{unit}，', value: '1' },
              { name: 'addFee', label: '增加运费', addonAfter: '元', value: '' },
            ],
            title: '默认运费',
          },
          defaultFee: false,
          checked: true,
          disabled: false,
          title: '快递',
          value: '-4',
        },
        {
          template: {
            defaultConfig: [
              { name: 'startStandard', addonAfter: '{unit}内', value: '1' },
              { name: 'startFee', addonAfter: '元，', value: '' },
              { name: 'addStandard', label: '每增加', addonAfter: '{unit}，', value: '1' },
              { name: 'addFee', label: '增加运费', addonAfter: '元', value: '' },
            ],
            title: '默认运费',
          },
          defaultFee: false,
          checked: false,
          disabled: false,
          title: '同城配送',
          value: '26000',
        },
        {
          template: {
            defaultConfig: [
              { name: 'startStandard', addonAfter: '{unit}内', value: '1' },
              { name: 'startFee', addonAfter: '元，', value: '' },
              { name: 'addStandard', label: '每增加', addonAfter: '{unit}，', value: '1' },
              { name: 'addFee', label: '增加运费', addonAfter: '元', value: '' },
            ],
            title: '默认运费',
          },
          defaultFee: false,
          checked: false,
          disabled: false,
          title: 'EMS',
          value: '-7',
        },
        {
          template: {
            defaultConfig: [
              { name: 'startStandard', addonAfter: '{unit}内', value: '1' },
              { name: 'startFee', addonAfter: '元，', value: '' },
              { name: 'addStandard', label: '每增加', addonAfter: '{unit}，', value: '1' },
              { name: 'addFee', label: '增加运费', addonAfter: '元', value: '' },
            ],
            title: '默认运费',
          },
          defaultFee: false,
          checked: true,
          disabled: false,
          title: '平邮',
          value: '-1',
        },
      ],
    }),
    promotionTemplate: JSON.stringify({
      template: { details: [] },
      checked: false,
      title: '指定条件包邮',
      value: '0',
      tips: "<img src='//img.alicdn.com/tps/i1/TB1Sw5KFVXXXXb7XFXX1xhnFFXX-23-12.png'>可选",
    }),
  });

  let response;
  try {
    response = await axios.post(TB_FREIGHT_TEMPLATE_API, body.toString(), { headers });
  } catch (axiosErr: unknown) {
    const isAxiosError = axiosErr !== null && typeof axiosErr === 'object' && 'response' in axiosErr;
    const axiosResponse = isAxiosError ? (axiosErr as { response?: { status?: number; data?: unknown } }).response : undefined;
    publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: axios POST 异常`, {
      taskId,
      error: axiosErr instanceof Error ? axiosErr.message : String(axiosErr),
      httpStatus: axiosResponse?.status ?? null,
      responseBody: axiosResponse?.data ?? null,
    });
    return null;
  }

  const data = response.data as Record<string, unknown>;
  publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: POST 响应`, {
    taskId,
    httpStatus: response.status,
    responseData: data,
  });

  if (!data?.success) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: POST 返回 success=false`, {
      taskId,
      msg: data?.msg ?? null,
    });
    return null;
  }

  // 等待淘宝后端数据同步后再查询列表
  publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 等待 2s 后查询列表`, { taskId });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 创建成功，接口不直接返回 templateId，调列表接口按 name 精确匹配
  return fetchTemplateIdByName(taskId, templateName, cookieString, userAgent);
}

const TB_FREIGHT_TEMPLATE_LIST_API =
  'https://adpmanager.taobao.com/user/normal_template_list.do';

/**
 * 查询运费模板列表，按 name 精确匹配返回 templateId
 * 新创建的模板在列表首位，pageSize=50 覆盖大多数情况
 */
async function fetchTemplateIdByName(
  taskId: number,
  templateName: string,
  cookieString: string,
  userAgent: string,
): Promise<string | null> {
  const listHeaders: Record<string, string> = {
    'accept': 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://qn.taobao.com',
    'pragma': 'no-cache',
    'referer': 'https://qn.taobao.com/home.htm/consign-tools-group/freightTemplate',
    'cookie': cookieString,
    'user-agent': userAgent || 'Mozilla/5.0',
  };

  let listResponse;
  try {
    listResponse = await axios.get(TB_FREIGHT_TEMPLATE_LIST_API, {
      params: { name: templateName, pageIndex: 1, pageSize: 50 },
      headers: listHeaders,
    });
  } catch (axiosErr: unknown) {
    const isAxiosError = axiosErr !== null && typeof axiosErr === 'object' && 'response' in axiosErr;
    const axiosResponse = isAxiosError ? (axiosErr as { response?: { status?: number; data?: unknown } }).response : undefined;
    publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: 列表接口异常`, {
      taskId,
      error: axiosErr instanceof Error ? axiosErr.message : String(axiosErr),
      httpStatus: axiosResponse?.status ?? null,
      responseBody: axiosResponse?.data ?? null,
    });
    return null;
  }

  const listData = listResponse.data as {
    success?: boolean;
    data?: Array<{ name?: string; templateId?: number | string }>;
  };

  publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 列表接口响应`, {
    taskId,
    success: listData?.success,
    totalCount: (listData as Record<string, unknown>)?.pageInfo
      ? ((listData as Record<string, unknown>).pageInfo as Record<string, unknown>)?.totalCount
      : null,
    names: (listData?.data ?? []).map(t => t.name),
  });

  const matched = (listData?.data ?? []).find(t => t.name === templateName);
  if (matched?.templateId) {
    const templateId = String(matched.templateId);
    publishInfo(`[task:${taskId}] [LogisticsFiller] create-template: 列表匹配成功`, {
      taskId,
      templateName,
      templateId,
    });
    return templateId;
  }

  publishWarn(`[task:${taskId}] [LogisticsFiller] create-template: 列表中未找到 name="${templateName}"`, {
    taskId,
    templateName,
    availableNames: (listData?.data ?? []).map(t => t.name),
  });
  return null;
}

/**
 * 将新创建的 templateId 写回服务端 address_template 缓存表
 */
async function saveAddressTemplate(
  taskId: number,
  platformShopId: string,
  addressId: number,
  templateId: string,
): Promise<void> {
  try {
    await requestBackend('POST', '/address-templates', {
      data: { platformShopId, addressId, templateId },
    });
    publishInfo(`[task:${taskId}] [LogisticsFiller] address_template 已写回服务端`, {
      taskId,
      platformShopId,
      addressId,
      templateId,
    });
  } catch (err) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] address_template 写回失败（非关键路径）`, {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
