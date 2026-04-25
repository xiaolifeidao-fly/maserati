const { ensureSharpPlatform } = require('./ensure-sharp-platform');

module.exports = async function ({ appDir, platform, arch }) {
  await ensureSharpPlatform({
    appDir,
    platform: platform.nodeName,
    arch,
    source: 'electron-builder beforeBuild',
  });
};
