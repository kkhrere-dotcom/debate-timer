// electron-builder afterPack 훅: Mac 빌드에 ad-hoc 코드 사이닝 적용.
// Apple Developer ID가 없어도 Apple Silicon에서 앱이 죽지 않도록 ad-hoc 사이닝 강제.
const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  console.log('[afterPack] Ad-hoc signing:', appPath);
  try {
    execSync('codesign --force --deep --sign - "' + appPath + '"', { stdio: 'inherit' });
    console.log('[afterPack] Ad-hoc signature applied');
  } catch (e) {
    console.error('[afterPack] codesign failed:', e.message);
    throw e;
  }
};
