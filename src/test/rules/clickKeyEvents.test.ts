import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkClickKeyEvents } from '../../scanner/rules/clickKeyEvents';

describe('click-events-have-key-events rule', () => {
  it('flags <div onClick> without keyboard handler', () => {
    const issues = collectIssues('<div onClick={handleClick}>click me</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'click-events-have-key-events');
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes <div onClick onKeyDown>', () => {
    const issues = collectIssues('<div onClick={handleClick} onKeyDown={handleKey}>ok</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <div onClick onKeyUp>', () => {
    const issues = collectIssues('<div onClick={handleClick} onKeyUp={handleKey}>ok</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <div onClick onKeyPress>', () => {
    const issues = collectIssues('<div onClick={handleClick} onKeyPress={handleKey}>ok</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores native <button> with onClick (interactive element)', () => {
    const issues = collectIssues('<button onClick={handleClick}>ok</button>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores <a> with onClick (interactive element)', () => {
    const issues = collectIssues('<a onClick={handleClick}>link</a>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores <input> with onClick (interactive element)', () => {
    const issues = collectIssues('<input onClick={handleClick} />', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores PascalCase React components', () => {
    const issues = collectIssues('<MyComponent onClick={handleClick} />', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <span onClick />', () => {
    const issues = collectIssues('<span onClick={handleClick} />', checkClickKeyEvents);
    assert.strictEqual(issues.length, 1);
  });

  it('does not flag elements without onClick', () => {
    const issues = collectIssues('<div>hello</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('suggests role and tabIndex when missing', () => {
    const issues = collectIssues('<div onClick={handleClick}>click</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('role'));
    assert.ok(issues[0].message.includes('tabIndex'));
  });

  /* ── Spread props ──────────────────────────────────────────────────── */

  it('suppresses when spread props present', () => {
    const issues = collectIssues('<div {...handlers} onClick={handleClick}>click</div>', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses self-closing with spread props', () => {
    const issues = collectIssues('<span {...props} />', checkClickKeyEvents);
    assert.strictEqual(issues.length, 0);
  });
});
