import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoRedundantRoles } from '../../scanner/rules/noRedundantRoles';

describe('no-redundant-roles rule', () => {
  it('flags <button role="button">', () => {
    const issues = collectIssues('<button role="button">Click</button>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-redundant-roles');
    assert.ok(issues[0].message.includes('redundant'));
  });

  it('flags <nav role="navigation">', () => {
    const issues = collectIssues('<nav role="navigation">Menu</nav>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <ul role="list">', () => {
    const issues = collectIssues('<ul role="list"><li>item</li></ul>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <button role="tab"> (different role)', () => {
    const issues = collectIssues('<button role="tab">Tab 1</button>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <div role="button"> (no implicit match)', () => {
    const issues = collectIssues('<div role="button">Click</div>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores React components (PascalCase)', () => {
    const issues = collectIssues('<Button role="button">Click</Button>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores elements without role', () => {
    const issues = collectIssues('<button>Click</button>', checkNoRedundantRoles);
    assert.strictEqual(issues.length, 0);
  });
});
