import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkPageTitle } from '../../scanner/rules/pageTitle';

describe('page-title rule', () => {
  it('flags <Head> without <title>', () => {
    const issues = collectIssues('<Head><meta charSet="utf-8" /></Head>', checkPageTitle);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'page-title');
  });

  it('passes <Head> with <title>', () => {
    const issues = collectIssues('<Head><title>My Page</title></Head>', checkPageTitle);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <head> (lowercase) without <title>', () => {
    const issues = collectIssues('<head><meta charSet="utf-8" /></head>', checkPageTitle);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <head> with <title>', () => {
    const issues = collectIssues('<head><title>My Page</title></head>', checkPageTitle);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-Head elements', () => {
    const issues = collectIssues('<div><span>hi</span></div>', checkPageTitle);
    assert.strictEqual(issues.length, 0);
  });
});
