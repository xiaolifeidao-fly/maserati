import type { IFiller, FillerContext } from './filler.interface';

/**
 * DetailImagesFiller — 商品详情图填充器
 *
 * 填充内容：
 *  - descModules   详情图模块列表（淘宝图文混排格式）
 *
 * 淘宝详情支持多种模块类型（图片/文字/视频），
 * 此处将所有详情图构建为图片模块列表。
 */
export class DetailImagesFiller implements IFiller {
  readonly fillerName = 'DetailImagesFiller';

  /** 单张详情图最大像素宽度（淘宝规范） */
  private static readonly MAX_WIDTH = 750;

  async fill(ctx: FillerContext): Promise<void> {
    const { uploadedDetailImages, draftPayload } = ctx;

    const validImages = uploadedDetailImages.filter(Boolean);
    if (!validImages.length) return;

    // 构建淘宝图文详情模块
    const descModules = validImages.map((url, idx) => ({
      moduleType: 'image',
      id: `desc_img_${idx + 1}`,
      sortOrder: idx + 1,
      content: {
        imageUrl: url,
        width: DetailImagesFiller.MAX_WIDTH,
      },
    }));

    draftPayload['descModules'] = descModules;

    // 兼容旧版纯图片 description 格式
    draftPayload['description'] = validImages
      .map(url => `<img src="${url}" style="max-width:${DetailImagesFiller.MAX_WIDTH}px;width:100%;" />`)
      .join('');
  }
}
