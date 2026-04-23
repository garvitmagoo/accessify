# Contributing to Accessify

Thank you for your interest in contributing! We welcome bug reports, feature requests, and pull requests.

## Code of Conduct

Be respectful and inclusive. We're all here to make accessibility better. 🤝

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/garvitmagoo/accessify.git
cd accessify
npm install
```

### 2. Setup Development Environment

```bash
# Install dependencies
npm install

# Start watch mode
npm run watch

# Run tests in watch mode
npm test

# Run integration tests
npm test:integration
```

### 3. Open in VS Code

```bash
code .
```

Press `F5` to launch the extension in a new VS Code window for testing.

## Development Workflow

### Adding a New Rule

1. **Create the rule file**
   ```bash
   touch src/scanner/rules/yourRuleName.ts
   ```

2. **Implement the rule**
   ```typescript
   import { Diagnostic, Range, DiagnosticSeverity } from 'vscode';
   import { Node } from 'estree-jsx';

   export function checkYourRule(node: Node, uri: string, source: string): Diagnostic[] {
     const diagnostics: Diagnostic[] = [];
     
     // Your rule logic here
     
     return diagnostics;
   }
   ```

3. **Add tests**
   ```bash
   touch src/test/rules/yourRuleName.test.ts
   ```

4. **Update README.md**
   - Add row to rules table
   - Update feature list if applicable

5. **Update scanner/astScanner.ts**
   - Import and call your rule in the main scanner

### Example: Adding Image Alt Text Rule

```typescript
// src/scanner/rules/imgAlt.ts
import { Diagnostic, Range, DiagnosticSeverity } from 'vscode';
import { Node } from 'estree-jsx';

export function checkImgAlt(node: Node, uri: string, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (node.type === 'JSXOpeningElement' && node.name?.name === 'img') {
    const altAttr = node.attributes?.find(attr => attr.name?.name === 'alt');
    
    if (!altAttr) {
      const range = new Range(
        { line: node.loc!.start.line - 1, character: node.loc!.start.column },
        { line: node.loc!.end.line - 1, character: node.loc!.end.column }
      );

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'Image must have an alt attribute (WCAG 1.1.1)',
        code: 'img-alt',
      });
    }
  }

  return diagnostics;
}
```

## Making Changes

### Before Submitting

1. **Code quality**
   ```bash
   npm run lint
   npm run check-types
   ```

2. **Tests**
   ```bash
   npm test
   npm test:integration
   ```

3. **Build**
   ```bash
   npm run package
   ```

4. **Manual testing**
   - Open test files in VS Code debug window
   - Verify diagnostics appear
   - Test quick fixes
   - Test AI features if applicable

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add aria-pattern rule for ARIA widget validation

- Validates WAI-ARIA pattern structure
- Covers tabs, disclosure, navigation patterns
- Includes 8 new test cases
- Fixes #123
```

Format: `<type>: <description>`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/your-feature`
3. **Make** your changes
4. **Test** thoroughly
5. **Commit** with clear messages
6. **Push** to your fork
7. **Create** a Pull Request with:
   - Clear description of changes
   - Link to related issues
   - Screenshots/GIFs if UI changes
   - Test results

### PR Checklist

- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Commit messages are clear
- [ ] No breaking changes (or justified)

## Testing

### Unit Tests

```bash
npm test
```

Tests use Mocha and should be in `src/test/`.

### Integration Tests

```bash
npm test:integration
```

Tests the full extension lifecycle in VS Code.

### Manual Testing

1. Press `F5` to launch debug extension
2. Open test files: `TestComponent.tsx`, `TestAllRules.tsx`
3. Verify diagnostics appear
4. Test commands via Command Palette
5. Test UI panels (Report, Screen Reader Preview)

## Project Structure

```
src/
├── extension.ts          # Extension entry point
├── diagnostics.ts        # Diagnostic collection
├── codeActions.ts        # Quick fixes & actions
├── config.ts             # Configuration handling
├── scanner/
│   ├── astScanner.ts     # Main AST scanner
│   ├── jsxValidator.ts   # JSX validation
│   └── rules/            # Individual rules
├── ai/
│   ├── provider.ts       # AI provider abstraction
│   ├── caller.ts         # API calls
│   └── fullFileFix.ts    # Full-file fix logic
├── webview/              # UI panels
└── test/                 # Test files
```

## Documentation

- **README.md**: User-facing documentation
- **CODE_REVIEW.md**: Architecture & design decisions
- **PUBLISHING_GUIDE.md**: Release process
- **CHANGELOG.md**: Version history

Please update relevant docs with your changes.

## Reporting Issues

### Bug Reports

Include:
- VS Code version
- Extension version
- File type (TSX, JSX, etc.)
- Minimal reproduction
- Expected vs. actual behavior
- Screenshots if applicable

### Feature Requests

Include:
- Use case / problem it solves
- Proposed solution
- Alternative approaches considered
- Examples from other tools

## Questions?

- 💬 Check [Discussions](../../discussions) for Q&A
- 🐛 Search [Issues](../../issues) before creating new ones
- 📧 Contact maintainers if needed

## Recognition

Contributors will be recognized in:
- CHANGELOG.md
- GitHub contributors page
- Special thanks section (if applicable)

Thank you for making Accessify better! 🙏

