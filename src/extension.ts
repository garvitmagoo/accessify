import * as vscode from 'vscode';
import { initDiagnostics, updateDiagnostics, clearDiagnosticData } from './diagnostics';
import { A11yCodeActionProvider, applyAiFixCommand, bulkFixFileCommand, bulkFixWorkspaceCommand } from './codeActions';
import { A11yReportPanel } from './webview/reportPanel';
import { ScreenReaderPanel } from './webview/screenReaderPanel';
import { createStatusBarItem, updateStatusBarScore } from './statusBar';
import { generateA11yTests } from './testGenerator';
import { exportSarif, exportJson } from './exportReport';
import { initAiProvider, setAiApiKey, clearAiFixCache, getStoredApiKey } from './ai/provider';
import { getFullFileFix, showFixLog, clearFullFixCache } from './ai/fullFileFix';
import { DiffPreviewPanel } from './webview/diffPreviewPanel';
import { BulkFixPreviewPanel } from './webview/bulkFixPreviewPanel';
import { ConfigPanel } from './webview/configPanel';
import { invalidateConfigCache } from './config';
import { resolveActiveDocument } from './editorUtils';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Accessify extension activated');

  initDiagnostics(context);
  initAiProvider(context.secrets);

  // Always register listeners; gate on config inside the handler so
  // toggling the setting takes effect without reloading.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && vscode.workspace.getConfiguration('a11y').get<boolean>('scanOnOpen', true)) {
        updateDiagnostics(editor.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      if (vscode.workspace.getConfiguration('a11y').get<boolean>('scanOnSave', true)) {
        updateDiagnostics(document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (vscode.workspace.getConfiguration('a11y').get<boolean>('scanOnOpen', true)) {
        updateDiagnostics(document);
      }
    }),
  );

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const key = event.document.uri.toString();
      const existing = debounceTimers.get(key);
      if (existing) { clearTimeout(existing); }
      debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key);
        updateDiagnostics(event.document);
      }, 500));
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString();
      const timer = debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(key);
      }
    }),
  );

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      clearDiagnosticData(document.uri);
    }),
  );

  const configWatcher = vscode.workspace.createFileSystemWatcher('**/.a11yrc.json');
  configWatcher.onDidChange(() => invalidateConfigCache());
  configWatcher.onDidCreate(() => invalidateConfigCache());
  configWatcher.onDidDelete(() => invalidateConfigCache());
  context.subscriptions.push(configWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('a11y.aiProvider') ||
          e.affectsConfiguration('a11y.aiModel') ||
          e.affectsConfiguration('a11y.aiEndpoint')) {
        clearAiFixCache();
        clearFullFixCache();
      }
    }),
  );

  createStatusBarItem(context);

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => updateStatusBarScore()),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBarScore()),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'typescriptreact' },
        { language: 'javascriptreact' },
        { language: 'html' },
      ],
      new A11yCodeActionProvider(),
      {
        providedCodeActionKinds: A11yCodeActionProvider.providedCodeActionKinds,
      },
    ),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.showReport', async () => {
      // Use active text editor directly — avoid resolveActiveDocument's file picker
      const activeEditor = vscode.window.activeTextEditor;
      const supportedLangs = new Set(['typescriptreact', 'javascriptreact', 'html']);
      const fileUri = activeEditor && supportedLangs.has(activeEditor.document.languageId)
        ? activeEditor.document.uri
        : undefined;

      const items = [
        ...(fileUri ? [{ label: '$(file) Current File', description: vscode.workspace.asRelativePath(fileUri), value: 'file' as const }] : []),
        { label: '$(folder) Entire Workspace', description: 'Show issues across all files', value: 'workspace' as const },
      ];

      // If no component file is open, go straight to workspace report
      if (items.length === 1) {
        await A11yReportPanel.createOrShow(context);
        return;
      }

      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: 'Show accessibility report for…',
      });
      if (!choice) { return; }
      if (choice.value === 'file' && fileUri) {
        await A11yReportPanel.createOrShow(context, fileUri);
      } else {
        await A11yReportPanel.createOrShow(context);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.applyAiFix', async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
      await applyAiFixCommand(uri, diagnostic);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.bulkFixFile', async () => {
      await bulkFixFileCommand();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.bulkFixWorkspace', async () => {
      await bulkFixWorkspaceCommand();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.screenReaderPreview', async () => {
      await ScreenReaderPanel.createOrShow();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.setApiKey', async () => {
      await setAiApiKey();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.openSettings', () => {
      ConfigPanel.createOrShow();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.generateTests', async () => {
      await generateA11yTests();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.fixFile', async () => {
      const provider = vscode.workspace.getConfiguration('a11y').get<string>('aiProvider', 'none');
      if (provider === 'none') {
        vscode.window.showWarningMessage('Accessify: No AI provider configured. Set one in Accessify Settings.');
        return;
      }
      const apiKey = await getStoredApiKey();
      if (!apiKey) {
        const action = await vscode.window.showWarningMessage(
          'Accessify: No API key configured.', 'Set API Key');
        if (action === 'Set API Key') { vscode.commands.executeCommand('a11y.setApiKey'); }
        return;
      }

      const document = await resolveActiveDocument();
      if (!document) {
        vscode.window.showWarningMessage('Accessify: No TSX, JSX, or HTML file is open.');
        return;
      }

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Accessify: Generating AI fixes for entire file…',
            cancellable: false,
          },
          () => getFullFileFix(document),
        );

        if (result && result.changes.length > 0) {
          DiffPreviewPanel.createOrShow(document.uri, result);
        } else {
          const action = await vscode.window.showInformationMessage(
            'Accessify: AI could not produce valid fixes for this file.',
            'Show Log',
          );
          if (action === 'Show Log') { showFixLog(); }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        vscode.window.showErrorMessage(`Accessify: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.exportReport', async () => {
      const format = await vscode.window.showQuickPick(
        [
          { label: 'SARIF', description: 'Static Analysis Results Interchange Format — for GitHub Code Scanning, Azure DevOps, SonarQube' },
          { label: 'JSON', description: 'Lightweight JSON — for custom CI integrations and dashboards' },
        ],
        { placeHolder: 'Select export format', title: 'Accessify: Export Report' },
      );
      if (!format) { return; }
      if (format.label === 'SARIF') { await exportSarif(); }
      else { await exportJson(); }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('a11y.bulkAiFix', async () => {
      const provider = vscode.workspace.getConfiguration('a11y').get<string>('aiProvider', 'none');
      if (provider === 'none') {
        vscode.window.showWarningMessage('Accessify: No AI provider configured. Set one in Accessify Settings.');
        return;
      }
      const apiKey = await getStoredApiKey();
      if (!apiKey) {
        const action = await vscode.window.showWarningMessage(
          'Accessify: No API key configured.', 'Set API Key');
        if (action === 'Set API Key') { vscode.commands.executeCommand('a11y.setApiKey'); }
        return;
      }

      const excludePattern = '{**/node_modules/**,**/.env*,**/config/**,**/*.config.*,**/*.test.*,**/*.spec.*,**/__tests__/**,**/__mocks__/**,**/test/**,**/tests/**,**/*.stories.*,**/coverage/**,**/dist/**,**/build/**}';
      const fileUris = await vscode.workspace.findFiles('**/*.{tsx,jsx,html}', excludePattern);
      if (fileUris.length === 0) {
        vscode.window.showInformationMessage('Accessify: No TSX/JSX/HTML files found in workspace.');
        return;
      }

      // Filter out files excluded from AI processing
      const { loadConfig: loadA11yConfig, isAiExcluded: checkAiExcluded, isExcluded: checkExcluded } = await import('./config');
      const a11yConfig = await loadA11yConfig();
      const eligibleUris = fileUris.filter(uri => !checkAiExcluded(a11yConfig, uri.fsPath) && !checkExcluded(a11yConfig, uri.fsPath));

      const entries: import('./webview/bulkFixPreviewPanel').BulkFixFileEntry[] = [];
      const concurrency = vscode.workspace.getConfiguration('a11y').get<number>('aiBatchConcurrency', 10);
      let failedFiles = 0;
      let totalIssuesFound = 0;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Accessify: Bulk AI Fix',
          cancellable: true,
        },
        async (progress, token) => {
          // Phase 1: Fast parallel scan to filter files with issues
          progress.report({ message: 'Scanning files for issues…' });
          const { parallelFilterFilesWithIssues } = await import('./parallelScanner');
          const { filesWithIssues, totalIssues: foundIssues } = await parallelFilterFilesWithIssues(
            eligibleUris,
            { token },
          );
          totalIssuesFound = foundIssues;

          if (filesWithIssues.length === 0) {
            return;
          }

          const total = filesWithIssues.length;
          let completed = 0;
          progress.report({
            message: `${total} file(s) with ${totalIssuesFound} issues — generating AI fixes…`,
          });

          for (let batchStart = 0; batchStart < total; batchStart += concurrency) {
            if (token.isCancellationRequested) { break; }

            const batch = filesWithIssues.slice(batchStart, batchStart + concurrency);
            const batchResults = await Promise.allSettled(
              batch.map(async (fileUri) => {
                try {
                  const document = await vscode.workspace.openTextDocument(fileUri);
                  const result = await getFullFileFix(document, { silent: true });
                  return { fileUri, result };
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  const rel = vscode.workspace.asRelativePath(fileUri);
                  console.error(`[Accessify] AI fix failed for ${rel}: ${msg}`);
                  return { fileUri, result: null as Awaited<ReturnType<typeof getFullFileFix>> };
                }
              }),
            );

            for (const settled of batchResults) {
              completed++;
              if (settled.status === 'fulfilled') {
                const { fileUri, result } = settled.value;
                if (result && result.changes.length > 0) {
                  entries.push({
                    uri: fileUri,
                    relativePath: vscode.workspace.asRelativePath(fileUri),
                    changes: result.changes,
                  });
                } else if (!result) {
                  failedFiles++;
                }
              } else {
                failedFiles++;
              }
            }

            progress.report({
              increment: (batch.length / total) * 100,
              message: `AI fixes: ${completed}/${total} files processed (${entries.length} with fixes)`,
            });
          }
        },
      );

      if (entries.length === 0) {
        const detail = failedFiles > 0
          ? ` (${failedFiles} file(s) failed AI analysis — check API key, endpoint, and rate limits)`
          : '';
        vscode.window.showInformationMessage(`Accessify: No AI-fixable issues found across the workspace.${detail}`);
        return;
      }

      const totalChanges = entries.reduce((sum, e) => sum + e.changes.length, 0);
      BulkFixPreviewPanel.createOrShow({ files: entries });
      let summary = `Accessify: AI generated ${totalChanges} fix(es) across ${entries.length} file(s).`;
      if (failedFiles > 0) {
        summary += ` ${failedFiles} file(s) failed AI analysis.`;
      }
      vscode.window.showInformationMessage(summary);
    }),
  );
}

export function deactivate(): void {
  console.log('Accessify extension deactivated');
}
