import * as assert from 'assert';
import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { createHeadingOrderChecker } from '../../scanner/rules/headingOrder';
import { parseJsx } from '../helpers';

/**
 * Run the heading-order checker matching how astScanner uses it:
 * Visit every node (collecting headings), then explicitly run on SourceFile.
 */
function collectHeadingIssues(code: string) {
  const sf = parseJsx(code);
  const checker = createHeadingOrderChecker();
  const issues: A11yIssue[] = [];

  function visit(node: ts.Node) {
    issues.push(...checker(node, sf));
    ts.forEachChild(node, visit);
  }
  visit(sf);
  // astScanner runs the checker one extra time on the SourceFile after the walk
  issues.push(...checker(sf, sf));
  return issues;
}

describe('heading-order rule', () => {
  it('passes correct heading order h1 → h2 → h3', () => {
    const code = `<><h1>Title</h1><h2>Sub</h2><h3>SubSub</h3></>`;
    const issues = collectHeadingIssues(code);
    assert.strictEqual(issues.length, 0);
  });

  it('flags skipped heading level h1 → h3', () => {
    const code = `<><h1>Title</h1><h3>Skip</h3></>`;
    const issues = collectHeadingIssues(code);
    assert.ok(issues.some(i => i.message.includes('skipped') || i.message.includes('Skipped')));
  });

  it('flags multiple h1 elements', () => {
    const code = `<><h1>First</h1><h1>Second</h1></>`;
    const issues = collectHeadingIssues(code);
    assert.ok(issues.some(i => i.message.includes('Multiple')));
  });

  it('flags first heading being h3 or higher', () => {
    const code = `<><h3>Start</h3><h4>Next</h4></>`;
    const issues = collectHeadingIssues(code);
    assert.ok(issues.some(i => i.message.includes('First heading') || i.message.includes('first heading')));
  });

  it('passes single h1', () => {
    const code = '<h1>Only heading</h1>';
    const issues = collectHeadingIssues(code);
    assert.strictEqual(issues.length, 0);
  });

  it('passes no headings at all', () => {
    const code = '<div>No headings here</div>';
    const issues = collectHeadingIssues(code);
    assert.strictEqual(issues.length, 0);
  });

  it('allows going from h3 back to h2 (not skipping)', () => {
    const code = `<><h1>Title</h1><h2>A</h2><h3>B</h3><h2>C</h2></>`;
    const issues = collectHeadingIssues(code);
    assert.strictEqual(issues.length, 0);
  });
});
