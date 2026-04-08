import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNextjsHeadLang } from '../../scanner/rules/nextjsHeadLang';

describe('nextjs-head-lang rule', () => {
  it('flags <Html> without lang attribute', () => {
    const issues = collectIssues('<Html><Head /><body></body></Html>', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'nextjs-head-lang');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes <Html> with lang attribute', () => {
    const issues = collectIssues('<Html lang="en"><Head /><body></body></Html>', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 0);
  });

  it('flags lowercase <html> without lang', () => {
    const issues = collectIssues('<html><head></head><body></body></html>', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 1);
  });

  it('passes lowercase <html> with lang', () => {
    const issues = collectIssues('<html lang="en"><head></head><body></body></html>', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-html elements', () => {
    const issues = collectIssues('<div>hello</div>', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <Html /> without lang', () => {
    const issues = collectIssues('<Html />', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 1);
  });

  it('passes self-closing <Html /> with lang', () => {
    const issues = collectIssues('<Html lang="fr" />', checkNextjsHeadLang);
    assert.strictEqual(issues.length, 0);
  });
});
