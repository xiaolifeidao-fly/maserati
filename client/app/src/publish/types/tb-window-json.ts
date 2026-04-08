export const TB_FOOD_COMPONENT_KEYS = [
  'foodAdditive',
  'foodPlanStorage',
  'foodPrdLicense',
  'foodDesignCode',
  'foodFactoryName',
  'foodFactorySite',
  'foodPeriod',
  'foodProduceDate',
  'foodFactoryContact',
  'foodMix',
  'foodNutrientTable',
  'foodImages',
] as const;

export type TbFoodComponentKey = (typeof TB_FOOD_COMPONENT_KEYS)[number];

export interface TbWindowJsonOption {
  value?: string | number | boolean | null;
  text?: string;
  label?: string;
}

export interface TbWindowJsonExpression {
  type?: string;
}

export interface TbWindowJsonUnit {
  value?: number;
  text?: string;
}

export interface TbWindowJsonRequiredModuleItem {
  name?: string;
  label?: string;
}

export interface TbWindowJsonRequiredModule {
  items: TbWindowJsonRequiredModuleItem[];
}

export interface TbWindowJsonNutritionField {
  name?: string;
  label?: string;
}

export interface TbWindowJsonNutritionDataSource {
  fields: TbWindowJsonNutritionField[];
}

export interface TbWindowJsonMeasurement {
  unit?: string;
}

export interface TbWindowJsonComponentProp {
  name?: string;
  label?: string;
  uiType?: string;
  required?: boolean;
  multiSelect?: boolean;
  unit?: string;
  value?: unknown;
  dataSource?: unknown;
  subItems?: unknown;
  requiredModule?: TbWindowJsonRequiredModule;
  expression?: TbWindowJsonExpression[];
  units?: TbWindowJsonUnit[];
}

export interface TbWindowJsonComponent {
  code: string;
  props: TbWindowJsonComponentProp;
}

export interface TbWindowJsonCatProp extends TbWindowJsonComponentProp {
  name: string;
}

export interface TbWindowJsonSalePropValueOption {
  value?: string | number;
  text?: string;
}

export interface TbWindowJsonSalePropValueGroup {
  options: TbWindowJsonSalePropValueOption[];
}

export interface TbWindowJsonSalePropSubItem {
  code?: string;
  name?: string;
  label?: string;
  uiType?: string;
  dataSource: TbWindowJsonSalePropValueGroup[];
  subItems: TbWindowJsonSalePropSubItem[];
}

export interface TbWindowJsonLogisticsSubItem {
  name?: string;
  dataSource: TbWindowJsonOption[];
}

export interface TbWindowJsonFoodComponent extends TbWindowJsonComponent {
  code: TbFoodComponentKey;
  props: TbWindowJsonComponentProp & {
    dataSource?: TbWindowJsonNutritionDataSource | TbWindowJsonOption[];
    value?: {
      measurement?: TbWindowJsonMeasurement;
      fields?: Record<string, unknown>;
    } | unknown;
  };
}

export interface TbWindowJsonMeta {
  catId?: string;
  itemId?: string;
  userId?: string;
  startTraceId?: string;
}

export interface TbWindowJsonDraftData {
  meta: TbWindowJsonMeta;
  fieldCodes: string[];
  components: Record<string, TbWindowJsonComponent>;
  catProps: TbWindowJsonCatProp[];
  salePropSubItems: Record<string, TbWindowJsonSalePropSubItem>;
  logisticsSubItems: TbWindowJsonLogisticsSubItem[];
  foodComponents: Partial<Record<TbFoodComponentKey, TbWindowJsonFoodComponent>>;
  isFoodCategory: boolean;
}
