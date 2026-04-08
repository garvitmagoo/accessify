import React from 'react';

// This file contains intentional a11y violations to test all 8 scanner rules.

export const TestAllRules = () => {
  const handleClick = () => console.log('clicked');

  return (
    <div>
      {/* ── 1. img-alt: missing alt attribute ── */}
      <img src="/logo.png" />
      <img src="/banner.jpg" width={600} />

      {/* ── 2. button-label: button without accessible text ── */}
      <button onClick={handleClick}>
        <svg viewBox="0 0 24 24"><path d="M12 2L2 22h20z" /></svg>
      </button>
      <button onClick={handleClick}></button>

      {/* ── 3. aria-role: invalid ARIA role ── */}
      <div role="superbutton">Custom Widget</div>
      <span role="clickable">Click me</span>

      {/* ── 4. form-label: inputs missing labels ── */}
      <input type="text" placeholder="Search..." />
      <select>
        <option>Option 1</option>
        <option>Option 2</option>
      </select>
      <textarea placeholder="Write a comment..." />

      {/* ── 5. click-events-have-key-events: onClick without keyboard ── */}
      <div onClick={handleClick}>Clickable div</div>
      <span onClick={handleClick} style={{ cursor: 'pointer' }}>
        Click this span
      </span>

      {/* ── 6. aria-pattern: invalid ARIA composite patterns ── */}
      <div role="tablist">
        <div>Not a tab</div>
      </div>
      <div role="dialog">
        <p>This dialog has no aria-label or aria-labelledby</p>
      </div>

      {/* ── 7. color-contrast: insufficient contrast ratio ── */}
      <p style={{ color: '#aaaaaa', backgroundColor: '#ffffff' }}>
        Low contrast text
      </p>
      <span style={{ color: '#cccccc', backgroundColor: '#eeeeee' }}>
        Very low contrast
      </span>

      {/* ── 8. heading-order: skipped heading levels & duplicate h1 ── */}
      <h1>Main Title</h1>
      <h1>Second H1 (duplicate)</h1>
      <h3>Skipped from h1 to h3</h3>
      <h5>Skipped from h3 to h5</h5>
    </div>
  );
};
