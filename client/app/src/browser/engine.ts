import path from 'path';
import fs from 'fs'
import { execSync } from 'child_process';
import type { Browser, BrowserContext, Page, Route, Request, Response } from 'playwright';
// 使用 patchright 替换原生 playwright 的 chromium：
// patchright 是 playwright 的 drop-in 替换，去除了 __pwInitScripts__、utility world、
// CDP Runtime.enable 等可被 aplus_v2 / umsdk 反爬脚本探测到的自动化痕迹。
import { chromium } from 'patchright';
import { getGlobal, removeGlobal, setGlobal } from '@utils/store/electron';
import { app, screen as electronScreen } from 'electron';
import { Monitor, MonitorChain, MonitorRequest, MonitorResponse } from './monitor/monitor';
import { DoorEntity } from './entity';
import log from 'electron-log';
import os from 'os';
import {
    publishTaobaoRequestLog,
    publishTaobaoResponseLog,
    summarizeForLog,
} from '@src/publish/utils/publish-logger';
declare const window: any;
declare const navigator: any;
declare const document: any;
declare const screen: any;
declare const WebGLRenderingContext: any;
declare const HTMLCanvasElement: any;
declare const Element: any;
declare const WebGL2RenderingContext: any;
declare const MimeType: any;
declare const performance: any;
const browserMap = new Map<string, Browser>();

const contextMap = new Map<string, BrowserContext>();

type BrowserPluginInfo = {
    name: string;
    description: string;
    filename: string;
};

type BrowserMimeTypeInfo = {
    type: string;
    suffixes: string;
    description: string;
};

type BrowserDeviceProfile = {
    userAgent: string;
    uaPlatform: string;
    locale: string;
    timezoneId: string;
    platform?: string;
    language?: string;
    languages?: string[];
    hardwareConcurrency?: number;
    deviceMemory?: number;
    deviceScaleFactor?: number;
    webgl?: {
        vendor?: string;
        renderer?: string;
    };
    plugins?: BrowserPluginInfo[];
    mimeTypes?: BrowserMimeTypeInfo[];
};

// ─── 从 Chrome 自身读取真实 UA，只修掉 HeadlessChrome 标识 ──────────────────
const chromeUACache = new Map<string, string>();
const deviceProfileCache = new Map<string, BrowserDeviceProfile>();

function getSystemLocale(): string {
    return app.getLocale() || Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN';
}

function getSystemTimezoneId(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

function getCurrentDeviceScaleFactor(): number | undefined {
    try {
        const primaryDisplay = electronScreen.getPrimaryDisplay();
        return primaryDisplay.scaleFactor || undefined;
    } catch {
        return undefined;
    }
}

function getUaPlatformByOS(): string {
    const p = os.platform();
    return p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : 'Linux';
}

function normalizeUserAgent(userAgent: string, chromePath?: string): string {
    const fixedUA = String(userAgent || '').replace('HeadlessChrome/', 'Chrome/');
    if (fixedUA) return fixedUA;

    let version = '136.0.0.0';
    if (chromePath) {
        try {
            const out = execSync(`"${chromePath}" --version 2>/dev/null`, { timeout: 5000 }).toString().trim();
            const m = out.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (m) version = m[1];
        } catch { /* ignore */ }
    }
    const p = os.platform();
    return p === 'darwin'
        ? `Mozilla/5.0 (Macintosh; Intel Mac OS X ${String((process as any).getSystemVersion?.() || os.release() || '10.15.7').replace(/\./g, '_')}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
        : p === 'win32'
        ? `Mozilla/5.0 (Windows NT ${os.release().split('.').slice(0, 2).join('.') || '10.0'}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
        : `Mozilla/5.0 (X11; Linux ${os.arch() === 'x64' ? 'x86_64' : os.arch()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

async function getBrowserDeviceProfile(chromePath?: string): Promise<BrowserDeviceProfile> {
    const cacheKey = chromePath ?? '__default__';
    if (deviceProfileCache.has(cacheKey)) return deviceProfileCache.get(cacheKey)!;

    const tmpDir = path.join(os.tmpdir(), `cr-device-probe-${Date.now()}`);
    let tempCtx: any;
    const fallbackProfile = (): BrowserDeviceProfile => ({
        userAgent: normalizeUserAgent('', chromePath),
        uaPlatform: getUaPlatformByOS(),
        locale: getSystemLocale(),
        timezoneId: getSystemTimezoneId(),
        deviceScaleFactor: getCurrentDeviceScaleFactor(),
    });

    try {
        tempCtx = await chromium.launchPersistentContext(tmpDir, {
            headless: true,
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await tempCtx.newPage();
        const rawProfile = await page.evaluate(() => {
            const getWebglInfo = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (!gl) return {};
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    if (!ext) return {};
                    return {
                        vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
                        renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
                    };
                } catch {
                    return {};
                }
            };
            return {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                languages: Array.from(navigator.languages || []),
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: (navigator as any).deviceMemory,
                deviceScaleFactor: window.devicePixelRatio,
                timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: Intl.DateTimeFormat().resolvedOptions().locale,
                webgl: getWebglInfo(),
                plugins: Array.from(navigator.plugins || []).map((plugin: any) => ({
                    name: String(plugin.name || ''),
                    description: String(plugin.description || ''),
                    filename: String(plugin.filename || ''),
                })).filter((plugin) => plugin.name || plugin.description || plugin.filename),
                mimeTypes: Array.from(navigator.mimeTypes || []).map((mime: any) => ({
                    type: String(mime.type || ''),
                    suffixes: String(mime.suffixes || ''),
                    description: String(mime.description || ''),
                })).filter((mime) => mime.type),
            };
        });
        const profile: BrowserDeviceProfile = {
            userAgent: normalizeUserAgent(rawProfile.userAgent, chromePath),
            uaPlatform: getUaPlatformByOS(),
            locale: rawProfile.locale || getSystemLocale(),
            timezoneId: rawProfile.timezoneId || getSystemTimezoneId(),
            platform: rawProfile.platform || undefined,
            language: rawProfile.language || undefined,
            languages: Array.isArray(rawProfile.languages) ? rawProfile.languages.filter(Boolean) : undefined,
            hardwareConcurrency: Number(rawProfile.hardwareConcurrency) || undefined,
            deviceMemory: Number(rawProfile.deviceMemory) || undefined,
            deviceScaleFactor: Number(rawProfile.deviceScaleFactor) || getCurrentDeviceScaleFactor(),
            webgl: rawProfile.webgl || undefined,
            plugins: Array.isArray(rawProfile.plugins) ? rawProfile.plugins : undefined,
            mimeTypes: Array.isArray(rawProfile.mimeTypes) ? rawProfile.mimeTypes : undefined,
        };
        deviceProfileCache.set(cacheKey, profile);
        chromeUACache.set(cacheKey, profile.userAgent);
        log.info('[Engine] browser device profile:', {
            userAgent: profile.userAgent,
            uaPlatform: profile.uaPlatform,
            locale: profile.locale,
            timezoneId: profile.timezoneId,
            platform: profile.platform,
            deviceScaleFactor: profile.deviceScaleFactor,
            webgl: profile.webgl,
            plugins: profile.plugins?.length || 0,
            mimeTypes: profile.mimeTypes?.length || 0,
        });
        return profile;
    } catch (error) {
        log.warn('[Engine] device profile probe failed, using system fallback:', error);
        const profile = fallbackProfile();
        deviceProfileCache.set(cacheKey, profile);
        chromeUACache.set(cacheKey, profile.userAgent);
        return profile;
    } finally {
        try { await tempCtx?.close(); } catch { }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    }
}

async function getRealChromeUA(chromePath?: string): Promise<string> {
    const cacheKey = chromePath ?? '__default__';
    if (chromeUACache.has(cacheKey)) return chromeUACache.get(cacheKey)!;
    const profile = await getBrowserDeviceProfile(chromePath);
    return profile.userAgent;
}

function buildSecChUaHeaders(userAgent: string, uaPlatform: string): Record<string, string> {
    const m = userAgent.match(/Chrome\/(\d+)/);
    const majorVersion = m ? m[1] : '136';
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
    return {
        'sec-ch-ua': `"Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}", "Not A(Brand";v="24"`,
        'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
        'sec-ch-ua-platform': `"${uaPlatform}"`,
    };
}

/**
 * 将 Electron BrowserView session 的 cookie 注入到指定店铺的 Playwright context。
 * 验证码在 Electron BrowserView 解完后调用，确保新 cookie 同步到 Playwright。
 */
export async function injectCookiesIntoTbContext(
  shopId: string,
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>,
): Promise<void> {
  if (!cookies.length) return;

  const validCookies = cookies.filter(c => c.domain && c.name && c.value !== undefined);
  if (!validCookies.length) return;

  let storeBrowserPath: string | undefined;
  try {
    storeBrowserPath = await getChromePath();
  } catch { /* ignore */ }

  const baseKey = `door_engine_tb_${shopId}`;
  const candidateKeys = [true, false].flatMap((headless) => {
    const key = `${headless.toString()}_${baseKey}`;
    return storeBrowserPath ? [`${key}_${storeBrowserPath}`, key] : [key];
  });
  const contexts = Array.from(new Set(candidateKeys.map(key => contextMap.get(key)).filter(Boolean))) as BrowserContext[];

  if (!contexts.length) {
    log.warn('[Engine] injectCookiesIntoTbContext: no context found for shop', shopId);
    return;
  }

  try {
    await Promise.all(contexts.map(context => context.addCookies(validCookies)));
    log.info('[Engine] injectCookiesIntoTbContext: injected', validCookies.length, 'cookies for shop', shopId, 'contexts:', contexts.length);
  } catch (error) {
    log.warn('[Engine] injectCookiesIntoTbContext: failed to inject cookies', error);
  }
}

/**
 * 清理 Chrome persistent context 目录下的过期锁文件。
 * Windows 上 app 崩溃或重装后这些文件会残留，导致 Chrome 弹出
 * "Profile is in use - Retry / Cancel" 对话框并无限循环。
 */
function clearChromeLockFiles(userDataDir: string): void {
    const lockFiles = [
        'lockfile',
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket',
    ];
    for (const name of lockFiles) {
        const lockPath = path.join(userDataDir, name);
        try {
            if (fs.existsSync(lockPath)) {
                fs.rmSync(lockPath, { force: true });
                log.info('[Engine] removed stale Chrome lock file', lockPath);
            }
        } catch (e) {
            log.warn('[Engine] failed to remove Chrome lock file', lockPath, e);
        }
    }
}

export async function closeAllBrowserContexts(): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const context of contextMap.values()) {
        tasks.push(context.close().catch((e) => log.warn('[Engine] close context error on quit', e)));
    }
    contextMap.clear();

    for (const browser of browserMap.values()) {
        tasks.push(browser.close().catch((e) => log.warn('[Engine] close browser error on quit', e)));
    }
    browserMap.clear();

    await Promise.allSettled(tasks);
}


export function loadChromePath(){
    try {
        log.info('[PlatformConfigApi] 开始加载Chrome路径');

        // 获取 StoreApi

        // 从存储中读取Chrome路径
        const result =  getGlobal("current_chrome_path");
        log.info('[PlatformConfigApi] 加载Chrome路径结果:', result);
        if(result && result == ""){
            return undefined;
        }
        return result;
    } catch (error: any) {
        return undefined;
    }
}


export function saveChromePath(path: string){
    setGlobal("current_chrome_path", path);
}

// 获取系统真实的Chrome浏览器路径
function getSystemChromePath(): string {
    const platform = os.platform();
    
    log.info(`检测操作系统: ${platform}`);
    //C:\Users\Administrator\AppData\Local\Google\Chrome\Bin\chromex.exe
    const winPaths = [
        path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files (x86)', 'Chrome', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Bin', 'chromex.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome Dev', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome SxS', 'Application', 'chrome.exe'), // Canary
        path.join('C:', 'Program Files', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files (x86)', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'),
    ];
    switch (platform) {
        case 'darwin': // macOS
            const macPaths = [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
                '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
            ];
            
            log.info('检测macOS Chrome路径...');
            for (const chromePath of macPaths) {
                log.info(`检查路径: ${chromePath}`);
                if (fs.existsSync(chromePath)) {
                    log.info(`✅ 找到Chrome: ${chromePath}`);
                    return chromePath;
                }
            }
            break;
        
        case 'win32': // Windows
            log.info('检测Windows Chrome路径...');
            for (const chromePath of winPaths) {
                log.info(`检查路径: ${chromePath}`);
                if (fs.existsSync(chromePath)) {
                    log.info(`✅ 找到Chrome: ${chromePath}`);
                    // 在Windows系统中将双反斜杠替换为单反斜杠
                    return chromePath.replace(/\\\\/g, '\\');
                }
            }
            break;
        
        case 'linux': // Linux
            const linuxPaths = [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome-beta',
                '/usr/bin/google-chrome-unstable',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/snap/bin/chromium',
                '/var/lib/snapd/snap/bin/chromium',
                '/usr/local/bin/google-chrome'
            ];
            
            log.info('检测Linux Chrome路径...');
            for (const chromePath of linuxPaths) {
                log.info(`检查路径: ${chromePath}`);
                if (fs.existsSync(chromePath)) {
                    log.info(`✅ 找到Chrome: ${chromePath}`);
                    return chromePath;
                }
            }
            break;
        
        default:
            log.info('default 检测Windows Chrome路径...');
            for (const chromePath of winPaths) {
                log.info(`检查路径: ${chromePath}`);
                if (fs.existsSync(chromePath)) {
                    log.info(`✅ 找到Chrome: ${chromePath}`);
                    // 在Windows系统中将双反斜杠替换为单反斜杠
                    return chromePath.replace(/\\\\/g, '\\');
                }
            }
    }
    
    // 如果都没找到，抛出错误
    throw new Error(`未找到系统安装的Chrome浏览器，请检查Chrome是否已安装。操作系统: ${platform}`);
}

// 获取Chrome浏览器路径的主方法
function getChromePath(): string {
    // 1. 优先使用环境变量中的路径
    // if (process.env.CHROME_PATH) {
    //     const envPath = process.env.CHROME_PATH;
    //     log.info(`使用环境变量中的Chrome路径: ${envPath}`);
        
    //     // 验证环境变量中的路径是否存在
    //     if (fs.existsSync(envPath)) {
    //         log.info(`✅ 环境变量路径有效: ${envPath}`);
    //         // 在Windows系统中将双反斜杠替换为单反斜杠
    //         if (os.platform() === 'win32') {
    //             return envPath.replace(/\\\\/g, '\\');
    //         }
    //         return envPath;
    //     } else {
    //         log.info(`❌ 环境变量路径无效: ${envPath}`);
    //         log.info('将尝试自动检测系统Chrome路径...');
    //     }
    // }
    
    // 2. 自动检测系统Chrome路径
    try {
        return getSystemChromePath();
    } catch (error) {
        console.error('❌ Chrome路径检测失败:', (error as Error).message);
        throw error;
    }
}

export abstract class DoorEngine<T = any> {

    protected chromePath: string | undefined;

    protected browser: Browser | undefined;

    protected context: BrowserContext | undefined;

    public resourceId : string;

    public headless: boolean = true;

    monitors : Monitor<T>[] = [];

    monitorsChain : MonitorChain<T>[] = [];

    page : Page | undefined;

    width : number;
    height : number;
    usePersistentContext : boolean;

    needValidateImage : boolean = false;
    publishTaskId?: number;

    timeout : number = 30000;

    browserArgs : string[] = [
        // '--disable-accelerated-2d-canvas', '--disable-webgl',
        //  '--disable-software-rasterizer',
        '--no-sandbox', // 取消沙箱，某些网站可能会检测到沙箱模式
        '--disable-setuid-sandbox',
        '--disable-webrtc-encryption',
        '--disable-webrtc-hw-decoding',
        '--disable-webrtc-hw-encoding',
        '--disable-extensions-file-access-check',
        '--disable-blink-features=AutomationControlled',  // 禁用浏览器自动化控制特性
        '--disable-background-timer-throttling', // 禁用后台定时器节流
        '--disable-renderer-backgrounding', // 禁用渲染器后台化
        '--disable-backgrounding-occluded-windows', // 禁用被遮挡窗口的后台化
        '--disable-dev-shm-usage', // 避免共享内存问题
        '--disable-gpu-sandbox', // 禁用GPU沙箱
        '--no-first-run', // 跳过首次运行设置
        '--no-default-browser-check', // 跳过默认浏览器检查
        '--disable-default-apps', // 禁用默认应用
        '--disable-features=TranslateUI' // 禁用翻译UI
      ];

    constructor(resourceId : string, headless: boolean = true, chromePath: string = "", usePersistentContext : boolean = true, browserArgs : string[]|undefined = undefined){
        this.resourceId = resourceId;
        this.usePersistentContext = usePersistentContext;
        if(chromePath){
            this.chromePath = chromePath;
        }else{
            this.chromePath = this.getChromePath();
        }
        this.headless = headless;
        if(browserArgs){
            this.browserArgs = browserArgs;
        }
        try{
            const primaryDisplay = electronScreen.getPrimaryDisplay();
            this.width = primaryDisplay.workAreaSize.width;
            this.height = primaryDisplay.workAreaSize.height;
        }catch(error){
            this.width = 1920;
            this.height = 1080;
            log.error("init width and height error", error);
        }
    }

    setNeedValidateImage(needValidateImage : boolean){
        this.needValidateImage = needValidateImage;
    }

    bindPublishTask(taskId: number){
        this.publishTaskId = taskId;
    }

    getChromePath() : string | undefined{
        return process.env.CHROME_PATH;
    }

    addMonitor(monitor: Monitor){
        this.monitors.push(monitor);
    }

    getPage(){
        return this.page;
    }

    addMonitorChain(monitorChain: MonitorChain<T>){
        this.monitorsChain.push(monitorChain);
        this.monitors.push(...monitorChain.getMonitors());
    }

    public getTimeout(){
        log.info("getTimeout is ", this.timeout);
        return this.timeout;
    }

    private getViewportConfig() {
        return this.headless ? { width: this.width, height: this.height } : null;
    }

    private async setInitialViewport(page: Page) {
        if (!this.headless) {
            return;
        }
        await page.setViewportSize({ width: this.width, height: this.height });
    }

    /**
     * 创建 Page 但不导航（用于在 goto 前注册响应监听器）。
     * 调用方完成监听器注册后，自行调用 page.goto(url)。
     */
    public async createPage(): Promise<Page | undefined> {
        if (this.usePersistentContext) {
            this.context = await this.createContextByPersistentContext();
        } else {
            this.browser = await this.createBrowser();
            if (!this.context) {
                this.context = await this.createContext();
            }
        }
        if (!this.context) return undefined;
        const timeout = await this.buildTimeout();
        this.timeout = timeout;
        const page = await this.context.newPage();
        await this.setInitialViewport(page);
        this.onRequest(page);
        this.onResponse(page);
        this.page = page;
        return page;
    }

    public async init(url : string|undefined = undefined) : Promise<Page | undefined> {
        log.info("init usePersistentContext is ", this.usePersistentContext);
        if(this.usePersistentContext){
            return await this.initByPersistentContext(url);
        }
        this.browser = await this.createBrowser();
        if(!this.context){
            this.context = await this.createContext();
        }
        // this.context = await this.createBrowser();
        if(!this.context){
            return undefined;
        }
        // 添加网络请求拦截
        // await this.setupNetworkInterception(this.context);
        const timeout = await this.buildTimeout();
        this.timeout = timeout;
        const page = await this.context.newPage();
        await this.setInitialViewport(page);
        if(url){
            await page.goto(url, {
                timeout: timeout,
            });
        }
        this.onRequest(page);
        this.onResponse(page);
        this.page = page;
        return page;
    }

    private async buildTimeout(){
        return 30000;
    }



    async initByPersistentContext(url : string|undefined = undefined) : Promise<Page | undefined> {
        this.context = await this.createContextByPersistentContext();
        if(!this.context){
            return undefined;
        }
        const page = await this.context.newPage();
        await this.setInitialViewport(page);
        if(url){
            await page.goto(url);
        }
        this.onRequest(page);
        this.onResponse(page);
        this.page = page;
        return page;
    }

    async createContextByPersistentContext(): Promise<BrowserContext> {
        let storeBrowserPath = await this.getRealChromePath();

        const key = this.getPersistentContextKey(storeBrowserPath);
        if(contextMap.has(key)){
            const cached = contextMap.get(key) as BrowserContext;
            try {
                // cookies() 是轻量检测：已关闭的 context 调用会抛错
                await cached.cookies();
                log.info("from cache browser key is ", key);
                return cached;
            } catch (error) {
                log.warn('[Engine] cached context is stale, removing and recreating', error);
                contextMap.delete(key);
            }
        }
        const userDataDir = this.getUserDataDir();
        clearChromeLockFiles(userDataDir);

        const deviceProfile = await getBrowserDeviceProfile(storeBrowserPath);
        const secChUaHeaders = buildSecChUaHeaders(deviceProfile.userAgent, deviceProfile.uaPlatform);

        const contextConfig: any = {
            headless: this.headless,
            executablePath: storeBrowserPath,
            userAgent: deviceProfile.userAgent,
            viewport: this.getViewportConfig(),
            args: [
                ...this.browserArgs,
                `--window-size=${this.width},${this.height}`,
            ],
            ignoreDefaultArgs: [
                '--enable-automation',
                '--enable-blink-features=IdleDetection',
                '--hide-scrollbars',
                '--mute-audio',
            ],
            extraHTTPHeaders: secChUaHeaders,
            bypassCSP : true,
            locale: deviceProfile.locale,
            timezoneId: deviceProfile.timezoneId,
        };
        if (this.headless && deviceProfile.deviceScaleFactor) {
            contextConfig.deviceScaleFactor = deviceProfile.deviceScaleFactor;
        }
        try{
            const context = await chromium.launchPersistentContext(userDataDir, contextConfig);
            contextMap.set(key, context);
            try {
                await this.addAntiDetectionScript(context, deviceProfile);
            } catch (injectError) {
                log.warn('[Engine] failed to inject anti-detection script (persistent)', injectError);
            }
            // 恢复上次保存的 session cookie（session cookie 不会随持久化 context 的关闭写入磁盘）
            const sessionPath = await this.getSessionPath();
            if (sessionPath && fs.existsSync(sessionPath)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                    if (Array.isArray(sessionData.cookies) && sessionData.cookies.length > 0) {
                        await context.addCookies(sessionData.cookies);
                        log.info('[Engine] restored session cookies from', sessionPath, 'count:', sessionData.cookies.length);
                    }
                } catch (restoreError) {
                    log.warn('[Engine] failed to restore session cookies', restoreError);
                }
            }
            return context;
        }catch(error){
            log.error("create context error is ", error);
            throw error;
        }
    }

    public getContext(){
        return this.context;
    }

    public getLastSessionDir(){
        const userDataPath = app.getPath('userData');

        const sessionDirPath = path.join(userDataPath,'resource','session',this.getNamespace(), this.resourceId.toString());
        log.info("sessionDirPath is ", sessionDirPath);
        if(fs.existsSync(sessionDirPath)){
            //获取此文件夹下最新的那个文件
            const files = fs.readdirSync(sessionDirPath);
            const latestFile = files.sort((a, b) => fs.statSync(path.join(sessionDirPath, b)).mtime.getTime() - fs.statSync(path.join(sessionDirPath, a)).mtime.getTime())[0];
            const filePath = path.join(sessionDirPath, latestFile);
            log.info("latestSessionDir is ", filePath);
            return filePath;
        }
        return undefined;
    }

    public async closePage(){
        if(this.page){
            await this.page.close();
        }
    }

    /**
     * 仅初始化 BrowserContext（复用缓存），不创建 Page。
     * 适用于只需读取 cookies 等轻量操作，避免不必要的 Tab 开销。
     */
    public async getContextOnly(): Promise<BrowserContext | null> {
        try {
            this.context = await this.createContextByPersistentContext();
            return this.context;
        } catch {
            return null;
        }
    }

    public async release(){
        // const browserKey = this.getBrowserKey();
        // if(browserMap.has(browserKey)){
        //     const browser = browserMap.get(browserKey);
        //     if(browser){
        //         await browser.close();
        //     }
        //     browserMap.delete(browserKey);
        // }
    }


    public async doBeforeRequest(router : Route, request: Request, headers: { [key: string]: string; }){
        let isFilter = false;
        for(const monitor of this.monitors){
            if(await monitor.filter(request.url(), request.resourceType(), request.method(), headers)){
                await router.abort();
                isFilter = true;
                continue;
            }
            if(monitor.finishTag){
                continue;
            }
            
            if(!(monitor instanceof MonitorRequest)){
                continue;
            }
            if(!await monitor.isMatch(request.url(), request.method(), headers)){
                continue;
            }
            const requestMonitor = monitor as MonitorRequest<T>;
            let data;
            if(requestMonitor.handler){
                data = await requestMonitor.handler(request, undefined);
            }
            let headerData = {};
            if(requestMonitor.needHeaderData()){
                headerData = await request.allHeaders();
            }
            let url = "";
            if(requestMonitor.needUrl()){
                url = request.url();
            }
            let requestBody = {};
            if(requestMonitor.needRequestBody()){
                const body = request.postData();
                if(body){
                    const params = new URLSearchParams(body);
                    // 将其转换为对象
                    requestBody = Object.fromEntries(params.entries());
                }
            }
            monitor._doCallback(new DoorEntity(data ? true : false, data, url, headerData, requestBody));
            monitor.setFinishTag(true);
        }
        return isFilter;
    }

    public async onRequest(page : Page){
        page.route("*/**", async (router : Route) => {
            // 获取请求对象
            const request = router.request();
            const headers = await request.allHeaders();
            await this.logPublishRequest(request, headers);
            const isFilter = await this.doBeforeRequest(router, request, headers);
            if(isFilter){
                return;
            }
            router.continue();
        });
    }

    public async doAfterResponse(response: Response){
        for(const monitor of this.monitors){
            if(monitor.finishTag){
                continue;
            }
            if(!(monitor instanceof MonitorResponse)){
                continue;
            }
            const responseMonitor = monitor as MonitorResponse<T>;
            if(!await monitor.doMatchResponse(response)){
                continue;
            }
            let headerData = {};
            const request = response.request();
            
            const allHeaders = await request.allHeaders();
            if(responseMonitor.needHeaderData()){
                headerData = allHeaders;
            }
            let url = "";
            if(responseMonitor.needUrl()){
                url = request.url();
            }
            let responseHeaderData = {};
            if(responseMonitor.needResponseHeaderData()){
                responseHeaderData = await response.allHeaders();
            }
            let requestBody = {};
            if(responseMonitor.needRequestBody()){
                const body = request.postData();
                if(body){
                    const params = new URLSearchParams(body);
                    // 将其转换为对象
                    requestBody = Object.fromEntries(params.entries());
                }
            }
            const data = await responseMonitor.getResponseData(response);
            data.url = url;
            data.headerData = headerData;
            data.requestBody = requestBody;
            data.responseHeaderData = responseHeaderData;
            responseMonitor._doCallback(data, response.request(), response);
            responseMonitor.setFinishTag(true);
        }
    }

    public async onResponse(page : Page){
        page.on('response', async (response) => {
            try {
                await this.logPublishResponse(response);
                await this.doAfterResponse(response);
            } catch (error) {
                if (page.isClosed()) {
                    log.warn('[Engine] response listener skipped after page closed', summarizeForLog(error));
                    return;
                }
                log.warn('[Engine] response listener failed', summarizeForLog(error));
            }
        });
    }

    private async logPublishRequest(
        request: Request,
        headers: { [key: string]: string; },
    ): Promise<void> {
        if (!this.publishTaskId) {
            return;
        }
        const url = request.url();
        if (!this.shouldLogPublishTraffic(url, request.resourceType(), request.method())) {
            return;
        }

        let body: unknown = undefined;
        try {
            const postData = request.postData();
            if (postData) {
                body = this.normalizeTrafficBody(postData, headers['content-type']);
            }
        } catch (error) {
            body = { readError: summarizeForLog(error) };
        }

        publishTaobaoRequestLog(this.publishTaskId, 'playwright', {
            method: request.method(),
            resourceType: request.resourceType(),
            url,
            headers: summarizeForLog(headers),
            body: summarizeForLog(body),
        });
    }

    private async logPublishResponse(response: Response): Promise<void> {
        if (!this.publishTaskId) {
            return;
        }
        const request = response.request();
        const url = response.url();
        if (!this.shouldLogPublishTraffic(url, request.resourceType(), request.method())) {
            return;
        }

        let body: unknown = undefined;
        try {
            const contentType = response.headers()['content-type'] ?? '';
            if (contentType.includes('application/json') || contentType.includes('text/')) {
                body = await response.text();
            } else {
                body = { contentType, skipped: true };
            }
        } catch (error) {
            body = { readError: summarizeForLog(error) };
        }

        let headers: unknown = {};
        try {
            headers = await response.allHeaders();
        } catch (error) {
            headers = { readError: summarizeForLog(error) };
        }

        publishTaobaoResponseLog(this.publishTaskId, 'playwright', {
            method: request.method(),
            resourceType: request.resourceType(),
            url,
            status: response.status(),
            ok: response.ok(),
            headers: summarizeForLog(headers),
            body: summarizeForLog(body),
        });
    }

    private shouldLogPublishTraffic(url: string, resourceType: string, method: string): boolean {
        const lowerUrl = url.toLowerCase();
        const isTaobao = lowerUrl.includes('taobao.com') || lowerUrl.includes('tmall.com');
        if (!isTaobao) {
            return false;
        }
        return resourceType === 'xhr'
            || resourceType === 'fetch'
            || resourceType === 'document'
            || method !== 'GET';
    }

    private normalizeTrafficBody(rawBody: string, contentType?: string): unknown {
        const lowerType = String(contentType ?? '').toLowerCase();
        if (lowerType.includes('application/json')) {
            try {
                return JSON.parse(rawBody);
            } catch {
                return rawBody;
            }
        }
        if (lowerType.includes('application/x-www-form-urlencoded')) {
            try {
                return Object.fromEntries(new URLSearchParams(rawBody).entries());
            } catch {
                return rawBody;
            }
        }
        if (lowerType.includes('multipart/form-data')) {
            return {
                contentType,
                size: rawBody.length,
                preview: rawBody.slice(0, 5000),
            };
        }
        return rawBody;
    }

    resetMonitor(){
        this.monitors = [];
        this.monitorsChain = [];
    }

    resetListener(page : Page){
        // this.onRequest(page);
        this.onResponse(page);
    }

    public async openWaitMonitor(page : Page,  url: string | undefined, monitor : Monitor<T | any>, headers: Record<string, string> = {}, doAction: (page: Page, ...doActionParams: any[]) => Promise<void | DoorEntity<any> | undefined> = async (page: Page, ...doActionParams: any[]) => {return undefined}, ...doActionParams: any[]){
        this.addMonitor(monitor);
        await this.startMonitor();
        if(url){
            await page.goto(url);
        }
        const result = await doAction(page, ...doActionParams);
        if(result != undefined){
            if(result instanceof DoorEntity){
                return result;
            }
            return result;
        }
        const doorEntity = await monitor.waitForAction();
        return doorEntity;
    }

    public async openNotWaitMonitor(page : Page,  url: string, monitor : Monitor<T | any>, headers: Record<string, string> = {}, doAction: (page: Page, ...doActionParams: any[]) => Promise<any>, ...doActionParams: any[]){
        this.addMonitor(monitor);
        await this.startMonitor();
        await page.goto(url);
        const result = await doAction(page, ...doActionParams);
        return result;
    }


    public async openWaitMonitorChain(page : Page,  url: string, monitorChain: MonitorChain<T | any>, headers: Record<string, string> = {}, doAction: (page: Page, ...doActionParams: any[]) => Promise<void> = async (page: Page, ...doActionParams: any[]) => {}, ...doActionParams: any[] ){
        const itemKey = monitorChain.getItemKeys(url);
        this.addMonitorChain(monitorChain);
        await this.startMonitor();
        await page.goto(url);
        await doAction(page, ...doActionParams);
        const doorEntity = await monitorChain.waitForAction();
        return doorEntity;
    }

    public async startMonitor(){
        for(const monitor of this.monitors){
            monitor.start();
        }
    }


    getMonitorChainFromChain(key : string) : MonitorChain<T> | undefined{
        if(!this.monitorsChain || this.monitorsChain.length == 0){
            return undefined;
        }
        for(const monitorChain of this.monitorsChain){
            if(monitorChain.getKey() == key){
                return monitorChain;
            }
        }
        return undefined;
    }

    getMonitor(key : string) : Monitor<T> | undefined{
        if(!this.monitors || this.monitors.length == 0){
            return undefined;
        }
        for(const monitor of this.monitors){
            if(monitor.getKey() == key){
                return monitor;
            }
        }
        return undefined;
    }

    public async closeContext(){
        if(this.context){
            // 先计算 key 并清理 map / 重置引用，避免 close() 抛错后遗留已关闭的 context
            const storeBrowserPath = await this.getRealChromePath().catch(() => undefined);
            const key = this.getPersistentContextKey(storeBrowserPath);
            contextMap.delete(key);
            const ctx = this.context;
            this.context = undefined;
            try {
                await ctx.close();
            } catch (error) {
                log.warn('[Engine] closeContext: context.close() failed (may already be closed)', error);
            }
        }
    }

    public async closeBrowser(){
        if(this.browser){
            await this.browser.close();
        }
    }

    getKey(){
        return `door_engine_${this.getNamespace()}_${this.resourceId}`;
    }

    async getSessionPath(){
        let sessionPath = getGlobal(this.getKey())
        if(sessionPath == undefined){
            sessionPath = this.getLastSessionDir();
            if(fs.existsSync(sessionPath)){
                setGlobal(this.getKey(), sessionPath);
                return sessionPath;
            }
        }
        if(fs.existsSync(sessionPath)){
            log.info("sessionPath is ", sessionPath);
            return sessionPath;
        }
        return undefined;
    }

    public getSessionDir(){
        const sessionFileName = Date.now().toString() + ".json";
        const name = this.constructor.name;
        const userDataPath = app.getPath('userData');

        const sessionDirPath = path.join(userDataPath,'resource','session',this.getNamespace(), this.resourceId.toString());
        if(!fs.existsSync(sessionDirPath)){
            fs.mkdirSync(sessionDirPath, { recursive: true });
        }
        const sessionDir = path.join(sessionDirPath, sessionFileName);
        return sessionDir;
    }

    private getPersistentContextKey(storeBrowserPath?: string){
        let key = `${this.headless.toString()}_${this.getKey()}`;
        if(storeBrowserPath){
            key += "_" + storeBrowserPath;
        }
        return key;
    }

    getUserDataDir(){
        const userDataPath = app.getPath('userData');
        const profileMode = this.headless ? 'headless' : 'headed';
        const userDataDir = path.join(userDataPath,'resource','userDataDir',this.getNamespace(), profileMode, this.resourceId.toString());
        log.info("userDataDir is ", userDataDir);
        if(!fs.existsSync(userDataDir)){
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        return userDataDir;
    }

    abstract getNamespace(): string;

    public async saveContextState() {
        if(!this.context){
            return;
        }
        const sessionDir = this.getSessionDir();
        setGlobal(this.getKey(), sessionDir);
        await this.context.storageState({ path: sessionDir});
    }

    /**
     * If this engine's context is already open in the contextMap, save its storage state
     * to a fresh session JSON file. Returns true if the state was saved.
     */
    public async saveContextStateIfOpen(): Promise<boolean> {
        const chromePath = await this.getRealChromePath().catch(() => undefined);
        let key = `${this.headless.toString()}_${this.getKey()}`;
        if (chromePath) {
            key += '_' + chromePath;
        }
        const cached = contextMap.get(key);
        if (!cached) {
            return false;
        }
        try {
            await cached.cookies(); // verify context is still alive
            const sessionDir = this.getSessionDir();
            setGlobal(this.getKey(), sessionDir);
            await cached.storageState({ path: sessionDir });
            log.info('[Engine] refreshed session state from open context', this.getKey());
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Read storage state from the headed (non-headless) userDataDir by launching a temporary
     * headless context against that profile using the system Chrome.
     * Saves the result to a session JSON file so future calls can read it without re-launching.
     * Returns true on success.
     *
     * Only safe to call when no headed context for this resourceId is currently running.
     */
    public async readAndSaveStorageStateFromHeadedDir(): Promise<boolean> {
        const headedUserDataDir = path.join(
            app.getPath('userData'),
            'resource', 'userDataDir',
            this.getNamespace(), 'headed',
            this.resourceId.toString(),
        );
        if (!fs.existsSync(headedUserDataDir)) {
            return false;
        }

        const chromePath = await this.getRealChromePath().catch(() => undefined);

        // Skip if the headed context is already open — it would conflict with a second launch
        let headedKey = `false_${this.getKey()}`;
        if (chromePath) {
            headedKey += '_' + chromePath;
        }
        if (contextMap.has(headedKey)) {
            return false;
        }

        clearChromeLockFiles(headedUserDataDir);
        let tempContext: BrowserContext | undefined;
        try {
            tempContext = await chromium.launchPersistentContext(headedUserDataDir, {
                headless: true,
                executablePath: chromePath,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            });
            const state = await tempContext.storageState();
            if (!Array.isArray(state.cookies) || state.cookies.length === 0) {
                log.warn('[Engine] headed dir has no cookies, skipping session save', this.getKey());
                return false;
            }
            const sessionDir = this.getSessionDir();
            setGlobal(this.getKey(), sessionDir);
            fs.writeFileSync(sessionDir, JSON.stringify(state), 'utf8');
            log.info('[Engine] extracted and saved session state from headed dir', this.getKey(), 'cookies:', state.cookies.length);
            return true;
        } catch (error) {
            log.warn('[Engine] failed to extract session state from headed dir', { key: this.getKey(), error: String(error) });
            return false;
        } finally {
            if (tempContext) {
                await tempContext.close().catch(() => {});
            }
        }
    }

    public async saveBak(bakPath : string) {
        try{

            const userDataDir = this.getUserDataDir();
            if(fs.existsSync(userDataDir)){
                fs.rmSync(userDataDir, { recursive: true });
            }
            log.info("saveBak userDataDir is ", userDataDir);
            fs.mkdirSync(userDataDir, { recursive: true });
            
            // 检查 bakPath 是文件还是目录
            const bakStat = fs.statSync(bakPath);
            if (bakStat.isDirectory()) {
                // 如果是目录，使用 cpSync 复制整个目录
                fs.cpSync(bakPath, userDataDir, { recursive: true });
            } else {
                // 如果是文件，使用 copyFileSync
                const fileName = path.basename(bakPath);
                const targetPath = path.join(userDataDir, fileName);
                fs.copyFileSync(bakPath, targetPath);
            }
            let storeBrowserPath = await this.getRealChromePath();
            const key = this.getPersistentContextKey(storeBrowserPath);
            log.info("browser key is ", key);
            if(contextMap.has(key)){
                const context = contextMap.get(key);
                if(context){
                    await this.closePage();
                    await context.close();
                }
                this.page = undefined;
                this.context = undefined;
                this.browser = undefined;
                contextMap.delete(key);
            }
            this.headless = false;
            await this.init();
            return new DoorEntity(true, "保存备份成功");
        }catch(e){
            log.error('[Engine] 保存备份失败:', e);
            return new DoorEntity(false, "保存备份失败");
        }
    }

    public async saveContextStateByPort(ck : string) {
        const key = this.getKey();
        let sessionDir = getGlobal(key);
        if(!sessionDir){
            sessionDir = this.getSessionDir();
        }
        setGlobal(this.getKey(), sessionDir);
        const jsonData = JSON.parse(ck);
        
        // 判断 jsonData 是 JSON 对象还是 JSON 数组
        if (Array.isArray(jsonData)) {
            // 如果是数组，处理每个元素并添加 sameSite 属性
            for(const json of jsonData){
                json['sameSite'] = "None";
            }
            const newCkJson = {
                "cookies" : jsonData
            }
            fs.writeFileSync(sessionDir, JSON.stringify(newCkJson));
        } else {
            const cookies = jsonData.cookies;
            for(const cookie of cookies) {
                cookie['sameSite'] = "None";
            }
            jsonData.cookies = cookies;
            fs.writeFileSync(sessionDir, JSON.stringify(jsonData));
        }
        if(this.context){
            await this.closePage();
            await this.context?.close();
            const key = this.headless.toString() + "_" + this.getKey();
            contextMap.delete(key);
            log.info("contextMap is ", contextMap);
            this.page = undefined;
            this.context = undefined;
        }
        return jsonData;
    }

    public getHeaderKey(){
        return `${this.resourceId}_door_header_${this.getKey()}`;
    }

    public getValidateAutoTagKey(){
        return `${this.resourceId}_door_validate_auto_tag_${this.getKey()}`;
    }

    public setHeader(header : {[key : string] : any}){
        if(!header || Object.keys(header).length == 0){
            return;
        }
        const key = this.getHeaderKey();
        setGlobal(key, header);
    }

    public setValidateAutoTag(validateAutoTag : boolean){
        const key = this.getValidateAutoTagKey();
        setGlobal(key, validateAutoTag);
    }

    public getValidateAutoTag(){
        const key = this.getValidateAutoTagKey();
        const validateAutoTag = getGlobal(key);
        if(validateAutoTag == undefined){
            return true;
        }
        return validateAutoTag;
    }

    public getHeader(){
        const key = this.getHeaderKey();
        return getGlobal(key);
    }

    public clearHeader(){
        const key = this.getHeaderKey();
        removeGlobal(key);
    }

    public setParams(key : string, value : any){
        const paramsKey = this.getKey() + "_" + key;
        setGlobal(paramsKey, value);
    }

    public getParams(key : string){
        const paramsKey = this.getKey() + "_" + key;
        return getGlobal(paramsKey);
    }
    async createContext(){
        if(!this.browser){
            return;
        }
        const key = this.headless.toString() + "_" + this.getKey();
        if(contextMap.has(key)){
            return contextMap.get(key);
        }
        
        const storeBrowserPath = await this.getRealChromePath();
        const deviceProfile = await getBrowserDeviceProfile(storeBrowserPath);
        const secChUaHeadersCtx = buildSecChUaHeaders(deviceProfile.userAgent, deviceProfile.uaPlatform);
        // let context;
        const contextConfig : any = {
            bypassCSP : true,
            locale: deviceProfile.locale,
            timezoneId: deviceProfile.timezoneId,
            userAgent: deviceProfile.userAgent,
            viewport: this.getViewportConfig(),
            extraHTTPHeaders: secChUaHeadersCtx,
            args: [
                ...this.browserArgs,
                `--window-size=${this.width},${this.height}`,
            ],
            ignoreDefaultArgs: [
                '--enable-automation',
                '--enable-blink-features=IdleDetection',
                '--hide-scrollbars',
                '--mute-audio',
            ],
        }
        if (this.headless && deviceProfile.deviceScaleFactor) {
            contextConfig.deviceScaleFactor = deviceProfile.deviceScaleFactor;
        }
        if(storeBrowserPath){
            contextConfig.executablePath = storeBrowserPath;
        }
        const sessionPath = await this.getSessionPath();
        if(sessionPath){
            contextConfig.storageState = sessionPath;
        }
        const context = await this.browser?.newContext(contextConfig);
        if(context){
            try {
                await this.addAntiDetectionScript(context, deviceProfile);
            } catch (injectError) {
                log.warn('[Engine] failed to inject anti-detection script (non-persistent)', injectError);
            }
        }
        contextMap.set(key, context);
        return context;
    }

    /**
     * 设置选择性代理路由
     * @param context 浏览器上下文
     * @param proxyConfig 代理配置
     */
    public async setupSelectiveProxy(contextOrPage: any) {
        // 设置路由规则，只对特定请求使用代理
        await contextOrPage.route('**/*', async (route: any) => {
            const url = route.request().url();
            const resourceType = route.request().resourceType();
            log.info("setupSelectiveProxy url is ", url, " resourceType is ", resourceType);
        });
        log.info('[Engine] 选择性代理路由设置完成');
    }


    /**
     * 判断请求是否应该使用代理
     * @param url 请求URL
     * @param resourceType 资源类型
     * @returns 是否使用代理
     */
    public shouldUseProxy(url: string, resourceType: string, proxyConfig: any): boolean {
        if(!proxyConfig){
            return false;
        }
        if(!proxyConfig.ip || proxyConfig.ip == ""){
            return false;
        }
        // 图片和视频资源不使用代理
        if (resourceType === 'image' || resourceType === 'media') {
            return false;
        }
        
        // 字体文件不使用代理
        if (resourceType === 'font') {
            return false;
        }
        
        // 样式表可以选择性代理（通常不需要）
        if (resourceType === 'stylesheet') {
            return false;
        }
        
        if(url.endsWith(".js") || url.endsWith(".css") || url.endsWith(".jpg") || url.endsWith(".png") || url.endsWith(".gif") || url.endsWith(".ico") || url.endsWith(".woff") || url.endsWith(".woff2") || url.endsWith(".ttf") || url.endsWith(".eot") || url.endsWith(".svg") || url.endsWith(".webp")) {
            return false;
        }
        // 脚本文件可以选择性代理
        if (resourceType === 'script') {
            // 只对主要的JS文件使用代理，CDN资源通常不需要
            return !this.isCDNResource(url);
        }
        
        // 文档请求（HTML页面）使用代理
        if (resourceType === 'document') {
            return true;
        }
        
        // XHR/Fetch请求使用代理
        if (resourceType === 'xhr' || resourceType === 'fetch') {
            return true;
        }
        
        // 其他类型默认使用代理
        return false;
    }

    /**
     * 判断是否为CDN资源
     * @param url 请求URL
     * @returns 是否为CDN资源
     */
    private isCDNResource(url: string): boolean {
        const cdnPatterns = [
            /\.jsdelivr\.net/,
            /\.unpkg\.com/,
            /\.cdnjs\.cloudflare\.com/,
            /\.googleapis\.com/,
            /\.gstatic\.com/,
            /\.amazonaws\.com/,
            /\.cloudfront\.net/,
            /\.alicdn\.com/,
            /\.qiniucdn\.com/,
            /\.tencent-cloud\.com/
        ];
        
        return cdnPatterns.some(pattern => pattern.test(url));
    }

    async getRealChromePath(){

        // const chromePath =  loadChromePath();
        // if(chromePath){
        //     // 在Windows系统中将双反斜杠替换为单反斜杠
        //     if (os.platform() === 'win32') {
        //         return chromePath.replace(/\\\\/g, '\\');
        //     }
        //     return chromePath;
        // }
        const storeBrowserPath = await getChromePath();
        if(storeBrowserPath){
            // 在Windows系统中将双反斜杠替换为单反斜杠
            if (os.platform() === 'win32') {
                return storeBrowserPath.replace(/\\\\/g, '\\');
            }
            return storeBrowserPath;
        }
        if (this.chromePath) {
            // 在Windows系统中将双反斜杠替换为单反斜杠
            if (os.platform() === 'win32') {
                return this.chromePath.replace(/\\\\/g, '\\');
            }
            return this.chromePath;
        }
        return this.chromePath;
    }

    getBrowserKey(){
        let key = this.headless.toString() + "_" + this.needValidateImage.toString();
        if (this.chromePath) {
            key += "_" + this.chromePath;
        }
        return key;
    }

    async createBrowser(){
        let key = this.getBrowserKey();
        log.info("browser key is ", key);
        let storeBrowserPath = await this.getRealChromePath();
        if(browserMap.has(key)){
            return browserMap.get(key);
        }
        
        // 随机化viewport尺寸，更真实
        const viewportWidth = this.width || (1280 + Math.floor(Math.random() * 200));
        const viewportHeight = this.height || (780 + Math.floor(Math.random() * 120));
        
        const args = [
            ...this.browserArgs,
            `--window-size=${viewportWidth},${viewportHeight}`
        ];
        log.info("init browser start storeBrowserPath is ", storeBrowserPath);
        log.info("init browser start is by ", this.resourceId, args);
        const browser = await chromium.launch({
            headless: this.headless,
            executablePath: storeBrowserPath,
            args: args,
            ignoreDefaultArgs: [
                '--enable-automation',
                '--enable-blink-features=IdleDetection',
            ],
        });
        log.info("init browser end is by ", this.resourceId);
    browserMap.set(key, browser);
        return browser;
    }


    // 添加新方法：注入反检测脚本
    async addAntiDetectionScript(context: BrowserContext, deviceProfile: BrowserDeviceProfile) {
        const antiArgs = {
            userAgent: deviceProfile.userAgent || '',
            uaPlatform: deviceProfile.uaPlatform || getUaPlatformByOS(),
            platform: deviceProfile.platform || '',
            language: deviceProfile.language || '',
            languages: deviceProfile.languages || [],
            hardwareConcurrency: deviceProfile.hardwareConcurrency,
            deviceMemory: deviceProfile.deviceMemory,
            webgl: deviceProfile.webgl || {},
            plugins: deviceProfile.plugins || [],
            mimeTypes: deviceProfile.mimeTypes || [],
        };
        await context.addInitScript((args: any) => {
            // =================== 关键浏览器指纹伪装 ===================
            const __antiArgs: {
                userAgent?: string;
                uaPlatform?: string;
                platform?: string;
                language?: string;
                languages?: string[];
                hardwareConcurrency?: number;
                deviceMemory?: number;
                webgl?: { vendor?: string; renderer?: string };
                plugins?: Array<{ name: string; description: string; filename: string }>;
                mimeTypes?: Array<{ type: string; suffixes: string; description: string }>;
            } = args || {};
            const __uaPlatform: string = (__antiArgs.uaPlatform || '').toString();

            // ---------- Function.prototype.toString 隐身 ----------
            // 所有我们手动替换/包装过的函数都通过 __markNative 注册到 WeakSet 里；
            // 其 toString() 返回 `function <name>() { [native code] }`，避免被 creepjs 等指纹脚本通过源码匹配抓现行。
            const __patchedFns: WeakSet<Function> = new WeakSet();
            const __nativeFnToString = Function.prototype.toString;
            const __markNative = <F extends Function>(fn: F, name?: string): F => {
                try {
                    if (name) {
                        try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {}
                    }
                    __patchedFns.add(fn);
                } catch (e) {}
                return fn;
            };
            try {
                const toStringProxy: any = new Proxy(__nativeFnToString, {
                    apply(target: any, thisArg: any, argumentsList: any) {
                        try {
                            if (typeof thisArg === 'function' && __patchedFns.has(thisArg)) {
                                const n = (thisArg as Function).name || '';
                                return 'function ' + n + '() { [native code] }';
                            }
                        } catch (e) {}
                        return Reflect.apply(target, thisArg, argumentsList);
                    }
                });
                // Proxy 自身 toString 也要看起来 native
                __patchedFns.add(toStringProxy);
                Function.prototype.toString = toStringProxy;
            } catch (e) {}

            const __defProtoGetter = (proto: any, key: string, getter: () => any) => {
                try {
                    __markNative(getter, 'get ' + key);
                    Object.defineProperty(proto, key, {
                        get: getter,
                        set: () => {},
                        configurable: true,
                        enumerable: true,
                    });
                } catch (e) {}
            };
            
            // 1. 覆盖 navigator 关键属性 —— 全部挂到 Navigator.prototype 上，避免实例 own descriptor 暴露
            const overrideNavigator = () => {
                try {
                    // @ts-ignore
                    const NavProto: any = (window as any).Navigator && (window as any).Navigator.prototype;
                    if (!NavProto) return;

                    // webdriver：清掉实例 own，再到 prototype 上挂 getter
                    try { delete (navigator as any).webdriver; } catch (e) {}
                    __defProtoGetter(NavProto, 'webdriver', () => false);
                    if (__antiArgs.platform) {
                        __defProtoGetter(NavProto, 'platform', () => __antiArgs.platform);
                    }
                    if (__antiArgs.language) {
                        __defProtoGetter(NavProto, 'language', () => __antiArgs.language);
                    }
                    if (Array.isArray(__antiArgs.languages) && __antiArgs.languages.length > 0) {
                        const languages = __antiArgs.languages.slice();
                        __defProtoGetter(NavProto, 'languages', () => languages.slice());
                    }
                    if (typeof __antiArgs.hardwareConcurrency === 'number' && __antiArgs.hardwareConcurrency > 0) {
                        __defProtoGetter(NavProto, 'hardwareConcurrency', () => __antiArgs.hardwareConcurrency);
                    }
                    if (typeof __antiArgs.deviceMemory === 'number' && __antiArgs.deviceMemory > 0) {
                        __defProtoGetter(NavProto, 'deviceMemory', () => __antiArgs.deviceMemory);
                    }
                } catch (e) {}

                // permissions.query：仅对 notifications 做一致性兜底，其余查询透传原函数。
                // 「全部返回 prompt」会与 Notification.permission 不一致，是 creepjs / browserscan 的经典 bot 信号。
                try {
                    if (navigator.permissions && navigator.permissions.query) {
                        const originalQuery: any = navigator.permissions.query.bind(navigator.permissions);
                        const patchedQuery: any = function(parameters: any) {
                            try {
                                if (parameters && parameters.name === 'notifications') {
                                    // @ts-ignore
                                    const perm = ((window as any).Notification && (window as any).Notification.permission) || 'default';
                                    return Promise.resolve({ state: perm, onchange: null });
                                }
                            } catch (e) {}
                            return originalQuery(parameters);
                        };
                        __markNative(patchedQuery, 'query');
                        Object.defineProperty(navigator.permissions, 'query', {
                            value: patchedQuery,
                            configurable: true,
                            writable: true,
                        });
                    }
                } catch (e) {}
            };
            
            // 2. 覆盖 WebGL/WebGL2 的 vendor/renderer —— 必须与 UA 平台一致，避免「macOS UA + Linux Mesa GPU」这种强 bot 信号
            const overrideWebGL = () => {
                const vendor = __antiArgs.webgl && __antiArgs.webgl.vendor;
                const renderer = __antiArgs.webgl && __antiArgs.webgl.renderer;
                if (!vendor && !renderer) return;
                const patch = (Ctor: any) => {
                    if (!Ctor || !Ctor.prototype || !Ctor.prototype.getParameter) return;
                    const original = Ctor.prototype.getParameter;
                    const patched: any = function(this: any, parameter: number) {
                        // UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
                        if (parameter === 37445 && vendor) return vendor;
                        if (parameter === 37446 && renderer) return renderer;
                        return original.apply(this, arguments as any);
                    };
                    __markNative(patched, 'getParameter');
                    Ctor.prototype.getParameter = patched;
                };
                try { patch((window as any).WebGLRenderingContext); } catch (e) {}
                try { patch((window as any).WebGL2RenderingContext); } catch (e) {}
            };
            
            // 3/4. 不再整体替换 window.chrome、不再锁死 Notification.permission。
            // 原因：
            //  - window.chrome 整体替换后 chrome.runtime 变成空对象（真实 Chrome 有 connect/sendMessage/id），
            //    且 loadTimes/csi 在新版 Chrome 已删除，重新加回反成强 stealth 信号。
            //  - Notification.permission 锁定为 'default' 会与 permissions.query({name:'notifications'}) 不一致。
            //  patchright + --headless=new 已经提供了与真实 Chrome 一致的 chrome 对象与 Notification.permission，
            //  在此基础上不要再叠加自己的版本。
            
            // 5. Canvas 指纹弱噪声 —— 直接 patch CanvasRenderingContext2D.prototype.getImageData，
            //    避免之前「在 getContext 返回值上叠加」每次 getContext 都重复包装的隐患。
            //    去掉 fillText 加空格的逻辑（会破坏正常文字渲染），仅在非透明像素上轻微扰动 RGB。
            const overrideCanvas = () => {
                try {
                    const Ctx2d: any = (window as any).CanvasRenderingContext2D;
                    if (!Ctx2d || !Ctx2d.prototype) return;
                    const originalGetImageData = Ctx2d.prototype.getImageData;
                    const patched: any = function(this: any) {
                        const imageData = originalGetImageData.apply(this, arguments as any);
                        try {
                            if (imageData && imageData.data && imageData.data.length >= 4) {
                                const data = imageData.data;
                                const totalPixels = data.length / 4;
                                for (let i = 0; i < 10; i++) {
                                    const pixel = Math.floor(Math.random() * totalPixels);
                                    const base = pixel * 4;
                                    if (data[base + 3] === 0) continue;
                                    const channel = Math.floor(Math.random() * 3);
                                    data[base + channel] = data[base + channel] ^ 1;
                                }
                            }
                        } catch (e) {}
                        return imageData;
                    };
                    __markNative(patched, 'getImageData');
                    Ctx2d.prototype.getImageData = patched;
                } catch (e) {}
            };
            
            // 6. 隐藏自动化特征 —— 仅保留必要的、且不会引入新信号的覆盖
            //
            // 已移除的过度伪装（这些反而会被检测）：
            //   - window.outerWidth/Height = innerWidth/Height（真浏览器 outer > inner，相等是 bot 信号）
            //   - Element.prototype.querySelectorAll 拦截 :target 返回 <div>（返回类型错误）
            //   - window.Notification = {...} 残缺替换
            //   - navigator.connection = {...} 假对象（真值由 patchright/headless=new 提供）
            //   - navigator.mediaDevices = {...} 残缺替换（缺 getUserMedia 等方法极易识破）
            //   - 重复的 navigator.userAgent 覆盖（已统一在 overrideNavigator 中处理）
            const hideAutomationFeatures = () => {
                try {
                    // @ts-ignore - 这些 DOM 全局只在浏览器侧存在
                    const PluginArrayCtor: any = (window as any).PluginArray;
                    // @ts-ignore
                    const PluginCtor: any = (window as any).Plugin;
                    // @ts-ignore
                    const NavigatorCtor: any = (window as any).Navigator;
                    const pluginData = Array.isArray(__antiArgs.plugins) ? __antiArgs.plugins.filter((item: any) => item && (item.name || item.description || item.filename)) : [];
                    if (navigator.plugins.length === 0 && pluginData.length > 0 && PluginArrayCtor && PluginCtor && NavigatorCtor) {
                        const makePlugin = (data: any) => {
                            const p: any = Object.create(PluginCtor.prototype);
                            Object.defineProperty(p, 'name', { value: data.name, enumerable: true, configurable: true });
                            Object.defineProperty(p, 'description', { value: data.description, enumerable: true, configurable: true });
                            Object.defineProperty(p, 'filename', { value: data.filename, enumerable: true, configurable: true });
                            Object.defineProperty(p, 'length', { value: 0, enumerable: false, configurable: true });
                            Object.defineProperty(p, 'item', { value: () => null, enumerable: false, configurable: true });
                            Object.defineProperty(p, 'namedItem', { value: () => null, enumerable: false, configurable: true });
                            return p;
                        };
                        const plugins = pluginData.map(makePlugin);
                        const pluginArray: any = Object.create(PluginArrayCtor.prototype);
                        plugins.forEach((p: any, i: number) => {
                            Object.defineProperty(pluginArray, i, { value: p, enumerable: true, configurable: true });
                            Object.defineProperty(pluginArray, p.name, { value: p, enumerable: false, configurable: true });
                        });
                        Object.defineProperty(pluginArray, 'length', { value: plugins.length, enumerable: false, configurable: true });
                        Object.defineProperty(pluginArray, 'item', { value: (i: number) => pluginArray[i] || null, enumerable: false, configurable: true });
                        Object.defineProperty(pluginArray, 'namedItem', { value: (n: string) => pluginArray[n] || null, enumerable: false, configurable: true });
                        Object.defineProperty(pluginArray, 'refresh', { value: () => {}, enumerable: false, configurable: true });
                        __defProtoGetter(NavigatorCtor.prototype, 'plugins', () => pluginArray);
                    }
                } catch (e) {}
            };
            
            // 7. 阻止指纹收集
            const blockFingerprinting = () => {
                // 注意：曾经在此处覆盖 performance.mark 以「阻止指纹收集」。但原实现里
                // `return performance.mark.apply(this, args)` 调用的是覆盖后的 mark 自身，
                // 会立刻触发 Maximum call stack size exceeded（browserscan / 任何调用
                // performance.mark 的页面进站即崩）。且指纹检测并不依赖 performance.mark，
                // 该覆盖既无收益又破坏 Web API 兼容（mark 必须返回 PerformanceMark 实例），
                // 故彻底移除。

                // 原有 AudioContext 包装存在 bug：createAnalyser() 在 originalGetChannelData 与
                // 后续赋值时分别返回两个不同的 AnalyserNode 实例，假装注入的噪声对消费者完全不可见，
                // 同时 `instanceof AudioContext` 会因 prototype 不一致而失败。指纹检测里 AudioContext
                // 噪声不是淘宝级风控核心信号，宁可不做也不要做错，整段移除。
                //
                // window.speechSynthesis 仅在真 headless（无 --headless=new）下为 undefined；
                // 我们已统一切到 headless=new，真值可用，残缺替换反而暴露。
            };
            
            // 8. 无头浏览器专用反检测
            //   - screen.availWidth/Height/width/height 不再强行 = window.innerWidth/Height：
            //     真值是显示器整体尺寸（远大于窗口内尺寸），相等是 bot 信号。--headless=new 自带真值。
            //   - WebGL2 vendor/renderer 已统一在 overrideWebGL 中按平台处理，这里不再重复覆盖。
            const antiHeadlessDetection = () => {
                // mimeTypes：仅在真值为空时基于 MimeTypeArray.prototype / MimeType.prototype 兜底
                try {
                    // @ts-ignore - 仅在浏览器侧存在
                    const MimeTypeArrayCtor: any = (window as any).MimeTypeArray;
                    // @ts-ignore
                    const MimeTypeCtor: any = (window as any).MimeType;
                    // @ts-ignore
                    const NavigatorCtor: any = (window as any).Navigator;
                    const mimeData = Array.isArray(__antiArgs.mimeTypes) ? __antiArgs.mimeTypes.filter((item: any) => item && item.type) : [];
                    if (navigator.mimeTypes.length === 0 && mimeData.length > 0 && MimeTypeArrayCtor && MimeTypeCtor && NavigatorCtor) {
                        const mimes = mimeData.map((d: any) => {
                            const m: any = Object.create(MimeTypeCtor.prototype);
                            Object.defineProperty(m, 'type', { value: d.type, enumerable: true, configurable: true });
                            Object.defineProperty(m, 'suffixes', { value: d.suffixes, enumerable: true, configurable: true });
                            Object.defineProperty(m, 'description', { value: d.description, enumerable: true, configurable: true });
                            return m;
                        });
                        const mimeArray: any = Object.create(MimeTypeArrayCtor.prototype);
                        mimes.forEach((m: any, i: number) => {
                            Object.defineProperty(mimeArray, i, { value: m, enumerable: true, configurable: true });
                            Object.defineProperty(mimeArray, m.type, { value: m, enumerable: false, configurable: true });
                        });
                        Object.defineProperty(mimeArray, 'length', { value: mimes.length, enumerable: false, configurable: true });
                        Object.defineProperty(mimeArray, 'item', { value: (i: number) => mimeArray[i] || null, enumerable: false, configurable: true });
                        Object.defineProperty(mimeArray, 'namedItem', { value: (n: string) => mimeArray[n] || null, enumerable: false, configurable: true });
                        __defProtoGetter(NavigatorCtor.prototype, 'mimeTypes', () => mimeArray);
                    }
                } catch (e) {}
            };
            
            // WebRTC 本地/真实 IP 泄漏屏蔽：阻止 host/srflx 候选地址回流到 JS
            const blockWebRTCLeak = () => {
                try {
                    // @ts-ignore
                    const RTC = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection || (window as any).mozRTCPeerConnection;
                    if (!RTC) return;
                    const OriginalRTC = RTC;
                    const PatchedRTC: any = function(this: any, ...args: any[]) {
                        const pc = new OriginalRTC(...args);
                        const origAddIce = pc.addIceCandidate && pc.addIceCandidate.bind(pc);
                        if (origAddIce) {
                            const patchedAddIce: any = function(candidate: any, ...rest: any[]) {
                                const c = candidate && (candidate.candidate || (candidate.toJSON && candidate.toJSON().candidate));
                                if (typeof c === 'string' && /(host|srflx)/i.test(c)) {
                                    return Promise.resolve();
                                }
                                return origAddIce(candidate, ...rest);
                            };
                            __markNative(patchedAddIce, 'addIceCandidate');
                            pc.addIceCandidate = patchedAddIce;
                        }
                        const origCreateOffer = pc.createOffer && pc.createOffer.bind(pc);
                        if (origCreateOffer) {
                            const patchedCreateOffer: any = function(opts: any) {
                                const merged = Object.assign({}, opts, { offerToReceiveAudio: false, offerToReceiveVideo: false });
                                return origCreateOffer(merged);
                            };
                            __markNative(patchedCreateOffer, 'createOffer');
                            pc.createOffer = patchedCreateOffer;
                        }
                        return pc;
                    };
                    PatchedRTC.prototype = OriginalRTC.prototype;
                    __markNative(PatchedRTC, 'RTCPeerConnection');
                    (window as any).RTCPeerConnection = PatchedRTC;
                    if ((window as any).webkitRTCPeerConnection) (window as any).webkitRTCPeerConnection = PatchedRTC;
                    if ((window as any).mozRTCPeerConnection) (window as any).mozRTCPeerConnection = PatchedRTC;
                } catch (e) {
                    // ignore
                }
            };

            // 执行所有伪装。已删除的 overrideChrome / overrideNotification 不再调用 ——
            // 那两块整体替换反而暴露，详见函数定义处注释。
            try {
                overrideNavigator();
                overrideCanvas();
                hideAutomationFeatures();
                blockFingerprinting();
                antiHeadlessDetection();
                blockWebRTCLeak();
            } catch (err) {
                // 忽略错误继续执行
            }
        }, antiArgs);
    }

}
