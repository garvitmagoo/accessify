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
});
