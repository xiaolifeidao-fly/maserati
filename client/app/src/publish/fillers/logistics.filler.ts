import type { IFiller, FillerContext } from './filler.interface';
import { requestBackend } from '@src/impl/shared/backend';
import { publishInfo, publishWarn } from '../utils/publish-logger';

interface AddressDTO {
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
 *  4. 以上均无时保留草稿原始值
 */
export class LogisticsFiller implements IFiller {
  readonly fillerName = 'LogisticsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { taskId, platformShopId, product, draftPayload, tbWindowJson } = ctx;
    const { logistics } = product;

    // ── 从 window.Json 提取模板列表 ───────────────────────────────────────────
    const templateOptions = extractTemplateOptions(tbWindowJson);
    publishInfo(`[task:${taskId}] [LogisticsFiller] templateOptions from window.Json`, {
      taskId,
      count: templateOptions.length,
      options: templateOptions,
    });

    // ── shipFrom 关键词归一化（同旧代码 getKeywords：取分号/逗号前第一段）──────
    const rawShipFrom = String(logistics.shipFrom ?? '').trim() || '北京市';
    const shipFromKeyword = getKeywords(rawShipFrom);

    // ── tbExtractWay ──────────────────────────────────────────────────────────
    publishInfo(`[task:${taskId}] [LogisticsFiller] tbExtractWay 入参`, {
      taskId,
      templateId: logistics.templateId ?? null,
      shipFrom: logistics.shipFrom ?? null,
      shipFromKeyword,
      platformShopId: platformShopId || null,
      existingTbExtractWay: draftPayload['tbExtractWay'] ?? null,
    });

    let resolvedTemplateId: string | null = null;

    if (logistics.templateId) {
      // 优先级 1：源商品直接带了 templateId
      resolvedTemplateId = String(logistics.templateId);
      publishInfo(`[task:${taskId}] [LogisticsFiller] tbExtractWay: hit priority-1 (product.templateId)`, {
        taskId,
        template: resolvedTemplateId,
      });
    }

    if (!resolvedTemplateId) {
      // 优先级 2：用 shipFrom 关键词与模板列表 text 精确匹配（旧代码核心逻辑）
      resolvedTemplateId = matchTemplateByText(shipFromKeyword, templateOptions);
      if (resolvedTemplateId) {
        publishInfo(`[task:${taskId}] [LogisticsFiller] tbExtractWay: hit priority-2 (text match)`, {
          taskId,
          keyword: shipFromKeyword,
          template: resolvedTemplateId,
        });
      }
    }

    if (!resolvedTemplateId) {
      // 优先级 3：从服务端 address_template 查存储的 templateId，再验证在模板列表中存在
      resolvedTemplateId = await resolveTemplateFromServer(taskId, platformShopId, templateOptions);
      if (resolvedTemplateId) {
        publishInfo(`[task:${taskId}] [LogisticsFiller] tbExtractWay: hit priority-3 (server address_template)`, {
          taskId,
          template: resolvedTemplateId,
        });
      }
    }

    if (resolvedTemplateId) {
      draftPayload['tbExtractWay'] = {
        template: resolvedTemplateId,
        value: ['2'],
      };
    } else {
      publishWarn(`[task:${taskId}] [LogisticsFiller] 无法解析 templateId，保留草稿原始值`, {
        taskId,
        shipFromKeyword,
        templateOptions,
        existingTbExtractWay: draftPayload['tbExtractWay'] ?? null,
      });
    }

    // ── deliveryTimeType（固定当日发货，同旧代码）────────────────────────────
    draftPayload['deliveryTimeType'] = { value: '0' };

    // ── shippingArea ──────────────────────────────────────────────────────────
    const hasShippingAreaComponent = Boolean(tbWindowJson?.components['shippingArea']);
    publishInfo(`[task:${taskId}] [LogisticsFiller] shippingArea`, {
      taskId,
      hasShippingAreaComponent,
      shipFrom: logistics.shipFrom ?? null,
    });

    if (!hasShippingAreaComponent) {
      publishInfo(`[task:${taskId}] [LogisticsFiller] 无 shippingArea 组件，跳过`, { taskId });
      return;
    }

    publishInfo(`[task:${taskId}] [LogisticsFiller] 查询发货地址`, { taskId, keywords: rawShipFrom });

    const address = await queryAddressByKeywords(taskId, rawShipFrom);
    publishInfo(`[task:${taskId}] [LogisticsFiller] 发货地址查询结果`, {
      taskId,
      keywords: rawShipFrom,
      found: Boolean(address),
      cityName: address?.cityName ?? null,
      cityCode: address?.cityCode ?? null,
    });

    draftPayload['shippingArea'] = {
      type: '1',
      warehouseType: '1',
      value: address
        ? { text: address.cityName, value: address.cityCode }
        : {},
    };

    publishInfo(`[task:${taskId}] [LogisticsFiller] shippingArea set`, {
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
 * 从服务端 address_template 表查出 templateId，
 * 并在 window.Json 模板列表中验证其存在后返回
 */
async function resolveTemplateFromServer(
  taskId: number,
  platformShopId: string,
  templateOptions: TemplateOption[],
): Promise<string | null> {
  if (!platformShopId) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] platformShopId 为空，跳过服务端模板查询`, { taskId });
    return null;
  }

  let templates: AddressTemplateDTO[] = [];
  try {
    const result = await requestBackend<AddressTemplateDTO[]>(
      'GET',
      '/address-templates',
      { params: { platformShopId } },
    );
    templates = Array.isArray(result) ? result : [];
    publishInfo(`[task:${taskId}] [LogisticsFiller] /address-templates 原始响应`, {
      taskId,
      platformShopId,
      count: templates.length,
      templates,
    });
  } catch (err) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] /address-templates 请求异常`, {
      taskId,
      platformShopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // 在 window.Json 模板列表中验证存在性，返回第一个匹配的 templateId
  const validValues = new Set(templateOptions.map(o => o.value));
  for (const t of templates) {
    const tid = String(t.templateId ?? '').trim();
    if (tid && validValues.has(tid)) {
      publishInfo(`[task:${taskId}] [LogisticsFiller] 匹配到有效模板`, {
        taskId,
        templateId: tid,
        text: templateOptions.find(o => o.value === tid)?.text ?? '',
      });
      return tid;
    }
  }

  publishWarn(`[task:${taskId}] [LogisticsFiller] 服务端模板均不在 window.Json 列表中`, {
    taskId,
    serverTemplateIds: templates.map(t => t.templateId),
    windowJsonValues: [...validValues],
  });
  return null;
}

/**
 * 通过关键词查询服务端地址库，返回第一条匹配记录
 */
async function queryAddressByKeywords(taskId: number, keywords: string): Promise<AddressDTO | null> {
  try {
    const result = await requestBackend<{ data: AddressDTO[]; total: number }>(
      'GET',
      '/addresses',
      { params: { keywords, pageSize: '1', pageIndex: '1' } },
    );
    publishInfo(`[task:${taskId}] [LogisticsFiller] /addresses API 原始响应`, {
      taskId,
      keywords,
      total: result.total ?? null,
      data: result.data ?? null,
    });
    return result.data?.[0] ?? null;
  } catch (err) {
    publishWarn(`[task:${taskId}] [LogisticsFiller] /addresses API 请求异常`, {
      taskId,
      keywords,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
