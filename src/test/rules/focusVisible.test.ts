import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkFocusVisible } from '../../scanner/rules/focusVisible';

describe('focus-visible rule', () => {
  it('flags style={{ outline: "none" }}', () => {
    const issues = collectIssues('<button style={{ outline: "none" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'focus-visible');
  });

  it('flags style={{ outline: "0" }}', () => {
    const issues = collectIssues('<button style={{ outline: "0" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('flags style={{ outline: 0 }}', () => {
    const issues = collectIssues('<button style={{ outline: 0 }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('passes outline: none with boxShadow replacement', () => {
    const issues = collectIssues('<button style={{ outline: "none", boxShadow: "0 0 0 2px blue" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('passes outline: none with borderColor replacement', () => {
    const issues = collectIssues('<button style={{ outline: "none", borderColor: "blue" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without outline suppression', () => {
    const issues = collectIssues('<button style={{ color: "red" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without style prop', () => {
    const issues = collectIssues('<button>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('flags style={{ outline: "transparent" }}', () => {
    const issues = collectIssues('<button style={{ outline: "transparent" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'focus-visible');
  });

  it('flags style={{ outlineWidth: 0 }}', () => {
    const issues = collectIssues('<button style={{ outlineWidth: 0 }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('flags style={{ outlineWidth: "0px" }}', () => {
    const issues = collectIssues('<button style={{ outlineWidth: "0px" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('flags style={{ outlineStyle: "none" }}', () => {
    const issues = collectIssues('<button style={{ outlineStyle: "none" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('passes outlineWidth: 0 with boxShadow replacement', () => {
    const issues = collectIssues('<button style={{ outlineWidth: 0, boxShadow: "0 0 0 2px blue" }}>click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  /* ── Tailwind / className-based checks ─────────────────────────────── */

  it('flags className="outline-none" without alternative', () => {
    const issues = collectIssues('<button className="outline-none">click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'focus-visible');
    assert.ok(issues[0].message.includes('outline-none'));
  });

  it('flags className="outline-0" without alternative', () => {
    const issues = collectIssues('<div className="outline-0">text</div>', checkFocusVisible);
    assert.strictEqual(issues.length, 1);
  });

  it('passes outline-none with ring-* alternative', () => {
    const issues = collectIssues('<button className="outline-none ring-2 ring-blue-500">click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('passes outline-none with shadow-* alternative', () => {
    const issues = collectIssues('<button className="outline-none shadow-md">click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('passes outline-none with border-* alternative', () => {
    const issues = collectIssues('<button className="outline-none border-blue-500">click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores className without outline removal', () => {
    const issues = collectIssues('<button className="bg-blue-500 text-white">click</button>', checkFocusVisible);
    assert.strictEqual(issues.length, 0);
  });
});
