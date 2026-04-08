import * as assert from 'assert';
import { scanForA11yIssues } from '../scanner/astScanner';

describe('astScanner integration', () => {
  it('detects multiple issues in a single file', () => {
    const code = `
      export function App() {
        return (
          <div>
            <img src="logo.png" />
            <button />
            <input />
            <div onClick={handleClick}>click me</div>
          </div>
        );
      }
    `;
    const issues = scanForA11yIssues(code, 'App.tsx');
    const rules = issues.map(i => i.rule);

    assert.ok(rules.includes('img-alt'), 'should detect img-alt');
    assert.ok(rules.includes('button-label'), 'should detect button-label');
    assert.ok(rules.includes('form-label'), 'should detect form-label');
    assert.ok(rules.includes('click-events-have-key-events'), 'should detect click-key-events');
  });

  it('returns no issues for fully accessible code', () => {
    const code = `
      export function App() {
        return (
          <div>
            <h1>Welcome</h1>
            <img src="logo.png" alt="Logo" />
            <button aria-label="Close">X</button>
            <input aria-label="Name" />
          </div>
        );
      }
    `;
    const issues = scanForA11yIssues(code, 'App.tsx');
    assert.strictEqual(issues.length, 0);
  });

  it('handles empty file gracefully', () => {
    const issues = scanForA11yIssues('', 'empty.tsx');
    assert.strictEqual(issues.length, 0);
  });

  it('handles plain TS (non-JSX) file gracefully', () => {
    const code = 'export const x = 42;';
    const issues = scanForA11yIssues(code, 'util.ts');
    assert.strictEqual(issues.length, 0);
  });

  it('detects aria-role issues', () => {
    const code = '<div role="banana">hello</div>';
    const issues = scanForA11yIssues(code, 'test.tsx');
    assert.ok(issues.some(i => i.rule === 'aria-role'));
  });

  it('detects color-contrast issues', () => {
    const code = '<span style={{ color: "white", backgroundColor: "#ffffff" }}>low contrast</span>';
    const issues = scanForA11yIssues(code, 'test.tsx');
    assert.ok(issues.some(i => i.rule === 'color-contrast'));
  });

  it('detects heading-order issues', () => {
    const code = '<><h1>Title</h1><h3>Skipped h2</h3></>';
    const issues = scanForA11yIssues(code, 'test.tsx');
    assert.ok(issues.some(i => i.rule === 'heading-order'));
  });
});
