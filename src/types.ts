import * as vscode from 'vscode';

export interface A11yIssue {
  message: string;
  rule: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  snippet: string;
  fix?: string;
  /** Structured data for code actions to consume without parsing messages. */
  data?: Record<string, string>;
}

export interface A11yRule {
  id: string;
  description: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  check: (node: any, sourceFile: any) => A11yIssue[];
}

export interface AiFixRequest {
  code: string;
  issue: A11yIssue;
  context: string;
}

export interface AiFixResponse {
  fixedCode: string;
  explanation: string;
  reasoning: string;
  /** Structured fix actions — preferred over fixedCode when present. */
  actions?: AiFixAction[];
}

/**
 * A single structured fix instruction the AI can return.
 * We apply these programmatically to avoid formatting/syntax issues.
 */
export type AiFixAction =
  | { type: 'addAttribute'; name: string; value: string }
  | { type: 'modifyAttribute'; name: string; newValue: string }
  | { type: 'removeAttribute'; name: string }
  | { type: 'replaceTag'; oldTag: string; newTag: string };

export function toVscodeSeverity(severity: A11yIssue['severity']): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'info': return vscode.DiagnosticSeverity.Information;
    case 'hint': return vscode.DiagnosticSeverity.Hint;
  }
}

/* ── PR Review types ────────────────────────────────────────────────────── */

export interface PrFileResult {
  /** Workspace-relative path */
  file: string;
  status: 'added' | 'modified' | 'renamed';
  newIssues: A11yIssue[];
  fixedIssues: A11yIssue[];
  currentIssues: A11yIssue[];
  previousIssues: A11yIssue[];
}

export interface PrReviewResult {
  baseBranch: string;
  currentBranch: string;
  files: PrFileResult[];
  totalNew: number;
  totalFixed: number;
  totalCurrent: number;
  totalPrevious: number;
  pass: boolean;
  /** GitHub PR metadata — present when reviewing a GitHub PR */
  prNumber?: number;
  prTitle?: string;
  prAuthor?: string;
  prUrl?: string;
}
