// @ts-nocheck
// Simple test runner for extension tests
const path = require('path');
const Mocha = require('mocha');

module.exports = {
  run: () => {
    const mocha = new Mocha({
      ui: 'tdd',
      color: true,
      timeout: 5000
    });

    // Add test file
    mocha.addFile(path.join(__dirname, 'extension.test.js'));

    // Run tests
    return new Promise((resolve, reject) => {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed`));
        } else {
          resolve(void 0);
        }
      });
    });
  }
};
