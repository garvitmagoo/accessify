# Accessify — VS Code Extension

[![Version](https://img.shields.io/visual-studio-marketplace/v/garvit-magoo.accessify?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=garvit-magoo.accessify)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/garvit-magoo.accessify)](https://marketplace.visualstudio.com/items?itemName=garvit-magoo.accessify)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-blue.svg)](https://www.w3.org/WAI/WCAG21/quickref/)

AI-powered accessibility scanner for React/JSX/TSX projects. Detects WCAG 2.1 Level AA violations inline, previews screen reader output with voice simulation, generates accessibility tests, and provides intelligent fix suggestions with confidence scoring, AI fix caching, and axe-core validation.

## Why Accessify?

Most accessibility tools only catch issues at runtime in the browser. Accessify shifts accessibility left into your editor:

- **Catch issues before code review** — real-time scanning as you type, not after deployment
- **Understand the impact** — every issue links to WCAG criteria, axe-core docs, and impact levels
- **Fix with confidence** — AI-generated fixes show confidence scores so you know what's safe to apply
- **Hear what users hear** — the screen reader preview lets you experience your UI the way assistive technology users do
- **Zero config** — works out of the box with 24 built-in rules; AI features are optional

## Features

- **Real-time scanning** — Detects accessibility issues as you type with debounced diagnostics
- **24 built-in rules** — Covers WCAG 2.1 Level AA success criteria (see [Rules](#rules))
- **Inline diagnostics** — Issues appear as squiggly underlines in the editor
- **Quick Fixes** — Click the lightbulb to apply fixes instantly with confidence % shown in the action title
- **Static Fix Current File** — Preview and apply all deterministic fixes for the current file with a risk-aware preview panel
- **AI-powered fixes** — Optional OpenAI / Azure OpenAI / Claude integration for context-aware fix suggestions
- **AI Fix Entire File** — Let AI fix all issues in a file at once with a diff preview
- **Bulk AI Fix Workspace** — AI-generate fixes for all files in the workspace (scans each file first, skips clean files)
- **AI Fix Caching** — Both single-fix and full-file AI results are cached in-memory (10 min TTL) to avoid redundant API calls
- **Confidence & Reasoning** — Every fix (static and AI) shows a confidence score (0–100%), color-coded risk level, WCAG references, and caveats
- **axe-core Integration** — Fixes are cross-validated against axe-core rule metadata for impact levels, WCAG tags, and documentation links
- **Screen Reader Preview** — Simulates how a screen reader would announce elements, with voice simulation (Web Speech API), per-row playback, speed control, and voice selection
- **Accessibility Score** — Live score (0–100) in the status bar with severity breakdown
- **Git Regression Tracking** — Compare issues between your working tree and the last commit
- **Test Generation** — Auto-generate accessibility test cases from detected issues
- **CI/CD Export** — Export SARIF (for GitHub Code Scanning) or JSON reports
- **Configurable** — Enable/disable rules, set severity overrides, and exclude files via `.a11yrc.json`

## Rules

| Rule | WCAG | Severity | Description |
|------|------|----------|-------------|
| `img-alt` | 1.1.1 | Error | `<img>` elements must have an `alt` attribute |
| `button-label` | 4.1.2 | Error | Buttons must have accessible names (`aria-label`, text, etc.) |
| `aria-role` | 4.1.2 | Error | ARIA `role` values must be valid WAI-ARIA roles |
| `form-label` | 1.3.1 | Warning | Form inputs must have associated labels |
| `click-events-have-key-events` | 2.1.1 | Warning | Non-interactive elements with `onClick` need keyboard handlers |
| `aria-pattern` | 4.1.2 | Error | ARIA widget patterns must be correctly structured |
| `color-contrast` | 1.4.3 | Warning | Inline styles must meet WCAG AA contrast ratio |
| `heading-order` | 1.3.1 | Warning | Heading levels must follow a logical hierarchy |
| `autocomplete-valid` | 1.3.5 | Warning | Personal data inputs must have valid `autoComplete` |
| `no-positive-tabindex` | 2.4.3 | Warning | Avoid `tabIndex` > 0 (disrupts focus order) |
| `focus-visible` | 2.4.7 | Warning | Don't remove `outline` without a replacement focus style |
| `page-title` | 2.4.2 | Warning | `<Head>` must contain a `<title>` element |
| `no-mouse-only-hover` | 1.4.13 | Warning | Hover content must also be keyboard-accessible |
| `nextjs-head-lang` | 3.1.1 | Error | Next.js `<Html>` must have a `lang` attribute |
| `nextjs-image-alt` | 1.1.1 | Error | Next.js `<Image>` must have an `alt` attribute |
| `nextjs-link-text` | 1.1.1 | Warning | Next.js `<Link>` must have discernible text |
| `anchor-is-valid` | 2.4.4 | Warning | Anchors must have a real destination; avoid `href="#"` or `javascript:` |
| `no-redundant-roles` | Best Practice | Hint | Don't add ARIA roles that duplicate implicit semantics (e.g. `<button role="button">`) |
| `no-autofocus` | 3.2.1 | Warning | `autoFocus` can disorient screen reader users on page load |
| `interactive-supports-focus` | 2.1.1 | Warning | Non-interactive elements with event handlers must be focusable |
| `media-has-caption` | 1.2.2 | Error | `<video>`/`<audio>` must have `<track kind="captions">` |
| `no-access-key` | Best Practice | Warning | `accessKey` conflicts with assistive technology shortcuts |
| `prefer-semantic-elements` | 1.3.1 | Warning | Prefer native semantic HTML (e.g. `<nav>`) over `<div role="navigation">` |
| `no-noninteractive-element-interactions` | 4.1.2 | Warning | Non-interactive elements (`<div>`, `<span>`) should not have event handlers — use `<button>` or similar |

## Getting Started

### Install from Marketplace

Search for **Accessify** in the VS Code Extensions panel, or run:

```bash
code --install-extension garvit-magoo.accessify
```

### Install from VSIX

```bash
code --install-extension accessify-1.0.0.vsix
```

### Usage

1. Open any `.tsx` or `.jsx` file — issues appear inline automatically
2. Hover over a squiggly underline to see the issue detail
3. Click the lightbulb (or press `Ctrl+.`) to see Quick Fix options
4. Use keyboard shortcuts for fast access (see below)

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type `A11y`:

| Command | Description |
|---------|-------------|
| **A11y: Scan Workspace** | Scan all TSX/JSX files across the workspace |
| **A11y: Show Accessibility Report** | Open the visual report panel |
| **A11y: Screen Reader Preview** | Simulate screen reader announcements with voice playback |
| **A11y: Static Fix Current File** | Preview and apply all static fixes for the current file |
| **A11y: AI Fix Entire File** | AI-generated fixes for all issues (requires AI provider) |
| **A11y: Bulk AI Fix Workspace** | AI-fix all files in the workspace (scans first, skips clean files) |
| **A11y: Static Fix Workspace** | Apply static fixes across the entire workspace |
| **A11y: Compare with Last Commit** | Show new/fixed issues vs. the last git commit |
| **A11y: Generate Accessibility Tests** | Auto-generate test cases from detected issues |
| **A11y: Export SARIF Report** | Export for CI/CD (GitHub Code Scanning compatible) |
| **A11y: Export JSON Report** | Export as JSON |
| **A11y: Set AI API Key** | Store your API key securely |

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Alt+R` (`Cmd+Alt+R`) | Show Report |
| `Ctrl+Alt+F` (`Cmd+Alt+F`) | Static Fix Current File |
| `Ctrl+Alt+Shift+A` (`Cmd+Alt+Shift+A`) | Scan Workspace |

## Configuration

### VS Code Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `a11y.scanOnSave` | `true` | Auto-scan on file save |
| `a11y.scanOnOpen` | `true` | Auto-scan when a file is opened |
| `a11y.severity` | `"warning"` | Default diagnostic severity |
| `a11y.aiProvider` | `"none"` | AI provider: `"none"`, `"openai"`, `"azure-openai"`, `"claude"` |
| `a11y.aiEndpoint` | `""` | Azure OpenAI endpoint URL |
| `a11y.aiModel` | `"gpt-4"` | Model/deployment name |
| `a11y.aiBatchConcurrency` | `10` | Files processed in parallel during bulk AI fix (1–10) |

### Enable AI Fixes

1. Run **A11y: Set AI API Key** from the Command Palette to store your key securely
2. Set the provider in VS Code settings:

```json
{
  "a11y.aiProvider": "openai",
  "a11y.aiModel": "gpt-4"
}
```

For Azure OpenAI, also set the endpoint:

```json
{
  "a11y.aiProvider": "azure-openai",
  "a11y.aiEndpoint": "https://your-resource.openai.azure.com",
  "a11y.aiModel": "your-deployment-name"
}
```

For Claude (Anthropic):

```json
{
  "a11y.aiProvider": "claude",
  "a11y.aiModel": "claude-sonnet-4-20250514"
}
```

### Project-Level Config (`.a11yrc.json`)

Create a `.a11yrc.json` in your workspace root to customize rules and exclusions:

```json
{
  "rules": {
    "color-contrast": { "severity": "error" },
    "heading-order": false
  },
  "exclude": [
    "**/test/**",
    "**/storybook/**"
  ]
}
```

## CI/CD Integration

Export a SARIF report and upload it to GitHub Code Scanning:

```yaml
# .github/workflows/a11y.yml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: a11y-report.sarif
```

## Development

```bash
git clone https://github.com/garvit-magoo/a11y-scanner-extension.git
cd a11y-scanner-extension
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

### Run Tests

```bash
npm test
```

### Package

```bash
npm run package
```

## Architecture

```
src/
├── extension.ts          # Extension entry point, command registration
├── diagnostics.ts        # Real-time diagnostic pipeline
├── codeActions.ts        # Quick fixes, static fix, AI fix commands
├── config.ts             # .a11yrc.json loader with caching
├── types.ts              # Shared type definitions
├── ai/
│   ├── caller.ts         # Shared AI API caller (OpenAI, Azure, Claude)
│   ├── provider.ts       # Single-issue AI fix with caching
│   └── fullFileFix.ts    # Full-file AI fix with caching
├── jsx/
│   └── utils.ts          # Pure JSX string manipulation utilities
├── scanner/
│   ├── astScanner.ts     # AST walker, rule orchestration
│   ├── axeIntegration.ts # axe-core metadata, fix validation
│   ├── jsxValidator.ts   # JSX syntax validation
│   └── rules/            # 22 individual rule checkers
└── webview/              # 5 webview panels (report, diff, bulk fix, etc.)
```

## License

[MIT](LICENSE)
