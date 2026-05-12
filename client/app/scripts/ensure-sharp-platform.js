const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');

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

function runtimePackagePath(appDir, platform, arch) {
  const runtimePackage = sharpRuntimePackage(platform, arch);
  return runtimePackage ? path.join(appDir, 'node_modules', ...runtimePackage.split('/')) : null;
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

  // 只安装平台 binary 包，不重装 sharp 主包，避免 --cpu 覆盖引起的 optional dep 清理
  const args = [
    'install',
    '--no-save',
    '--no-package-lock',
    '--include=optional',
    '--ignore-scripts=true',
    `--os=${platform}`,
    `--cpu=${arch}`,
    ...packages,
  ];

  console.log(`[sharp] installing ${platform}-${arch}: npm ${args.join(' ')}`);
  execFileSync('npm', args, {
    cwd: appDir,
    stdio: 'inherit',
    env,
  });
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
  ensureSharpPlatform().catch(error => {
    console.error(`[sharp] ${error.stack || error.message}`);
    process.exit(1);
  });
}

module.exports = {
  ensureSharpPlatform,
};
