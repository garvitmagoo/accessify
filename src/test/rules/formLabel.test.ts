import * as assert from 'assert';
import { collectIssues } from '../helpers';
import { checkFormLabel } from '../../scanner/rules/formLabel';

describe('form-label rule', () => {
  it('flags <input /> without label', () => {
    const issues = collectIssues('<input />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'form-label');
    assert.strictEqual(issues[0].severity, 'warning');
  });

  it('passes <input> with aria-label', () => {
    const issues = collectIssues('<input aria-label="Name" />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <input> with aria-labelledby', () => {
    const issues = collectIssues('<input aria-labelledby="name-label" />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('emits hint for <input> with id but no explicit label', () => {
    const issues = collectIssues('<input id="name-field" />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'hint');
    assert.ok(issues[0].message.includes('id'));
  });

  it('skips <input type="hidden" />', () => {
    const issues = collectIssues('<input type="hidden" />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <select /> without label', () => {
    const issues = collectIssues('<select />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <textarea /> without label', () => {
    const issues = collectIssues('<textarea />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
  });

  it('flags <TextField /> (MUI) without label', () => {
    const issues = collectIssues('<TextField />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
  });

  it('passes <TextField label="Name" />', () => {
    const issues = collectIssues('<TextField label="Name" />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <TextField label={labelVar} />', () => {
    const issues = collectIssues('<TextField label={labelVar} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('emits hint for <TextField placeholder="Search..." /> without label', () => {
    const issues = collectIssues('<TextField placeholder="Search..." />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'hint');
    assert.ok(issues[0].message.includes('placeholder'));
  });

  it('passes <TextField placeholder="..." label="Search" /> with label', () => {
    const issues = collectIssues('<TextField placeholder="Search..." label="Search" />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <TextField InputLabelProps={{}} />', () => {
    const issues = collectIssues('<TextField InputLabelProps={{ shrink: true }} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <TextField inputProps={{}} />', () => {
    const issues = collectIssues('<TextField inputProps={{ "aria-label": "name" }} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <TextField slotProps={{}} /> (MUI v5+)', () => {
    const issues = collectIssues('<TextField slotProps={{ input: { "aria-label": "name" } }} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <TextField slots={{}} />', () => {
    const issues = collectIssues('<TextField slots={{ input: CustomInput }} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('flags <Autocomplete /> (MUI) without label', () => {
    const issues = collectIssues('<Autocomplete options={[]} />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'form-label');
  });

  it('passes <Autocomplete /> with aria-label', () => {
    const issues = collectIssues('<Autocomplete aria-label="Search" options={[]} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('passes <Autocomplete /> with renderInput (label delegated to TextField)', () => {
    const code = '<Autocomplete options={items} renderInput={(params) => <TextField {...params} label="Search" />} />';
    const issues = collectIssues(code, checkFormLabel);
    // Autocomplete itself should not be flagged since renderInput delegates labeling
    const autoIssues = issues.filter(i => i.snippet.includes('Autocomplete'));
    assert.strictEqual(autoIssues.length, 0);
  });

  it('passes <input placeholder="Name" /> with hint severity', () => {
    const issues = collectIssues('<input placeholder="Name" />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'hint');
  });

  it('passes <Select> inside <FormControl> (MUI label context)', () => {
    const code = '<FormControl fullWidth><InputLabel>File</InputLabel><Select value={val} onChange={fn} /></FormControl>';
    const issues = collectIssues(code, checkFormLabel);
    const selectIssues = issues.filter(i => i.snippet.includes('Select'));
    assert.strictEqual(selectIssues.length, 0);
  });

  it('flags <Select> without FormControl or label', () => {
    const issues = collectIssues('<Select value={val} />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].rule, 'form-label');
  });

  it('ignores non-form elements', () => {
    const issues = collectIssues('<div>hello</div>', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  /* ── Spread props ──────────────────────────────────────────────────── */

  it('suppresses when spread props present (<input {...props} />)', () => {
    const issues = collectIssues('<input {...props} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  it('suppresses MUI input with spread props', () => {
    const issues = collectIssues('<TextField {...props} />', checkFormLabel);
    assert.strictEqual(issues.length, 0);
  });

  /* ── Empty label detection ──────────────────────────────────────────── */

  it('flags <input aria-label="" />', () => {
    const issues = collectIssues('<input aria-label="" />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
    assert.ok(issues[0].message.includes('empty'));
  });

  it('flags <TextField label="" />', () => {
    const issues = collectIssues('<TextField label="" />', checkFormLabel);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
  });
});
