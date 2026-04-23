import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkColorContrast } from '../../scanner/rules/colorContrast';

describe('color-contrast rule', () => {
  it('flags low contrast (white on white)', () => {
    const code = '<span style={{ color: "white", backgroundColor: "#ffffff" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'color-contrast');
    assert.strictEqual(issues[0].severity, 'error'); // ratio ~1:1 < 3
  });

  it('flags medium-low contrast as warning (ratio between 3 and 4.5)', () => {
    // gray (#808080) on white (#ffffff) ≈ 4.0:1 — below 4.5 but above 3
    const code = '<span style={{ color: "gray", backgroundColor: "white" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes high contrast (black on white)', () => {
    const code = '<span style={{ color: "black", backgroundColor: "white" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('handles hex colors', () => {
    const code = '<span style={{ color: "#000000", backgroundColor: "#ffffff" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('handles short hex colors', () => {
    const code = '<span style={{ color: "#000", backgroundColor: "#fff" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('handles rgb() colors', () => {
    const code = '<span style={{ color: "rgb(0,0,0)", backgroundColor: "rgb(255,255,255)" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('skips when only foreground color is specified', () => {
    const code = '<span style={{ color: "red" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('skips when only background color is specified', () => {
    const code = '<span style={{ backgroundColor: "blue" }}>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('skips elements without style attribute', () => {
    const code = '<span>text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('handles named colors', () => {
    // red (#ff0000) on white (#ffffff) ≈ 4.0:1
    const code = '<div style={{ color: "red", backgroundColor: "white" }}>text</div>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  /* ── Tailwind / class-based styling ──────────────────────────────────── */

  it('flags low contrast via Tailwind classes (text-white bg-white)', () => {
    const code = '<span className="text-white bg-white">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'color-contrast');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes high contrast via Tailwind classes (text-white bg-black)', () => {
    const code = '<span className="text-white bg-black">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('flags low contrast with Tailwind shade classes', () => {
    // yellow-200 (#fef08a) on white (#ffffff) — very low contrast
    const code = '<p className="text-yellow-200 bg-white">text</p>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
  });

  it('passes with high-contrast Tailwind shade classes', () => {
    // blue-900 (#1e3a8a) on white (#ffffff) — high contrast
    const code = '<p className="text-blue-900 bg-white">text</p>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('handles Tailwind arbitrary value text-[#hex] and bg-[#hex]', () => {
    const code = '<span className="text-[#ffffff] bg-[#ffffff]">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('skips when only Tailwind fg is specified', () => {
    const code = '<span className="text-red-500">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('skips when only Tailwind bg is specified', () => {
    const code = '<span className="bg-blue-500">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('prefers inline style over className when both exist', () => {
    // Inline: black on white (passes). Class: white on white (would fail).
    // Inline takes priority so no issue reported.
    const code = '<span style={{ color: "black", backgroundColor: "white" }} className="text-white bg-white">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('merges inline fg with Tailwind bg', () => {
    // inline color white + Tailwind bg-white => 1:1 contrast
    const code = '<span style={{ color: "white" }} className="bg-white">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
  });

  it('handles class attribute (not just className)', () => {
    const code = '<span class="text-white bg-black">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 0);
  });

  it('includes "(via class utilities)" in message for class-based issues', () => {
    const code = '<span className="text-white bg-white">text</span>';
    const issues = collectIssues(code, checkColorContrast);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('via class utilities'));
  });
});
