import {
  TB_FOOD_COMPONENT_KEYS,
  type TbFoodComponentKey,
  type TbWindowJsonCatProp,
  type TbWindowJsonComponent,
  type TbWindowJsonComponentProp,
  type TbWindowJsonDraftData,
  type TbWindowJsonExpression,
  type TbWindowJsonFoodComponent,
  type TbWindowJsonLogisticsSubItem,
  type TbWindowJsonMeasurement,
  type TbWindowJsonNutritionDataSource,
  type TbWindowJsonNutritionField,
  type TbWindowJsonOption,
  type TbWindowJsonRequiredModule,
  type TbWindowJsonRequiredModuleItem,
  type TbWindowJsonSalePropSubItem,
  type TbWindowJsonSalePropValueGroup,
  type TbWindowJsonSalePropValueOption,
  type TbWindowJsonUnit,
} from '../types/tb-window-json';
import type { TbCategoryInfo, TbCategoryProp, TbPropValue, TbSaleProp, TbSalePropValue } from '../types/draft';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function parseOption(value: unknown): TbWindowJsonOption | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    value:
      typeof record.value === 'string' ||
      typeof record.value === 'number' ||
      typeof record.value === 'boolean' ||
      record.value === null
        ? record.value
        : undefined,
    text: typeof record.text === 'string' ? record.text : undefined,
    label: typeof record.label === 'string' ? record.label : undefined,
  };
}

function parseExpressionList(value: unknown): TbWindowJsonExpression[] | undefined {
  const items = asArray(value)
    .map(item => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({ type: typeof item.type === 'string' ? item.type : undefined }))
    .filter(item => item.type);

  return items.length ? items : undefined;
}

function parseUnitList(value: unknown): TbWindowJsonUnit[] | undefined {
  const items = asArray(value)
    .map(item => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      value: typeof item.value === 'number' ? item.value : undefined,
      text: typeof item.text === 'string' ? item.text : undefined,
    }))
    .filter(item => item.value !== undefined || item.text !== undefined);

  return items.length ? items : undefined;
}

function parseRequiredModuleItem(value: unknown): TbWindowJsonRequiredModuleItem | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    label: typeof record.label === 'string' ? record.label : undefined,
  };
}

function parseRequiredModule(value: unknown): TbWindowJsonRequiredModule | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const items = asArray(record.items)
    .map(parseRequiredModuleItem)
    .filter((item): item is TbWindowJsonRequiredModuleItem => Boolean(item));

  return items.length ? { items } : undefined;
}

function parseNutritionField(value: unknown): TbWindowJsonNutritionField | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    label: typeof record.label === 'string' ? record.label : undefined,
  };
}

function parseNutritionDataSource(value: unknown): TbWindowJsonNutritionDataSource | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const fields = asArray(record.fields)
    .map(parseNutritionField)
    .filter((item): item is TbWindowJsonNutritionField => Boolean(item));

  return fields.length ? { fields } : undefined;
}

function parseMeasurement(value: unknown): TbWindowJsonMeasurement | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    unit: typeof record.unit === 'string' ? record.unit : undefined,
  };
}

function parseComponentProp(value: unknown): TbWindowJsonComponentProp {
  const record = asRecord(value) ?? {};
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    label: typeof record.label === 'string' ? record.label : undefined,
    uiType: typeof record.uiType === 'string' ? record.uiType : undefined,
    required: typeof record.required === 'boolean' ? record.required : undefined,
    multiSelect:
      typeof record.multiSelect === 'boolean'
        ? record.multiSelect
        : typeof record.multiple === 'boolean'
          ? record.multiple
          : undefined,
    multiple: typeof record.multiple === 'boolean' ? record.multiple : undefined,
    unit: typeof record.unit === 'string' ? record.unit : undefined,
    value: record.value,
    dataSource: record.dataSource,
    subItems: record.subItems,
    requiredModule: parseRequiredModule(record.requiredModule),
    expression: parseExpressionList(record.expression),
    units: parseUnitList(record.units),
  };
}

function parseComponent(code: string, value: unknown): TbWindowJsonComponent | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    code,
    props: parseComponentProp(record.props),
  };
}

function parseCatProp(value: unknown): TbWindowJsonCatProp | undefined {
  const prop = parseComponentProp(value);
  if (!prop.name) return undefined;
  return {
    ...prop,
    name: prop.name,
  };
}

function parseSalePropValueOption(value: unknown): TbWindowJsonSalePropValueOption | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    value:
      typeof record.value === 'string' || typeof record.value === 'number'
        ? record.value
        : undefined,
    text: typeof record.text === 'string' ? record.text : undefined,
  };
}

function parseSalePropValueGroup(value: unknown): TbWindowJsonSalePropValueGroup | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const options = Object.values(record)
    .flatMap(item => asArray(item))
    .map(parseSalePropValueOption)
    .filter((item): item is TbWindowJsonSalePropValueOption => Boolean(item));

  return options.length ? { options } : undefined;
}

function parseSalePropSubItem(code: string, value: unknown): TbWindowJsonSalePropSubItem {
  const record = asRecord(value) ?? {};

  const dataSource = asArray(record.dataSource)
    .map(parseSalePropValueGroup)
    .filter((item): item is TbWindowJsonSalePropValueGroup => Boolean(item));

  const subItems = asArray(record.subItems)
    .map((item, index) => parseSalePropSubItem(`${code}:${index}`, item))
    .filter(Boolean);

  return {
    code,
    name: typeof record.name === 'string' ? record.name : undefined,
    label: typeof record.label === 'string' ? record.label : undefined,
    uiType: typeof record.uiType === 'string' ? record.uiType : undefined,
    dataSource,
    subItems,
  };
}

function parseLogisticsSubItem(value: unknown): TbWindowJsonLogisticsSubItem | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    dataSource: asArray(record.dataSource)
      .map(parseOption)
      .filter((item): item is TbWindowJsonOption => Boolean(item)),
  };
}

function parseFoodComponent(code: TbFoodComponentKey, value: unknown): TbWindowJsonFoodComponent | undefined {
  const component = parseComponent(code, value);
  if (!component) return undefined;

  const props = component.props;
  const measurement = parseMeasurement(asRecord(props.value)?.measurement);
  const nutritionDataSource = parseNutritionDataSource(props.dataSource);
  const optionDataSource = asArray(props.dataSource)
    .map(parseOption)
    .filter((item): item is TbWindowJsonOption => Boolean(item));

  return {
    code,
    props: {
      ...props,
      dataSource: nutritionDataSource ?? optionDataSource,
      value: asRecord(props.value)
        ? {
            measurement,
            fields: asRecord(asRecord(props.value)?.fields),
          }
        : props.value,
    },
  };
}

function pickMeta(raw: Record<string, unknown>): TbWindowJsonDraftData['meta'] {
  const models = asRecord(raw.models) ?? {};
  const modelsGlobal = asRecord(models.global);
  const components = asRecord(raw.components) ?? {};
  const fakeCreditProps =
    asRecord(asRecord(components.fakeCredit)?.props) ??
    asRecord(asRecord(components.ifdWarning)?.props);
  const icmp = asRecord(fakeCreditProps?.icmp);
  const global = asRecord(icmp?.global);
  const globalValue = asRecord(global?.value);
  const frontDataLog = asRecord(globalValue?.frontDataLog);

  return {
    catId: toStringValue(globalValue?.catId) ?? toStringValue(modelsGlobal?.catId),
    itemId: toStringValue(globalValue?.id),
    userId: toStringValue(globalValue?.userId),
    startTraceId: toStringValue(frontDataLog?.traceId),
  };
}

function pickSkuCombineContentEnable(raw: Record<string, unknown>): boolean {
  const components = asRecord(raw.components) ?? {};
  const ifdWarning = asRecord(components.ifdWarning);
  const props = asRecord(ifdWarning?.props);
  const icmp = asRecord(props?.icmp);
  const global = asRecord(icmp?.global);

  const candidateValues = [
    global?.isSkuCombineContentEnable,
    asRecord(global?.value)?.isSkuCombineContentEnable,
  ];

  return candidateValues.some((value) => value === true || value === 'true');
}

export function parseTbWindowJsonForDraft(raw: unknown): TbWindowJsonDraftData {
  const root = asRecord(raw) ?? {};
  const models = asRecord(root.models) ?? {};
  const components = asRecord(root.components) ?? {};
  const fieldsRecord = asRecord(models.__fields__) ?? {};
  const fieldCodes = Object.keys(fieldsRecord);

  const relevantComponentKeys = new Set<string>([
    ...fieldCodes,
    'catProp',
    'saleProp',
    'tbExtractWay',
    'shippingArea',
    'fakeCredit',
    'qualification',
    ...TB_FOOD_COMPONENT_KEYS,
  ]);

  const draftComponents = Object.entries(components)
    .filter(([code]) => relevantComponentKeys.has(code))
    .map(([code, component]) => parseComponent(code, component))
    .filter((item): item is TbWindowJsonComponent => Boolean(item))
    .reduce<Record<string, TbWindowJsonComponent>>((acc, item) => {
      acc[item.code] = item;
      return acc;
    }, {});

  const catPropsSource = asArray(asRecord(models.catProp)?.dataSource).length
    ? asArray(asRecord(models.catProp)?.dataSource)
    : asArray(asRecord(asRecord(components.catProp)?.props)?.dataSource);

  const catProps = catPropsSource
    .map(parseCatProp)
    .filter((item): item is TbWindowJsonCatProp => Boolean(item));

  const salePropSubItemsRecord = asRecord(asRecord(asRecord(components.saleProp)?.props)?.subItems) ?? {};
  const salePropSubItems = Object.entries(salePropSubItemsRecord).reduce<
    Record<string, TbWindowJsonSalePropSubItem>
  >((acc, [code, value]) => {
    acc[code] = parseSalePropSubItem(code, value);
    return acc;
  }, {});

  const tbExtractWaySubItems = asArray(asRecord(asRecord(components.tbExtractWay)?.props)?.subItems)
    .map(parseLogisticsSubItem)
    .filter((item): item is TbWindowJsonLogisticsSubItem => Boolean(item));

  const foodComponents = TB_FOOD_COMPONENT_KEYS.reduce<
    Partial<Record<TbFoodComponentKey, TbWindowJsonFoodComponent>>
  >((acc, key) => {
    const component = parseFoodComponent(key, components[key]);
    if (component) {
      acc[key] = component;
    }
    return acc;
  }, {});

  return {
    meta: pickMeta(root),
    fieldCodes,
    components: draftComponents,
    catProps,
    salePropSubItems,
    logisticsSubItems: tbExtractWaySubItems,
    foodComponents,
    isFoodCategory: Object.keys(foodComponents).length > 0,
    isSkuCombineContentEnable: pickSkuCombineContentEnable(root),
  };
}

function normalizeCatPropPid(name?: string): string {
  return String(name ?? '').trim();
}

function normalizeSalePropPid(name?: string): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  if (raw.includes('-')) {
    return raw.split('-').pop() ?? raw;
  }
  return raw;
}

function mapOptionToPropValue(option: { value?: string | number | boolean | null; text?: string; label?: string }): TbPropValue | null {
  const text = String(option.text ?? option.label ?? '').trim();
  if (!text || option.value == null) {
    return null;
  }
  return {
    vid: String(option.value),
    name: text,
  };
}

function extractSalePropValues(
  subItem: TbWindowJsonSalePropSubItem,
  collector: Map<string, TbSalePropValue>,
): void {
  for (const group of subItem.dataSource ?? []) {
    for (const option of group.options ?? []) {
      const text = String(option.text ?? '').trim();
      if (!text || option.value == null) {
        continue;
      }
      const vid = String(option.value);
      collector.set(vid, {
        vid,
        name: text,
      });
    }
  }

  for (const child of subItem.subItems ?? []) {
    extractSalePropValues(child, collector);
  }
}

export function buildCategoryInfoFromTbWindowJson(
  tbWindowJson: TbWindowJsonDraftData,
  fallback?: Partial<TbCategoryInfo>,
): TbCategoryInfo {
  const props = (tbWindowJson.catProps ?? [])
    .map(prop => {
      const pid = normalizeCatPropPid(prop.name);
      if (!pid) {
        return null;
      }

      const dataSource = Array.isArray(prop.dataSource)
        ? prop.dataSource
          .map(item => mapOptionToPropValue(item as { value?: string | number | boolean | null; text?: string; label?: string }))
          .filter((item): item is TbPropValue => Boolean(item))
        : undefined;

      return {
        pid,
        name: String(prop.label ?? prop.name).trim(),
        required: Boolean(prop.required),
        uiType: String(prop.uiType ?? (dataSource?.length ? 'dataSource' : 'input')),
        dataSource: dataSource?.length ? dataSource : undefined,
        multiSelect: prop.multiSelect,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const salePropList = Object.values(tbWindowJson.salePropSubItems ?? {})
    .map(subItem => {
      const pid = normalizeSalePropPid(subItem.name ?? subItem.code);
      if (!pid) {
        return null;
      }

      const values = new Map<string, TbSalePropValue>();
      extractSalePropValues(subItem, values);

      return {
        pid,
        name: String(subItem.label ?? subItem.name ?? pid).trim(),
        uiType: String(subItem.uiType ?? 'dataSource'),
        values: Array.from(values.values()),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    catId: String(tbWindowJson.meta.catId ?? fallback?.catId ?? '').trim(),
    catName: String(fallback?.catName ?? '').trim(),
    catPath: String(fallback?.catPath ?? '').trim(),
    props,
    salePropList,
  };
}
