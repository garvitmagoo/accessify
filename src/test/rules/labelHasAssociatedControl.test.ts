import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkLabelHasAssociatedControl } from '../../scanner/rules/labelHasAssociatedControl';

describe('label-has-associated-control rule', () => {
  it('flags <label> without htmlFor and no child control', () => {
    const code = '<label>Name</label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'label-has-associated-control');
  });

  it('passes <label htmlFor="name">', () => {
    const code = '<label htmlFor="name">Name</label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <label> wrapping an <input>', () => {
    const code = '<label>Name <input type="text" /></label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <label> wrapping a <select>', () => {
    const code = '<label>Country <select><option>US</option></select></label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <label> wrapping a <textarea>', () => {
    const code = '<label>Message <textarea></textarea></label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <label> wrapping a PascalCase component (assumed form control)', () => {
    const code = '<label>Name <CustomInput /></label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('flags self-closing <label /> without htmlFor', () => {
    const code = '<label />';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <label> with dynamic htmlFor', () => {
    const code = '<label htmlFor={inputId}>Name</label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses with spread props', () => {
    const code = '<label {...labelProps}>Name</label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <label> wrapping deeply nested input', () => {
    const code = '<label>Name <span><input type="text" /></span></label>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-label elements', () => {
    const code = '<div>hello</div>';
    const issues = collectIssues(code, checkLabelHasAssociatedControl);
    assert.strictEqual(issues.length, 0);
  });
});
