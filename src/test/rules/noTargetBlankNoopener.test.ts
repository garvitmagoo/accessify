import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoTargetBlankNoopener } from '../../scanner/rules/noTargetBlankNoopener';

describe('no-target-blank-noopener rule', () => {
  it('flags <a target="_blank"> without rel', () => {
    const issues = collectIssues('<a href="/x" target="_blank">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-target-blank-noopener');
  });

  it('flags target="_blank" with unrelated rel', () => {
    const issues = collectIssues('<a target="_blank" rel="nofollow">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 1);
  });

  it('passes with rel="noopener"', () => {
    const issues = collectIssues('<a target="_blank" rel="noopener">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('passes with rel="noopener noreferrer"', () => {
    const issues = collectIssues('<a target="_blank" rel="noopener noreferrer">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('passes with rel="noreferrer"', () => {
    const issues = collectIssues('<a target="_blank" rel="noreferrer">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores target="_self"', () => {
    const issues = collectIssues('<a target="_self">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores anchors without target', () => {
    const issues = collectIssues('<a href="/x">x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <area target="_blank">', () => {
    const issues = collectIssues('<area target="_blank" />', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 1);
  });

  it('suppresses when spread props present', () => {
    const issues = collectIssues('<a target="_blank" {...props}>x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses when rel is dynamic', () => {
    const issues = collectIssues('<a target="_blank" rel={rel}>x</a>', checkNoTargetBlankNoopener);
    assert.strictEqual(issues.length, 0);
  });
});
