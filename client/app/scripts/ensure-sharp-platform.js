const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const transientStateFile = '.sharp-platform-transient.json';

/**
 * 从已安装的 sharp 包中读取实际版本号和 libvips 版本，
 * 避免写死版本号导致升级 sharp 后打包失败。
 */
function resolveSharpVersions(targetAppDir) {
  try {
    const sharpPkg = JSON.parse(
      fs.readFileSync(path.join(targetAppDir, 'node_modules', 'sharp', 'package.json'), 'utf8'),
    );
    const version = sharpPkg.version;
    const optDeps = sharpPkg.optionalDependencies || {};

    function libvips(platform, arch) {
      const name = `@img/sharp-libvips-${platform}-${arch}`;
      const ver = (optDeps[name] || '').replace(/^[^\d]*/, '') || '1.0.4';
      return `${name}@${ver}`;
    }

    return { version, libvips };
  } catch {
    // sharp 尚未安装时回退到 package.json 声明的版本
    const pkg = JSON.parse(fs.readFileSync(path.join(targetAppDir, 'package.json'), 'utf8'));
    const version = ((pkg.dependencies && pkg.dependencies.sharp) || '0.33.5').replace(/^[^\d]*/, '');
    function libvips(platform, arch) {
      return `@img/sharp-libvips-${platform}-${arch}@1.0.4`;
    }
    return { version, libvips };
  }
}

function buildSharpPackages(targetAppDir) {
  const { version, libvips } = resolveSharpVersions(targetAppDir);
  return {
    win32: {
      x64: [`@img/sharp-win32-x64@${version}`],
      ia32: [`@img/sharp-win32-ia32@${version}`],
    },
    darwin: {
      x64: [`@img/sharp-darwin-x64@${version}`, libvips('darwin', 'x64')],
      arm64: [`@img/sharp-darwin-arm64@${version}`, libvips('darwin', 'arm64')],
    },
    linux: {
      x64: [`@img/sharp-linux-x64@${version}`, libvips('linux', 'x64')],
      arm64: [`@img/sharp-linux-arm64@${version}`, libvips('linux', 'arm64')],
    },
  };
}

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function sharpRuntimePackage(platform, arch) {
  return platform === 'win32' && arch === 'arm64'
    ? null
    : `@img/sharp-${platform}-${arch}`;
}

function packagePath(appDir, packageName) {
  return path.join(appDir, 'node_modules', ...packageName.split('/'));
}

function runtimePackagePath(appDir, platform, arch) {
  const runtimePackage = sharpRuntimePackage(platform, arch);
  return runtimePackage ? packagePath(appDir, runtimePackage) : null;
}

function hasNativeBinary(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return false;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory() && hasNativeBinary(current)) {
      return true;
    }
    if (entry.isFile() && entry.name.endsWith('.node')) {
      return true;
    }
  }
  return false;
}

function installSharpPlatform({ appDir, platform, arch }) {
  const sharpPackages = buildSharpPackages(appDir);
  const packages = sharpPackages[platform] && sharpPackages[platform][arch];
  if (!packages) {
    throw new Error(`Unsupported sharp target: ${platform}-${arch}`);
  }

  const env = {
    ...process.env,
    npm_config_platform: platform,
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_include: 'optional',
  };

  if (platform === 'linux') {
    env.npm_config_libc = 'glibc';
  }

  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'maserati-sharp-'));

  // 先安装到临时目录，再复制目标平台 runtime 包，避免 npm 改写当前 node_modules
  // 或清理本机平台的 sharp optional dependency。
  const args = [
    'install',
    '--force',
    '--no-save',
    '--no-package-lock',
    '--include=optional',
    '--ignore-scripts=true',
    `--os=${platform}`,
    `--cpu=${arch}`,
    ...packages,
  ];

  try {
    console.log(`[sharp] staging ${platform}-${arch}: npm ${args.join(' ')}`);
    execFileSync('npm', args, {
      cwd: tempDir,
      stdio: 'inherit',
      env,
    });

    const installedPackages = [];
    for (const packageSpec of packages) {
      const packageName = packageSpec.replace(/@[^@]+$/, '');
      const from = packagePath(tempDir, packageName);
      const to = packagePath(appDir, packageName);

      if (!fs.existsSync(from)) {
        throw new Error(`Missing staged sharp package: ${from}`);
      }

      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true });
      installedPackages.push(packageName);
      console.log(`[sharp] staged package copied: ${path.relative(appDir, to)}`);
    }

    recordTransientPackages(appDir, installedPackages);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readTransientPackages(targetAppDir) {
  const statePath = path.join(targetAppDir, transientStateFile);
  if (!fs.existsSync(statePath)) {
    return [];
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return Array.isArray(state.packages) ? state.packages.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function recordTransientPackages(targetAppDir, packageNames) {
  const packages = Array.from(new Set([...readTransientPackages(targetAppDir), ...packageNames]));
  fs.writeFileSync(
    path.join(targetAppDir, transientStateFile),
    JSON.stringify({ packages }, null, 2),
  );
}

function cleanupSharpPlatform(options = {}) {
  const targetAppDir = options.appDir || appDir;
  const packages = readTransientPackages(targetAppDir);

  for (const packageName of packages) {
    const target = packagePath(targetAppDir, packageName);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[sharp] cleaned transient package: ${path.relative(targetAppDir, target)}`);
  }

  fs.rmSync(path.join(targetAppDir, transientStateFile), { force: true });
}

async function ensureSharpPlatform(options = {}) {
  const targetPlatform = options.platform || parseArg('platform', process.platform);
  const targetArch = options.arch || parseArg('arch', process.arch);
  const targetAppDir = options.appDir || appDir;
  const source = options.source || 'script';
  const nativeDir = runtimePackagePath(targetAppDir, targetPlatform, targetArch);

  console.log(`[sharp] ${source}: host=${process.platform}-${process.arch} target=${targetPlatform}-${targetArch}`);

  if (!nativeDir) {
    throw new Error(`sharp does not publish a prebuilt runtime package for ${targetPlatform}-${targetArch}`);
  }

  if (!hasNativeBinary(nativeDir)) {
    installSharpPlatform({ appDir: targetAppDir, platform: targetPlatform, arch: targetArch });
  }

  if (!hasNativeBinary(nativeDir)) {
    throw new Error(`Missing sharp native binary after install: ${nativeDir}`);
  }

  console.log(`[sharp] ready: ${path.relative(targetAppDir, nativeDir)}`);
}

if (require.main === module) {
  const cleanup = process.argv.includes('--cleanup');
  const action = cleanup ? cleanupSharpPlatform() : ensureSharpPlatform();

  Promise.resolve(action).catch(error => {
    console.error(`[sharp] ${error.stack || error.message}`);
    process.exit(1);
  });
}

module.exports = {
  ensureSharpPlatform,
  cleanupSharpPlatform,
};
