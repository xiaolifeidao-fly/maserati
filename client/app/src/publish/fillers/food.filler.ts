import type { IFiller, FillerContext } from './filler.interface';
import type { TbWindowJsonComponent, TbWindowJsonComponentProp } from '../types/tb-window-json';
import axios from 'axios';
import { publishInfo, publishWarn } from '../utils/publish-logger';

// ─── 内部适配类型 ──────────────────────────────────────────────────────────────

/** 将 AttributeItem({name, value}) 适配为旧版 SkuItem({value, text[]}) 格式 */
interface FoodSkuItem {
  value: string;   // 属性名称（如 "保质期"）
  text: string[];  // 属性值列表（如 ["12个月"]）
}

type FoodComponents = Record<string, TbWindowJsonComponent>;

// ─── 食品生产许可证随机池 ──────────────────────────────────────────────────────

const FOOD_PRD_LICENSES = [
  'SC10341147101351',
  'SC10432062101169',
  'SC11334160230808',
  'SC10644512106525',
  'SC10634160212611',
  'SC10435058302205',
];

function randomFoodPrdLicense(): string {
  return FOOD_PRD_LICENSES[Math.floor(Math.random() * FOOD_PRD_LICENSES.length)];
}

// ─── FoodHandler 基类 ─────────────────────────────────────────────────────────

abstract class FoodHandler {
  readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  isValidate(): boolean {
    return true;
  }

  needFill(draftData: Record<string, unknown>): boolean {
    return !this.isNotNull(draftData);
  }

  isNotNull(draftData: Record<string, unknown>): boolean {
    const value = draftData[this.key];
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as object).length > 0;
    return String(value).length > 0;
  }

  doFill(catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>, skuItem: FoodSkuItem): void {
    draftData[this.key] = skuItem.text[0];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  againFill(_catProp: TbWindowJsonComponentProp, _draftData: Record<string, unknown>, _skuItems: FoodSkuItem[]): void {
    // 子类按需重写
  }

  getUnit(foodPeriod: string): string {
    if (foodPeriod.includes('天')) return '天';
    if (foodPeriod.includes('月')) return '月';
    if (foodPeriod.includes('年')) return '年';
    return '天';
  }
}

// ─── 具体 Handler ─────────────────────────────────────────────────────────────

/** 食品添加剂 */
class FoodAdditiveHandler extends FoodHandler {
  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '详情见包装';
  }
}

/** 食品储存方式 */
class FoodPlanStorageHandler extends FoodHandler {
  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '详情见包装';
  }
}

/** 食品生产许可证 */
class FoodPrdLicenseHandler extends FoodHandler {
  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    if (draftData[this.key]) return;
    draftData[this.key] = randomFoodPrdLicense();
  }
}

/** 食品生产编码 */
class FoodDesignCodeHandler extends FoodHandler {}

/** 厂名（不强制验证） */
class FoodFactoryNameHandler extends FoodHandler {
  isValidate(): boolean {
    return false;
  }

  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '详情见包装';
  }
}

/** 食品生产商地址（不强制验证） */
class FoodFactorySiteHandler extends FoodHandler {
  isValidate(): boolean {
    return false;
  }

  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '详情见包装';
  }
}

/** 工厂联系方式 */
class FoodFactoryContactHandler extends FoodHandler {
  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '无';
  }
}

/** 食品成分/配料 */
class FoodMixHandler extends FoodHandler {
  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    draftData[this.key] = '详情见包装';
  }
}

/** 保质期 */
class FoodPeriodHandler extends FoodHandler {
  needFill(_draftData: Record<string, unknown>): boolean {
    // 保质期始终尝试重新填充（从源商品属性覆盖）
    return true;
  }

  doFill(catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>, skuItem: FoodSkuItem): void {
    const foodPeriod = skuItem.text[0];
    const targetUnit = catProp.unit;
    const foodPeriodNum = parseInt(foodPeriod.match(/\d+/g)?.[0] ?? '0', 10);
    const sourceUnit = this.getUnit(foodPeriod);
    const convertNum = this.convertToNum(foodPeriodNum, sourceUnit, targetUnit);
    draftData[this.key] = `${convertNum}`;
  }

  convertToNum(unitNum: number, sourceUnit: string, targetUnit: string | undefined): number {
    if (sourceUnit === '天') {
      if (targetUnit === '月') return unitNum / 30;
      if (targetUnit === '年') return unitNum / 365;
      return unitNum;
    }
    if (sourceUnit === '月') {
      if (targetUnit === '天') return unitNum * 30;
      if (targetUnit === '年') return unitNum / 12;
      return unitNum;
    }
    if (sourceUnit === '年') {
      if (targetUnit === '天') return unitNum * 365;
      if (targetUnit === '月') return unitNum * 12;
      return unitNum;
    }
    return unitNum;
  }
}

/** 生产日期 */
class FoodProduceDateHandler extends FoodHandler {
  needFill(_draftData: Record<string, unknown>): boolean {
    return true;
  }

  doFill(catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>, skuItem: FoodSkuItem): void {
    const foodProduceDate = skuItem.text[0];
    if (foodProduceDate.includes('至')) {
      // 已是日期范围格式，直接使用
      super.doFill(catProp, draftData, skuItem);
      return;
    }
    const endDate = new Date().toISOString().split('T')[0];
    draftData[this.key] = `${foodProduceDate},${endDate}`;
  }

  againFill(_catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    const date = new Date().toISOString().split('T')[0];
    draftData[this.key] = `${date},${date}`;
  }
}

/** 营养成分表 */
class FoodNutrientTableHandler extends FoodHandler {
  needFill(draftData: Record<string, unknown>): boolean {
    const value = draftData[this.key] as Record<string, unknown> | undefined;
    if (!value) return true;
    if ('fields' in value) {
      return Object.keys(value.fields as object).length === 0;
    }
    return true;
  }

  isNotNull(draftData: Record<string, unknown>): boolean {
    const value = draftData[this.key] as Record<string, unknown> | undefined;
    if (!value) return false;
    if ('fields' in value) {
      return Object.keys(value.fields as object).length > 0;
    }
    return false;
  }

  againFill(catProp: TbWindowJsonComponentProp, draftData: Record<string, unknown>): void {
    const dataSource = catProp.dataSource as { fields?: Array<{ name?: string }> } | undefined;
    const fields = dataSource?.fields;
    if (!fields) return;

    const foodNutrientTable: Record<string, unknown> = {
      multiple: true,
      measurement: { unit: 'hundredGram' },
    };

    // 使用 window.Json 中已有的 measurement 覆盖默认值
    const existingValue = catProp.value as { measurement?: unknown } | undefined;
    if (existingValue?.measurement) {
      foodNutrientTable.measurement = existingValue.measurement;
    }

    const fieldsData: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.name) {
        fieldsData[field.name] = { value: 2, percent: 2 };
      }
    }
    foodNutrientTable.fields = fieldsData;
    draftData[this.key] = foodNutrientTable;
  }
}

// ─── Handler 注册表 ───────────────────────────────────────────────────────────

const foodHandlers: FoodHandler[] = [
  new FoodAdditiveHandler('foodAdditive'),
  new FoodPlanStorageHandler('foodPlanStorage'),
  new FoodPrdLicenseHandler('foodPrdLicense'),
  new FoodDesignCodeHandler('foodDesignCode'),
  new FoodFactoryNameHandler('foodFactoryName'),
  new FoodFactorySiteHandler('foodFactorySite'),
  new FoodPeriodHandler('foodPeriod'),
  new FoodProduceDateHandler('foodProduceDate'),
  new FoodFactoryContactHandler('foodFactoryContact'),
  new FoodMixHandler('foodMix'),
  new FoodNutrientTableHandler('foodNutrientTable'),
];

// ─── FoodFiller ───────────────────────────────────────────────────────────────

/**
 * FoodFiller — 食品类属性填充器
 *
 * 填充内容（仅食品类目生效）：
 *  - foodAdditive       食品添加剂
 *  - foodPlanStorage    储存方式
 *  - foodPrdLicense     食品生产许可证（含通过淘宝 asyncOpt 接口验证/补全厂名厂址）
 *  - foodDesignCode     生产编码
 *  - foodFactoryName    厂名
 *  - foodFactorySite    厂址
 *  - foodFactoryContact 工厂联系方式
 *  - foodMix            配料表
 *  - foodPeriod         保质期（自动换算单位）
 *  - foodProduceDate    生产日期
 *  - foodNutrientTable  营养成分表
 *  - foodImages         食品图片（前置图/背景图）
 *
 * 判断是否食品类：
 *  优先使用 tbWindowJson.isFoodCategory；若未解析，则检查 foodComponents 中是否存在
 *  任何食品 handler key。
 */
export class FoodFiller implements IFiller {
  readonly fillerName = 'FoodFiller';

  private fillSuccess = true;
  private fillMessage = '食品类:';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, tbWindowJson, draftPayload, draftContext, uploadedMainImages, taskId } = ctx;

    // ── 判断是否食品类 ──────────────────────────────────────────────────────────
    const isFoodCategory = tbWindowJson?.isFoodCategory ?? this.detectFoodByComponents(tbWindowJson?.foodComponents ?? {});
    if (!isFoodCategory) {
      publishInfo(`[task:${taskId}] [FOOD] 非食品类，跳过食品填充`, { taskId });
      return;
    }

    publishInfo(`[task:${taskId}] [FOOD] 检测到食品类，开始填充食品属性`, { taskId });

    // 将 AttributeItem[] 适配为 FoodSkuItem[] 以复用原有匹配逻辑
    const skuItems: FoodSkuItem[] = product.attributes.map((attr) => ({
      value: attr.name,
      text: [attr.value],
    }));

    const components = (tbWindowJson?.foodComponents ?? {}) as FoodComponents;

    // ── 三轮填充 ────────────────────────────────────────────────────────────────
    this.fillBasic(components, skuItems, draftPayload);
    this.againCheckAndFill(components, skuItems, draftPayload);
    this.checkResult(components, draftPayload, taskId);

    // ── 通过淘宝 asyncOpt 接口补全食品工厂信息 ───────────────────────────────────
    const requestHeaders: Record<string, string> =
      draftContext.updateDraftRequestHeaders ??
      draftContext.addDraftRequestHeaders ??
      {};
    await this.fillFoodFactory(components, draftContext.catId, draftContext.startTraceId, requestHeaders, draftPayload, taskId);

    // ── 填充食品图片 ────────────────────────────────────────────────────────────
    this.fillFoodImages(components, draftPayload, uploadedMainImages);

    if (!this.fillSuccess) {
      publishWarn(`[task:${taskId}] [FOOD] 食品填充存在问题: ${this.fillMessage}`, { taskId });
    } else {
      publishInfo(`[task:${taskId}] [FOOD] 食品属性填充完成`, { taskId });
    }
  }

  // ─── 第一轮：从源商品属性匹配填充 ────────────────────────────────────────────

  private fillBasic(
    components: FoodComponents,
    skuItems: FoodSkuItem[],
    draftPayload: Record<string, unknown>,
  ): void {
    for (const handler of foodHandlers) {
      if (!handler.needFill(components)) continue;

      const matchResult = this.matchComponent(handler.key, components, skuItems);
      if (!matchResult) continue;
      if (!matchResult.skuItem) continue;

      handler.doFill(matchResult.catProp, draftPayload, matchResult.skuItem);
    }
  }

  // ─── 第二轮：对未填充的必填项使用默认值 ─────────────────────────────────────

  private againCheckAndFill(
    components: FoodComponents,
    skuItems: FoodSkuItem[],
    draftPayload: Record<string, unknown>,
  ): void {
    for (const handler of foodHandlers) {
      const component = components[handler.key] as TbWindowJsonComponent | undefined;
      if (!component) continue;
      if (!handler.needFill(draftPayload)) continue;

      handler.againFill(component.props, draftPayload, skuItems);
    }
  }

  // ─── 校验必填项 ────────────────────────────────────────────────────────────

  private checkResult(
    components: FoodComponents,
    draftPayload: Record<string, unknown>,
    taskId: number,
  ): void {
    for (const handler of foodHandlers) {
      const component = components[handler.key] as TbWindowJsonComponent | undefined;
      if (!component) continue;
      if (!component.props?.required) continue;
      if (handler.isNotNull(draftPayload)) continue;
      if (!handler.isValidate()) continue;

      this.fillSuccess = false;
      const label = component.props?.label ?? handler.key;
      this.fillMessage += `[${label}] 未能填充;`;
      publishWarn(`[task:${taskId}] [FOOD] 必填项未填充: ${label}`, { taskId });
    }
  }

  // ─── 通过淘宝 asyncOpt 接口补全食品工厂信息 ─────────────────────────────────

  private async fillFoodFactory(
    components: FoodComponents,
    catId: string,
    startTraceId: string,
    headers: Record<string, string>,
    draftPayload: Record<string, unknown>,
    taskId: number,
  ): Promise<void> {
    if (!components.foodPrdLicense) return;

    let foodPrdLicense = draftPayload.foodPrdLicense as string | undefined;
    if (!foodPrdLicense || !this.isQualifiedLicense(foodPrdLicense)) {
      foodPrdLicense = randomFoodPrdLicense();
    }

    publishInfo(`[task:${taskId}] [FOOD] 开始验证食品生产许可证: ${foodPrdLicense}`, { taskId });

    const result = await this.getFoodPrdLicenseInfo(catId, startTraceId, headers, foodPrdLicense, 1, taskId);
    if (!result) return;

    draftPayload.foodPrdLicense = result.foodPrdLicense;
    draftPayload.foodFactoryName = result.foodFactoryName;
    draftPayload.foodFactorySite = result.foodFactorySite;

    publishInfo(`[task:${taskId}] [FOOD] 食品工厂信息填充完成`, { taskId, factoryName: result.foodFactoryName });
  }

  /** 许可证格式合法性检查（SC 或 QS 开头） */
  private isQualifiedLicense(license: string): boolean {
    return license.startsWith('SC') || license.startsWith('QS');
  }

  /**
   * 调用淘宝 asyncOpt 接口验证生产许可证并获取厂名/厂址
   * 失败时自动换用池中其他许可证重试，最多 3 次
   */
  private async getFoodPrdLicenseInfo(
    catId: string,
    startTraceId: string,
    headers: Record<string, string>,
    foodPrdLicense: string,
    retryCount: number,
    taskId: number,
  ): Promise<{ foodPrdLicense: string; foodFactoryName: string; foodFactorySite: string } | undefined> {
    if (retryCount > 3) {
      this.fillSuccess = false;
      this.fillMessage += '[食品生产商] 验证失败;';
      publishWarn(`[task:${taskId}] [FOOD] 食品生产许可证验证超过最大重试次数`, { taskId });
      return undefined;
    }

    try {
      const url = 'https://item.upload.taobao.com/sell/v2/asyncOpt.htm';
      const data = new URLSearchParams({
        optType: 'foodPrdLicenseType',
        catId,
        foodPrdLicense,
        globalExtendInfo: JSON.stringify({ startTraceId }),
      });

      const response = await axios.post(url, data.toString(), {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15_000,
      });

      const result = response.data as Record<string, unknown>;

      if (result.models) {
        const models = result.models as Record<string, unknown>;
        const globalMessage = models.globalMessage as { type?: string } | undefined;
        if (globalMessage?.type === 'error') {
          publishWarn(`[task:${taskId}] [FOOD] 许可证 ${foodPrdLicense} 无效，换用随机许可证重试`, { taskId });
          return await this.getFoodPrdLicenseInfo(
            catId, startTraceId, headers, randomFoodPrdLicense(), retryCount + 1, taskId,
          );
        }

        const formValues = models.formValues as Record<string, string> | undefined;
        return {
          foodPrdLicense,
          foodFactoryName: formValues?.foodFactoryName ?? '',
          foodFactorySite: formValues?.foodFactorySite ?? '',
        };
      } else {
        this.fillSuccess = false;
        this.fillMessage += '[食品生产商] 接口异常;';
        publishWarn(`[task:${taskId}] [FOOD] asyncOpt 接口返回异常`, { taskId, responseData: result });
        return undefined;
      }
    } catch (err) {
      publishWarn(`[task:${taskId}] [FOOD] asyncOpt 请求失败，重试 ${retryCount}`, {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      return await this.getFoodPrdLicenseInfo(
        catId, startTraceId, headers, randomFoodPrdLicense(), retryCount + 1, taskId,
      );
    }
  }

  // ─── 填充食品图片 ─────────────────────────────────────────────────────────

  private fillFoodImages(
    components: FoodComponents,
    draftPayload: Record<string, unknown>,
    uploadedMainImages: string[],
  ): void {
    if (!components.foodImages) return;
    if (draftPayload.foodImages) return; // 已有值，不覆盖

    if (uploadedMainImages.length < 2) return;

    const frontUrl = uploadedMainImages[0];
    const backgroundUrl = uploadedMainImages[1];

    draftPayload.foodImages = [
      { url: '', thumbUrl: '' },
      { url: '', thumbUrl: '' },
      {
        url: frontUrl,
        thumbUrl: frontUrl,
        pix: '800x800',
        folderId: '0',
      },
      {
        url: backgroundUrl,
        thumbUrl: backgroundUrl,
        pix: '800x800',
        folderId: '0',
      },
    ];
  }

  // ─── 辅助方法 ─────────────────────────────────────────────────────────────

  /**
   * 在 components 中查找 handler key 对应的属性，并在 skuItems 中匹配源商品属性
   * 匹配规则：label 与 skuItem.value 双向包含匹配
   */
  private matchComponent(
    handlerKey: string,
    components: FoodComponents,
    skuItems: FoodSkuItem[],
  ): { catProp: TbWindowJsonComponentProp; skuItem: FoodSkuItem | undefined } | undefined {
    const component = components[handlerKey] as TbWindowJsonComponent | undefined;
    if (!component) return undefined;

    const catProp = component.props;
    const targetLabel = catProp?.label ?? '';

    for (const skuItem of skuItems) {
      const sourceLabel = skuItem.value;
      if (
        sourceLabel === targetLabel ||
        sourceLabel.includes(targetLabel) ||
        targetLabel.includes(sourceLabel)
      ) {
        return { catProp, skuItem };
      }
    }

    // 未匹配到源属性，但若是必填项仍返回（由 againFill 兜底）
    if (catProp?.required) {
      return { catProp, skuItem: undefined };
    }

    return undefined;
  }

  /** 通过检查 foodComponents 是否存在任意食品 handler key 来判断是否食品类 */
  private detectFoodByComponents(foodComponents: Record<string, unknown>): boolean {
    return foodHandlers.some((handler) => handler.key in foodComponents);
  }
}
