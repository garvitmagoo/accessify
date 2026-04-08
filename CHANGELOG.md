# Changelog

## [1.0.0] - 2026-04-08

### Added

- **Click-to-navigate** in Accessibility Report — clicking an issue row opens the file at that line
- **WCAG-principled workspace score** — score now factors in WCAG conformance level (A/AA/AAA), severity, and principle breadth
- **Smart test merge** — "Generate Tests" detects existing test files and offers Merge (append new) or Overwrite
- **Active document fallback** — all commands resolve the right file even when a webview panel has focus
- **Webview auto-refresh** — Report and Screen Reader panels refresh after applying static or AI fixes
- **axe-core test generation** — generated tests import `jest-axe` directly with functional assertions
- **Color contrast test** — uses `axe(container, { runOnly: ['color-contrast'] })` instead of `it.todo`
- **`prefer-semantic-elements` rule** — flags `<div>`/`<span>` with ARIA roles that have native HTML equivalents (e.g. `<div role="navigation">` → `<nav>`)
- **`no-noninteractive-element-interactions` rule** — flags non-interactive elements with event handlers that should use `<button>` or similar

### Changed

- Removed all inline comments from generated test files for cleaner output
- Generated tests open in the same editor column as the source file
- `no-redundant-roles` test now checks 6 implicit role mappings

### Removed

- **Scan Workspace command** — redundant with the Accessibility Report (which covers both file and workspace scanning)

### Security

- **Command allowlist** — webview panels only execute commands from a known set
- **Script injection fix** — JSON embedded in `<script>` blocks is now escaped against `</script>` breakout
- **URI validation** — webview file-open handlers verify workspace containment
- **Path traversal fix** — PR review panel rejects `../` sequences in file paths
- **Single-quote escaping** — `escapeHtml()` now escapes `'` to `&#x27;`

## [0.4.0] - 2026-04-07

### Added

- **6 new rules** (22 total): `anchor-is-valid` (2.4.4), `no-redundant-roles`, `no-autofocus` (3.2.1), `interactive-supports-focus` (2.1.1), `media-has-caption` (1.2.2), `no-access-key`
- **AI fix caching** — Both single-fix and full-file AI results are cached in-memory with 10 min TTL; caches are cleared when AI provider/model settings change
- **Claude (Anthropic) support** — Added as a third AI provider option alongside OpenAI and Azure OpenAI
- **Static Fix Workspace** command — Apply static fixes across the entire workspace

### Changed

- **Modular architecture** — Extracted shared modules: `ai/caller.ts` (shared AI API caller), `jsx/utils.ts` (pure JSX string manipulation), `scanner/jsxValidator.ts` (JSX syntax validation), `scanner/rules/altCheck.ts` (alt-check rule factory)
- Deduplicated ~750 lines of code across AI callers, JSX utilities, and alt-check rules
- `img-alt` and `nextjs-image-alt` rules now use a shared factory (`createAltChecker`)
- Confidence scoring wired end-to-end: static fixes use `getStaticFixRisk().confidence`, AI fixes use `validateFix().adjustedConfidence`

## [0.3.0] - 2026-04-02

### Added

- **Confidence & Reasoning for all fixes** — Every fix (AI and static) now shows a confidence score (0–100%), color-coded risk badge (green/orange/red), detailed reasoning, and caveats
- **axe-core integration** — Fixes are cross-validated against axe-core rule metadata; impact levels, WCAG tags, and documentation links are displayed in fix previews
- **Voice simulation** in Screen Reader Preview — Play All, per-row Play, Stop controls, voice selector, and speed slider using Web Speech API
- **Bulk AI Fix Workspace** (`a11y.bulkAiFix`) — AI-generate fixes for all files across the workspace; each file is scanned first and skipped if clean
- **Static Fix Current File** (`a11y.bulkFixFile`) — Preview and apply all deterministic fixes for the active file with the risk-aware preview panel
- **Per-rule static fix risk profiles** — Each rule has a calibrated confidence score (45–95%) with specific caveats (e.g., empty `aria-label` placeholder vs. deterministic `lang="en"`)
- **Risk-aware Bulk Fix Preview Panel** — Risk summary banner, confidence distribution chart, "Select Safe Only" button, low-confidence fixes start unchecked, modal confirmation before applying risky changes

### Changed

- Quick fix action titles now show confidence percentage (e.g., `[95%] Add lang="en"`)
- AI fix diff preview now shows confidence badge, reasoning, and axe-core metadata per change
- Publisher updated from `lockton` to `garvit-magoo`

### Fixed

- Screen Reader Preview "No active file" when clicking Play All (webview was stealing focus from text editor)

### Removed

- **Bulk Fix Entire Workspace** (static) — Replaced by the safer per-file static fix and workspace-wide AI bulk fix

## [0.2.0] - 2026-03-20

### Added

- **5 new WCAG 2.1 rules**: `autocomplete-valid` (1.3.5), `no-positive-tabindex` (2.4.3), `focus-visible` (2.4.7), `page-title` (2.4.2), `no-mouse-only-hover` (1.4.13)
- **Keyboard shortcuts**: `Ctrl+Alt+A` (scan file), `Ctrl+Alt+R` (report), `Ctrl+Alt+F` (bulk fix), `Ctrl+Alt+Shift+A` (scan workspace)
- **Workspace scan progress** with file-by-file progress indicator and cancellation support
- **Detailed skip reporting** for bulk fix — skipped changes logged to Output channel with file, line, and rule
- **Status bar severity breakdown** — tooltip now shows error/warning/info counts

### Improved

- Screen reader preview panel now debounces on text changes (500ms) to prevent typing lag
- Bulk fix in file goes directly to preview panel (no intermediate dropdown)
- Git comparison is now cancellable with 10s timeout per file to prevent hangs

## [0.1.0] - 2025-01-01

### Added

- **AST-based accessibility scanning** for React/JSX/TSX files
- **8 built-in rules**: img-alt, button-label, aria-role, form-label, click-key-events, aria-pattern, color-contrast, heading-order
- **AI-powered fix suggestions** via OpenAI or Azure OpenAI
- **Screen reader text preview** with simulated announcements
- **Accessibility score** in the status bar (0–100)
- **Auto-generate accessibility tests** from detected issues
- **Git regression tracking** — compare accessibility between commits
- **CI/CD export** — SARIF and JSON report formats
- **Real-time scanning** with debounced diagnostics on file change
- **Quick fixes** for every rule via VS Code Code Actions
- **Configuration** support via `.a11yrc.json` (enable/disable rules, exclude files)
- **Secure API key storage** using VS Code SecretStorage
- **Webview report panel** with issue visualization
