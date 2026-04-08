/**
 * Register the vscode mock before any test modules load.
 */
const Module = require('module');
const path = require('path');

const vscockMockPath = path.join(__dirname, '__mocks__', 'vscode.js');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return vscockMockPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
