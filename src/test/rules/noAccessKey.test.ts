import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoAccessKey } from '../../scanner/rules/noAccessKey';

describe('no-access-key rule', () => {
  it('flags accessKey on button', () => {
    const issues = collectIssues('<button accessKey="s">Save</button>', checkNoAccessKey);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-access-key');
    assert.ok(issues[0].message.includes('accessKey'));
  });

  it('flags accessKey on anchor', () => {
    const issues = collectIssues('<a href="/home" accessKey="h">Home</a>', checkNoAccessKey);
    assert.strictEqual(issues.length, 1);
  });

  it('flags accessKey on input', () => {
    const issues = collectIssues('<input accessKey="n" />', checkNoAccessKey);
    assert.strictEqual(issues.length, 1);
  });

  it('passes elements without accessKey', () => {
    const issues = collectIssues('<button>Save</button>', checkNoAccessKey);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without any attributes', () => {
    const issues = collectIssues('<div>hello</div>', checkNoAccessKey);
    assert.strictEqual(issues.length, 0);
  });
});
