import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkButtonLabel } from '../../scanner/rules/buttonLabel';

describe('button-label rule', () => {
  it('flags self-closing <button /> without aria-label', () => {
    const issues = collectIssues('<button />', checkButtonLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'button-label');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes self-closing button with aria-label', () => {
    const issues = collectIssues('<button aria-label="Close" />', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes self-closing button with title', () => {
    const issues = collectIssues('<button title="Submit" />', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes self-closing button with aria-labelledby', () => {
    const issues = collectIssues('<button aria-labelledby="label-id" />', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <IconButton /> without label', () => {
    const issues = collectIssues('<IconButton />', checkButtonLabel);
    assert.strictEqual(issues.length, 1);
  });

  it('flags opening <button> without text content or label', () => {
    const issues = collectIssues('<button><img src="icon.png" /></button>', checkButtonLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes <button> with text content', () => {
    const issues = collectIssues('<button>Submit</button>', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <button> with aria-label and no text', () => {
    const issues = collectIssues('<button aria-label="Close"><span /></button>', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-button elements', () => {
    const issues = collectIssues('<div>hello</div>', checkButtonLabel);
    assert.strictEqual(issues.length, 0);
  });
});
