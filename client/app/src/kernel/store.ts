import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import Store from 'electron-store';
import { initStore, type StoreAdapter } from '../../../common/utils/store/electron';

type SqlJsModule = {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    export(): Uint8Array;
};

const DEFAULT_STORAGE_DRIVER = 'store';
const SQLITE_STORAGE_DIR = 'storage';
const SQLITE_STORAGE_FILE = 'app-storage.sqlite';

function resolveStorageDriver(): string {
    return String(process.env.ELECTRON_STORAGE_DRIVER ?? DEFAULT_STORAGE_DRIVER)
        .trim()
        .toLowerCase();
}

function createElectronStoreAdapter(): StoreAdapter {
    const store = new Store();
    return {
        get(key: string): any {
            return store.get(key);
        },
        set(key: string, value: any): void {
            store.set(key, value);
        },
        delete(key: string): void {
            store.delete(key);
        },
        clear(): void {
            store.clear();
        },
        keys(): string[] {
            return Object.keys(store.store);
        },
    };
}

async function loadSqlJsModule(): Promise<SqlJsModule> {
    const sqlJsFactory = require('sql.js/dist/sql-asm.js');
    return sqlJsFactory.default ? sqlJsFactory.default() : sqlJsFactory();
}

function ensureDirectory(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readDatabaseFile(filePath: string): Uint8Array | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    return new Uint8Array(fs.readFileSync(filePath));
}

function createSqliteStoreAdapter(db: SqlJsDatabase, filePath: string): StoreAdapter {
    db.run(`
        CREATE TABLE IF NOT EXISTS app_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    const flush = () => {
        ensureDirectory(filePath);
        fs.writeFileSync(filePath, Buffer.from(db.export()));
    };

    const parseValue = (rawValue: unknown, key: string): any => {
        if (typeof rawValue !== 'string') {
            return undefined;
        }
        try {
            return JSON.parse(rawValue);
        } catch (error) {
            throw new Error(`failed to parse stored sqlite value for key "${key}": ${String(error)}`);
        }
    };

    return {
        get(key: string): any {
            const result = db.exec('SELECT value FROM app_store WHERE key = ?', [key]);
            const rawValue = result[0]?.values?.[0]?.[0];
            if (rawValue == null) {
                return undefined;
            }
            return parseValue(rawValue, key);
        },
        set(key: string, value: any): void {
            if (value === undefined) {
                db.run('DELETE FROM app_store WHERE key = ?', [key]);
                flush();
                return;
            }
            const serialized = JSON.stringify(value);
            if (serialized === undefined) {
                throw new Error(`sqlite store does not support serializing value for key "${key}"`);
            }
            db.run(
                'INSERT INTO app_store(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                [key, serialized],
            );
            flush();
        },
        delete(key: string): void {
            db.run('DELETE FROM app_store WHERE key = ?', [key]);
            flush();
        },
        clear(): void {
            db.run('DELETE FROM app_store');
            flush();
        },
        keys(): string[] {
            const result = db.exec('SELECT key FROM app_store ORDER BY key ASC');
            return (result[0]?.values ?? []).map((row) => String(row[0]));
        },
    };
}

async function createSqliteAdapter(): Promise<StoreAdapter> {
    const SQL = await loadSqlJsModule();
    const filePath = path.join(app.getPath('userData'), SQLITE_STORAGE_DIR, SQLITE_STORAGE_FILE);
    const database = new SQL.Database(readDatabaseFile(filePath));
    return createSqliteStoreAdapter(database, filePath);
}

export async function init(): Promise<void> {
    const storageDriver = resolveStorageDriver();
    const adapter = storageDriver === 'sqlite'
        ? await createSqliteAdapter()
        : createElectronStoreAdapter();

    initStore(adapter);
}
