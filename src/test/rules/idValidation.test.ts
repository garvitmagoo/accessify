import * as assert from 'assert';
import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { createIdValidationChecker } from '../../scanner/rules/idValidation';
import { parseJsx } from '../helpers';

/**
 * Run the id-validation checker the way astScanner does:
 * visit every node (collecting state), then run once on the SourceFile.
 */
function collectIdIssues(code: string): A11yIssue[] {
  const sf = parseJsx(code);
  const checker = createIdValidationChecker();
  const issues: A11yIssue[] = [];

  function visit(node: ts.Node) {
    issues.push(...checker(node, sf));
    ts.forEachChild(node, visit);
  }
  visit(sf);
  issues.push(...checker(sf, sf));
  return issues;
}

describe('id-validation (no-duplicate-id / aria-valid-ref)', () => {
  it('flags duplicate ids', () => {
    const code = '<><div id="main">a</div><section id="main">b</section></>';
    const issues = collectIdIssues(code);
    const dupes = issues.filter(i => i.rule === 'no-duplicate-id');
    assert.strictEqual(dupes.length, 1);
    assert.ok(dupes[0].message.includes('main'));
  });

  it('passes unique ids', () => {
    const code = '<><div id="a">x</div><div id="b">y</div></>';
    const issues = collectIdIssues(code);
    assert.strictEqual(issues.filter(i => i.rule === 'no-duplicate-id').length, 0);
  });

  it('flags aria-labelledby pointing to a missing id', () => {
    const code = '<div role="dialog" aria-labelledby="ghost">x</div>';
    const issues = collectIdIssues(code);
    const refs = issues.filter(i => i.rule === 'aria-valid-ref');
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].message.includes('ghost'));
  });

  it('passes aria-labelledby pointing to an existing id', () => {
    const code = '<><h2 id="title">T</h2><div role="dialog" aria-labelledby="title">x</div></>';
    const issues = collectIdIssues(code);
    assert.strictEqual(issues.filter(i => i.rule === 'aria-valid-ref').length, 0);
  });

  it('handles multiple space-separated ids in aria-labelledby', () => {
    const code = '<><span id="a">A</span><div aria-labelledby="a b">x</div></>';
    const issues = collectIdIssues(code);
    const refs = issues.filter(i => i.rule === 'aria-valid-ref');
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].message.includes('b'));
  });

  it('suppresses ref check when the file has a dynamic id', () => {
    const code = '<><div id={genId()}>x</div><div aria-labelledby="ghost">y</div></>';
    const issues = collectIdIssues(code);
    assert.strictEqual(issues.filter(i => i.rule === 'aria-valid-ref').length, 0);
  });

  it('ignores dynamic aria reference values', () => {
    const code = '<div aria-controls={panelId}>x</div>';
    const issues = collectIdIssues(code);
    assert.strictEqual(issues.filter(i => i.rule === 'aria-valid-ref').length, 0);
  });
});
