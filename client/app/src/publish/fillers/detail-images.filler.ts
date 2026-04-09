import type { TbUploadedImageMeta } from '../types/draft';
import type { IFiller, FillerContext } from './filler.interface';

interface ExistingImageMeta {
  url?: string;
  groupId?: string;
  componentId?: string;
  width?: number;
  height?: number;
  size?: number;
  imageId?: string;
  groupHeight?: number;
}

interface TemplateContent {
  groups?: unknown[];
  sellergroups?: unknown[];
}

/**
 * DetailImagesFiller — 商品详情图填充器
 *
 * 填充内容：
 *  - desc          详情 HTML
 *  - descRepublicOfSell 详情编辑器提交参数
 *
 * 淘宝详情支持多种模块类型（图片/文字/视频），
 * 此处将所有详情图构建为图片模块列表。
 */
export class DetailImagesFiller implements IFiller {
  readonly fillerName = 'DetailImagesFiller';

  /** 单张详情图最大像素宽度（淘宝规范） */
  private static readonly MAX_WIDTH = 750;
  /** 详情装修画布宽度 */
  private static readonly DETAIL_CANVAS_WIDTH = 620;
  /** 缺少宽高信息时的默认模块高度 */
  private static readonly DEFAULT_GROUP_HEIGHT = 620;

  async fill(ctx: FillerContext): Promise<void> {
    const { uploadedDetailImages, uploadedDetailImageMetas, draftPayload } = ctx;

    const validImages = uploadedDetailImages.filter(Boolean);
    if (!validImages.length) return;

    const descriptionHtml = validImages
      .map(url => `<img src="${url}" style="max-width:${DetailImagesFiller.MAX_WIDTH}px;width:100%;" />`)
      .join('');

    draftPayload['desc'] = descriptionHtml;

    const descRepublic = (draftPayload['descRepublicOfSell'] as Record<string, unknown> | undefined) ?? {};
    const commitParam = (descRepublic['descPageCommitParam'] as Record<string, unknown> | undefined) ?? {};
    const templateContent = this.parseTemplateContent(commitParam['templateContent']);
    const existingMetaMap = this.buildExistingMetaMap(templateContent, uploadedDetailImageMetas ?? []);
    const groups = validImages.map((url, index) => this.buildImageGroup(url, index, existingMetaMap.get(url)));
    const detailHeight = groups.reduce((sum, group) => sum + group.boxStyle.height, 0);

    draftPayload['descRepublicOfSell'] = {
      ...descRepublic,
      descPageCommitParam: {
        ...commitParam,
        changed: true,
        detailParam: descriptionHtml,
        detailHeight,
        templateContent: JSON.stringify({
          groups,
          sellergroups: Array.isArray(templateContent.sellergroups) ? templateContent.sellergroups : [],
        }),
      },
    };
  }

  private parseTemplateContent(rawValue: unknown): TemplateContent {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue) as TemplateContent;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private buildExistingMetaMap(
    templateContent: TemplateContent,
    uploadedMetas: TbUploadedImageMeta[],
  ): Map<string, ExistingImageMeta> {
    const result = new Map<string, ExistingImageMeta>();

    for (const meta of uploadedMetas) {
      const url = meta.url.trim();
      if (!url) continue;
      result.set(url, {
        width: meta.width,
        height: meta.height,
        size: meta.size,
        imageId: meta.imageId,
      });
    }

    for (const group of Array.isArray(templateContent.groups) ? templateContent.groups : []) {
      const record = this.extractExistingImageMeta(group);
      if (!record?.url) continue;
      result.set(record.url, {
        ...result.get(record.url),
        ...record,
      });
    }

    return result;
  }

  private extractExistingImageMeta(group: unknown): ExistingImageMeta | null {
    if (!group || typeof group !== 'object') {
      return null;
    }

    const groupRecord = group as Record<string, unknown>;
    const components = Array.isArray(groupRecord['components']) ? groupRecord['components'] : [];
    const firstComponent = components[0];
    if (!firstComponent || typeof firstComponent !== 'object') {
      return null;
    }

    const componentRecord = firstComponent as Record<string, unknown>;
    const boxStyle = this.asRecord(componentRecord['boxStyle']);
    const imgStyle = this.asRecord(componentRecord['imgStyle']);
    const picMeta = this.asRecord(componentRecord['picMeta']);
    const url = this.normalizeImageUrl(boxStyle?.['background-image']);
    if (!url) {
      return null;
    }

    return {
      url,
      groupId: this.readString(groupRecord['groupId']) ?? this.readString(groupRecord['id']),
      componentId: this.readString(componentRecord['componentId']),
      width: this.readNumber(picMeta?.['width']) ?? this.readNumber(imgStyle?.['width']),
      height: this.readNumber(picMeta?.['height']) ?? this.readNumber(imgStyle?.['height']),
      size: this.readNumber(picMeta?.['size']),
      imageId: this.readString(picMeta?.['id']),
      groupHeight: this.readNumber(this.asRecord(groupRecord['boxStyle'])?.['height'])
        ?? this.readNumber(boxStyle?.['height']),
    };
  }

  private buildImageGroup(url: string, index: number, meta?: ExistingImageMeta) {
    const groupId = meta?.groupId ?? this.buildNodeId('group', index);
    const componentId = meta?.componentId ?? this.buildNodeId('component', index);
    const groupHeight = this.resolveGroupHeight(meta);
    const picMeta = this.buildPicMeta(meta, groupHeight);

    return {
      type: 'group',
      hide: false,
      bizCode: 0,
      propertyPanelVisible: true,
      level: 1,
      boxStyle: {
        'background-color': '#ffffff',
        width: DetailImagesFiller.DETAIL_CANVAS_WIDTH,
        height: groupHeight,
      },
      position: 'middle',
      groupName: '模块',
      scenario: 'wde',
      components: [
        {
          type: 'component',
          level: 2,
          sellerEditable: true,
          boxStyle: {
            rotate: 0,
            'z-index': 0,
            top: 0,
            left: 0,
            width: DetailImagesFiller.DETAIL_CANVAS_WIDTH,
            height: groupHeight,
            'background-image': url,
          },
          componentName: '图片组件',
          clipType: 'rect',
          imgStyle: {
            top: 0,
            left: 0,
            width: DetailImagesFiller.DETAIL_CANVAS_WIDTH,
            height: groupHeight,
          },
          picMeta,
          isEdit: false,
          componentType: 'pic',
          componentId,
          groupId,
          selected: false,
        },
      ],
      groupId,
      id: groupId,
      bizName: '图文模块',
    };
  }

  private buildPicMeta(meta: ExistingImageMeta | undefined, groupHeight: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (meta?.width != null) result['width'] = meta.width;
    if (meta?.height != null) result['height'] = meta.height;
    if (meta?.size != null) result['size'] = meta.size;
    if (meta?.imageId != null) result['id'] = meta.imageId;
    if (!Object.keys(result).length) {
      result['width'] = DetailImagesFiller.DETAIL_CANVAS_WIDTH;
      result['height'] = groupHeight;
    }

    return result;
  }

  private resolveGroupHeight(meta?: ExistingImageMeta): number {
    if (meta?.groupHeight && meta.groupHeight > 0) {
      return Math.round(meta.groupHeight);
    }
    if (meta?.width && meta.width > 0 && meta.height && meta.height > 0) {
      return Math.max(
        1,
        Math.round((DetailImagesFiller.DETAIL_CANVAS_WIDTH * meta.height) / meta.width),
      );
    }
    return DetailImagesFiller.DEFAULT_GROUP_HEIGHT;
  }

  private buildNodeId(prefix: string, index: number): string {
    return `${prefix}${Date.now()}${index}${Math.floor(Math.random() * 10000)}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return undefined;
  }

  private normalizeImageUrl(value: unknown): string {
    const url = this.readString(value)?.trim() ?? '';
    return url.replace(/^url\((['"]?)(.*)\1\)$/i, '$2');
  }
}
