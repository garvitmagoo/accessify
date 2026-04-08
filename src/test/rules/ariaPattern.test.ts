import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkAriaPattern } from '../../scanner/rules/ariaPattern';

describe('aria-pattern rule', () => {
  it('flags dialog without aria-label or aria-labelledby', () => {
    const issues = collectIssues('<div role="dialog">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'aria-pattern');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes dialog with aria-label', () => {
    const issues = collectIssues('<div role="dialog" aria-label="Settings">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('passes dialog with aria-labelledby', () => {
    const issues = collectIssues('<div role="dialog" aria-labelledby="title">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('flags alertdialog without label', () => {
    const issues = collectIssues('<div role="alertdialog">warning</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('flags dialog with empty aria-label', () => {
    const issues = collectIssues('<div role="dialog" aria-label="">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
    assert.ok(issues[0].message.includes('empty'));
  });

  it('flags dialog with empty aria-labelledby', () => {
    const issues = collectIssues('<div role="dialog" aria-labelledby="">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('flags tabpanel with empty aria-label', () => {
    const issues = collectIssues('<div role="tabpanel" aria-label="">content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('flags tab without aria-controls or aria-selected', () => {
    const issues = collectIssues('<div role="tab">Tab 1</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes tab with aria-controls', () => {
    const issues = collectIssues('<div role="tab" aria-controls="panel-1">Tab 1</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('passes tab with aria-selected', () => {
    const issues = collectIssues('<div role="tab" aria-selected={true}>Tab 1</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('flags tabpanel without aria-labelledby or aria-label', () => {
    const issues = collectIssues('<div role="tabpanel">Content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes tabpanel with aria-labelledby', () => {
    const issues = collectIssues('<div role="tabpanel" aria-labelledby="tab-1">Content</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('flags combobox without aria-expanded', () => {
    const issues = collectIssues('<div role="combobox">Pick one</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes combobox with aria-expanded', () => {
    const issues = collectIssues('<div role="combobox" aria-expanded={false}>Pick</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });

  it('flags tablist without tab children', () => {
    const code = '<div role="tablist"><div>Not a tab</div></div>';
    const issues = collectIssues(code, checkAriaPattern);
    assert.ok(issues.some((i: { message: string }) => i.message.includes('tablist') && i.message.includes('tab')));
  });

  it('passes tablist with tab children', () => {
    const code = '<div role="tablist"><div role="tab" aria-selected={true}>Tab 1</div></div>';
    const issues = collectIssues(code, checkAriaPattern);
    // Should not flag tablist (tab might still need aria-controls, but that's separate)
    const tablistIssues = issues.filter((i: { message: string }) => i.message.includes('tablist'));
    assert.strictEqual(tablistIssues.length, 0);
  });

  it('ignores elements without role', () => {
    const issues = collectIssues('<div>hello</div>', checkAriaPattern);
    assert.strictEqual(issues.length, 0);
  });
});
