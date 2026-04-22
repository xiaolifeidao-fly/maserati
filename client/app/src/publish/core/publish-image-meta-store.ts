export interface ImageCropMeta {
  /** 裁剪后宽度 */
  width: number;
  /** 裁剪后高度 */
  height: number;
}

/** taskId → (tbUrl → 裁剪尺寸) */
const store = new Map<number, Map<string, ImageCropMeta>>();

export function setImageCropMeta(taskId: number, tbUrl: string, meta: ImageCropMeta): void {
  let taskMap = store.get(taskId);
  if (!taskMap) {
    taskMap = new Map();
    store.set(taskId, taskMap);
  }
  taskMap.set(tbUrl, meta);
}

/** 获取任务的全量图片尺寸 map（只读快照，供 filler 使用一次） */
export function getImageCropMetaMap(taskId: number): ReadonlyMap<string, ImageCropMeta> {
  return store.get(taskId) ?? new Map();
}

export function clearImageCropMeta(taskId: number): void {
  store.delete(taskId);
}
