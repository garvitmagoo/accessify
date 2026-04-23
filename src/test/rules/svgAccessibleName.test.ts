import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkSvgAccessibleName } from '../../scanner/rules/svgAccessibleName';

describe('svg-has-accessible-name rule', () => {
  it('flags <svg> without accessible name', () => {
    const code = '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'svg-has-accessible-name');
  });

  it('passes <svg> with aria-label', () => {
    const code = '<svg aria-label="Home icon" viewBox="0 0 24 24"><path d="M10 20v-6h4v6" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <svg> with aria-labelledby', () => {
    const code = '<svg aria-labelledby="icon-title" viewBox="0 0 24 24"><title id="icon-title">Home</title></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <svg> with <title> child', () => {
    const code = '<svg viewBox="0 0 24 24"><title>Home icon</title><path d="M10 20v-6h4v6" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <svg> with empty <title> child', () => {
    const code = '<svg viewBox="0 0 24 24"><title></title><path d="M10 20v-6h4v6" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 1);
  });

  it('skips <svg aria-hidden="true">', () => {
    const code = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 20" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('skips <svg role="presentation">', () => {
    const code = '<svg role="presentation" viewBox="0 0 24 24"><path d="M10 20" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <svg role="img"> without aria-label', () => {
    const code = '<svg role="img" viewBox="0 0 24 24"><path d="M10 20" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
    assert.ok(issues[0].message.includes('role="img"'));
  });

  it('passes <svg role="img" aria-label="...">', () => {
    const code = '<svg role="img" aria-label="Logo" viewBox="0 0 24 24"><path d="M10 20" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses with spread props', () => {
    const code = '<svg {...iconProps} viewBox="0 0 24 24"><path d="M10 20" /></svg>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <svg /> without name', () => {
    const code = '<svg viewBox="0 0 24 24" />';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 1);
  });

  it('ignores non-svg elements', () => {
    const code = '<div>hello</div>';
    const issues = collectIssues(code, checkSvgAccessibleName);
    assert.strictEqual(issues.length, 0);
  });
});
