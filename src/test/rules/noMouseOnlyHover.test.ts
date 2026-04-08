import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoMouseOnlyHover } from '../../scanner/rules/noMouseOnlyHover';

describe('no-mouse-only-hover rule', () => {
  it('flags onMouseEnter without onFocus', () => {
    const issues = collectIssues('<div onMouseEnter={() => {}} />', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-mouse-only-hover');
  });

  it('flags onMouseOver without onFocus', () => {
    const issues = collectIssues('<div onMouseOver={() => {}} />', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 1);
  });

  it('passes onMouseEnter with onFocus', () => {
    const issues = collectIssues('<div onMouseEnter={() => {}} onFocus={() => {}} />', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 0);
  });

  it('passes onMouseOver with onFocus', () => {
    const issues = collectIssues('<div onMouseOver={() => {}} onFocus={() => {}} />', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without mouse hover events', () => {
    const issues = collectIssues('<div onClick={() => {}} />', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 0);
  });

  it('flags opening element with onMouseEnter but no onFocus', () => {
    const issues = collectIssues('<div onMouseEnter={() => {}}>tooltip</div>', checkNoMouseOnlyHover);
    assert.strictEqual(issues.length, 1);
  });
});
