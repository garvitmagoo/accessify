import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Extension Integration Tests', () => {
  const extensionId = 'garvit-magoo.a11y-scanner';
  let tmpDir: string;

  suiteSetup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-test-'));
  });

  suiteTeardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('extension should be present', () => {
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext, 'Extension not found');
  });

  test('extension should activate on TSX file', async () => {
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext, 'Extension not found');

    // Create a TSX file to trigger activation
    const doc = await vscode.workspace.openTextDocument({
      language: 'typescriptreact',
      content: '<img src="test.png" />',
    });
    await vscode.window.showTextDocument(doc);

    // Wait for extension to activate
    await ext.activate();
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const a11yCommands = commands.filter(c => c.startsWith('a11y.'));

    assert.ok(a11yCommands.includes('a11y.showReport'), 'showReport command missing');
    assert.ok(a11yCommands.includes('a11y.screenReaderPreview'), 'screenReaderPreview missing');
    assert.ok(a11yCommands.includes('a11y.setApiKey'), 'setApiKey command missing');
    assert.ok(a11yCommands.includes('a11y.generateTests'), 'generateTests command missing');
    assert.ok(a11yCommands.includes('a11y.compareWithLastCommit'), 'compareWithLastCommit command missing');
    assert.ok(a11yCommands.includes('a11y.exportSarif'), 'exportSarif command missing');
    assert.ok(a11yCommands.includes('a11y.exportJson'), 'exportJson command missing');
  });

  test('diagnostics should appear for inaccessible code', async () => {
    // Create a real .tsx file so the TypeScript AST parser recognises JSX
    const filePath = path.join(tmpDir, 'Test.tsx');
    fs.writeFileSync(filePath, '<img src="broken.png" />', 'utf-8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc);

    // Run scan command
    await vscode.commands.executeCommand('a11y.showReport');

    // Wait for diagnostics to appear (event-based with timeout fallback)
    const diagnostics = await waitForDiagnostics(doc.uri, 10000);
    const a11yDiagnostics = diagnostics.filter(d => d.source === 'Accessify');

    assert.ok(a11yDiagnostics.length > 0, 'Should have at least one diagnostic');
    assert.ok(
      a11yDiagnostics.some(d => d.code === 'img-alt'),
      'Should flag img-alt rule',
    );
  });
});

function waitForDiagnostics(uri: vscode.Uri, timeoutMs: number): Promise<vscode.Diagnostic[]> {
  return new Promise(resolve => {
    const check = () => {
      const diags = vscode.languages.getDiagnostics(uri);
      if (diags.length > 0) {
        disposable.dispose();
        clearTimeout(timer);
        resolve(diags);
      }
    };
    const disposable = vscode.languages.onDidChangeDiagnostics(() => check());
    const timer = setTimeout(() => {
      disposable.dispose();
      resolve(vscode.languages.getDiagnostics(uri));
    }, timeoutMs);
    // Check immediately in case diagnostics are already there
    check();
  });
}
