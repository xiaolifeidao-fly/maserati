/**
 * 商品属性填充器 —— 填充 catProp (类目属性)
 *
 * 逻辑说明:
 *  1. 遍历商品标准化属性列表
 *  2. 在 commonData.models.catProp.dataSource 中找到对应字段定义
 *  3. 根据 uiType 做不同的值转换 (taoSirProp / dataSource 枚举等)
 *  4. 品牌字段特殊处理: 若品牌不匹配, 回退为"无品牌"
 */
import axios from 'axios';
import log from 'electron-log';
import { DraftFiller, type FillerContext } from '../core/filler.base';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct } from '../types/product.types';

interface CatPropDef {
  name: string;
  label: string;
  uiType: string;
  required?: boolean;
  dataSource?: Array<{ text: string; value: unknown }>;
  value?: unknown;
}

export class AttributesFiller extends DraftFiller {
  readonly name = 'AttributesFiller';

  async fill(draft: DraftData, product: ParsedProduct, ctx: FillerContext): Promise<void> {
    if (!ctx.commonData) {
      this.warn('commonData not provided, skipping attributes fill');
      return;
    }

    const catProps: CatPropDef[] =
      (ctx.commonData as any)?.data?.models?.catProp?.dataSource ?? [];

    const newCatProp: Record<string, unknown> = { ...(draft.catProp ?? {}) };

    for (const attr of product.attributes) {
      const catProp = this.findMatchingCatProp(attr.label, catProps);
      if (!catProp) continue;

      const key = catProp.name;
      const uiType = catProp.uiType;
      const targetValue = attr.value[0];
      if (!targetValue) continue;

      if (uiType === 'taoSirProp') {
        newCatProp[key] = isNaN(Number(targetValue)) ? targetValue : parseInt(targetValue);
        continue;
      }

      // 已有值且非空则保留
      if (key in newCatProp && newCatProp[key]) continue;

      if (!catProp.dataSource) {
        newCatProp[key] = targetValue;
        continue;
      }

      const matched = this.matchDataSource(catProp.dataSource, attr.value);
      if (matched) {
        newCatProp[key] = matched;
      } else if (ctx.requestHeaders && ctx.catId && ctx.startTraceId) {
        // 本地未匹配, 尝试调用 TB API 查询
        const remote = await this.queryRemotePropValue(
          key,
          targetValue,
          ctx.requestHeaders,
          ctx.catId as string,
          ctx.startTraceId as string,
          product.sourceId,
        );
        if (remote) newCatProp[key] = remote;
      }
    }

    // 品牌特殊处理
    newCatProp['p-20000'] = await this.resolveBrand(
      newCatProp['p-20000'],
      product,
      ctx,
    );

    draft.catProp = newCatProp;
    this.log(`Filled ${Object.keys(newCatProp).length} category props`);
  }

  private findMatchingCatProp(label: string, catProps: CatPropDef[]): CatPropDef | undefined {
    return catProps.find(
      p => p.label === label || p.label.includes(label) || label.includes(p.label),
    );
  }

  private matchDataSource(
    dataSource: Array<{ text: string; value: unknown }>,
    values: string[],
  ): unknown {
    for (const val of values) {
      const found = dataSource.find(d => d.text === val);
      if (found) return { value: found.value, text: found.text };
    }
    return undefined;
  }

  private async queryRemotePropValue(
    pid: string,
    keyword: string,
    headers: Record<string, string>,
    catId: string,
    startTraceId: string,
    itemId: string,
  ): Promise<unknown> {
    try {
      const reqHeaders = {
        ...headers,
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://item.upload.taobao.com',
        referer: `https://item.upload.taobao.com/sell/v2/publish.htm?commendItem=true&commendItemId=${itemId}`,
      };
      const body = new URLSearchParams({
        keyword,
        pid,
        queryType: 'query',
        globalExtendInfo: JSON.stringify({ startTraceId }),
      });
      const res = await axios.post(
        `https://item.upload.taobao.com/sell/v2/asyncOpt.htm?optType=taobaoBrandQuery&queryType=query&catId=${catId}`,
        body.toString(),
        { headers: reqHeaders },
      );
      const data = res.data;
      if (!data?.success || !data?.data?.success) return undefined;
      const ds = data.data.dataSource;
      if (!ds || ds.length === 0) return undefined;
      return { value: ds[0].value, text: ds[0].text };
    } catch (e) {
      log.warn('[AttributesFiller] queryRemotePropValue failed:', e);
      return undefined;
    }
  }

  private async resolveBrand(
    brand: unknown,
    product: ParsedProduct,
    ctx: FillerContext,
  ): Promise<unknown> {
    const defaultBrand = { text: '无品牌/无注册商标', value: 30025069481 };

    if (!brand || (typeof brand === 'object' && Object.keys(brand as object).length === 0)) {
      return this.fetchDefaultBrand(product, ctx) ?? defaultBrand;
    }

    const brandRecord = brand as Record<string, string>;
    if (brandRecord.text?.includes('无品牌')) return brand;

    // 校验品牌是否与源数据一致
    const sourceBrand = product.attributes.find(a => a.label === '品牌')?.value[0];
    if (sourceBrand && sourceBrand !== brandRecord.text) {
      this.log(`Brand mismatch (${brandRecord.text} vs ${sourceBrand}), using default`);
      return (await this.fetchDefaultBrand(product, ctx)) ?? defaultBrand;
    }

    return brand;
  }

  private async fetchDefaultBrand(
    product: ParsedProduct,
    ctx: FillerContext,
  ): Promise<unknown> {
    if (!ctx.requestHeaders || !ctx.catId || !ctx.startTraceId) return undefined;
    return this.queryRemotePropValue(
      'p-20000',
      '无品牌',
      ctx.requestHeaders,
      ctx.catId as string,
      ctx.startTraceId as string,
      product.sourceId,
    );
  }
}
