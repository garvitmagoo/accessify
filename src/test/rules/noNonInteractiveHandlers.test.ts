import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoNonInteractiveHandlers } from '../../scanner/rules/noNonInteractiveHandlers';

describe('no-noninteractive-element-interactions rule', () => {
  it('flags <div onClick={fn}>', () => {
    const issues = collectIssues('<div onClick={handleClick}>Click</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-noninteractive-element-interactions');
    assert.ok(issues[0].message.includes('not an interactive element'));
  });

  it('flags <span onClick={fn}>', () => {
    const issues = collectIssues('<span onClick={handleClick}>Click</span>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <div onKeyDown={fn}>', () => {
    const issues = collectIssues('<div onKeyDown={handleKey}>Info</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <p onClick={fn}>', () => {
    const issues = collectIssues('<p onClick={handleClick}>Text</p>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
  });

  it('passes for <button onClick={fn}>', () => {
    const issues = collectIssues('<button onClick={handleClick}>Click</button>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('passes for <a onClick={fn}>', () => {
    const issues = collectIssues('<a onClick={handleClick}>Link</a>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('passes for <input onKeyDown={fn} />', () => {
    const issues = collectIssues('<input onKeyDown={handleKey} />', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('passes when div has role="button"', () => {
    const issues = collectIssues('<div role="button" onClick={handleClick}>Click</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('passes when div has role="link"', () => {
    const issues = collectIssues('<div role="link" onClick={handleClick}>Go</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('flags when div has non-interactive role', () => {
    const issues = collectIssues('<div role="banner" onClick={handleClick}>Header</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
  });

  it('passes for div without event handlers', () => {
    const issues = collectIssues('<div>Content</div>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores React components (PascalCase)', () => {
    const issues = collectIssues('<Card onClick={handleClick}>Content</Card>', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <div onClick={fn} />', () => {
    const issues = collectIssues('<div onClick={handleClick} />', checkNoNonInteractiveHandlers);
    assert.strictEqual(issues.length, 1);
  });
});
