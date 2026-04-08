import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkPreferSemanticElements } from '../../scanner/rules/preferSemanticElements';

describe('prefer-semantic-elements rule', () => {
  it('flags <div role="navigation">', () => {
    const issues = collectIssues('<div role="navigation">Nav</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'prefer-semantic-elements');
    assert.ok(issues[0].message.includes('<nav>'));
  });

  it('flags <div role="banner">', () => {
    const issues = collectIssues('<div role="banner">Header</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<header>'));
  });

  it('flags <div role="main">', () => {
    const issues = collectIssues('<div role="main">Content</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<main>'));
  });

  it('flags <div role="contentinfo">', () => {
    const issues = collectIssues('<div role="contentinfo">Footer</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<footer>'));
  });

  it('flags <div role="complementary">', () => {
    const issues = collectIssues('<div role="complementary">Aside</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<aside>'));
  });

  it('flags <span role="button">', () => {
    const issues = collectIssues('<span role="button">Click</span>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<button>'));
  });

  it('flags <div role="link">', () => {
    const issues = collectIssues('<div role="link">Go</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<a>'));
  });

  it('flags <div role="region">', () => {
    const issues = collectIssues('<div role="region">Content</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<section>'));
  });

  it('passes when div has no role', () => {
    const issues = collectIssues('<div>Content</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 0);
  });

  it('passes when role has no semantic equivalent', () => {
    const issues = collectIssues('<div role="alert">Error</div>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 0);
  });

  it('passes for native semantic elements (not div/span)', () => {
    const issues = collectIssues('<nav role="navigation">Nav</nav>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores React components (PascalCase)', () => {
    const issues = collectIssues('<Box role="navigation">Nav</Box>', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <div role="img" />', () => {
    const issues = collectIssues('<div role="img" />', checkPreferSemanticElements);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('<img>'));
  });
});
