/**
 * 商品详情图填充器 —— 填充 descRepublicOfSell.descPageCommitParam.templateContent
 *
 * 每张详情图生成一个「图文模块」JSON 节点, 最终序列化为 templateContent 字符串
 */
import { DraftFiller, type FillerContext } from '../core/filler.base';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct, ProductImage } from '../types/product.types';

interface PicMeta {
  width: number;
  height: number;
  size: number;
  id: number;
}

interface ImageComponent {
  type: string;
  level: number;
  sellerEditable: boolean;
  boxStyle: Record<string, unknown>;
  componentName: string;
  clipType: string;
  imgStyle: Record<string, unknown>;
  picMeta: PicMeta;
  isEdit: boolean;
  componentType: string;
  componentId: string;
  groupId: string;
  selected: boolean;
}

interface ImageGroup {
  type: string;
  hide: boolean;
  bizCode: number;
  propertyPanelVisible: boolean;
  level: number;
  boxStyle: Record<string, unknown>;
  position: string;
  groupName: string;
  scenario: string;
  components: ImageComponent[];
  groupId: string;
  id: string;
  bizName: string;
}

export class DetailImagesFiller extends DraftFiller {
  readonly name = 'DetailImagesFiller';

  /** 详情图固定展示宽高 */
  private static readonly DISPLAY_WIDTH = 620;
  private static readonly DISPLAY_HEIGHT = 889;

  async fill(draft: DraftData, product: ParsedProduct, _ctx: FillerContext): Promise<void> {
    const images = product.detailImages.filter(img => img.uploadedUrl ?? img.originalUrl);

    if (images.length === 0) {
      this.warn('No detail images available, skipping');
      return;
    }

    this.log(`Filling ${images.length} detail images`);

    const groups = images.map((img, i) => this.buildGroup(img, i));

    const templateContent = JSON.stringify({ groups, sellergroups: [] });

    if (!draft.descRepublicOfSell) {
      draft.descRepublicOfSell = { descPageCommitParam: { templateContent: '' } };
    }
    draft.descRepublicOfSell.descPageCommitParam.templateContent = templateContent;
  }

  private buildGroup(img: ProductImage, index: number): ImageGroup {
    const baseId = Date.now() + index;
    const groupId = `group${baseId}`;
    const componentId = `component${baseId + 1}`;

    const url = img.uploadedUrl ?? img.originalUrl;
    const { DISPLAY_WIDTH: w, DISPLAY_HEIGHT: h } = DetailImagesFiller;

    return {
      type: 'group',
      hide: false,
      bizCode: 0,
      propertyPanelVisible: true,
      level: 1,
      boxStyle: { 'background-color': '#ffffff', width: w, height: h },
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
            width: w,
            height: h,
            'background-image': url,
          },
          componentName: '图片组件',
          clipType: 'rect',
          imgStyle: { top: 0, left: 0, width: w, height: h },
          picMeta: {
            width: img.width ?? w,
            height: img.height ?? h,
            size: img.fileSize ?? 0,
            id: Number(img.fileId ?? 0),
          },
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
}
