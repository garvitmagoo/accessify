import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as https from 'https';
import { scanForA11yIssues } from './scanner/astScanner';
import type { A11yIssue, PrFileResult, PrReviewResult } from './types';
import { PrReviewPanel } from './webview/prReviewPanel';

/* ── Public command ─────────────────────────────────────────────────────── */

export async function reviewPullRequest(context: vscode.ExtensionContext): Promise<void> {
  try {
    await reviewPullRequestUnsafe(context);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    vscode.window.showErrorMessage(`Accessify: PR review failed — ${msg}`);
  }
}

/* ── Implementation ─────────────────────────────────────────────────────── */

async function reviewPullRequestUnsafe(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Accessify: No workspace folder open.');
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  if (!(await isGitRepo(cwd))) {
    vscode.window.showWarningMessage('Accessify: This workspace is not a git repository.');
    return;
  }

  // Let the user pick review mode
  const mode = await pickReviewMode();
  if (!mode) { return; }

  if (mode === 'github-pr') {
    await reviewGitHubPr(context, cwd);
  } else if (mode === 'compare-head') {
    await reviewVsHead(context, cwd);
  } else {
    await reviewVsBranch(context, cwd);
  }
}

async function pickReviewMode(): Promise<'github-pr' | 'compare-head' | 'compare-branch' | undefined> {
  const pick = await vscode.window.showQuickPick([
    {
      label: '$(github) Review GitHub Pull Request',
      description: 'Fetch an open PR from GitHub and scan its changes',
      value: 'github-pr' as const,
    },
    {
      label: '$(git-compare) Compare with Last Commit',
      description: 'Scan changes between working tree and HEAD',
      value: 'compare-head' as const,
    },
    {
      label: '$(git-branch) Compare Branches',
      description: 'Compare current branch against another local branch',
      value: 'compare-branch' as const,
    },
  ], {
    placeHolder: 'Choose review mode',
    title: 'A11y PR Review',
  });

  return pick?.value;
}

/* ── Mode: GitHub PR ────────────────────────────────────────────────────── */

interface GitHubPrInfo {
  number: number;
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  url: string;
}

interface GitHubPrFile {
  filename: string;
  status: string;
  previous_filename?: string;
  patch?: string;
}

async function reviewGitHubPr(context: vscode.ExtensionContext, cwd: string): Promise<void> {
  // Get GitHub token via VS Code's built-in auth
  const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
  if (!session) {
    vscode.window.showWarningMessage('Accessify: GitHub authentication is required to review PRs.');
    return;
  }
  const token = session.accessToken;

  // Detect owner/repo from git remote
  const remote = await getGitHubRemote(cwd);
  if (!remote) {
    vscode.window.showWarningMessage('Accessify: Could not detect GitHub remote. Ensure this repo has a GitHub origin.');
    return;
  }

  // Fetch open PRs
  const prs = await fetchOpenPrs(remote.owner, remote.repo, token);
  if (prs.length === 0) {
    vscode.window.showInformationMessage('Accessify: No open pull requests found.');
    return;
  }

  // Let user pick a PR
  const prPick = await vscode.window.showQuickPick(
    prs.map(pr => ({
      label: `#${pr.number}  ${pr.title}`,
      description: `${pr.headBranch} → ${pr.baseBranch}`,
      detail: `by ${pr.author}`,
      pr,
    })),
    { placeHolder: 'Select a pull request to review', title: 'A11y PR Review: Open PRs' },
  );
  if (!prPick) { return; }

  const selectedPr = prPick.pr;

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Accessify: Reviewing PR #${selectedPr.number}…`,
      cancellable: true,
    },
    async (progress, cancelToken) => {
      return await runGitHubPrReview(cwd, remote, selectedPr, token, progress, cancelToken);
    },
  );

  if (!result) { return; }

  PrReviewPanel.createOrShow(context, result);
}

async function getGitHubRemote(cwd: string): Promise<{ owner: string; repo: string } | null> {
  return new Promise(resolve => {
    cp.execFile('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
    }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const url = stdout.trim();
      // Match HTTPS or SSH GitHub URLs
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
      if (match) {
        resolve({ owner: match[1], repo: match[2] });
      } else {
        resolve(null);
      }
    });
  });
}

function githubApi<T>(urlPath: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'a11y-scanner-vscode',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON response from GitHub API')); }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy(new Error('GitHub API request timed out'));
    });
    req.end();
  });
}

async function fetchOpenPrs(owner: string, repo: string, token: string): Promise<GitHubPrInfo[]> {
  const rawPrs = await githubApi<Array<{
    number: number;
    title: string;
    user: { login: string } | null;
    base: { ref: string };
    head: { ref: string };
    html_url: string;
  }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30&sort=updated&direction=desc`, token);

  return rawPrs.map(pr => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? 'unknown',
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    url: pr.html_url,
  }));
}

async function fetchPrFiles(owner: string, repo: string, prNumber: number, token: string): Promise<GitHubPrFile[]> {
  const files = await githubApi<GitHubPrFile[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=100`,
    token,
  );
  return files;
}

function fetchFileContent(owner: string, repo: string, filePath: string, ref: string, token: string): Promise<string | null> {
  return new Promise((resolve) => {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    githubApi<{ content?: string; encoding?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      token,
    ).then(data => {
      if (data.content && data.encoding === 'base64') {
        resolve(Buffer.from(data.content, 'base64').toString('utf-8'));
      } else {
        resolve(null);
      }
    }).catch(() => resolve(null));
  });
}

async function runGitHubPrReview(
  _cwd: string,
  remote: { owner: string; repo: string },
  pr: GitHubPrInfo,
  token: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  cancelToken?: vscode.CancellationToken,
): Promise<PrReviewResult | null> {
  progress.report({ message: 'Fetching PR files from GitHub…' });
  const prFiles = await fetchPrFiles(remote.owner, remote.repo, pr.number, token);

  const supportedExtensions = ['.tsx', '.jsx', '.ts', '.js'];
  const relevantFiles = prFiles.filter(f =>
    supportedExtensions.includes(path.extname(f.filename).toLowerCase()),
  );

  if (relevantFiles.length === 0) {
    vscode.window.showInformationMessage('Accessify: No relevant JSX/TSX files changed in this PR.');
    return null;
  }

  const files: PrFileResult[] = [];
  let totalNew = 0;
  let totalFixed = 0;
  let totalCurrent = 0;
  let totalPrevious = 0;

  for (let i = 0; i < relevantFiles.length; i++) {
    if (cancelToken?.isCancellationRequested) { break; }

    const prFile = relevantFiles[i];
    progress.report({
      message: `Scanning ${prFile.filename} (${i + 1}/${relevantFiles.length})`,
      increment: (1 / relevantFiles.length) * 100,
    });

    const status: PrFileResult['status'] =
      prFile.status === 'added' ? 'added' :
      prFile.status === 'renamed' ? 'renamed' : 'modified';

    // Fetch head (new) version from GitHub
    const headSource = await fetchFileContent(remote.owner, remote.repo, prFile.filename, pr.headBranch, token);
    if (!headSource) { continue; }

    const currentIssues = scanForA11yIssues(headSource, prFile.filename);

    // Fetch base (old) version from GitHub
    const baseFileName = prFile.previous_filename ?? prFile.filename;
    const baseSource = status === 'added' ? null : await fetchFileContent(remote.owner, remote.repo, baseFileName, pr.baseBranch, token);
    const previousIssues = baseSource ? scanForA11yIssues(baseSource, prFile.filename) : [];

    const prevKeys = new Set(previousIssues.map(issueKey));
    const currKeys = new Set(currentIssues.map(issueKey));

    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));
    const fixedIssues = previousIssues.filter(i => !currKeys.has(issueKey(i)));

    totalNew += newIssues.length;
    totalFixed += fixedIssues.length;
    totalCurrent += currentIssues.length;
    totalPrevious += previousIssues.length;

    files.push({ file: prFile.filename, status, newIssues, fixedIssues, currentIssues, previousIssues });
  }

  return {
    baseBranch: pr.baseBranch,
    currentBranch: pr.headBranch,
    files,
    totalNew,
    totalFixed,
    totalCurrent,
    totalPrevious,
    pass: totalNew === 0,
    prNumber: pr.number,
    prTitle: pr.title,
    prAuthor: pr.author,
    prUrl: pr.url,
  };
}

/* ── Mode: Compare with HEAD ────────────────────────────────────────────── */

async function reviewVsHead(context: vscode.ExtensionContext, cwd: string): Promise<void> {
  const currentBranch = await getCurrentBranch(cwd) ?? 'HEAD';

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Accessify: Comparing with last commit…',
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Finding changed files…' });

      // Get files changed between HEAD and working tree
      const changedFiles = await getChangedFilesVsHead(cwd);
      const supportedExtensions = ['.tsx', '.jsx', '.ts', '.js'];
      const relevantFiles = changedFiles.filter(f =>
        supportedExtensions.includes(path.extname(f.file).toLowerCase()),
      );

      if (relevantFiles.length === 0) {
        // Fallback: scan all workspace tsx/jsx files like the old regression did
        return await runFullWorkspaceComparison(cwd, currentBranch, progress, token);
      }

      return await runLocalReview(cwd, 'HEAD', currentBranch, relevantFiles, progress, token);
    },
  );

  if (!result) { return; }
  PrReviewPanel.createOrShow(context, result);
}

async function getChangedFilesVsHead(cwd: string): Promise<{ status: string; file: string; oldFile?: string }[]> {
  // Get both staged and unstaged changes vs HEAD
  return new Promise(resolve => {
    cp.execFile('git', ['diff', '--name-status', '--diff-filter=AMRCT', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    }, (err, stdout) => {
      if (err) { resolve([]); return; }
      resolve(parseNameStatus(stdout));
    });
  });
}

async function runFullWorkspaceComparison(
  cwd: string,
  currentBranch: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token?: vscode.CancellationToken,
): Promise<PrReviewResult | null> {
  const uris = await vscode.workspace.findFiles('**/*.{tsx,jsx}', '**/node_modules/**');
  if (uris.length === 0) {
    vscode.window.showInformationMessage('Accessify: No JSX/TSX files found in workspace.');
    return null;
  }

  const files: PrFileResult[] = [];
  let totalNew = 0, totalFixed = 0, totalCurrent = 0, totalPrevious = 0;

  for (let i = 0; i < uris.length; i++) {
    if (token?.isCancellationRequested) { break; }

    const uri = uris[i];
    const relativePath = vscode.workspace.asRelativePath(uri);
    progress.report({
      message: `Scanning ${relativePath} (${i + 1}/${uris.length})`,
      increment: (1 / uris.length) * 100,
    });

    const doc = await vscode.workspace.openTextDocument(uri);
    const currentSource = doc.getText();
    const currentIssues = scanForA11yIssues(currentSource, doc.fileName);

    const previousSource = await getFileAtRef(cwd, 'HEAD', relativePath);
    const previousIssues = previousSource ? scanForA11yIssues(previousSource, doc.fileName) : [];

    const prevKeys = new Set(previousIssues.map(issueKey));
    const currKeys = new Set(currentIssues.map(issueKey));

    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));
    const fixedIssues = previousIssues.filter(i => !currKeys.has(issueKey(i)));

    if (newIssues.length > 0 || fixedIssues.length > 0) {
      totalNew += newIssues.length;
      totalFixed += fixedIssues.length;
      totalCurrent += currentIssues.length;
      totalPrevious += previousIssues.length;
      files.push({ file: relativePath, status: 'modified', newIssues, fixedIssues, currentIssues, previousIssues });
    }
  }

  if (files.length === 0) {
    vscode.window.showInformationMessage('Accessify: No accessibility changes detected since last commit.');
    return null;
  }

  return {
    baseBranch: 'HEAD',
    currentBranch,
    files,
    totalNew,
    totalFixed,
    totalCurrent,
    totalPrevious,
    pass: totalNew === 0,
  };
}

/* ── Mode: Compare branches ─────────────────────────────────────────────── */

async function reviewVsBranch(context: vscode.ExtensionContext, cwd: string): Promise<void> {
  const currentBranch = await getCurrentBranch(cwd);
  if (!currentBranch) {
    vscode.window.showWarningMessage('Accessify: Unable to determine current branch.');
    return;
  }

  const baseBranch = await pickBaseBranch(cwd, currentBranch);
  if (!baseBranch) { return; }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Accessify: Reviewing branch for accessibility…',
      cancellable: true,
    },
    async (progress, token) => {
      const mergeBase = await getMergeBase(cwd, baseBranch);
      if (!mergeBase) {
        vscode.window.showWarningMessage('Accessify: Unable to find common ancestor between branches.');
        return null;
      }

      progress.report({ message: 'Finding changed files…' });
      const changedFiles = await getChangedFilesBetween(cwd, baseBranch);
      const supportedExtensions = ['.tsx', '.jsx', '.ts', '.js'];
      const relevantFiles = changedFiles.filter(f =>
        supportedExtensions.includes(path.extname(f.file).toLowerCase()),
      );

      if (relevantFiles.length === 0) {
        vscode.window.showInformationMessage('Accessify: No relevant JSX/TSX files changed between branches.');
        return null;
      }

      return await runLocalReview(cwd, mergeBase, currentBranch, relevantFiles, progress, token);
    },
  );

  if (!result) { return; }
  if (result.baseBranch === '' && baseBranch) { result.baseBranch = baseBranch; }
  PrReviewPanel.createOrShow(context, result);
}

/* ── Git helpers ────────────────────────────────────────────────────────── */

function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise(resolve => {
    cp.exec('git rev-parse --is-inside-work-tree', { cwd }, err => {
      resolve(!err);
    });
  });
}

function getCurrentBranch(cwd: string): Promise<string | null> {
  return new Promise(resolve => {
    cp.execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
    }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

async function listBranches(cwd: string): Promise<string[]> {
  return new Promise(resolve => {
    cp.execFile('git', ['branch', '-a', '--format=%(refname:short)'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
    }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const branches = stdout
        .split('\n')
        .map(b => b.trim())
        .filter(Boolean);
      resolve(branches);
    });
  });
}

async function pickBaseBranch(cwd: string, currentBranch: string): Promise<string | undefined> {
  const branches = await listBranches(cwd);
  const prioritized = ['main', 'master', 'develop', 'dev'];
  const sorted = [
    ...prioritized.filter(b => branches.includes(b) && b !== currentBranch),
    ...branches.filter(b => !prioritized.includes(b) && b !== currentBranch),
  ];

  const items: vscode.QuickPickItem[] = sorted.map(b => ({
    label: b,
    description: prioritized.includes(b) ? 'common base branch' : undefined,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Select base branch to compare "${currentBranch}" against`,
    title: 'A11y PR Review: Choose Base Branch',
  });

  return pick?.label;
}

function getChangedFilesBetween(cwd: string, baseBranch: string): Promise<{ status: string; file: string; oldFile?: string }[]> {
  return new Promise(resolve => {
    cp.execFile('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
    }, (err, mergeBase) => {
      if (err) { resolve([]); return; }
      cp.execFile('git', ['diff', '--name-status', '--diff-filter=AMRCT', mergeBase.trim(), 'HEAD'], {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
      }, (err2, stdout) => {
        if (err2) { resolve([]); return; }
        resolve(parseNameStatus(stdout));
      });
    });
  });
}

function parseNameStatus(stdout: string): { status: string; file: string; oldFile?: string }[] {
  const results: { status: string; file: string; oldFile?: string }[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) { continue; }
    const parts = line.split('\t');
    const statusChar = parts[0]?.[0];
    if (!statusChar) { continue; }
    if (statusChar === 'R' && parts.length >= 3) {
      results.push({ status: 'R', file: parts[2], oldFile: parts[1] });
    } else if (parts[1]) {
      results.push({ status: statusChar, file: parts[1] });
    }
  }
  return results;
}

function getFileAtRef(cwd: string, ref: string, relativePath: string): Promise<string | null> {
  const normalized = path.normalize(relativePath).replace(/\\/g, '/');
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    cp.execFile('git', ['show', `${ref}:${normalized}`], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

function getMergeBase(cwd: string, baseBranch: string): Promise<string | null> {
  return new Promise(resolve => {
    cp.execFile('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
    }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

/* ── Core review logic (shared by local modes) ──────────────────────────── */

async function runLocalReview(
  cwd: string,
  baseRef: string,
  currentBranch: string,
  changedFiles: { status: string; file: string; oldFile?: string }[],
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token?: vscode.CancellationToken,
): Promise<PrReviewResult | null> {
  const files: PrFileResult[] = [];
  let totalNew = 0;
  let totalFixed = 0;
  let totalCurrent = 0;
  let totalPrevious = 0;

  for (let i = 0; i < changedFiles.length; i++) {
    if (token?.isCancellationRequested) { break; }

    const changed = changedFiles[i];
    progress.report({
      message: `Scanning ${changed.file} (${i + 1}/${changedFiles.length})`,
      increment: (1 / changedFiles.length) * 100,
    });

    const filePath = path.join(cwd, changed.file);
    const status: PrFileResult['status'] =
      changed.status === 'A' ? 'added' :
      changed.status === 'R' ? 'renamed' : 'modified';

    let currentSource: string;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      currentSource = doc.getText();
    } catch {
      continue;
    }

    const currentIssues = scanForA11yIssues(currentSource, filePath);

    const baseFile = changed.oldFile ?? changed.file;
    const baseSource = status === 'added' ? null : await getFileAtRef(cwd, baseRef, baseFile);
    const previousIssues = baseSource ? scanForA11yIssues(baseSource, filePath) : [];

    const prevKeys = new Set(previousIssues.map(issueKey));
    const currKeys = new Set(currentIssues.map(issueKey));

    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));
    const fixedIssues = previousIssues.filter(i => !currKeys.has(issueKey(i)));

    totalNew += newIssues.length;
    totalFixed += fixedIssues.length;
    totalCurrent += currentIssues.length;
    totalPrevious += previousIssues.length;

    files.push({ file: changed.file, status, newIssues, fixedIssues, currentIssues, previousIssues });
  }

  return {
    baseBranch: baseRef,
    currentBranch,
    files,
    totalNew,
    totalFixed,
    totalCurrent,
    totalPrevious,
    pass: totalNew === 0,
  };
}

function issueKey(issue: A11yIssue): string {
  return `${issue.rule}::${issue.message}`;
}
