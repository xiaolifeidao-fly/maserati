const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('../client/app/node_modules/patchright');

const targetUrl = process.argv[2] || 'https://bot.sannysoft.com/';
const artifactName = (process.argv[3] || new URL(targetUrl).hostname)
  .replace(/^www\./, '')
  .replace(/[^a-z0-9.-]+/gi, '-')
  .replace(/^-+|-+$/g, '');
const repoRoot = path.resolve(__dirname, '..');
const artifactDir = path.join(repoRoot, 'artifacts');
const userDataDir = path.join(os.tmpdir(), `maserati-tb-engine-${artifactName}-profile`);
const screenshotPath = path.join(artifactDir, `${artifactName}-tb-engine-headless-fullpage.png`);
const summaryPath = path.join(artifactDir, `${artifactName}-tb-engine-headless-summary.json`);

const chromiumSandbox = process.platform !== 'linux';

const browserArgs = [
  '--force-webrtc-ip-handling-policy=default_public_interface_only',
  '--disable-webrtc-hw-decoding',
  '--disable-webrtc-hw-encoding',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-default-apps',
  '--window-size=1440,1800',
];

const ignoreDefaultArgs = [
  '--enable-automation',
  '--enable-blink-features=IdleDetection',
  '--hide-scrollbars',
  '--mute-audio',
];

function findChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
        '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      ]
    : process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
        ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function normalizeUserAgent(userAgent, chromePath) {
  const fixed = String(userAgent || '').replace('HeadlessChrome/', 'Chrome/');
  if (fixed) {
    return fixed;
  }

  let version = '136.0.0.0';
  if (chromePath) {
    try {
      const output = execFileSync(chromePath, ['--version'], { timeout: 5000 }).toString();
      const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        version = match[1];
      }
    } catch {
      // Keep the fallback version.
    }
  }

  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }
  if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function getUaPlatformByOS() {
  if (process.platform === 'darwin') return 'macOS';
  if (process.platform === 'win32') return 'Windows';
  return 'Linux';
}

function sanitizeBrands(brands) {
  if (!Array.isArray(brands)) return undefined;
  return brands
    .filter((brand) => brand && brand.brand)
    .map((brand) => ({
      brand: /headless\s*chrome/i.test(brand.brand) ? 'Google Chrome' : String(brand.brand),
      version: String(brand.version || ''),
    }));
}

function formatBrandList(brands) {
  return (brands || []).map((brand) => `"${brand.brand}";v="${brand.version}"`).join(', ');
}

function buildSecChUaHeaders(profile) {
  const brands = profile.uaData && profile.uaData.brands;
  const majorVersion = (profile.userAgent.match(/Chrome\/(\d+)/) || [])[1] || '136';
  const secChUa = brands && brands.length
    ? formatBrandList(brands)
    : `"Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}", "Not.A/Brand";v="99"`;

  const headers = {
    'sec-ch-ua': secChUa,
    'sec-ch-ua-mobile': profile.uaData && profile.uaData.mobile ? '?1' : '?0',
    'sec-ch-ua-platform': `"${profile.uaPlatform}"`,
  };

  const fullVersionList = profile.uaData && profile.uaData.fullVersionList;
  if (fullVersionList && fullVersionList.length) {
    headers['sec-ch-ua-full-version-list'] = formatBrandList(fullVersionList);
  }

  return headers;
}

async function addTbEngineLikeAntiDetectionScript(context, profile) {
  await context.addInitScript((args) => {
    const patchedFns = new WeakSet();
    const nativeFnToString = Function.prototype.toString;
    const markNative = (fn, name) => {
      try {
        if (name) {
          Object.defineProperty(fn, 'name', { value: name, configurable: true });
        }
        patchedFns.add(fn);
      } catch {
        // Ignore descriptor failures in browser sandboxes.
      }
      return fn;
    };

    try {
      const toStringProxy = new Proxy(nativeFnToString, {
        apply(target, thisArg, argumentList) {
          try {
            if (typeof thisArg === 'function' && patchedFns.has(thisArg)) {
              return `function ${thisArg.name || ''}() { [native code] }`;
            }
          } catch {
            // Fall through to native behavior.
          }
          return Reflect.apply(target, thisArg, argumentList);
        },
      });
      patchedFns.add(toStringProxy);
      Function.prototype.toString = toStringProxy;
    } catch {
      // Keep page execution alive even if a browser blocks this patch.
    }

    const defProtoGetter = (proto, key, getter) => {
      try {
        markNative(getter, `get ${key}`);
        Object.defineProperty(proto, key, {
          get: getter,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Ignore and continue with the rest of the patches.
      }
    };

    try {
      const navProto = window.Navigator && window.Navigator.prototype;
      if (navProto) {
        try {
          delete navigator.webdriver;
        } catch {
          // Some Chromium builds expose this as non-deletable.
        }
        defProtoGetter(navProto, 'webdriver', () => false);

        if (args.platform) defProtoGetter(navProto, 'platform', () => args.platform);
        if (typeof args.hardwareConcurrency === 'number' && args.hardwareConcurrency > 0) {
          defProtoGetter(navProto, 'hardwareConcurrency', () => args.hardwareConcurrency);
        }
        if (typeof args.deviceMemory === 'number' && args.deviceMemory > 0) {
          defProtoGetter(navProto, 'deviceMemory', () => args.deviceMemory);
        }
      }
    } catch {
      // Ignore navigator patch failures.
    }
  }, {
    platform: profile.platform || '',
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
  });
}

async function getBrowserDeviceProfile(chromePath) {
  const tmpDir = path.join(os.tmpdir(), `cr-device-probe-${Date.now()}`);
  let context;
  try {
    context = await chromium.launchPersistentContext(tmpDir, {
      headless: true,
      executablePath: chromePath,
      chromiumSandbox,
      args: ['--disable-dev-shm-usage'],
    });
    const page = await context.newPage();
    const rawProfile = await page.evaluate(async () => {
      const uaData = navigator.userAgentData
        ? await navigator.userAgentData.getHighEntropyValues([
            'architecture',
            'bitness',
            'model',
            'platformVersion',
            'uaFullVersion',
            'fullVersionList',
            'wow64',
          ]).catch(() => ({}))
        : undefined;
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: Array.from(navigator.languages || []),
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        deviceScaleFactor: window.devicePixelRatio,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uaData: navigator.userAgentData ? {
          brands: Array.from(navigator.userAgentData.brands || []),
          mobile: navigator.userAgentData.mobile,
          platform: navigator.userAgentData.platform,
          ...uaData,
        } : undefined,
      };
    });

    return {
      ...rawProfile,
      userAgent: normalizeUserAgent(rawProfile.userAgent, chromePath),
      uaPlatform: getUaPlatformByOS(),
      locale: rawProfile.locale || Intl.DateTimeFormat().resolvedOptions().locale,
      timezoneId: rawProfile.timezoneId || 'Asia/Shanghai',
      uaData: rawProfile.uaData ? {
        ...rawProfile.uaData,
        brands: sanitizeBrands(rawProfile.uaData.brands),
        fullVersionList: sanitizeBrands(rawProfile.uaData.fullVersionList),
      } : undefined,
    };
  } finally {
    await context?.close().catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const chromePath = findChromePath();
  const profile = await getBrowserDeviceProfile(chromePath);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    chromiumSandbox,
    executablePath: chromePath,
    userAgent: profile.userAgent,
    viewport: { width: 1440, height: 1800 },
    deviceScaleFactor: profile.deviceScaleFactor || 1,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    extraHTTPHeaders: buildSecChUaHeaders(profile),
    bypassCSP: true,
    args: browserArgs,
    ignoreDefaultArgs,
  });

  try {
    await addTbEngineLikeAntiDetectionScript(context, profile);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(Number(process.env.CAPTURE_WAIT_MS || 12000));

    const summary = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      webdriver: navigator.webdriver,
      bodyText: document.body.innerText.slice(0, 5000),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    }));

    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled', timeout: 120000 });
    fs.writeFileSync(summaryPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      targetUrl,
      chromePath,
      screenshotPath,
      summary,
    }, null, 2));

    console.log(JSON.stringify({ screenshotPath, summaryPath, chromePath, title: summary.title }, null, 2));
  } finally {
    await context.close().catch(() => {});
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
