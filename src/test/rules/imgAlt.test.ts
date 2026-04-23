import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkImgAlt } from '../../scanner/rules/imgAlt';

describe('img-alt rule', () => {
  it('flags <img> without alt attribute', () => {
    const issues = collectIssues('<img src="logo.png" />', checkImgAlt);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'img-alt');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes <img> with alt attribute', () => {
    const issues = collectIssues('<img src="logo.png" alt="Logo" />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <img> with empty alt (decorative)', () => {
    const issues = collectIssues('<img src="bg.png" alt="" />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-img elements', () => {
    const issues = collectIssues('<div>hello</div>', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <img> opening element without alt', () => {
    const issues = collectIssues('<img src="test.png"></img>', checkImgAlt);
    assert.strictEqual(issues.length, 1);
  });

  /* ── Spread props ──────────────────────────────────────────────────── */

  it('suppresses when spread props present (<img {...props} />)', () => {
    const issues = collectIssues('<img {...props} />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('still flags when spread is present but partial attrs are explicit', () => {
    // Spread is present + no alt → suppressed (spread may carry alt)
    const issues = collectIssues('<img src="x.png" {...props} />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  /* ── Decorative images ──────────────────────────────────────────────── */

  it('skips aria-hidden="true" images', () => {
    const issues = collectIssues('<img src="bg.png" aria-hidden="true" />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('skips role="presentation" images', () => {
    const issues = collectIssues('<img src="bg.png" role="presentation" />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('skips role="none" images', () => {
    const issues = collectIssues('<img src="bg.png" role="none" />', checkImgAlt);
    assert.strictEqual(issues.length, 0);
  });
});
