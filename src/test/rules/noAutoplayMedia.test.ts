import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkNoAutoplayMedia } from '../../scanner/rules/noAutoplayMedia';

describe('no-autoplay-media rule', () => {
  it('flags <video autoPlay> without muted or controls', () => {
    const issues = collectIssues('<video autoPlay src="x.mp4" />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'no-autoplay-media');
  });

  it('flags <audio autoPlay>', () => {
    const issues = collectIssues('<audio autoPlay src="x.mp3" />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 1);
  });

  it('passes autoPlay + muted', () => {
    const issues = collectIssues('<video autoPlay muted src="x.mp4" />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 0);
  });

  it('passes autoPlay + controls', () => {
    const issues = collectIssues('<video autoPlay controls src="x.mp4" />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 0);
  });

  it('passes video without autoPlay', () => {
    const issues = collectIssues('<video src="x.mp4" controls />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 0);
  });

  it('ignores non-media elements', () => {
    const issues = collectIssues('<div autoPlay>x</div>', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses when spread props present', () => {
    const issues = collectIssues('<video autoPlay {...props} />', checkNoAutoplayMedia);
    assert.strictEqual(issues.length, 0);
  });
});
