import path from 'path';
import fs from 'fs'
import { Browser, chromium, devices,firefox, BrowserContext, Page, Route ,Request, Response} from 'playwright';
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

    constructor(resourceId : string, headless: boolean = false, chromePath: string = "", usePersistentContext : boolean = true, browserArgs : string[]|undefined = undefined){
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
        await page.setViewportSize({ width: this.width, height: this.height });
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
        await page.setViewportSize({ width: this.width, height: this.height });
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
        const platform = await ensurePlatform();
        
        const contextConfig: any = {
            headless: this.headless,
            executablePath: storeBrowserPath,
            args: [
                ...this.browserArgs,
                `--window-size=${this.width},${this.height}`,
                // 明确禁用沙箱相关参数
                '--disable-sandbox=false',
                '--enable-sandbox',
                '--disable-dev-shm-usage',
                // '--disable-gpu-sandbox',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-features=TranslateUI',
                // 添加新的反检测参数
                '--disable-automation',
                '--disable-blink-features',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--disable-features=VizDisplayCompositor'
            ],
            ignoreDefaultArgs: [
                '--enable-automation', 
                // '--disable-blink-features=AutomationControlled',  // 禁用浏览器自动化控制特性 - 已过时
                '--enable-blink-features=IdleDetection',
                '--no-sandbox',  // 明确忽略 --no-sandbox
                '--disable-setuid-sandbox'  // 明确忽略 --disable-setuid-sandbox
            ],
            extraHTTPHeaders: {
                'sec-ch-ua': getSecChUa(platform),
                'sec-ch-ua-mobile': '?0', // 设置为移动设备
                'sec-ch-ua-platform': `"${getSecChUaPlatform(platform)}"`,
            },
            userAgent: platform.userAgent,

            bypassCSP : true,
            locale: 'zh-CN',
        };
        try{
            const context = await chromium.launchPersistentContext(userDataDir, contextConfig);
            contextMap.set(key, context);
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
            await this.logPublishResponse(response);
            await this.doAfterResponse(response);
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

        publishTaobaoResponseLog(this.publishTaskId, 'playwright', {
            method: request.method(),
            resourceType: request.resourceType(),
            url,
            status: response.status(),
            ok: response.ok(),
            headers: summarizeForLog(await response.allHeaders()),
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
        const platform = await ensurePlatform();
        // let context;
        const contextConfig : any = {
            bypassCSP : true,
            locale: 'zh-CN',
            args: [
                ...this.browserArgs,
                `--window-size=${this.width},${this.height}`,
                // 明确禁用沙箱相关参数
                '--disable-sandbox=false',
                '--enable-sandbox',
                '--disable-dev-shm-usage',
                // '--disable-gpu-sandbox',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-features=TranslateUI',
                // 添加新的反检测参数
                '--disable-automation',
                '--disable-blink-features',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--disable-features=VizDisplayCompositor'
            ],
            ignoreDefaultArgs: [
                '--enable-automation', 
                // '--disable-blink-features=AutomationControlled',  // 禁用浏览器自动化控制特性 - 已过时
                '--enable-blink-features=IdleDetection',
                '--no-sandbox',  // 明确忽略 --no-sandbox
                '--disable-setuid-sandbox'  // 明确忽略 --disable-setuid-sandbox
            ],
            extraHTTPHeaders: {
                'sec-ch-ua': getSecChUa(platform),
                'sec-ch-ua-mobile': '?0', // 设置为移动设备
                'sec-ch-ua-platform': `"${getSecChUaPlatform(platform)}"`,
            }
        }
        if(storeBrowserPath){
            contextConfig.executablePath = storeBrowserPath;
        }
        // contextConfig.screen = {
        //     width: this.width,
        //     height: this.height
        // }
        const sessionPath = await this.getSessionPath();
        if(sessionPath){
            contextConfig.storageState = sessionPath;
        }
        if(platform){
            contextConfig.userAgent = platform.userAgent;
            contextConfig.extraHTTPHeaders = {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7',
                'sec-ch-ua': getSecChUa(platform),
                'sec-ch-ua-mobile': '?0', // 设置为移动设备
                'sec-ch-ua-platform': `"${getSecChUaPlatform(platform)}"`,
            };
        }
        const context = await this.browser?.newContext(contextConfig);
        
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
        });
        log.info("init browser end is by ", this.resourceId);
    browserMap.set(key, browser);
        return browser;
    }

    // 添加网络请求拦截方法
    async setupNetworkInterception(context: BrowserContext) {
        await context.route('**/*', async route => {
            const request = route.request();
            const headers = await request.allHeaders();
            
            // 修改请求头，增加更多人类特征
            const customHeaders = {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7',
                'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site'
            };
            
            // 合并头部信息
            const mergedHeaders = { ...headers, ...customHeaders };
            
            // 监听与验证相关的请求，记录详细日志
            if (request.url().includes('captcha') || 
                request.url().includes('verify') || 
                request.url().includes('check') || 
                request.url().includes('report') || 
                request.url().includes('punish') || 
                request.url().includes('_____tmd_____')) {
                log.info(`发现验证相关请求: ${request.url()}`);
                log.info(`请求方法: ${request.method()}`);
                
                try {
                    const postData = request.postData();
                    if (postData) {
                        log.info(`请求数据: ${postData}`);
                    }
                } catch (e) {
                    log.info(`无法获取请求数据: ${e}`);
                }
            }
            
            try {
                // 继续请求，但使用修改后的头部
                await route.continue({ headers: mergedHeaders });
            } catch (e) {
                // 如果修改失败，则以原始方式继续
                await route.continue();
            }
        });
    }

    // 添加新方法：注入反检测脚本
    async addAntiDetectionScript(context: BrowserContext) {
        await context.addInitScript(() => {
            // =================== 关键浏览器指纹伪装 ===================
            
            // 1. 覆盖navigator对象的关键属性
            const overrideNavigator = () => {
                // 覆盖webdriver属性
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });
                
                // 语言伪装
                Object.defineProperty(navigator, 'languages', {
                    get: function() {
                        return ['zh-CN', 'zh', 'en-US', 'en'];
                    }
                });
                
                // 硬件并发伪装
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: function() {
                        return 8; // 大多数普通用户的值
                    }
                });
                
                // deviceMemory
                Object.defineProperty(navigator, 'deviceMemory', {
                    get: function() {
                        return 8; // 常见值
                    }
                });
                
                // 连接类型伪装
                // @ts-ignore
                if (navigator.connection) {
                    // @ts-ignore
                    Object.defineProperty(navigator.connection, 'rtt', {
                        get: function() {
                            return 50 + Math.floor(Math.random() * 40);
                        }
                    });
                }
                
                // 阻止权限查询
                const originalPermissions = navigator.permissions;
                if (originalPermissions) {
                    // 完全绕过TypeScript类型检查来修改权限API
                    Object.defineProperty(navigator.permissions, 'query', {
                        // @ts-ignore - 必须忽略类型检查以实现反检测
                        value: function() {
                            return Promise.resolve({
                                state: "prompt",
                                onchange: null
                            });
                        }
                    });
                }
            };
            
            // 2. 覆盖WebGL指纹
            const overrideWebGL = () => {
                try {
                    // 伪装WebGL
                    const getParameterProto = WebGLRenderingContext.prototype.getParameter;
                    // @ts-ignore
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        // 扰乱指纹值
                        if (parameter === 37445) {
                            return 'Intel Open Source Technology Center';
                        }
                        if (parameter === 37446) {
                            return 'Mesa DRI Intel(R) HD Graphics 630 (Kaby Lake GT2)';
                        }
                        return getParameterProto.apply(this, [...arguments]);
                    };
                } catch (e) {}
            };
            
            // 3. 覆盖Chrome特有属性
            const overrideChrome = () => {
                // @ts-ignore
                window.chrome = {
                    runtime: {},
                    loadTimes: function() {
                        return {
                            firstPaintTime: 0,
                            firstPaintAfterLoadTime: 0,
                            navigationType: "Other",
                            requestTime: Date.now() / 1000,
                            startLoadTime: Date.now() / 1000,
                            finishDocumentLoadTime: Date.now() / 1000,
                            finishLoadTime: Date.now() / 1000,
                            firstPaintChromeTime: Date.now() / 1000,
                            wasAlternateProtocolAvailable: false,
                            wasFetchedViaSpdy: false,
                            wasNpnNegotiated: false,
                            npnNegotiatedProtocol: "http/1.1",
                            connectionInfo: "h2",
                        };
                    },
                    app: {
                        isInstalled: false,
                        getDetails: function(){},
                        getIsInstalled: function(){},
                        installState: function(){
                            return "disabled";
                        },
                        runningState: function(){
                            return "cannot_run";
                        }
                    },
                    csi: function() {
                        return {
                            startE: Date.now(),
                            onloadT: Date.now(),
                            pageT: Date.now(),
                            tran: 15
                        };
                    }
                };
            };
            
            // 4. 伪装通知API
            const overrideNotification = () => {
                if (window.Notification) {
                    Object.defineProperty(window.Notification, 'permission', {
                        get: () => "default"
                    });
                }
            };
            
            // 5. 伪造Canvas指纹
            const overrideCanvas = () => {
                try {
                    const originalGetContext = HTMLCanvasElement.prototype.getContext;
                    // @ts-ignore
                    HTMLCanvasElement.prototype.getContext = function(contextType) {
                        const contextId = arguments[0];
                        const options = arguments.length > 1 ? arguments[1] : undefined;
                        const context = originalGetContext.call(this, contextId, options);
                        
                        if (contextType === '2d' && context) {
                            // @ts-ignore
                            const originalFillText = context.fillText;
                            // @ts-ignore
                            context.fillText = function() {
                                const args = Array.from(arguments);
                                if (args.length > 0 && typeof args[0] === 'string') {
                                    args[0] = args[0] + ' '; // 添加空格来改变文本
                                }
                                return originalFillText.apply(this, args);
                            };
                            
                            // @ts-ignore
                            const originalGetImageData = context.getImageData;
                            // @ts-ignore
                            context.getImageData = function() {
                                const args = Array.from(arguments);
                                const imageData = originalGetImageData.apply(this, args);
                                if (imageData && imageData.data && imageData.data.length > 0) {
                                    // 轻微修改像素数据，使其更难被追踪
                                    for (let i = 0; i < 10; i++) {
                                        const offset = Math.floor(Math.random() * imageData.data.length);
                                        imageData.data[offset] = imageData.data[offset] ^ 1; // 改变一个位
                                    }
                                }
                                return imageData;
                            };
                        }
                        return context;
                    };
                } catch (e) {
                    log.info('Canvas指纹修改失败，但继续执行', e);
                }
            };
            
            // 6. 隐藏自动化特征
            const hideAutomationFeatures = () => {
                // 隐藏Playwright特征
                Object.defineProperty(window, 'outerWidth', {
                    get: function() { return window.innerWidth; }
                });
                Object.defineProperty(window, 'outerHeight', {
                    get: function() { return window.innerHeight; }
                });
                
                // 阻止检测自动化的navigator特性
                Object.defineProperty(navigator, 'plugins', {
                    get: function() {
                        // 常见插件
                        const fakePlugins = [];
                        const flash = { name: 'Shockwave Flash', description: 'Shockwave Flash 32.0 r0', filename: 'internal-flash.plugin', version: '32.0.0' };
                        const pdf = { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf.plugin', version: '1.0' };
                        const pdfViewer = { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', version: '1.0' };
                        
                        // @ts-ignore
                        fakePlugins.push(flash, pdf, pdfViewer);
                        
                        // 添加可迭代性
                        // @ts-ignore
                        fakePlugins.item = function(index) { return this[index]; };
                        // @ts-ignore
                        fakePlugins.namedItem = function(name) { 
                            // @ts-ignore
                            return this.find(p => p.name === name); 
                        };
                        // @ts-ignore
                        fakePlugins.refresh = function() {};
                        
                        return fakePlugins;
                    }
                });
                
                // 伪造指纹特征
                const originalQuery = Element.prototype.querySelectorAll;
                // @ts-ignore
                Element.prototype.querySelectorAll = function(selector) {
                    if (selector && selector.includes(':target')) {
                        // 扰乱指纹
                        return document.createElement('div');
                    }
                    return originalQuery.apply(this, [...arguments]);
                };
                
                // 无头模式特殊修复 - 修复window.Notification
                if (window.Notification === undefined) {
                    // @ts-ignore
                    window.Notification = {
                        permission: 'default',
                        requestPermission: function() {
                            return Promise.resolve('default');
                        }
                    };
                }
                
                // 修复headless Chrome检测
                // 模拟浏览器连接
                // @ts-ignore
                if (!navigator.connection) {
                    // @ts-ignore
                    navigator.connection = {
                        downlink: 10 + Math.random() * 5,
                        effectiveType: "4g",
                        onchange: null,
                        rtt: 50 + Math.random() * 30,
                        saveData: false
                    };
                }
                
                // 修复无头WebDriver检测
                Object.defineProperty(navigator, 'userAgent', {
                    get: function() {
                        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
                    }
                });
                
                // 模拟媒体设备
                if (navigator.mediaDevices === undefined) {
                    // @ts-ignore
                    navigator.mediaDevices = {
                        enumerateDevices: function() {
                            return Promise.resolve([
                                {kind: 'audioinput', deviceId: 'default', groupId: 'default', label: ''},
                                {kind: 'videoinput', deviceId: 'default', groupId: 'default', label: ''}
                            ]);
                        }
                    };
                }
            };
            
            // 7. 阻止指纹收集
            const blockFingerprinting = () => {
                // 阻止FP收集常用的脚本
                Object.defineProperty(performance, 'mark', {
                    value: function() {
                        // 记录性能但如果调用与fingerprint相关就扰乱
                        const args = Array.from(arguments);
                        if (args.length > 0 && typeof args[0] === 'string' && 
                            (args[0].includes('finger') || args[0].includes('detect') || args[0].includes('bot'))) {
                            return null;
                        }
                        return performance.mark.apply(this, args as unknown as [string, any?]);
                    }
                });
                
                // 干扰AudioContext指纹
                if (window.AudioContext || (window as any).webkitAudioContext) {
                    const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    // @ts-ignore
                    window.AudioContext = (window as any).webkitAudioContext = function() {
                        const audioContext = new OriginalAudioContext();
                        const originalGetChannelData = audioContext.createAnalyser().getFloatFrequencyData;
                        // @ts-ignore
                        audioContext.createAnalyser().getFloatFrequencyData = function(array) {
                            const result = originalGetChannelData.apply(this, [...arguments]);
                            // 轻微改变音频数据
                            if (array && array.length > 0) {
                                for (let i = 0; i < array.length; i += 200) {
                                    array[i] = array[i] + Math.random() * 0.01;
                                }
                            }
                            return result;
                        };
                        return audioContext;
                    };
                }
                
                // 无头模式特殊处理 - 修复语音合成
                if (window.speechSynthesis === undefined) {
                    // @ts-ignore
                    window.speechSynthesis = {
                        pending: false,
                        speaking: false,
                        paused: false,
                        onvoiceschanged: null,
                        getVoices: function() { return []; },
                        speak: function() {},
                        cancel: function() {},
                        pause: function() {},
                        resume: function() {}
                    };
                }
            };
            
            // 8. 无头浏览器专用反检测
            const antiHeadlessDetection = () => {
                // 模拟物理屏幕尺寸
                Object.defineProperty(screen, 'availWidth', {
                    get: function() { return window.innerWidth; }
                });
                Object.defineProperty(screen, 'availHeight', {
                    get: function() { return window.innerHeight; }
                });
                Object.defineProperty(screen, 'width', {
                    get: function() { return window.innerWidth; }
                });
                Object.defineProperty(screen, 'height', {
                    get: function() { return window.innerHeight; }
                });
                
                // 模拟WebGL2
                if (window.WebGL2RenderingContext) {
                    const getParameterProto = WebGL2RenderingContext.prototype.getParameter;
                    // @ts-ignore
                    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                        if (parameter === 37445) {
                            return 'Intel Open Source Technology Center';
                        }
                        if (parameter === 37446) {
                            return 'Mesa DRI Intel(R) HD Graphics 630 (Kaby Lake GT2)';
                        }
                        return getParameterProto.apply(this, [...arguments]);
                    };
                }
                
                // 处理无头模式中navigator.plugins和mimeTypes
                if (navigator.plugins.length === 0) {
                    Object.defineProperty(navigator, 'plugins', {
                        get: function() {
                            const ChromePDFPlugin = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' };
                            const FakeMimeType = { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' };
                            
                            // @ts-ignore
                            ChromePDFPlugin.__proto__ = MimeType.prototype;
                            const pluginArray = [ChromePDFPlugin];
                            
                            // @ts-ignore
                            pluginArray.item = function(index) { return this[index]; };
                            // @ts-ignore
                            pluginArray.namedItem = function(name) { return this[0].name === name ? this[0] : null; };
                            // @ts-ignore
                            pluginArray.refresh = function() {};
                            // @ts-ignore
                            pluginArray.length = 1;
                            
                            return pluginArray;
                        }
                    });
                }
                
                if (navigator.mimeTypes.length === 0) {
                    Object.defineProperty(navigator, 'mimeTypes', {
                        get: function() {
                            const mimeTypes = [
                                { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: {} }
                            ];
                            
                            // @ts-ignore
                            mimeTypes.item = function(index) { return this[index]; };
                            // @ts-ignore
                            mimeTypes.namedItem = function(name) { return this[0].type === name ? this[0] : null; };
                            // @ts-ignore
                            mimeTypes.length = 1;
                            
                            return mimeTypes;
                        }
                    });
                }
            };
            
            // 执行所有伪装
            try {
                overrideNavigator();
                overrideWebGL();
                overrideChrome();
                overrideNotification();
                overrideCanvas();
                hideAutomationFeatures();
                blockFingerprinting();
                antiHeadlessDetection(); // 添加无头浏览器专用反检测
            } catch (err) {
                // 忽略错误继续执行
            }
        });
    }

}

export function getSecChUa(platform : any){
    if(!platform){
        return "";
    }
    const brands = Array.isArray(platform.userAgentData?.brands) ? platform.userAgentData.brands : [];
    const result = [];
    for(const brand of brands){
        result.push(`"${brand.brand}";v="${brand.version}"`);
    }
    return result.join(", ");
}

export function getSecChUaPlatform(platform: any){
    const uaPlatform = platform?.userAgentData?.platform;
    if(uaPlatform){
        return uaPlatform;
    }
    const navigatorPlatform = platform?.platform;
    if(typeof navigatorPlatform !== 'string' || navigatorPlatform.length === 0){
        return "";
    }
    if(navigatorPlatform.startsWith('Mac')){
        return 'macOS';
    }
    if(navigatorPlatform.startsWith('Win')){
        return 'Windows';
    }
    if(navigatorPlatform.includes('Linux')){
        return 'Linux';
    }
    return navigatorPlatform;
}

export function normalizePlatform(platform : any){
    if(!platform){
        return platform;
    }
    const userAgentData = platform.userAgentData || {};
    return {
        ...platform,
        userAgentData: {
            brands: Array.isArray(userAgentData.brands) ? userAgentData.brands : [],
            mobile: typeof userAgentData.mobile === 'boolean' ? userAgentData.mobile : false,
            platform: userAgentData.platform || getSecChUaPlatform(platform),
        }
    };
}

export async function initPlatform(){
    let browser : Browser | undefined = undefined;
    try{
        let platform = await getPlatform();
        if(platform){
            return platform;
        }
        let storeBrowserPath = await getChromePath();

        browser = await chromium.launch({
            headless: false,
            executablePath: storeBrowserPath,
            args: [
            '--disable-accelerated-2d-canvas', '--disable-webgl', '--disable-software-rasterizer',
            '--no-sandbox', // 取消沙箱，某些网站可能会检测到沙箱模式
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',  // 禁用浏览器自动化控制特性
          ]
         });
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("https://www.baidu.com");
        platform = await setPlatform(page);
        return platform;
    }catch(error){
        log.error("initPlatform error", error);
    }finally{
        if(browser){
            await browser.close();
        }
    }
}

export async function setPlatform(page : Page){
    const platform = await page.evaluate(() => {
        // @ts-ignore
        const navigatorObj = navigator;
        const result : any = {};
        for(let key in navigatorObj){
            result[key] = navigatorObj[key];
        }
        result.userAgent = navigator.userAgent;
        result.platform = navigator.platform;
        result.language = navigator.language;
        result.languages = navigator.languages;
        result.userAgentData = {
            brands: Array.isArray(navigator.userAgentData?.brands) ? navigator.userAgentData.brands : [],
            mobile: typeof navigator.userAgentData?.mobile === 'boolean' ? navigator.userAgentData.mobile : false,
            platform: navigator.userAgentData?.platform || navigator.platform || '',
        };
        return result;
    });
    const normalizedPlatform = normalizePlatform(platform);
    setGlobal("tbk_browserPlatform_" + (process.env.CHROME_VERSION || '1169'), JSON.stringify(normalizedPlatform));
    return normalizedPlatform;
}

export async function getPlatform(){
    const chromeVersion = process.env.CHROME_VERSION || '1169';
    const browserPlatform = await getGlobal("tbk_browserPlatform_" + chromeVersion);
    if(browserPlatform){
        return normalizePlatform(JSON.parse(browserPlatform));
    }
    return undefined;
}

async function ensurePlatform(){
    const currentPlatform = await getPlatform();
    if(currentPlatform){
        return currentPlatform;
    }

    const initializedPlatform = await initPlatform();
    if(initializedPlatform){
        return normalizePlatform(initializedPlatform);
    }

    return getDefaultPlatform();
}

function getDefaultPlatform(){
    return normalizePlatform({
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        platform: "MacIntel",
        language: "zh-CN",
        languages: ["zh-CN", "zh", "en-US", "en"],
        userAgentData: {
            brands: [
                { brand: "Chromium", version: "136" },
                { brand: "Google Chrome", version: "136" },
                { brand: "Not.A/Brand", version: "24" },
            ],
            mobile: false,
            platform: "macOS",
        },
    });
}
