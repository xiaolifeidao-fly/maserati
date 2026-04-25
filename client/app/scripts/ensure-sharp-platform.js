const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const pkg = require(path.join(appDir, 'package.json'));

const sharpVersion = (pkg.dependencies && pkg.dependencies.sharp || '0.33.5').replace(/^[^\d]*/, '');

const sharpPackages = {
  win32: {
    x64: [`@img/sharp-win32-x64@${sharpVersion}`],
    ia32: [`@img/sharp-win32-ia32@${sharpVersion}`],
  },
  darwin: {
    x64: [`@img/sharp-darwin-x64@${sharpVersion}`, '@img/sharp-libvips-darwin-x64@1.0.4'],
    arm64: [`@img/sharp-darwin-arm64@${sharpVersion}`, '@img/sharp-libvips-darwin-arm64@1.0.4'],
  },
  linux: {
    x64: [`@img/sharp-linux-x64@${sharpVersion}`, '@img/sharp-libvips-linux-x64@1.0.4'],
    arm64: [`@img/sharp-linux-arm64@${sharpVersion}`, '@img/sharp-libvips-linux-arm64@1.0.4'],
  },
};

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
  const packages = sharpPackages[platform] && sharpPackages[platform][arch];
  if (!packages) {
    throw new Error(`Unsupported sharp target: ${platform}-${arch}`);
  }

  const env = {
    ...process.env,
    npm_config_platform: platform,
    npm_config_arch: arch,
    npm_config_include: 'optional',
  };

  if (platform === 'linux') {
    env.npm_config_libc = 'glibc';
  }

  const args = [
    'install',
    '--no-save',
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    `--os=${platform}`,
    `--cpu=${arch}`,
    `sharp@${sharpVersion}`,
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
