# Changelog

## [1.1.0] - 2026-04-22

### Added

- **7 rules re-registered** (24 total): `anchor-is-valid`, `focus-visible`, `label-has-associated-control`, `media-has-caption`, `page-title`, `prefer-semantic-elements`, `skip-link`
- **Activation on TypeScript/JavaScript** — Extension now activates on `typescript` and `javascript` files in addition to `typescriptreact`, `javascriptreact`, and `html`, matching the diagnostic scanner's `SUPPORTED_LANGUAGES`

### Fixed

- **Report panel keyboard accessibility** — Issue rows and collapsible file headers now have `role="button"`, `tabindex="0"`, `aria-label`, `aria-expanded`, `:focus-visible` outlines, and Enter/Space keyboard handlers
- **Screen Reader panel tabs** — Tabs now use `aria-controls`, `aria-labelledby`, roving `tabindex`, and Arrow/Home/End key navigation per WAI-ARIA Tabs pattern
- **Command bar menu** — Menu items now use `role="menuitem"` with roving tabindex; toggle button has `aria-haspopup`/`aria-expanded`; Escape closes menu and returns focus; Arrow Up/Down navigates items
- **Diff/Bulk Fix checkbox labels** — All checkboxes (change, file, folder) now have `<label for=…>` and `aria-label` for screen reader access
- **Severity badge contrast** — `.severity.error` text changed from white to black for ≥ 4.5:1 contrast ratio against the red background
- **scanOnOpen/scanOnSave** — Listeners are now always registered; the config setting is read inside the handler so toggling takes effect immediately without reload
- **Config panel rule list** — All 24 rules now appear in the Settings panel rule toggles (was missing the 7 re-registered rules)

## [1.0.0] - 2026-04-21

### Added

- **HTML file support** — Scans `.html` files in addition to JSX/TSX
- **Visual Settings panel** (`Accessify: Open Settings`) — Configure AI provider, rule toggles, exclude patterns, and performance via a dedicated UI instead of editing JSON
- **Config-aware reports & exports** — Disabled rules and excluded files are now respected in the Accessibility Report and SARIF/JSON exports
- **Tailwind color contrast suggestions** — Color-contrast diagnostics suggest accessible Tailwind replacement classes
- **Merged export command** — Single `Accessify: Export Report` command with SARIF/JSON format picker
- **Claude model auto-detection** — AI model defaults are inferred per-provider when left empty (Claude → claude-sonnet-4-20250514, OpenAI → gpt-4)
- **API retry with backoff** — AI calls retry up to 2 times with exponential backoff (120s timeout), respecting `Retry-After` headers
- **Crash boundary for bulk AI fix** — Individual file failures no longer abort the entire batch

### Changed

- **Status bar click** — Goes directly to file/workspace report picker without component-file dropdown
- **Focused rule set** — Removed 7 flag-only rules that had no auto-fix; every remaining rule has a static or bulk fix (restored in v1.1.0)
- **.a11yrc.json write safety** — All file writes are serialized through a queue to prevent corruption from concurrent toggles
- **Enable/Disable All rules** — Sends a single batch operation instead of 17 individual writes
- **editorUtils** — Tab resolution now includes `.html` files
- Rule count updated to 17 across all documentation and metadata
- VSIX no longer includes source maps (`**/*.map` excluded)

### Removed

- **`anchor-is-valid` rule** — Produced 7500+ false positives on typical codebases (restored in v1.1.0)
- **6 flag-only rules**: `focus-visible`, `page-title`, `media-has-caption`, `prefer-semantic-elements`, `label-has-associated-control`, `skip-link` — these only flagged issues without providing fixes (restored in v1.1.0)

### Fixed

- **"Invalid .a11yrc.json" error** — Race condition when clicking Enable/Disable All in settings panel caused concurrent writes that corrupted the file
- **Reports ignoring config** — Accessibility Report and exports now filter out disabled rules and excluded files

## [Pre-release changes]

### Added

- **3 new rules** (24 total): `svg-has-accessible-name` (1.1.1), `label-has-associated-control` (1.3.1), `skip-link` (2.4.1)
- **Disabled element exemption** — `color-contrast` rule now skips elements with `disabled`, `aria-disabled="true"`, or `aria-disabled={true}` per WCAG 1.4.3
- **Dynamic expression support** — `button-label` and `svg-has-accessible-name` rules now recognize dynamic JSX expressions (e.g., `` aria-label={`More options for ${name}`} ``) as valid labels
- **Duplicate attribute guard** — static fixes no longer insert attributes that already exist on the element
- **Overlapping change detection** — AI fix preview panels detect and skip overlapping line ranges instead of failing the entire batch
- **WCAG metadata** for all rules in axe integration, SARIF export, and report panel

### Changed

- All webview panels now open in the second editor column (`ViewColumn.Two`)
- Static fix placeholders use descriptive TODO text (e.g., `aria-label="TODO: describe action"`) instead of empty strings
- Rule count updated to 24 across all documentation and metadata

### Removed

- **6 low-value rules**: `no-positive-tabindex`, `no-access-key`, `no-redundant-roles`, `no-redundant-alt`, `table-has-header`, `prefers-reduced-motion`
- **PR Review command** (`a11y.reviewPR`) and associated webview panel
- **Compare with Last Commit** command (`a11y.compareWithLastCommit`)
- **Scan Workspace command** — redundant with the Accessibility Report
- Removed stale references to deleted rules from all metadata maps, test generators, and export modules

### Fixed

- **Workspace re-scan not reflecting fixes** — diagnostics are now cleared before re-scanning
- **"Failed to apply changes" error** — overlapping AI fix ranges are detected and skipped
- **False positive on dynamic aria-label** — template literals and JSX expressions no longer flagged as missing

## [Earlier development]

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

## [0.4.0]

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

## [0.3.0]

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

## [0.2.0]

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

## [0.1.0]

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
