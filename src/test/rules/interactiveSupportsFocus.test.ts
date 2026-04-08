import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkInteractiveSupportsFocus } from '../../scanner/rules/interactiveSupportsFocus';

describe('interactive-supports-focus rule', () => {
  it('flags <div onClick> without tabIndex', () => {
    const issues = collectIssues('<div onClick={handler}>Click me</div>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'interactive-supports-focus');
    assert.ok(issues[0].message.includes('tabIndex'));
  });

  it('passes <div onClick tabIndex={0}>', () => {
    const issues = collectIssues('<div onClick={handler} tabIndex={0}>Click</div>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores native <button onClick>', () => {
    const issues = collectIssues('<button onClick={handler}>Click</button>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores <a onClick>', () => {
    const issues = collectIssues('<a onClick={handler}>Click</a>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores <input onClick>', () => {
    const issues = collectIssues('<input onClick={handler} />', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores React components (PascalCase)', () => {
    const issues = collectIssues('<Card onClick={handler}>Content</Card>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <span onMouseDown> without tabIndex', () => {
    const issues = collectIssues('<span onMouseDown={handler}>Drag</span>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 1);
  });

  it('ignores elements without event handlers', () => {
    const issues = collectIssues('<div>hello</div>', checkInteractiveSupportsFocus);
    assert.strictEqual(issues.length, 0);
  });
});
