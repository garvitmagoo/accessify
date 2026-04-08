import * as vscode from 'vscode';
import { scanForA11yIssues } from './scanner/astScanner';
import type { A11yIssue } from './types';

/**
 * SARIF (Static Analysis Results Interchange Format) v2.1.0 exporter.
 * Produces output consumable by:
 *   - GitHub Code Scanning (upload via actions/upload-sarif)
 *   - Azure DevOps
 *   - SonarQube
 *   - VS Code SARIF Viewer extension
 *
 * Also supports a lightweight JSON export for custom CI integrations.
 */

/* ── SARIF type subset (just enough to produce valid output) ────────────── */

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: { driver: SarifDriver };
  results: SarifResult[];
}

interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  helpUri?: string;
  defaultConfiguration: { level: string };
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: SarifLocation[];
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId: string };
    region: { startLine: number; startColumn: number };
  };
}

/* ── Rule metadata for SARIF ────────────────────────────────────────────── */

const RULE_METADATA: Record<string, { description: string; wcag?: string }> = {
  'img-alt': { description: 'Images must have alt text', wcag: '1.1.1' },
  'button-label': { description: 'Buttons must have accessible names', wcag: '4.1.2' },
  'aria-role': { description: 'ARIA roles must be valid', wcag: '4.1.2' },
  'form-label': { description: 'Form controls must have labels', wcag: '1.3.1' },
  'click-events-have-key-events': { description: 'Interactive elements need keyboard support', wcag: '2.1.1' },
  'aria-pattern': { description: 'ARIA widget patterns must be correctly structured', wcag: '4.1.2' },
  'color-contrast': { description: 'Text must meet WCAG AA contrast ratio', wcag: '1.4.3' },
  'heading-order': { description: 'Heading levels should follow logical order', wcag: '1.3.1' },
  'autocomplete-valid': { description: 'Input fields collecting personal data must have autocomplete', wcag: '1.3.5' },
  'no-positive-tabindex': { description: 'Avoid positive tabIndex values that disrupt focus order', wcag: '2.4.3' },
  'focus-visible': { description: 'Focus indicators must not be removed without replacement', wcag: '2.4.7' },
  'page-title': { description: 'Pages must have a descriptive title element', wcag: '2.4.2' },
  'no-mouse-only-hover': { description: 'Hover content must also be keyboard-accessible', wcag: '1.4.13' },
  'nextjs-head-lang': { description: 'Next.js Html element must have a lang attribute', wcag: '3.1.1' },
  'nextjs-image-alt': { description: 'Next.js Image component must have alt text', wcag: '1.1.1' },
  'nextjs-link-text': { description: 'Next.js Link component must have discernible text', wcag: '1.1.1' },
  'no-access-key': { description: 'Avoid accessKey — it creates inconsistent keyboard shortcuts', wcag: '2.1.1' },
  'no-autofocus': { description: 'Avoid autoFocus — it reduces usability for sighted and non-sighted users', wcag: '2.4.3' },
  'no-redundant-roles': { description: 'Elements should not have ARIA roles that duplicate implicit semantics', wcag: '4.1.2' },
  'media-has-caption': { description: 'Media elements must have captions for deaf/hard-of-hearing users', wcag: '1.2.2' },
  'interactive-supports-focus': { description: 'Interactive elements must be focusable for keyboard users', wcag: '2.1.1' },
  'anchor-is-valid': { description: 'Anchor elements must have valid href attributes', wcag: '2.1.1' },
  'prefer-semantic-elements': { description: 'Prefer native semantic HTML elements over ARIA roles on div/span', wcag: '1.3.1' },
  'no-noninteractive-element-interactions': { description: 'Non-interactive elements should not have event handlers — use interactive elements instead', wcag: '4.1.2' },
};

/* ── Export commands ────────────────────────────────────────────────────── */

export async function exportSarif(): Promise<void> {
  try {
    const result = await scanWorkspaceForExport();
    if (!result) { return; }

    const sarif = buildSarif(result);
    await saveExport(JSON.stringify(sarif, null, 2), 'a11y-report.sarif', 'SARIF');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    vscode.window.showErrorMessage(`Accessify: SARIF export failed — ${msg}`);
  }
}

export async function exportJson(): Promise<void> {
  try {
    const result = await scanWorkspaceForExport();
    if (!result) { return; }

    const report = buildJsonReport(result);
    await saveExport(JSON.stringify(report, null, 2), 'a11y-report.json', 'JSON');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    vscode.window.showErrorMessage(`Accessify: JSON export failed — ${msg}`);
  }
}

/* ── Shared scan ────────────────────────────────────────────────────────── */

interface ScanResult {
  files: { relativePath: string; absolutePath: string; issues: A11yIssue[] }[];
  totalIssues: number;
  scannedAt: string;
}

async function scanWorkspaceForExport(): Promise<ScanResult | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Accessify: No workspace folder open.');
    return null;
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Accessify: Scanning workspace for export...',
      cancellable: false,
    },
    async (progress) => {
      const fileUris = await vscode.workspace.findFiles('**/*.{tsx,jsx}', '**/node_modules/**');
      const files: ScanResult['files'] = [];
      let totalIssues = 0;
      const total = fileUris.length;

      for (let i = 0; i < total; i++) {
        const uri = fileUris[i];
        progress.report({
          increment: (1 / total) * 100,
          message: `(${i + 1}/${total}) ${vscode.workspace.asRelativePath(uri)}`,
        });

        const doc = await vscode.workspace.openTextDocument(uri);
        const issues = scanForA11yIssues(doc.getText(), doc.fileName);
        const relativePath = vscode.workspace.asRelativePath(uri);
        files.push({ relativePath, absolutePath: doc.fileName, issues });
        totalIssues += issues.length;
      }

      return { files, totalIssues, scannedAt: new Date().toISOString() };
    },
  );
}

/* ── SARIF builder ──────────────────────────────────────────────────────── */

function buildSarif(scan: ScanResult): SarifLog {
  const seenRules = new Set<string>();
  const results: SarifResult[] = [];

  for (const file of scan.files) {
    for (const issue of file.issues) {
      seenRules.add(issue.rule);
      results.push({
        ruleId: issue.rule,
        level: severityToSarifLevel(issue.severity),
        message: { text: issue.message },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: file.relativePath.replace(/\\/g, '/'),
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: issue.line + 1,   // SARIF uses 1-based lines
              startColumn: issue.column + 1,
            },
          },
        }],
      });
    }
  }

  const rules: SarifRule[] = Array.from(seenRules).sort().map(id => {
    const meta = RULE_METADATA[id];
    return {
      id,
      shortDescription: { text: meta?.description || id },
      helpUri: meta?.wcag ? `https://www.w3.org/WAI/WCAG21/Understanding/${wcagAnchor(meta.wcag)}` : undefined,
      defaultConfiguration: { level: 'warning' },
    };
  });

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'Accessify',
          version: require('../package.json').version,
          informationUri: 'https://github.com/garvit-magoo/a11y-scanner-extension',
          rules,
        },
      },
      results,
    }],
  };
}

function severityToSarifLevel(severity: A11yIssue['severity']): string {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'note';
    case 'hint': return 'note';
  }
}

function wcagAnchor(sc: string): string {
  // Map WCAG SC numbers to Understanding doc slugs
  const map: Record<string, string> = {
    '1.1.1': 'non-text-content',
    '1.3.1': 'info-and-relationships',
    '1.3.5': 'identify-input-purpose',
    '1.4.3': 'contrast-minimum',
    '1.4.13': 'content-on-hover-or-focus',
    '2.1.1': 'keyboard',
    '2.4.2': 'page-titled',
    '2.4.3': 'focus-order',
    '2.4.7': 'focus-visible',
    '3.1.1': 'language-of-page',
    '4.1.2': 'name-role-value',
  };
  return map[sc] || sc;
}

/* ── JSON report builder ────────────────────────────────────────────────── */

function buildJsonReport(scan: ScanResult): object {
  const byRule: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const file of scan.files) {
    for (const issue of file.issues) {
      byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    }
  }

  return {
    tool: 'Accessify',
    version: require('../package.json').version,
    scannedAt: scan.scannedAt,
    summary: {
      totalIssues: scan.totalIssues,
      filesScanned: scan.files.length,
      filesWithIssues: scan.files.filter(f => f.issues.length > 0).length,
      byRule,
      bySeverity,
    },
    files: scan.files
      .filter(f => f.issues.length > 0)
      .map(f => ({
        path: f.relativePath.replace(/\\/g, '/'),
        issueCount: f.issues.length,
        issues: f.issues.map(i => ({
          rule: i.rule,
          severity: i.severity,
          message: i.message,
          line: i.line + 1,
          column: i.column + 1,
          wcag: RULE_METADATA[i.rule]?.wcag || null,
        })),
      })),
  };
}

/* ── File save helper ───────────────────────────────────────────────────── */

async function saveExport(content: string, defaultName: string, format: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = workspaceFolder
    ? vscode.Uri.joinPath(workspaceFolder.uri, defaultName)
    : undefined;

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: format === 'SARIF'
      ? { 'SARIF': ['sarif'], 'JSON': ['json'] }
      : { 'JSON': ['json'] },
    title: `Save A11y ${format} Report`,
  });

  if (!saveUri) {
    return; // User cancelled
  }

  const encoder = new TextEncoder();
  await vscode.workspace.fs.writeFile(saveUri, encoder.encode(content));
  vscode.window.showInformationMessage(`Accessify: ${format} report saved to ${vscode.workspace.asRelativePath(saveUri)}`);
}
