/**
 * Minimal vscode mock for unit tests running outside VS Code.
 * Only stubs the symbols that our compiled source files reference at import time.
 */
module.exports = {
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  // Add more stubs here if tests grow to touch other vscode APIs
};
