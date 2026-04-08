import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNextjsLink } from '../../scanner/rules/nextjsLink';

describe('nextjs-link-text rule', () => {
  it('flags self-closing <Link /> without aria-label', () => {
    const issues = collectIssues('<Link href="/home" />', checkNextjsLink);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'nextjs-link-text');
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes self-closing <Link /> with aria-label', () => {
    const issues = collectIssues('<Link href="/home" aria-label="Home page" />', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('passes self-closing <Link /> with title', () => {
    const issues = collectIssues('<Link href="/home" title="Home" />', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <Link> with text content', () => {
    const issues = collectIssues('<Link href="/home">Home</Link>', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <Link> wrapping only an icon without aria-label', () => {
    const issues = collectIssues('<Link href="/home"><Icon /></Link>', checkNextjsLink);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <Link> wrapping icon with aria-label', () => {
    const issues = collectIssues('<Link href="/home" aria-label="Home"><Icon /></Link>', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <Link> with string expression child', () => {
    const issues = collectIssues('<Link href="/home">{"Home"}</Link>', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-Link elements', () => {
    const issues = collectIssues('<a href="/home">link</a>', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <Link> with aria-labelledby', () => {
    const issues = collectIssues('<Link href="/home" aria-labelledby="nav-label" />', checkNextjsLink);
    assert.strictEqual(issues.length, 0);
  });
});
