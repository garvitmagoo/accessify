import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkAnchorIsValid } from '../../scanner/rules/anchorIsValid';

describe('anchor-is-valid rule', () => {
  it('flags <a href="#">', () => {
    const issues = collectIssues('<a href="#">Click here</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'anchor-is-valid');
    assert.ok(issues[0].message.includes('href="#"'));
  });

  it('flags <a href="javascript:void(0)">', () => {
    const issues = collectIssues('<a href="javascript:void(0)">Click</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <a href="javascript:;">', () => {
    const issues = collectIssues('<a href="javascript:;">Click</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <a> without href', () => {
    const issues = collectIssues('<a>Click here</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('missing'));
  });

  it('passes <a href="/about">', () => {
    const issues = collectIssues('<a href="/about">About</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <a href="https://example.com">', () => {
    const issues = collectIssues('<a href="https://example.com">Example</a>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-anchor elements', () => {
    const issues = collectIssues('<button>Click</button>', checkAnchorIsValid);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <a href="#" />', () => {
    const issues = collectIssues('<a href="#" />', checkAnchorIsValid);
    assert.strictEqual(issues.length, 1);
  });
});
