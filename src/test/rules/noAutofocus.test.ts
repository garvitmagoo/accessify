import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoAutofocus } from '../../scanner/rules/noAutofocus';

describe('no-autofocus rule', () => {
  it('flags autoFocus on input', () => {
    const issues = collectIssues('<input autoFocus />', checkNoAutofocus);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-autofocus');
    assert.ok(issues[0].message.includes('autoFocus'));
  });

  it('flags autoFocus on button', () => {
    const issues = collectIssues('<button autoFocus>Click</button>', checkNoAutofocus);
    assert.strictEqual(issues.length, 1);
  });

  it('flags autoFocus on textarea', () => {
    const issues = collectIssues('<textarea autoFocus></textarea>', checkNoAutofocus);
    assert.strictEqual(issues.length, 1);
  });

  it('passes input without autoFocus', () => {
    const issues = collectIssues('<input type="text" />', checkNoAutofocus);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without autoFocus', () => {
    const issues = collectIssues('<div>hello</div>', checkNoAutofocus);
    assert.strictEqual(issues.length, 0);
  });
});
