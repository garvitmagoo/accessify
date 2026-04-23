import * as vscode from 'vscode';

/**
 * Resolves the active JSX/TSX document even when a webview or panel has focus
 * and `activeTextEditor` is `undefined`.
 *
 * Fallback chain:
 *  1. Active editor (if its language matches)
 *  2. Most recent visible JSX/TSX editor
 *  3. Open tabs — auto-picks if only one, shows quick-pick if multiple
 *
 * @param languageIds — accepted language IDs (default: TSX + JSX)
 * @param excludePattern — regex to reject certain file paths (e.g. test files)
 */
export async function resolveActiveDocument(
  languageIds = new Set(['typescriptreact', 'javascriptreact', 'html']),
  excludePattern?: RegExp,
): Promise<vscode.TextDocument | undefined> {
  // 1. Active editor
  const active = vscode.window.activeTextEditor?.document;
  if (active && languageIds.has(active.languageId)) {
    return active;
  }

  // 2. Visible editors
  const visible = vscode.window.visibleTextEditors.find(
    e => languageIds.has(e.document.languageId),
  );
  if (visible) { return visible.document; }

  // 3. Open tabs
  const tabUris = vscode.window.tabGroups.all
    .flatMap(g => g.tabs)
    .map(t => (t.input as any)?.uri as vscode.Uri | undefined)
    .filter((u): u is vscode.Uri => {
      if (!u) { return false; }
      const ext = u.fsPath.toLowerCase();
      const hasExt = ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.html');
      if (!hasExt) { return false; }
      if (excludePattern && excludePattern.test(u.fsPath)) { return false; }
      return true;
    });

  if (tabUris.length === 0) { return undefined; }

  if (tabUris.length === 1) {
    return vscode.workspace.openTextDocument(tabUris[0]);
  }

  const pick = await vscode.window.showQuickPick(
    tabUris.map(u => ({
      label: vscode.workspace.asRelativePath(u),
      uri: u,
    })),
    { placeHolder: 'Select a component file' },
  );
  if (!pick) { return undefined; }
  return vscode.workspace.openTextDocument(pick.uri);
}
