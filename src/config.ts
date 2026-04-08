import * as vscode from 'vscode';
import * as path from 'path';
import type { A11yIssue } from './types';

/**
 * Per-rule configuration that users can set in .a11yrc.json.
 */
export interface RuleConfig {
  enabled?: boolean;
  severity?: 'error' | 'warning' | 'info' | 'hint';
}

/**
 * Shape of the .a11yrc.json file.
 */
export interface A11yConfig {
  rules?: Record<string, RuleConfig | false>;
  exclude?: string[];
  /** Glob patterns for folders/files to skip when sending to the AI provider. */
  aiExclude?: string[];
}

const DEFAULT_CONFIG: A11yConfig = {
  rules: {},
  exclude: [],
  aiExclude: [],
};

let cachedConfig: A11yConfig | undefined;
let cachedConfigPath: string | undefined;

/**
 * Load the .a11yrc.json configuration from the workspace root.
 * Returns the default (all rules enabled) if no config file exists.
 */
export async function loadConfig(): Promise<A11yConfig> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return DEFAULT_CONFIG;
  }

  const configPath = path.join(workspaceFolders[0].uri.fsPath, '.a11yrc.json');

  if (cachedConfig && cachedConfigPath === configPath) {
    return cachedConfig!;
  }

  try {
    const uri = vscode.Uri.file(configPath);
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(raw).toString('utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Unknown parse error';
      vscode.window.showWarningMessage(`Accessify: Invalid .a11yrc.json — ${msg}. Using default config.`);
      cachedConfig = DEFAULT_CONFIG;
      cachedConfigPath = configPath;
      return DEFAULT_CONFIG;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      vscode.window.showWarningMessage('Accessify: .a11yrc.json must be a JSON object. Using default config.');
      cachedConfig = DEFAULT_CONFIG;
      cachedConfigPath = configPath;
      return DEFAULT_CONFIG;
    }
    const obj = parsed as Record<string, unknown>;
    const config: A11yConfig = {
      rules: typeof obj.rules === 'object' && obj.rules !== null && !Array.isArray(obj.rules)
        ? obj.rules as A11yConfig['rules']
        : DEFAULT_CONFIG.rules,
      exclude: Array.isArray(obj.exclude) ? (obj.exclude as unknown[]).filter((e): e is string => typeof e === 'string') : DEFAULT_CONFIG.exclude,
      aiExclude: Array.isArray(obj.aiExclude) ? (obj.aiExclude as unknown[]).filter((e): e is string => typeof e === 'string') : DEFAULT_CONFIG.aiExclude,
    };
    cachedConfig = config;
    cachedConfigPath = configPath;
    return config;
  } catch {
    cachedConfig = DEFAULT_CONFIG;
    cachedConfigPath = configPath;
    return DEFAULT_CONFIG;
  }
}

export function invalidateConfigCache(): void {
  cachedConfig = undefined;
  cachedConfigPath = undefined;
}

export function isRuleEnabled(config: A11yConfig, ruleId: string): boolean {
  if (!config.rules) { return true; }
  const ruleConfig = config.rules[ruleId];
  if (ruleConfig === false) { return false; }
  if (ruleConfig && ruleConfig.enabled === false) { return false; }
  return true;
}

/**
 * Apply config overrides to a list of issues: filter disabled rules and
 * override severity where configured.
 */
export function applyConfig(config: A11yConfig, issues: A11yIssue[]): A11yIssue[] {
  if (!config.rules || Object.keys(config.rules).length === 0) {
    return issues;
  }

  return issues
    .filter(issue => isRuleEnabled(config, issue.rule))
    .map(issue => {
      const ruleConfig = config.rules![issue.rule];
      if (ruleConfig && typeof ruleConfig === 'object' && ruleConfig.severity) {
        return { ...issue, severity: ruleConfig.severity };
      }
      return issue;
    });
}

/**
 * Check if a file path matches any of the exclude patterns.
 * Supports globs: * (any non-separator chars), ** (any path), ? (single char).
 */
export function isExcluded(config: A11yConfig, filePath: string): boolean {
  if (!config.exclude || config.exclude.length === 0) {
    return false;
  }
  const normalized = filePath.replace(/\\/g, '/');
  return config.exclude.some(pattern => {
    const regex = globToRegex(pattern);
    return regex.test(normalized);
  });
}

/**
 * Check if a file path matches any of the aiExclude patterns.
 * Files matching these patterns will still be scanned for diagnostics
 * but will not be sent to the AI provider for fixes.
 */
export function isAiExcluded(config: A11yConfig, filePath: string): boolean {
  if (!config.aiExclude || config.aiExclude.length === 0) {
    return false;
  }
  const normalized = filePath.replace(/\\/g, '/');
  return config.aiExclude.some(pattern => {
    const regex = globToRegex(pattern);
    return regex.test(normalized);
  });
}

/**
 * Convert a glob pattern to a RegExp.
 * Handles **, *, ?, and escapes regex-special chars.
 */
function globToRegex(pattern: string): RegExp {
  const parts = pattern.split('**');
  const regexParts = parts.map(part => {
    return part
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
  });
  const joined = regexParts.join('.*');
  return new RegExp(`^${joined}$`);
}
