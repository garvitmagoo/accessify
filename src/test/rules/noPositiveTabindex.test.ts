import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoPositiveTabindex } from '../../scanner/rules/noPositiveTabindex';

describe('no-positive-tabindex rule', () => {
  it('flags tabIndex={5}', () => {
    const issues = collectIssues('<div tabIndex={5}>test</div>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-positive-tabindex');
    assert.ok(issues[0].message.includes('tabIndex={5}'));
  });

  it('flags tabIndex={1}', () => {
    const issues = collectIssues('<button tabIndex={1}>click</button>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 1);
  });

  it('passes tabIndex={0}', () => {
    const issues = collectIssues('<div tabIndex={0}>test</div>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 0);
  });

  it('passes tabIndex={-1}', () => {
    const issues = collectIssues('<div tabIndex={-1}>test</div>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without tabIndex', () => {
    const issues = collectIssues('<div>test</div>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 0);
  });

  it('flags string tabIndex="3"', () => {
    const issues = collectIssues('<div tabIndex="3">test</div>', checkNoPositiveTabindex);
    assert.strictEqual(issues.length, 1);
  });
});
