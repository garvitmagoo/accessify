import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkAriaRole } from '../../scanner/rules/ariaRole';

describe('aria-role rule', () => {
  it('flags invalid ARIA role', () => {
    const issues = collectIssues('<div role="banana">hello</div>', checkAriaRole);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'aria-role');
    assert.strictEqual(issues[0].severity, 'error');
    assert.ok(issues[0].message.includes('banana'));
  });

  it('passes valid ARIA role "button"', () => {
    const issues = collectIssues('<div role="button">Click me</div>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });

  it('passes valid ARIA role "navigation"', () => {
    const issues = collectIssues('<nav role="navigation">Nav</nav>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });

  it('passes valid ARIA role "dialog"', () => {
    const issues = collectIssues('<div role="dialog" aria-label="Settings">Content</div>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });

  it('passes valid ARIA role "tablist"', () => {
    const issues = collectIssues('<div role="tablist">tabs</div>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without role attribute', () => {
    const issues = collectIssues('<div>hello</div>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });

  it('handles self-closing element with invalid role', () => {
    const issues = collectIssues('<span role="invalid" />', checkAriaRole);
    assert.strictEqual(issues.length, 1);
  });

  it('is case-insensitive for role values', () => {
    const issues = collectIssues('<div role="BUTTON">ok</div>', checkAriaRole);
    assert.strictEqual(issues.length, 0);
  });
});
