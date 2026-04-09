export interface StoreAdapter {
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
    clear(): void;
    keys(): string[];
}

let store: StoreAdapter | undefined = undefined;

function ensureStore(): StoreAdapter {
    if (!store) {
        throw new Error('store adapter not initialized');
    }
    return store;
}

/**
 * 初始化 store adapter
 */
export function initStore(adapter: StoreAdapter): void {
    store = adapter;
}

// ========== 全局存储函数 (不涉及端口) ==========

/**
 * 获取全局配置 (不涉及端口)
 */
export function getGlobal(key: string): any {
    return ensureStore().get(key);
}

/**
 * 设置全局配置 (不涉及端口)
 */
export function setGlobal(key: string, value: any): void {
    ensureStore().set(key, value);
}

/**
 * 删除全局配置 (不涉及端口)
 */
export function removeGlobal(key: string): void {
    ensureStore().delete(key);
}

/**
 * 清空所有全局配置 (不涉及端口)
 */
export function clearGlobal(): void {
    ensureStore().clear();
}

/**
 * 获取所有存储键名
 */
export function getAllStoreKeys(): string[] {
    return ensureStore().keys();
}
