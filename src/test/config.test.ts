import * as assert from 'assert';
import { isRuleEnabled, applyConfig, isExcluded, isAiExcluded } from '../config';
import type { A11yConfig } from '../config';
import type { A11yIssue } from '../types';

function makeIssue(rule: string, severity: 'error' | 'warning' | 'info' | 'hint' = 'warning'): A11yIssue {
  return {
    message: `Issue from ${rule}`,
    rule,
    severity,
    line: 0,
    column: 0,
    snippet: '<div />',
  };
}

describe('config — isRuleEnabled', () => {
  it('returns true when no rules configured', () => {
    assert.strictEqual(isRuleEnabled({}, 'img-alt'), true);
  });

  it('returns true when rules object empty', () => {
    assert.strictEqual(isRuleEnabled({ rules: {} }, 'img-alt'), true);
  });

  it('returns false when rule is set to false', () => {
    assert.strictEqual(isRuleEnabled({ rules: { 'img-alt': false } }, 'img-alt'), false);
  });

  it('returns false when rule.enabled is false', () => {
    assert.strictEqual(isRuleEnabled({ rules: { 'img-alt': { enabled: false } } }, 'img-alt'), false);
  });

  it('returns true when rule has severity override but is not disabled', () => {
    assert.strictEqual(isRuleEnabled({ rules: { 'img-alt': { severity: 'info' } } }, 'img-alt'), true);
  });

  it('returns true for rules not mentioned in config', () => {
    assert.strictEqual(isRuleEnabled({ rules: { 'img-alt': false } }, 'button-label'), true);
  });
});

describe('config — applyConfig', () => {
  it('returns all issues when no rules configured', () => {
    const issues = [makeIssue('img-alt'), makeIssue('button-label')];
    const result = applyConfig({}, issues);
    assert.strictEqual(result.length, 2);
  });

  it('filters disabled rules', () => {
    const config: A11yConfig = { rules: { 'img-alt': false } };
    const issues = [makeIssue('img-alt'), makeIssue('button-label')];
    const result = applyConfig(config, issues);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rule, 'button-label');
  });

  it('overrides severity when configured', () => {
    const config: A11yConfig = { rules: { 'img-alt': { severity: 'info' } } };
    const issues = [makeIssue('img-alt', 'error')];
    const result = applyConfig(config, issues);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].severity, 'info');
  });

  it('does not mutate original issues', () => {
    const config: A11yConfig = { rules: { 'img-alt': { severity: 'hint' } } };
    const original = makeIssue('img-alt', 'error');
    applyConfig(config, [original]);
    assert.strictEqual(original.severity, 'error');
  });

  it('handles mix of disabled and severity-overridden rules', () => {
    const config: A11yConfig = {
      rules: {
        'img-alt': false,
        'button-label': { severity: 'error' },
      },
    };
    const issues = [makeIssue('img-alt'), makeIssue('button-label'), makeIssue('form-label')];
    const result = applyConfig(config, issues);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].rule, 'button-label');
    assert.strictEqual(result[0].severity, 'error');
    assert.strictEqual(result[1].rule, 'form-label');
  });
});

describe('config — isExcluded', () => {
  it('returns false when no excludes', () => {
    assert.strictEqual(isExcluded({}, '/src/App.tsx'), false);
  });

  it('returns false when exclude array is empty', () => {
    assert.strictEqual(isExcluded({ exclude: [] }, '/src/App.tsx'), false);
  });

  it('matches ** glob (any path)', () => {
    const config: A11yConfig = { exclude: ['**/test/**'] };
    assert.strictEqual(isExcluded(config, '/src/test/App.tsx'), true);
    assert.strictEqual(isExcluded(config, '/src/App.tsx'), false);
  });

  it('matches * glob (single segment)', () => {
    const config: A11yConfig = { exclude: ['src/*.test.tsx'] };
    assert.strictEqual(isExcluded(config, 'src/App.test.tsx'), true);
    assert.strictEqual(isExcluded(config, 'src/deep/App.test.tsx'), false);
  });

  it('matches file extension patterns', () => {
    const config: A11yConfig = { exclude: ['**/*.stories.tsx'] };
    assert.strictEqual(isExcluded(config, '/src/Button.stories.tsx'), true);
    assert.strictEqual(isExcluded(config, '/src/Button.tsx'), false);
  });

  it('normalizes backslashes on Windows paths', () => {
    const config: A11yConfig = { exclude: ['**/test/**'] };
    assert.strictEqual(isExcluded(config, 'C:\\src\\test\\App.tsx'), true);
  });

  it('handles ? glob (single char)', () => {
    const config: A11yConfig = { exclude: ['src/?.tsx'] };
    assert.strictEqual(isExcluded(config, 'src/A.tsx'), true);
    assert.strictEqual(isExcluded(config, 'src/AB.tsx'), false);
  });

  it('escapes dots in patterns', () => {
    const config: A11yConfig = { exclude: ['**/*.test.ts'] };
    // Should NOT match .testXts (dot is literal, not regex any-char)
    assert.strictEqual(isExcluded(config, 'src/appXtestXts'), false);
    assert.strictEqual(isExcluded(config, 'src/app.test.ts'), true);
  });
});

describe('config — isAiExcluded', () => {
  it('returns false when no aiExclude configured', () => {
    assert.strictEqual(isAiExcluded({}, '/src/App.tsx'), false);
  });

  it('returns false when aiExclude array is empty', () => {
    assert.strictEqual(isAiExcluded({ aiExclude: [] }, '/src/App.tsx'), false);
  });

  it('matches ** glob for folder exclusion', () => {
    const config: A11yConfig = { aiExclude: ['**/legacy/**'] };
    assert.strictEqual(isAiExcluded(config, '/src/legacy/OldComponent.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/components/NewComponent.tsx'), false);
  });

  it('matches multiple patterns', () => {
    const config: A11yConfig = { aiExclude: ['**/legacy/**', '**/generated/**', '**/vendor/**'] };
    assert.strictEqual(isAiExcluded(config, '/src/legacy/Old.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/generated/Auto.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/vendor/Lib.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/components/App.tsx'), false);
  });

  it('matches file extension patterns', () => {
    const config: A11yConfig = { aiExclude: ['**/*.generated.tsx'] };
    assert.strictEqual(isAiExcluded(config, '/src/Form.generated.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/Form.tsx'), false);
  });

  it('normalizes backslashes on Windows paths', () => {
    const config: A11yConfig = { aiExclude: ['**/legacy/**'] };
    assert.strictEqual(isAiExcluded(config, 'C:\\src\\legacy\\Old.tsx'), true);
  });

  it('is independent from exclude — a file can be ai-excluded but not scan-excluded', () => {
    const config: A11yConfig = {
      exclude: ['**/test/**'],
      aiExclude: ['**/legacy/**'],
    };
    // legacy file: not scan-excluded, but ai-excluded
    assert.strictEqual(isExcluded(config, '/src/legacy/Old.tsx'), false);
    assert.strictEqual(isAiExcluded(config, '/src/legacy/Old.tsx'), true);
    // test file: scan-excluded, but not ai-excluded
    assert.strictEqual(isExcluded(config, '/src/test/App.tsx'), true);
    assert.strictEqual(isAiExcluded(config, '/src/test/App.tsx'), false);
  });

  it('matches * glob (single segment)', () => {
    const config: A11yConfig = { aiExclude: ['src/*.auto.tsx'] };
    assert.strictEqual(isAiExcluded(config, 'src/Button.auto.tsx'), true);
    assert.strictEqual(isAiExcluded(config, 'src/deep/Button.auto.tsx'), false);
  });

  it('handles ? glob (single char)', () => {
    const config: A11yConfig = { aiExclude: ['src/?.tsx'] };
    assert.strictEqual(isAiExcluded(config, 'src/A.tsx'), true);
    assert.strictEqual(isAiExcluded(config, 'src/AB.tsx'), false);
  });
});
