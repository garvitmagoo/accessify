import * as assert from 'assert';
import { validateJsxSyntax } from '../scanner/jsxValidator';
import { validateFix } from '../scanner/axeIntegration';

describe('validateJsxSyntax', () => {
  it('accepts valid self-closing JSX', () => {
    const result = validateJsxSyntax('<img alt="photo" />');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('accepts valid opening+closing JSX', () => {
    const result = validateJsxSyntax('<button aria-label="Save">Save</button>');
    assert.strictEqual(result.valid, true);
  });

  it('accepts multiline JSX with template literal attribute', () => {
    const result = validateJsxSyntax('<Link\n  aria-label={`Breadcrumb ${index + 1}`}\n  crumb\n  key={index}\n/>');
    assert.strictEqual(result.valid, true);
  });

  it('rejects unclosed brace in attribute', () => {
    const result = validateJsxSyntax('<div aria-label={value>test</div>');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rejects unclosed string literal', () => {
    const result = validateJsxSyntax('<img alt="photo />');
    assert.strictEqual(result.valid, false);
  });

  it('rejects orphaned attribute value on new line', () => {
    const code = '<Link\n  aria-label=\n  crumb\n/>';
    const result = validateJsxSyntax(code);
    assert.strictEqual(result.valid, false);
  });

  it('accepts nested JSX expressions', () => {
    const result = validateJsxSyntax('<div style={{ color: "red", fontSize: 14 }} />');
    assert.strictEqual(result.valid, true);
  });

  it('accepts JSX with children and expressions', () => {
    const result = validateJsxSyntax('<span>{`Hello ${name}`}</span>');
    assert.strictEqual(result.valid, true);
  });

  it('rejects unbalanced closing brace', () => {
    const result = validateJsxSyntax('<div aria-label={value}} />');
    assert.strictEqual(result.valid, false);
  });
});

describe('validateFix – syntax checks in confidence scoring', () => {
  it('penalizes confidence for broken JSX replacement', () => {
    const result = validateFix('img-alt', '<img />', '<img alt="test />');
    assert.ok(result.adjustedConfidence < 50, 'Should heavily penalize broken JSX');
    assert.ok(result.notes.some(n => n.includes('syntax') || n.includes('Unclosed')), 'Should note syntax error');
  });

  it('does not penalize confidence for valid JSX replacement', () => {
    const result = validateFix('img-alt', '<img />', '<img alt="photo" />');
    assert.ok(result.adjustedConfidence >= 50, 'Valid fix should have decent confidence');
    assert.ok(result.notes.some(n => n.includes('alt attribute added')));
  });

  it('gives zero confidence for identical replacement', () => {
    const result = validateFix('img-alt', '<img />', '<img />');
    assert.strictEqual(result.adjustedConfidence, 0);
  });

  it('detects when fix splits attribute across lines', () => {
    const brokenFix = '<Link\n  aria-label=\n  crumb\n  label\n/>';
    const result = validateFix('nextjs-link-text', '<Link />', brokenFix);
    assert.ok(result.adjustedConfidence < 50, 'Should catch split attribute');
  });
});
