const pathModule = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    const extensionDevelopmentPath = pathModule.resolve(__dirname, '../..');
    const extensionTestsPath = pathModule.resolve(__dirname, './suite/index');

    console.log('Running tests with configuration:', {
      extensionDevelopmentPath,
      extensionTestsPath
    });

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      version: '1.99.3'
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
