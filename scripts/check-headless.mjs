/**
 * 无头浏览器指纹检测脚本
 * 用法：node scripts/check-headless.mjs
 *
 * 使用与 engine.ts 相同的 patchright + 反检测配置，
 * 打开 browserscan.net 和 bot.sannysoft.com，
 * 将最终 HTML 保存到 scripts/report/ 目录。
 */

import pkg from '../client/app/node_modules/patchright/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, 'report');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ─── Chrome 路径检测（与 engine.ts 保持一致）────────────────────────────────
function getChromePath() {
    const platform = os.platform();
    const macPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
        '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];
    const winPaths = [
        path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ];

    const candidates = platform === 'darwin' ? macPaths
        : platform === 'win32' ? winPaths
        : linuxPaths;

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`未找到 Chrome，请确认已安装。platform=${platform}`);
}

// ─── 从 Chrome 自身读取真实 UA，只修掉 HeadlessChrome 标识 ─────────────────
const chromeUACache = new Map();

async function getRealChromeUA(chromePath) {
    const cacheKey = chromePath ?? '__default__';
    if (chromeUACache.has(cacheKey)) return chromeUACache.get(cacheKey);

    const tmpDir = path.join(os.tmpdir(), `cr-ua-probe-${Date.now()}`);
    let tempCtx;
    try {
        tempCtx = await chromium.launchPersistentContext(tmpDir, {
            headless: true,
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await tempCtx.newPage();
        const rawUA = await page.evaluate(() => navigator.userAgent);
        // 只修掉 HeadlessChrome → Chrome，macOS版本、Chrome版本完全保留真实值
        const fixedUA = rawUA.replace('HeadlessChrome/', 'Chrome/');
        chromeUACache.set(cacheKey, fixedUA);
        console.log('[UA real]', fixedUA);
        return fixedUA;
    } catch (e) {
        console.warn('[UA probe failed]', e.message);
        // fallback
        let version = '136.0.0.0';
        try {
            const out = execSync(`"${chromePath}" --version 2>/dev/null`, { timeout: 5000 }).toString().trim();
            const m = out.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (m) version = m[1];
        } catch { }
        const p = os.platform();
        const ua = p === 'darwin'
            ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
            : p === 'win32'
            ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
            : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
        chromeUACache.set(cacheKey, ua);
        return ua;
    } finally {
        try { await tempCtx?.close(); } catch { }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    }
}

function buildSecChUaHeaders(userAgent, uaPlatform) {
    const m = userAgent.match(/Chrome\/(\d+)/);
    const majorVersion = m ? m[1] : '136';
    return {
        'sec-ch-ua': `"Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}", "Not A(Brand";v="24"`,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${uaPlatform}"`,
    };
}

// ─── 反检测 init script（与 engine.ts 保持一致）────────────────────────────
async function buildAntiDetectionScript(chromePath) {
    const osPlatform = os.platform();
    const uaPlatform = osPlatform === 'darwin' ? 'macOS' : osPlatform === 'win32' ? 'Windows' : 'Linux';
    const userAgent = await getRealChromeUA(chromePath);
    return { script: antiDetectionFn, args: { userAgent, uaPlatform }, userAgent, uaPlatform };
}

/** 与 engine.ts addAntiDetectionScript 内部的 initScript 完全一致 */
function antiDetectionFn(args) {
    const __antiArgs = args || {};
    const __uaPlatform = (__antiArgs.uaPlatform || '').toString();
    const __isMac = __uaPlatform === 'macOS';
    const __isWin = __uaPlatform === 'Windows';

    const __patchedFns = new WeakSet();
    const __nativeFnToString = Function.prototype.toString;
    const __markNative = (fn, name) => {
        try {
            if (name) Object.defineProperty(fn, 'name', { value: name, configurable: true });
            __patchedFns.add(fn);
        } catch (e) {}
        return fn;
    };
    try {
        const toStringProxy = new Proxy(__nativeFnToString, {
            apply(target, thisArg, argumentsList) {
                try {
                    if (typeof thisArg === 'function' && __patchedFns.has(thisArg)) {
                        const n = thisArg.name || '';
                        return 'function ' + n + '() { [native code] }';
                    }
                } catch (e) {}
                return Reflect.apply(target, thisArg, argumentsList);
            }
        });
        __patchedFns.add(toStringProxy);
        Function.prototype.toString = toStringProxy;
    } catch (e) {}

    const __defProtoGetter = (proto, key, getter) => {
        try {
            __markNative(getter, 'get ' + key);
            Object.defineProperty(proto, key, { get: getter, set: () => {}, configurable: true, enumerable: true });
        } catch (e) {}
    };

    const overrideNavigator = () => {
        try {
            const NavProto = window.Navigator && window.Navigator.prototype;
            if (!NavProto) return;
            try { delete navigator.webdriver; } catch (e) {}
            __defProtoGetter(NavProto, 'webdriver', () => false);
            if (__antiArgs.userAgent) {
                __defProtoGetter(NavProto, 'userAgent', () => __antiArgs.userAgent);
            }
        } catch (e) {}

        try {
            if (navigator.permissions && navigator.permissions.query) {
                const originalQuery = navigator.permissions.query.bind(navigator.permissions);
                const patchedQuery = function(parameters) {
                    try {
                        if (parameters && parameters.name === 'notifications') {
                            const perm = (window.Notification && window.Notification.permission) || 'default';
                            return Promise.resolve({ state: perm, onchange: null });
                        }
                    } catch (e) {}
                    return originalQuery(parameters);
                };
                __markNative(patchedQuery, 'query');
                Object.defineProperty(navigator.permissions, 'query', { value: patchedQuery, configurable: true, writable: true });
            }
        } catch (e) {}
    };

    const overrideCanvas = () => {
        try {
            const Ctx2d = window.CanvasRenderingContext2D;
            if (!Ctx2d || !Ctx2d.prototype) return;
            const originalGetImageData = Ctx2d.prototype.getImageData;
            const patched = function() {
                const imageData = originalGetImageData.apply(this, arguments);
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

    const hideAutomationFeatures = () => {
        try {
            const PluginArrayCtor = window.PluginArray;
            const PluginCtor = window.Plugin;
            const NavigatorCtor = window.Navigator;
            if (navigator.plugins.length === 0 && PluginArrayCtor && PluginCtor && NavigatorCtor) {
                const pluginData = [
                    { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                    { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                ];
                const makePlugin = (data) => {
                    const p = Object.create(PluginCtor.prototype);
                    Object.defineProperty(p, 'name', { value: data.name, enumerable: true, configurable: true });
                    Object.defineProperty(p, 'description', { value: data.description, enumerable: true, configurable: true });
                    Object.defineProperty(p, 'filename', { value: data.filename, enumerable: true, configurable: true });
                    Object.defineProperty(p, 'length', { value: 0, enumerable: false, configurable: true });
                    Object.defineProperty(p, 'item', { value: () => null, enumerable: false, configurable: true });
                    Object.defineProperty(p, 'namedItem', { value: () => null, enumerable: false, configurable: true });
                    return p;
                };
                const plugins = pluginData.map(makePlugin);
                const pluginArray = Object.create(PluginArrayCtor.prototype);
                plugins.forEach((p, i) => {
                    Object.defineProperty(pluginArray, i, { value: p, enumerable: true, configurable: true });
                    Object.defineProperty(pluginArray, p.name, { value: p, enumerable: false, configurable: true });
                });
                Object.defineProperty(pluginArray, 'length', { value: plugins.length, enumerable: false, configurable: true });
                Object.defineProperty(pluginArray, 'item', { value: (i) => pluginArray[i] || null, enumerable: false, configurable: true });
                Object.defineProperty(pluginArray, 'namedItem', { value: (n) => pluginArray[n] || null, enumerable: false, configurable: true });
                Object.defineProperty(pluginArray, 'refresh', { value: () => {}, enumerable: false, configurable: true });
                __defProtoGetter(NavigatorCtor.prototype, 'plugins', () => pluginArray);
            }
        } catch (e) {}
    };

    const antiHeadlessDetection = () => {
        try {
            const MimeTypeArrayCtor = window.MimeTypeArray;
            const MimeTypeCtor = window.MimeType;
            const NavigatorCtor = window.Navigator;
            if (navigator.mimeTypes.length === 0 && MimeTypeArrayCtor && MimeTypeCtor && NavigatorCtor) {
                const mimeData = [
                    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                ];
                const mimes = mimeData.map((d) => {
                    const m = Object.create(MimeTypeCtor.prototype);
                    Object.defineProperty(m, 'type', { value: d.type, enumerable: true, configurable: true });
                    Object.defineProperty(m, 'suffixes', { value: d.suffixes, enumerable: true, configurable: true });
                    Object.defineProperty(m, 'description', { value: d.description, enumerable: true, configurable: true });
                    return m;
                });
                const mimeArray = Object.create(MimeTypeArrayCtor.prototype);
                mimes.forEach((m, i) => {
                    Object.defineProperty(mimeArray, i, { value: m, enumerable: true, configurable: true });
                    Object.defineProperty(mimeArray, m.type, { value: m, enumerable: false, configurable: true });
                });
                Object.defineProperty(mimeArray, 'length', { value: mimes.length, enumerable: false, configurable: true });
                Object.defineProperty(mimeArray, 'item', { value: (i) => mimeArray[i] || null, enumerable: false, configurable: true });
                Object.defineProperty(mimeArray, 'namedItem', { value: (n) => mimeArray[n] || null, enumerable: false, configurable: true });
                __defProtoGetter(NavigatorCtor.prototype, 'mimeTypes', () => mimeArray);
            }
        } catch (e) {}
    };

    const blockWebRTCLeak = () => {
        try {
            const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
            if (!RTC) return;
            const OriginalRTC = RTC;
            const PatchedRTC = function(...args) {
                const pc = new OriginalRTC(...args);
                const origAddIce = pc.addIceCandidate && pc.addIceCandidate.bind(pc);
                if (origAddIce) {
                    const patchedAddIce = function(candidate, ...rest) {
                        const c = candidate && (candidate.candidate || (candidate.toJSON && candidate.toJSON().candidate));
                        if (typeof c === 'string' && /(host|srflx)/i.test(c)) return Promise.resolve();
                        return origAddIce(candidate, ...rest);
                    };
                    __markNative(patchedAddIce, 'addIceCandidate');
                    pc.addIceCandidate = patchedAddIce;
                }
                return pc;
            };
            PatchedRTC.prototype = OriginalRTC.prototype;
            __markNative(PatchedRTC, 'RTCPeerConnection');
            window.RTCPeerConnection = PatchedRTC;
            if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = PatchedRTC;
            if (window.mozRTCPeerConnection) window.mozRTCPeerConnection = PatchedRTC;
        } catch (e) {}
    };

    try {
        overrideNavigator();
        overrideCanvas();
        hideAutomationFeatures();
        antiHeadlessDetection();
        blockWebRTCLeak();
    } catch (e) {}
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
const TARGETS = [
    {
        name: 'browserscan',
        url: 'https://www.browserscan.net/',
        waitMs: 12000,
        file: 'browserscan.html',
    },
    {
        name: 'sannysoft',
        url: 'https://bot.sannysoft.com/',
        waitMs: 5000,
        file: 'sannysoft.html',
    },
];

const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-webrtc-encryption',
    '--disable-webrtc-hw-decoding',
    '--disable-webrtc-hw-encoding',
    '--disable-extensions-file-access-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-features=TranslateUI',
    '--window-size=1920,1080',
];

async function run() {
    let chromePath;
    try {
        chromePath = getChromePath();
        console.log(`[Chrome] ${chromePath}`);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }

    const { script, args: antiArgs, userAgent, uaPlatform } = await buildAntiDetectionScript(chromePath);
    const secChUaHeaders = buildSecChUaHeaders(userAgent, uaPlatform);

    const context = await chromium.launchPersistentContext(
        path.join(REPORT_DIR, '.chrome-profile'),
        {
            headless: true,
            executablePath: chromePath,
            userAgent,
            args: BROWSER_ARGS,
            ignoreDefaultArgs: [
                '--enable-automation',
                '--enable-blink-features=IdleDetection',
                '--hide-scrollbars',
                '--mute-audio',
            ],
            extraHTTPHeaders: secChUaHeaders,
            bypassCSP: true,
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            viewport: { width: 1920, height: 1080 },
        }
    );

    // 注入反检测脚本
    await context.addInitScript(script, antiArgs);

    for (const target of TARGETS) {
        console.log(`\n[${target.name}] 打开 ${target.url}`);
        const page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        try {
            await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            console.log(`[${target.name}] 页面加载完成，等待 ${target.waitMs}ms 让 JS 执行...`);
            await page.waitForTimeout(target.waitMs);

            const screenshotPath = path.join(REPORT_DIR, target.file.replace('.html', '.png'));
            await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 60000 });
            console.log(`[${target.name}] 截图已保存 → ${screenshotPath}`);
        } catch (e) {
            console.error(`[${target.name}] 失败:`, e.message);
        } finally {
            await page.close();
        }
    }

    await context.close();
    console.log('\n✅ 完成，报告在 scripts/report/ 目录');
}

run().catch(e => { console.error(e); process.exit(1); });
