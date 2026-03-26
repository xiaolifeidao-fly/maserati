
let store: any = undefined;
let currentPort: number = 0;

/**
 * 初始化store
 */
export function initStore(electronStore: any): void {
    store = electronStore;
}


// ========== 全局存储函数 (不涉及端口) ==========

/**
 * 获取全局配置 (不涉及端口)
 */
export function getGlobal(key: string): any {
    return store.get(key);
}

/**
 * 设置全局配置 (不涉及端口)
 */
export function setGlobal(key: string, value: any): void {
    store.set(key, value);
}

/**
 * 删除全局配置 (不涉及端口)
 */
export function removeGlobal(key: string): void {
    store.delete(key);
}

/**
 * 清空所有全局配置 (不涉及端口)
 */
export function clearGlobal(): void {
    store.clear();
}


/**
 * 获取所有存储键名
 */
export function getAllStoreKeys(): string[] {
    return Object.keys(store.store);
}