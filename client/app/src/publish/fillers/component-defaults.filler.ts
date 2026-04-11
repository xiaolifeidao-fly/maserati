import type { IFiller, FillerContext } from './filler.interface';
import { publishInfo } from '../utils/publish-logger';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export class ComponentDefaultsFiller implements IFiller {
  readonly fillerName = 'ComponentDefaultsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { tbWindowJson, draftPayload, taskId } = ctx;
    const multiDiscountPromotion = tbWindowJson?.components['multiDiscountPromotion'];

    if (!multiDiscountPromotion?.props?.required) {
      return;
    }

    const currentValue = asRecord(draftPayload['multiDiscountPromotion']);
    if (currentValue?.enable === true) {
      return;
    }

    draftPayload['multiDiscountPromotion'] = {
      type: 1,
      value: 9.5,
      enable: true,
    };

    publishInfo(`[task:${taskId}] [COMPONENT_DEFAULTS] enabled multiDiscountPromotion`, {
      taskId,
      value: draftPayload['multiDiscountPromotion'],
    });
  }
}
