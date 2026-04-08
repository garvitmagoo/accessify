import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNextjsImageAlt } from '../../scanner/rules/nextjsImage';

describe('nextjs-image-alt rule', () => {
  it('flags <Image> without alt attribute', () => {
    const issues = collectIssues('<Image src="/logo.png" width={100} height={100} />', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'nextjs-image-alt');
    assert.strictEqual(issues[0].severity, 'error');
  });

  it('passes <Image> with alt attribute', () => {
    const issues = collectIssues('<Image src="/logo.png" alt="Company logo" width={100} height={100} />', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <Image> with empty alt (decorative)', () => {
    const issues = collectIssues('<Image src="/bg.png" alt="" width={100} height={100} />', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-Image elements', () => {
    const issues = collectIssues('<div>hello</div>', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores lowercase img (handled by img-alt rule)', () => {
    const issues = collectIssues('<img src="test.png" />', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <Image> opening element without alt', () => {
    const issues = collectIssues('<Image src="/test.png" width={100} height={100}></Image>', checkNextjsImageAlt);
    assert.strictEqual(issues.length, 1);
  });
});
