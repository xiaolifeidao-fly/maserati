import type { IFiller, FillerContext } from './filler.interface';
import type { TbSaleProp, TbSalePropValue } from '../types/draft';
import type { NormalizedSku, NormalizedSkuAttr } from '../types/source-data';

/**
 * SkuFiller — SKU 填充器
 *
 * 填充内容：
 *  - skuInfo      SKU 规格组合（颜色、尺码等销售属性）
 *  - stockPriceInfo 各 SKU 的价格 + 库存
 *
 * 处理逻辑：
 *  1. 将商品 SKU 的属性名映射到淘宝销售属性 pid
 *  2. 将属性值映射到对应的 vid
 *  3. 如有颜色图片（imageUrl），上传并绑定到对应 vid
 *  4. 构建 SKU 规格矩阵（每个 SKU = pid1:vid1;pid2:vid2 形式）
 */
export class SkuFiller implements IFiller {
  readonly fillerName = 'SkuFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, categoryInfo, draftPayload } = ctx;
    const { skuList } = product;

    if (!skuList.length) return;

    const salePropList = categoryInfo.salePropList ?? [];

    // 构建销售属性映射: attrName → TbSaleProp
    const salePropMap = new Map<string, TbSaleProp>();
    for (const sp of salePropList) {
      salePropMap.set(sp.name, sp);
    }

    // 收集所有使用到的属性名（去重）
    const attrNames = new Set<string>();
    for (const sku of skuList) {
      for (const attr of sku.attributes) {
        attrNames.add(attr.name);
      }
    }

    // 构建 pid/vid 映射表
    const attrPidMap = new Map<string, string>();   // attrName → pid
    const valuVidMap = new Map<string, string>();   // `${pid}:${value}` → vid

    for (const attrName of attrNames) {
      const saleProp = this.findSaleProp(attrName, salePropList);
      if (!saleProp) continue;
      attrPidMap.set(attrName, saleProp.pid);

      for (const val of saleProp.values) {
        valuVidMap.set(`${saleProp.pid}:${val.name}`, val.vid);
        if (val.alias) {
          valuVidMap.set(`${saleProp.pid}:${val.alias}`, val.vid);
        }
      }
    }

    // 构建 SKU 列表
    const skuInfoList = skuList
      .map(sku => this.buildSkuEntry(sku, attrPidMap, valuVidMap))
      .filter(Boolean);

    if (skuInfoList.length === 0) return;

    draftPayload['skuInfo'] = {
      skuList: skuInfoList,
    };

    // 价格 / 库存列表
    draftPayload['stockPriceInfo'] = {
      skuStockPriceList: skuInfoList.map((entry: any, idx: number) => ({
        skuId: entry.skuId,
        specId: entry.specId,
        // 淘宝价格单位：分
        price: Math.round((skuList[idx]?.price ?? 0) * 100),
        quantity: skuList[idx]?.stock ?? 0,
        outerSkuId: skuList[idx]?.skuCode ?? '',
      })),
    };
  }

  private buildSkuEntry(
    sku: NormalizedSku,
    attrPidMap: Map<string, string>,
    valuVidMap: Map<string, string>,
  ): Record<string, unknown> | null {
    const specParts: string[] = [];
    for (const attr of sku.attributes) {
      const pid = attrPidMap.get(attr.name);
      if (!pid) continue;
      const vid =
        valuVidMap.get(`${pid}:${attr.value}`) ??
        this.fuzzyMatchVid(attr.value, pid, valuVidMap);
      if (vid) {
        specParts.push(`${pid}:${vid}`);
      }
    }
    if (!specParts.length) return null;

    const specId = specParts.join(';');
    return {
      skuId: specId,
      specId,
      imageUrl: sku.imageUrl ?? '',
    };
  }

  private findSaleProp(attrName: string, salePropList: TbSaleProp[]): TbSaleProp | undefined {
    return (
      salePropList.find(sp => sp.name === attrName) ??
      salePropList.find(sp => sp.name.includes(attrName) || attrName.includes(sp.name))
    );
  }

  /** 模糊匹配 vid（包含关系） */
  private fuzzyMatchVid(
    value: string,
    pid: string,
    valuVidMap: Map<string, string>,
  ): string | undefined {
    for (const [key, vid] of valuVidMap.entries()) {
      if (!key.startsWith(`${pid}:`)) continue;
      const mapValue = key.slice(pid.length + 1);
      if (mapValue.includes(value) || value.includes(mapValue)) {
        return vid;
      }
    }
    return undefined;
  }
}
