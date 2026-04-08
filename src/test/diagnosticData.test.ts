import * as assert from 'assert';
import { scanForA11yIssues } from '../scanner/astScanner';

/**
 * Tests that scanner rules produce structured `data` fields
 * which code actions can consume without parsing messages.
 */
describe('diagnostic structured data', () => {
  describe('aria-role', () => {
    it('includes invalidRole in data', () => {
      const issues = scanForA11yIssues('<div role="buton">hi</div>', 'test.tsx');
      const roleIssue = issues.find(i => i.rule === 'aria-role');
      assert.ok(roleIssue, 'should find aria-role issue');
      assert.strictEqual(roleIssue!.data?.invalidRole, 'buton');
    });
  });

  describe('color-contrast', () => {
    it('includes foreground and background in data', () => {
      const issues = scanForA11yIssues(
        '<div style={{ color: "white", backgroundColor: "white" }}>text</div>',
        'test.tsx',
      );
      const contrastIssue = issues.find(i => i.rule === 'color-contrast');
      assert.ok(contrastIssue, 'should find color-contrast issue');
      assert.strictEqual(contrastIssue!.data?.foreground, 'white');
      assert.strictEqual(contrastIssue!.data?.background, 'white');
    });
  });

  describe('heading-order', () => {
    it('includes skipped type with currentTag and previousLevel', () => {
      const issues = scanForA11yIssues('<h1>Title</h1><h3>Subtitle</h3>', 'test.tsx');
      const skipIssue = issues.find(i => i.rule === 'heading-order' && i.data?.type === 'skipped');
      assert.ok(skipIssue, 'should find skipped heading issue');
      assert.strictEqual(skipIssue!.data?.currentTag, 'h3');
      assert.strictEqual(skipIssue!.data?.previousLevel, '1');
    });

    it('includes multiple-h1 type', () => {
      const issues = scanForA11yIssues('<h1>First</h1><h1>Second</h1>', 'test.tsx');
      const multiIssue = issues.find(i => i.rule === 'heading-order' && i.data?.type === 'multiple-h1');
      assert.ok(multiIssue, 'should find multiple-h1 issue');
      assert.strictEqual(multiIssue!.data?.currentTag, 'h1');
    });

    it('includes first-heading type', () => {
      const issues = scanForA11yIssues('<h4>Deep</h4>', 'test.tsx');
      const firstIssue = issues.find(i => i.rule === 'heading-order' && i.data?.type === 'first-heading');
      assert.ok(firstIssue, 'should find first-heading issue');
      assert.strictEqual(firstIssue!.data?.currentTag, 'h4');
    });
  });
});
