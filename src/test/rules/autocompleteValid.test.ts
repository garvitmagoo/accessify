import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkAutocompleteValid } from '../../scanner/rules/autocompleteValid';

describe('autocomplete-valid rule', () => {
  it('flags email input without autoComplete', () => {
    const issues = collectIssues('<input type="email" name="email" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'autocomplete-valid');
  });

  it('flags password input without autoComplete', () => {
    const issues = collectIssues('<input type="password" name="password" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 1);
  });

  it('flags text input with personal name pattern', () => {
    const issues = collectIssues('<input type="text" name="firstName" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 1);
  });

  it('passes input with valid autoComplete', () => {
    const issues = collectIssues('<input type="email" name="email" autoComplete="email" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 0);
  });

  it('flags input with invalid autoComplete token', () => {
    const issues = collectIssues('<input type="text" name="name" autoComplete="bogus" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].message.includes('Invalid autoComplete'));
  });

  it('ignores non-personal inputs', () => {
    const issues = collectIssues('<input type="text" name="query" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores checkbox inputs', () => {
    const issues = collectIssues('<input type="checkbox" name="email" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 0);
  });

  it('passes tel input with valid autoComplete', () => {
    const issues = collectIssues('<input type="tel" name="phone" autoComplete="tel" />', checkAutocompleteValid);
    assert.strictEqual(issues.length, 0);
  });
});
