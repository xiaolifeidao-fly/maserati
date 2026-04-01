"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  DeleteOutlined,
  EyeOutlined,
  PictureOutlined,
  PlusOutlined,
  SwapOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { AutoComplete, Button, Input, Modal, Spin, message } from "antd";
import type { AttributeItem, SkuItem, StandardProductData } from "./standard-product.types";

const { TextArea } = Input;

const SECTION: CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ecf0",
  borderRadius: 12,
  marginBottom: 12,
  flexShrink: 0,
  overflow: "hidden",
  boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
};

const SECTION_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  background: "linear-gradient(90deg, #f7f9fc 0%, #f0f4f8 100%)",
  borderBottom: "1px solid #e8ecf0",
  fontSize: 13,
  fontWeight: 700,
  color: "#1e293b",
};

const SECTION_ACCENT: CSSProperties = {
  width: 3,
  height: 15,
  borderRadius: 2,
  background: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)",
  flexShrink: 0,
};

const SECTION_BODY: CSSProperties = {
  padding: "14px 16px",
};

const FIELD_ROW: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
};

const FIELD_LABEL: CSSProperties = {
  flexShrink: 0,
  width: 80,
  fontSize: 12,
  color: "#64748b",
  lineHeight: "32px",
};

const FIELD_VALUE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const BADGE_COUNT: CSSProperties = {
  marginLeft: "auto",
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 400,
};

const TODO_ACTION_TEXT = "上传/替换能力稍后接入";
const SECTION_MAX_HEIGHT = 500;
const SECTION_HEADER_HEIGHT = 52;
const SECTION_BODY_MAX_HEIGHT = SECTION_MAX_HEIGHT - SECTION_HEADER_HEIGHT;

function normalizeMainImages(images: string[]) {
  return Array.from({ length: 5 }, (_, index) => images[index] || "");
}

function moveArrayItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [current] = next.splice(from, 1);
  next.splice(to, 0, current);
  return next;
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={SECTION}>
      <div style={SECTION_HEADER}>
        <div style={SECTION_ACCENT} />
        <span>{title}</span>
        {count ? <span style={BADGE_COUNT}>{count}</span> : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            marginLeft: count ? 0 : "auto",
            border: "none",
            background: "transparent",
            color: "#64748b",
            cursor: "pointer",
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
          title={open ? "折叠" : "展开"}
        >
          <UpOutlined style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }} />
        </button>
      </div>
      {open ? (
        <div
          style={{
            ...SECTION_BODY,
            maxHeight: SECTION_BODY_MAX_HEIGHT,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ImageActionButton({
  icon,
  title,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: "1px solid rgba(226,232,240,0.95)",
        background: "rgba(255,255,255,0.96)",
        color: danger ? "#ef4444" : "#475569",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
      }}
    >
      {icon}
    </button>
  );
}

function MainImagePanel({
  images,
  allImages,
  onChange,
  onPreview,
}: {
  images: string[];
  allImages?: string[];
  onChange: (next: string[]) => void;
  onPreview: (url: string) => void;
}) {
  const slots = normalizeMainImages(images);
  const selectedImages = images.filter(Boolean);
  const selectedSet = new Set(selectedImages);
  const hasCandidates = Array.isArray(allImages) && allImages.length > 5;

  const toggleCandidate = (url: string) => {
    if (selectedSet.has(url)) {
      onChange(selectedImages.filter((u) => u !== url));
    } else {
      if (selectedImages.length >= 5) {
        void message.warning("最多选择 5 张主图");
        return;
      }
      onChange([...selectedImages, url]);
    }
  };

  return (
    <div>
      {hasCandidates ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            共 {allImages!.length} 张候选图，已选 {selectedImages.length}/5，点击选择/取消
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {allImages!.map((url, index) => {
              const isSelected = selectedSet.has(url);
              const order = isSelected ? selectedImages.indexOf(url) + 1 : 0;
              const maxReached = !isSelected && selectedImages.length >= 5;
              return (
                <div
                  key={`candidate-${index}`}
                  title={isSelected ? `已选为第 ${order} 张主图，点击取消` : maxReached ? "已选满 5 张" : "点击选为主图"}
                  onClick={() => !maxReached && toggleCandidate(url)}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    border: isSelected ? "2.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                    position: "relative",
                    overflow: "hidden",
                    cursor: maxReached ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    opacity: maxReached ? 0.45 : 1,
                    transition: "border-color 0.15s, opacity 0.15s",
                  }}
                >
                  <img
                    src={url}
                    alt={`候选图${index + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {isSelected ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#3b82f6",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {order}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 14, fontSize: 12, color: "#94a3b8" }}>
            已选主图预览
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {slots.map((url, index) => {
          const hasImage = Boolean(url);
          return (
            <div
              key={`main-image-${index}`}
              style={{
                width: 150,
                height: 150,
                borderRadius: 14,
                border: "1px dashed rgba(148,163,184,0.45)",
                background: hasImage
                  ? "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))"
                  : "linear-gradient(180deg, rgba(248,250,252,0.95), rgba(241,245,249,0.95))",
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {hasImage ? (
                <button
                  type="button"
                  onClick={() => onPreview(url)}
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "zoom-in",
                  }}
                  title="预览大图"
                >
                  <img
                    src={url}
                    alt={`主图${index + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    color: "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  <PictureOutlined style={{ fontSize: 28 }} />
                  <span>主图 {index + 1}</span>
                  <span>暂未设置</span>
                </div>
              )}

              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  gap: 6,
                }}
              >
                {hasImage ? (
                  <>
                    <ImageActionButton icon={<EyeOutlined />} title="预览大图" onClick={() => onPreview(url)} />
                    <ImageActionButton
                      icon={<DeleteOutlined />}
                      title="删除图片"
                      danger
                      onClick={() => {
                        const next = [...slots];
                        next[index] = "";
                        onChange(next.filter(Boolean));
                      }}
                    />
                  </>
                ) : null}
              </div>

              {!hasCandidates ? (
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 8,
                  }}
                >
                  <Button
                    size="small"
                    type={hasImage ? "default" : "primary"}
                    icon={hasImage ? <SwapOutlined /> : <PlusOutlined />}
                    onClick={() => message.info(TODO_ACTION_TEXT)}
                  >
                    {hasImage ? "替换" : "上传"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailImagePanel({
  images,
  onChange,
  onPreview,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  onPreview: (url: string) => void;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggingIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggingIndex === null) return;
    onChange(moveArrayItem(images, draggingIndex, targetIndex));
    setDraggingIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 14 }}>
      {images.map((url, index) => (
        <div
          key={`detail-image-${index}-${url}`}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => handleDrop(index)}
          onDragEnd={handleDragEnd}
          style={{
            width: 150,
            height: 150,
            borderRadius: 12,
            border:
              draggingIndex === index
                ? "1px solid rgba(59,130,246,0.85)"
                : "1px solid rgba(226,232,240,0.9)",
            background: "#f8fafc",
            position: "relative",
            overflow: "hidden",
            cursor: "grab",
            boxShadow: draggingIndex === index ? "0 10px 24px rgba(59,130,246,0.15)" : "none",
          }}
        >
          <button
            type="button"
            onClick={() => onPreview(url)}
            style={{
              width: "100%",
              height: "100%",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "zoom-in",
            }}
            title="预览大图"
          >
            <img
              src={url}
              alt={`详情图${index + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </button>

          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              minWidth: 26,
              height: 24,
              borderRadius: 999,
              padding: "0 8px",
              background: "rgba(15,23,42,0.72)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </div>

          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
            }}
          >
            <ImageActionButton
              icon={<DeleteOutlined />}
              title="删除图片"
              danger
              onClick={() => onChange(images.filter((_, currentIndex) => currentIndex !== index))}
            />
          </div>

          <div
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
            }}
          >
            <Button size="small" icon={<SwapOutlined />} onClick={() => message.info(TODO_ACTION_TEXT)}>
              替换
            </Button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => message.info(TODO_ACTION_TEXT)}
        style={{
          width: 150,
          height: 150,
          borderRadius: 12,
          border: "1px dashed rgba(59,130,246,0.45)",
          background: "linear-gradient(180deg, rgba(239,246,255,0.95), rgba(248,250,252,0.95))",
          color: "#3b82f6",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <PlusOutlined style={{ fontSize: 22 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>添加图片</span>
      </button>
    </div>
  );
}

function AttributeRows({
  attributes,
  onChange,
}: {
  attributes: AttributeItem[];
  onChange: (attrs: AttributeItem[]) => void;
}) {
  if (attributes.length === 0) {
    return <div style={{ padding: "16px 0", textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>暂无属性数据</div>;
  }

  const updateValue = (idx: number, value: string) => {
    onChange(attributes.map((item, index) => (index === idx ? { ...item, value } : item)));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px 16px" }}>
      {attributes.map((attr, idx) => (
        <div key={idx}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{attr.name}</div>
          {attr.options && attr.options.length > 1 ? (
            <AutoComplete
              size="small"
              value={attr.value}
              options={attr.options.map((opt) => ({ value: opt }))}
              onChange={(value) => updateValue(idx, value)}
              filterOption={(input, option) =>
                String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: "100%", fontSize: 12 }}
            />
          ) : (
            <Input
              size="small"
              value={attr.value}
              onChange={(e) => updateValue(idx, e.target.value)}
              style={{ fontSize: 12 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SkuTable({
  skuList,
  onChange,
}: {
  skuList: SkuItem[];
  onChange: (skus: SkuItem[]) => void;
}) {
  if (skuList.length === 0) {
    return <div style={{ padding: "16px 0", textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>暂无规格数据</div>;
  }

  const specColumns = Array.from(
    skuList.reduce((map, sku) => {
      const specs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : [{ name: "规格", value: sku.spec, propId: undefined, valueId: undefined, imageUrl: sku.imgUrl }];

      specs.forEach((spec, index) => {
        const key = spec.propId || `index-${index}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            index,
            name: spec.name || `规格${index + 1}`,
          });
          return;
        }
        const current = map.get(key);
        if (current && !current.name && spec.name) {
          current.name = spec.name;
        }
      });
      return map;
    }, new Map<string, { key: string; index: number; name: string }>()).values(),
  ).sort((left, right) => left.index - right.index);

  const colStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    padding: "6px 8px",
    background: "#f8fafc",
    borderBottom: "1px solid #e8ecf0",
  };

  const gridTemplateColumns = `${specColumns.map(() => "minmax(140px, 1.2fr)").join(" ")} minmax(110px, 0.9fr) minmax(110px, 0.9fr)`;

  const updateColumnName = (columnKey: string, nextName: string) => {
    const nextList = skuList.map((sku) => {
      const specs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : [{ name: "规格", value: sku.spec, propId: undefined, valueId: undefined, imageUrl: sku.imgUrl }];

      const nextSpecs = specs.map((spec, index) => {
        const specKey = spec.propId || `index-${index}`;
        return specKey === columnKey ? { ...spec, name: nextName } : spec;
      });

      return {
        ...sku,
        specs: nextSpecs,
      };
    });
    onChange(nextList);
  };

  const updateSpecValue = (rowIndex: number, columnKey: string, nextValue: string) => {
    const nextList = skuList.map((sku, index) => {
      if (index !== rowIndex) {
        return sku;
      }
      const fallbackSpecs = specColumns.map((column, columnIndex) => {
        const currentSpec = sku.specs?.find((item, itemIndex) => (item.propId || `index-${itemIndex}`) === column.key);
        if (currentSpec) {
          return currentSpec;
        }
        if (columnIndex === 0 && !sku.specs?.length) {
          return {
            name: column.name,
            value: sku.spec,
            propId: undefined,
            valueId: undefined,
            imageUrl: sku.imgUrl,
          };
        }
        return {
          name: column.name,
          value: "",
          propId: column.key.startsWith("index-") ? undefined : column.key,
          valueId: undefined,
          imageUrl: undefined,
        };
      });

      const nextSpecs = fallbackSpecs.map((spec, specIndex) => {
        const specKey = spec.propId || `index-${specIndex}`;
        return specKey === columnKey ? { ...spec, name: spec.name || specColumns[specIndex]?.name || "规格", value: nextValue } : spec;
      });

      return {
        ...sku,
        spec: nextSpecs.map((item) => item.value).filter(Boolean).join(" / "),
        specs: nextSpecs,
      };
    });

    onChange(nextList);
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          border: "1px solid #e8ecf0",
          borderRadius: 8,
          overflow: "hidden",
          minWidth: Math.max(360, specColumns.length * 150 + 220),
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns }}>
          {specColumns.map((column) => (
            <div key={`header-${column.key}`} style={colStyle}>
              <Input
                size="small"
                value={column.name}
                onChange={(event) => updateColumnName(column.key, event.target.value)}
                style={{ fontSize: 12 }}
              />
            </div>
          ))}
          <div style={{ ...colStyle, textAlign: "center" }}>价格（元）</div>
          <div style={{ ...colStyle, textAlign: "center" }}>数量（件）</div>
        </div>

        {skuList.map((sku, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns,
              alignItems: "center",
              borderBottom: idx < skuList.length - 1 ? "1px solid #f1f5f9" : "none",
              background: idx % 2 === 0 ? "#fff" : "#fafbfc",
            }}
          >
            {specColumns.map((column, columnIndex) => {
              const matchedSpec = sku.specs?.find((item, specIndex) => (item.propId || `index-${specIndex}`) === column.key);
              const fallbackValue = !sku.specs?.length && columnIndex === 0 ? sku.spec : "";
              const currentValue = matchedSpec?.value ?? fallbackValue;
              const currentImage = matchedSpec?.imageUrl || (columnIndex === 0 ? sku.imgUrl : undefined);

              return (
                <div key={`${idx}-${column.key}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 8px", minWidth: 0 }}>
                  {currentImage ? (
                    <img
                      src={currentImage}
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        objectFit: "cover",
                        flexShrink: 0,
                        background: "#f1f5f9",
                      }}
                    />
                  ) : null}
                  <Input
                    size="small"
                    value={currentValue}
                    onChange={(event) => updateSpecValue(idx, column.key, event.target.value)}
                    style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                  />
                </div>
              );
            })}
            <div style={{ padding: "8px 6px" }}>
              <Input
                size="small"
                value={sku.price}
                onChange={(e) => {
                  const next = skuList.map((item, index) => (index === idx ? { ...item, price: e.target.value } : item));
                  onChange(next);
                }}
                style={{ fontSize: 12, textAlign: "center" }}
                prefix={<span style={{ color: "#e11d48", fontSize: 11 }}>¥</span>}
              />
            </div>
            <div style={{ padding: "8px 6px" }}>
              <Input
                size="small"
                value={String(sku.stock)}
                onChange={(e) => {
                  const next = skuList.map((item, index) =>
                    index === idx ? { ...item, stock: Number(e.target.value.replace(/\D/g, "")) || 0 } : item,
                  );
                  onChange(next);
                }}
                style={{ fontSize: 12, textAlign: "center" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ProductDetailEditorProps {
  data: StandardProductData | null;
  loading?: boolean;
  onChange?: (next: StandardProductData) => void;
}

export function ProductDetailEditor({ data, loading = false, onChange }: ProductDetailEditorProps) {
  const [local, setLocal] = useState<StandardProductData | null>(data);
  const [previewImage, setPreviewImage] = useState("");

  useEffect(() => {
    setLocal(data);
  }, [data]);

  function patch(partial: Partial<StandardProductData>) {
    if (!local) return;
    const next = { ...local, ...partial };
    setLocal(next);
    onChange?.(next);
  }

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 240, flex: 1 }}>
        <Spin tip="加载商品数据…" />
      </div>
    );
  }

  if (!local) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          flex: 1,
          minHeight: 200,
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        暂无商品数据
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          flex: 1,
          height: "100%",
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          paddingRight: 2,
          scrollbarGutter: "stable",
        }}
      >
        <CollapsibleSection title="基础信息" defaultOpen>
          <div style={FIELD_ROW}>
            <div style={FIELD_LABEL}>
              <span style={{ color: "#ef4444" }}>*</span> 宝贝标题
            </div>
            <div style={FIELD_VALUE}>
              <TextArea
                value={local.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={60}
                showCount
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="请输入宝贝标题（最多60字）"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ ...FIELD_ROW, marginBottom: 0 }}>
            <div style={FIELD_LABEL}>导购标题</div>
            <div style={FIELD_VALUE}>
              <Input
                value={local.subTitle || ""}
                onChange={(e) => patch({ subTitle: e.target.value })}
                maxLength={30}
                showCount
                placeholder="品牌 + 品类词 + 利益点（最多30字）"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="商品主图"
          count={
            local.viewImages && local.viewImages.length > 5
              ? `已选 ${local.mainImages.filter(Boolean).length}/5，共 ${local.viewImages.length} 张候选`
              : `${local.mainImages.filter(Boolean).length}/5 张`
          }
          defaultOpen
        >
          <MainImagePanel
            images={local.mainImages}
            allImages={local.viewImages}
            onChange={(next) => patch({ mainImages: next.filter(Boolean).slice(0, 5) })}
            onPreview={(url) => setPreviewImage(url)}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="商品详情图"
          count={`${local.detailImages.length} 张`}
          defaultOpen
        >
          <DetailImagePanel
            images={local.detailImages}
            onChange={(next) => patch({ detailImages: next })}
            onPreview={(url) => setPreviewImage(url)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="商品属性" count={local.attributes.length ? `${local.attributes.length} 项` : undefined}>
          <AttributeRows attributes={local.attributes} onChange={(attributes) => patch({ attributes })} />
        </CollapsibleSection>

        <CollapsibleSection title="销售规格" count={local.skuList.length ? `${local.skuList.length} 个 SKU` : undefined}>
          <SkuTable skuList={local.skuList} onChange={(skuList) => patch({ skuList })} />
        </CollapsibleSection>

        <CollapsibleSection title="物流信息">
          <div style={FIELD_ROW}>
            <div style={FIELD_LABEL}>快递运费</div>
            <div style={FIELD_VALUE}>
              <Input
                value={local.logistics.shipping || ""}
                onChange={(e) => patch({ logistics: { ...local.logistics, shipping: e.target.value } })}
                placeholder="如：包邮 / ¥5.00"
                size="small"
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <div style={FIELD_ROW}>
            <div style={FIELD_LABEL}>发货时间</div>
            <div style={FIELD_VALUE}>
              <Input
                value={local.logistics.deliveryTime || ""}
                onChange={(e) => patch({ logistics: { ...local.logistics, deliveryTime: e.target.value } })}
                placeholder="如：48小时内"
                size="small"
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <div style={FIELD_ROW}>
            <div style={FIELD_LABEL}>退换货</div>
            <div style={FIELD_VALUE}>
              <Input
                value={local.logistics.refundPolicy || ""}
                onChange={(e) => patch({ logistics: { ...local.logistics, refundPolicy: e.target.value } })}
                placeholder="退换货政策"
                size="small"
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ ...FIELD_ROW, marginBottom: 0 }}>
            <div style={FIELD_LABEL}>发货地</div>
            <div style={FIELD_VALUE}>
              <Input
                value={local.logistics.shipFrom || ""}
                onChange={(e) => patch({ logistics: { ...local.logistics, shipFrom: e.target.value } })}
                placeholder="如：广东 深圳"
                size="small"
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
        </CollapsibleSection>

        <div style={{ height: 12, flexShrink: 0 }} />

        <style>{`
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.5); border-radius: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-corner { background: transparent; }
        `}</style>
      </div>

      <Modal open={Boolean(previewImage)} footer={null} onCancel={() => setPreviewImage("")} width={880}>
        {previewImage ? (
          <img
            src={previewImage}
            alt="图片预览"
            style={{ width: "100%", maxHeight: "72vh", objectFit: "contain", display: "block" }}
          />
        ) : null}
      </Modal>
    </>
  );
}
