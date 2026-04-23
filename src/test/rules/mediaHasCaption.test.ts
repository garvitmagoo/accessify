import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkMediaHasCaption } from '../../scanner/rules/mediaHasCaption';

describe('media-has-caption rule', () => {
  it('flags self-closing <video />', () => {
    const issues = collectIssues('<video src="movie.mp4" />', checkMediaHasCaption);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'media-has-caption');
    assert.ok(issues[0].message.includes('track'));
  });

  it('flags <video> without <track kind="captions">', () => {
    const issues = collectIssues('<video src="movie.mp4"><source src="movie.webm" /></video>', checkMediaHasCaption);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <video> with <track kind="captions">', () => {
    const issues = collectIssues('<video src="movie.mp4"><track kind="captions" src="captions.vtt" /></video>', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <video> with <track kind="subtitles">', () => {
    const issues = collectIssues('<video src="movie.mp4"><track kind="subtitles" src="subs.vtt" /></video>', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });

  it('passes muted <video />', () => {
    const issues = collectIssues('<video src="movie.mp4" muted />', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <audio> without captions', () => {
    const issues = collectIssues('<audio src="podcast.mp3"></audio>', checkMediaHasCaption);
    assert.strictEqual(issues.length, 1);
  });

  it('ignores non-media elements', () => {
    const issues = collectIssues('<div>hello</div>', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });

  /* ── Spread props ──────────────────────────────────────────────────── */

  it('suppresses when spread props present on video', () => {
    const issues = collectIssues('<video {...videoProps} />', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses when spread props present on audio', () => {
    const issues = collectIssues('<audio {...audioProps} />', checkMediaHasCaption);
    assert.strictEqual(issues.length, 0);
  });
});
