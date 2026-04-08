import React from 'react';

// This file contains intentional a11y violations to test all 8 scanner rules.

export const TestAllRules = () => {
  const handleClick = () => console.log('clicked');

  return (
    <div>
      {/* ── 1. img-alt: missing alt attribute ── */}
      <img src="/logo.png"  alt=""/>
      <img src="/banner.jpg" width={600}  alt=""/>

      {/* ── 2. button-label: button without accessible text ── */}
      <button onClick={handleClick} aria-label="">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 22h20z" /></svg>
      </button>
      <button onClick={handleClick} aria-label=""></button>

      {/* ── 3. aria-role: invalid ARIA role ── */}
      <div role="spinbutton">Custom Widget</div>
      <span role="checkbox">Click me</span>

      {/* ── 4. form-label: inputs missing labels ── */}
      <input type="text" placeholder="Search..."  aria-label=""/>
      <select aria-label="">
        <option>Option 1</option>
        <option>Option 2</option>
      </select>
      <textarea placeholder="Write a comment..."  aria-label=""/>

      {/* ── 5. click-events-have-key-events: onClick without keyboard ── */}
      <div onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { /* handler */ } }}>Clickable div</div>
      <span onClick={handleClick} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { /* handler */ } }}>
        Click this span
      </span>

      {/* ── 6. aria-pattern: invalid ARIA composite patterns ── */}
      <div role="tablist">
        <div role="tab" aria-controls="tab-panel-1" aria-selected="false">Not a tab</div>
      </div>
      <div role="dialog" aria-labelledby="dialog-label">
        <p>This dialog has no aria-label or aria-labelledby</p>
      </div>

      {/* ── 7. color-contrast: insufficient contrast ratio ── */}
      <p style={{ color: '#767676', backgroundColor: '#ffffff' }}>
        Low contrast text
      </p>
      <span style={{ color: '#6c6c6c', backgroundColor: '#eeeeee' }}>
        Very low contrast
      </span>

      {/* ── 8. heading-order: skipped heading levels & duplicate h1 ── */}
      <h1>Main Title</h1>
      <h2>Second H1 (duplicate)</h2>
      <h2>Skipped from h1 to h3</h2>
      <h3>Skipped from h3 to h5</h3>
    </div>
  );
};
