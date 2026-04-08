import * as assert from 'assert';
import { scanForA11yIssues } from '../scanner/astScanner';

/**
 * Tests that validate the core logic used by the PR review feature:
 * diffing issues between a base version and a current version of a file,
 * keyed by rule + message (line-independent).
 */

function issueKey(issue: { rule: string; message: string }): string {
  return `${issue.rule}::${issue.message}`;
}

describe('PR review diffing logic', () => {
  it('detects new issues introduced in the current version', () => {
    const baseSrc = `
      export function App() {
        return (
          <div>
            <img src="logo.png" alt="Logo" />
          </div>
        );
      }
    `;
    const currentSrc = `
      export function App() {
        return (
          <div>
            <img src="logo.png" alt="Logo" />
            <img src="banner.png" />
          </div>
        );
      }
    `;

    const baseIssues = scanForA11yIssues(baseSrc, 'App.tsx');
    const currentIssues = scanForA11yIssues(currentSrc, 'App.tsx');

    const prevKeys = new Set(baseIssues.map(issueKey));
    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));

    assert.ok(newIssues.length > 0, 'should detect at least one new issue');
    assert.ok(newIssues.some(i => i.rule === 'img-alt'), 'new issue should be img-alt');
  });

  it('detects issues fixed in the current version', () => {
    const baseSrc = `
      export function App() {
        return (
          <div>
            <img src="logo.png" />
            <button />
          </div>
        );
      }
    `;
    const currentSrc = `
      export function App() {
        return (
          <div>
            <img src="logo.png" alt="Logo" />
            <button aria-label="Close">X</button>
          </div>
        );
      }
    `;

    const baseIssues = scanForA11yIssues(baseSrc, 'App.tsx');
    const currentIssues = scanForA11yIssues(currentSrc, 'App.tsx');

    const currKeys = new Set(currentIssues.map(issueKey));
    const fixedIssues = baseIssues.filter(i => !currKeys.has(issueKey(i)));

    assert.ok(fixedIssues.length >= 2, 'should detect at least two fixed issues');
    assert.ok(fixedIssues.some(i => i.rule === 'img-alt'), 'img-alt should be fixed');
    assert.ok(fixedIssues.some(i => i.rule === 'button-label'), 'button-label should be fixed');
  });

  it('reports zero new issues when nothing changed', () => {
    const src = `
      export function App() {
        return <img src="logo.png" />;
      }
    `;

    const baseIssues = scanForA11yIssues(src, 'App.tsx');
    const currentIssues = scanForA11yIssues(src, 'App.tsx');

    const prevKeys = new Set(baseIssues.map(issueKey));
    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));

    assert.strictEqual(newIssues.length, 0, 'no new issues for identical code');
  });

  it('handles added file (no base version)', () => {
    const currentSrc = `
      export function NewPage() {
        return (
          <div>
            <img src="hero.png" />
            <button />
          </div>
        );
      }
    `;

    const baseIssues: ReturnType<typeof scanForA11yIssues> = []; // didn't exist
    const currentIssues = scanForA11yIssues(currentSrc, 'NewPage.tsx');

    const prevKeys = new Set(baseIssues.map(issueKey));
    const newIssues = currentIssues.filter(i => !prevKeys.has(issueKey(i)));

    // All issues in a new file are "new"
    assert.strictEqual(newIssues.length, currentIssues.length);
  });

  it('correctly determines PR pass/fail verdict', () => {
    // Scenario 1: PR introduces new issues → fail
    const baseSrc = '<div><img src="x.png" alt="ok" /></div>';
    const currentSrcBad = '<div><img src="x.png" alt="ok" /><img src="y.png" /></div>';

    const baseIssues = scanForA11yIssues(baseSrc, 'test.tsx');
    const currentIssuesBad = scanForA11yIssues(currentSrcBad, 'test.tsx');

    const prevKeys = new Set(baseIssues.map(issueKey));
    const newIssues = currentIssuesBad.filter(i => !prevKeys.has(issueKey(i)));

    const passBad = newIssues.length === 0;
    assert.strictEqual(passBad, false, 'PR should fail when new issues are introduced');

    // Scenario 2: PR only fixes issues → pass
    const currentSrcGood = '<div><img src="x.png" alt="ok" /></div>';
    const currentIssuesGood = scanForA11yIssues(currentSrcGood, 'test.tsx');
    const newIssuesGood = currentIssuesGood.filter(i => !prevKeys.has(issueKey(i)));

    const passGood = newIssuesGood.length === 0;
    assert.strictEqual(passGood, true, 'PR should pass when no new issues');
  });
});
