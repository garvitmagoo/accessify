import * as vscode from 'vscode';
import { scanForA11yIssues } from './scanner/astScanner';
import type { A11yIssue } from './types';

/**
 * Shared parallel workspace scanner.
 *
 * Scans multiple files concurrently using a pool of `concurrency` workers.
 * Progress is reported incrementally and the whole operation respects
 * cancellation tokens.
 *
 * Design constraints:
 *  - Never blocks the extension host event loop for long stretches —
 *    `setImmediate`-style yielding happens between batches.
 *  - File I/O (`openTextDocument`) is the main bottleneck; parallelising
 *    it across files gives the biggest speedup.
 *  - `scanForA11yIssues` is CPU-bound but fast (<5 ms per typical file),
 *    so running it in the same async task is fine.
 */

/** Default concurrency — reads from user config, falls back to 8. */
function getDefaultConcurrency(): number {
  return vscode.workspace.getConfiguration('a11y').get<number>('scanConcurrency', 8);
}

export interface ScanFileResult {
  uri: vscode.Uri;
  relativePath: string;
  issues: A11yIssue[];
}

export interface ParallelScanOptions {
  /** Maximum number of files scanned concurrently. Default: 8. */
  concurrency?: number;
  /** VS Code cancellation token. */
  token?: vscode.CancellationToken;
  /** Report progress per-file. `completed` and `total` are counts. */
  onProgress?: (completed: number, total: number, currentFile: string) => void;
  /** Optional filter applied to issues after scanning each file. */
  filterIssues?: (issues: A11yIssue[]) => A11yIssue[];
}

/**
 * Scan an array of file URIs in parallel with bounded concurrency.
 *
 * Returns only files that have at least one issue (after filtering).
 * Files that fail to open are silently skipped.
 */
export async function parallelScan(
  files: vscode.Uri[],
  options: ParallelScanOptions = {},
): Promise<ScanFileResult[]> {
  const {
    concurrency = getDefaultConcurrency(),
    token,
    onProgress,
    filterIssues,
  } = options;

  const total = files.length;
  const results: ScanFileResult[] = [];
  let completed = 0;

  // Process in batches of `concurrency` size
  for (let batchStart = 0; batchStart < total; batchStart += concurrency) {
    if (token?.isCancellationRequested) { break; }

    const batch = files.slice(batchStart, batchStart + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (uri) => {
        if (token?.isCancellationRequested) { return null; }

        const document = await vscode.workspace.openTextDocument(uri);
        let issues = scanForA11yIssues(document.getText(), document.fileName);
        if (filterIssues) { issues = filterIssues(issues); }

        const relativePath = vscode.workspace.asRelativePath(uri);

        completed++;
        onProgress?.(completed, total, relativePath);

        if (issues.length === 0) { return null; }
        return { uri, relativePath, issues } satisfies ScanFileResult;
      }),
    );

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled' && settled.value) {
        results.push(settled.value);
      } else if (settled.status === 'fulfilled') {
        // null — no issues or cancelled, skip
      } else {
        // rejected — file failed to open, skip silently
      }
    }

    // Yield to the event loop between batches so the UI stays responsive
    if (batchStart + concurrency < total) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  return results;
}

/**
 * Quick parallel scan that only returns file URIs that have at least
 * one issue. Useful for the "filter" phase of bulk operations where
 * you only need to know *which* files need work.
 */
export async function parallelFilterFilesWithIssues(
  files: vscode.Uri[],
  options: ParallelScanOptions = {},
): Promise<{ filesWithIssues: vscode.Uri[]; totalIssues: number }> {
  const results = await parallelScan(files, options);
  let totalIssues = 0;
  const filesWithIssues: vscode.Uri[] = [];

  for (const r of results) {
    filesWithIssues.push(r.uri);
    totalIssues += r.issues.length;
  }

  return { filesWithIssues, totalIssues };
}
