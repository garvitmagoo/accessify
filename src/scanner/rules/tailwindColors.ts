/**
 * Tailwind CSS default color palette (v3).
 * Maps Tailwind color utility classes to hex values for static color contrast analysis.
 */

/* ── Default palette ────────────────────────────────────────────────────── */

const PALETTE: Record<string, Record<number, string>> = {
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
    400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
    800: '#1e293b', 900: '#0f172a', 950: '#020617',
  },
  gray: {
    50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
    400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
    800: '#1f2937', 900: '#111827', 950: '#030712',
  },
  zinc: {
    50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8',
    400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46',
    800: '#27272a', 900: '#18181b', 950: '#09090b',
  },
  neutral: {
    50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4',
    400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
    800: '#262626', 900: '#171717', 950: '#0a0a0a',
  },
  stone: {
    50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1',
    400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c',
    800: '#292524', 900: '#1c1917', 950: '#0c0a09',
  },
  red: {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
    400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
    800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
  },
  orange: {
    50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74',
    400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c',
    800: '#9a3412', 900: '#7c2d12', 950: '#431407',
  },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
    400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
    800: '#92400e', 900: '#78350f', 950: '#451a03',
  },
  yellow: {
    50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047',
    400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207',
    800: '#854d0e', 900: '#713f12', 950: '#422006',
  },
  lime: {
    50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264',
    400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f',
    800: '#3f6212', 900: '#365314', 950: '#1a2e05',
  },
  green: {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
    400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
    800: '#166534', 900: '#14532d', 950: '#052e16',
  },
  emerald: {
    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
    400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
    800: '#065f46', 900: '#064e3b', 950: '#022c22',
  },
  teal: {
    50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
    400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
    800: '#115e59', 900: '#134e4a', 950: '#042f2e',
  },
  cyan: {
    50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9',
    400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490',
    800: '#155e75', 900: '#164e63', 950: '#083344',
  },
  sky: {
    50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
    400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
    800: '#075985', 900: '#0c4a6e', 950: '#082f49',
  },
  blue: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
    400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
    800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  },
  indigo: {
    50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
    400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
    800: '#3730a3', 900: '#312e81', 950: '#1e1b4e',
  },
  violet: {
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
    400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
    800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
  },
  purple: {
    50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
    400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce',
    800: '#6b21a8', 900: '#581c87', 950: '#3b0764',
  },
  fuchsia: {
    50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc',
    400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf',
    800: '#86198f', 900: '#701a75', 950: '#4a044e',
  },
  pink: {
    50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4',
    400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d',
    800: '#9d174d', 900: '#831843', 950: '#500724',
  },
  rose: {
    50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af',
    400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
    800: '#9f1239', 900: '#881337', 950: '#4c0519',
  },
};

/* ── Special single-value colors ────────────────────────────────────── */

const SPECIAL_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
};

/* ── Regex patterns for Tailwind color classes ──────────────────────── */

/**
 * Matches Tailwind text color classes:  text-{color}-{shade}  or  text-black / text-white
 */
const TEXT_COLOR_RE = /^text-([\w]+?)(?:-(\d+))?$/;

/**
 * Matches Tailwind background color classes:  bg-{color}-{shade}  or  bg-black / bg-white
 */
const BG_COLOR_RE = /^bg-([\w]+?)(?:-(\d+))?$/;

/* ── Public API ─────────────────────────────────────────────────────── */

/**
 * Resolve a single Tailwind utility class to a hex color string.
 * Returns `null` if the class is not a recognised color utility.
 *
 * Supports:
 *  - text-{color}-{shade}  (foreground)
 *  - bg-{color}-{shade}    (background)
 *  - text-black, text-white, bg-black, bg-white
 *  - Arbitrary value classes: text-[#rrggbb], bg-[#rrggbb], text-[rgb(...)], bg-[rgb(...)]
 */
export function resolveTailwindColor(cls: string): { hex: string; type: 'fg' | 'bg' } | null {
  // Arbitrary value: text-[#ff0000] or bg-[rgb(0,0,0)]
  const arbTextMatch = cls.match(/^text-\[(.+)\]$/);
  if (arbTextMatch) {
    return { hex: arbTextMatch[1], type: 'fg' };
  }
  const arbBgMatch = cls.match(/^bg-\[(.+)\]$/);
  if (arbBgMatch) {
    return { hex: arbBgMatch[1], type: 'bg' };
  }

  // text-{color}-{shade}
  const textMatch = cls.match(TEXT_COLOR_RE);
  if (textMatch) {
    const hex = lookupColor(textMatch[1], textMatch[2]);
    if (hex) { return { hex, type: 'fg' }; }
  }

  // bg-{color}-{shade}
  const bgMatch = cls.match(BG_COLOR_RE);
  if (bgMatch) {
    const hex = lookupColor(bgMatch[1], bgMatch[2]);
    if (hex) { return { hex, type: 'bg' }; }
  }

  return null;
}

function lookupColor(name: string, shade: string | undefined): string | null {
  // Single-value colors (black, white)
  if (!shade && SPECIAL_COLORS[name]) {
    return SPECIAL_COLORS[name];
  }

  const palette = PALETTE[name];
  if (!palette) { return null; }

  // Default shade when none is given (e.g. `text-red` → 500)
  const shadeNum = shade ? Number(shade) : 500;
  return palette[shadeNum] ?? null;
}

/**
 * Scan a space-separated class list and return resolved foreground and/or
 * background hex colors. The last matching class for each type wins
 * (mimicking Tailwind's "last utility wins" behaviour).
 */
export function extractTailwindColors(
  classList: string,
): { fg?: string; bg?: string; fgClass?: string; bgClass?: string } {
  let fg: string | undefined;
  let bg: string | undefined;
  let fgClass: string | undefined;
  let bgClass: string | undefined;

  for (const cls of classList.split(/\s+/)) {
    const result = resolveTailwindColor(cls.trim());
    if (!result) { continue; }
    if (result.type === 'fg') { fg = result.hex; fgClass = cls.trim(); }
    if (result.type === 'bg') { bg = result.hex; bgClass = cls.trim(); }
  }

  return { fg, bg, fgClass, bgClass };
}

/**
 * Given a Tailwind text-color class that fails contrast against a bg hex,
 * find the closest shade in the same hue family that achieves ≥ 4.5:1.
 * Returns the replacement class name, or null if none achieves the target.
 */
export function suggestAccessibleTailwindClass(
  fgClass: string,
  bgHex: string,
  parseColor: (v: string) => { r: number; g: number; b: number } | null,
  contrastRatio: (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => number,
): string | null {
  const bgRgb = parseColor(bgHex);
  if (!bgRgb) { return null; }

  // Handle arbitrary value classes: text-[#hex] or text-[rgb(...)]
  const arbMatch = fgClass.match(/^text-\[(.+)\]$/);
  if (arbMatch) {
    const fgRgb = parseColor(arbMatch[1]);
    if (!fgRgb) { return null; }
    const fixedHex = findAccessibleColor(fgRgb, bgRgb, contrastRatio);
    if (fixedHex) { return `text-[${fixedHex}]`; }
    return null;
  }

  // Parse the class: text-{color}-{shade} or text-{special}
  const textMatch = fgClass.match(TEXT_COLOR_RE);
  if (!textMatch) { return null; }

  const colorName = textMatch[1];
  const palette = PALETTE[colorName];
  if (!palette) { return null; }

  // Determine the bg luminance to decide search direction
  const shades = Object.keys(palette).map(Number).sort((a, b) => a - b);

  let bestClass: string | null = null;
  let bestDist = Infinity;
  const originalShade = textMatch[2] ? Number(textMatch[2]) : 500;

  for (const shade of shades) {
    const hex = palette[shade];
    const rgb = parseColor(hex);
    if (!rgb) { continue; }
    const ratio = contrastRatio(rgb, bgRgb);
    if (ratio >= 4.5) {
      const dist = Math.abs(shade - originalShade);
      if (dist < bestDist) {
        bestDist = dist;
        bestClass = `text-${colorName}-${shade}`;
      }
    }
  }

  return bestClass;
}

/**
 * Binary-search for an accessible foreground color by adjusting lightness.
 * Stays as close to the original hue/saturation as possible.
 */
function findAccessibleColor(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
  contrastRatio: (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => number,
): string | null {
  // Already passes
  if (contrastRatio(fg, bg) >= 4.5) { return null; }

  const hsl = rgbToHsl(fg);
  const bgLum = relativeLuminanceSimple(bg);
  const goDarker = bgLum > 0.179;

  let lo: number, hi: number;
  if (goDarker) { lo = 0; hi = hsl.l; }
  else { lo = hsl.l; hi = 1; }

  let bestColor: { r: number; g: number; b: number } | null = null;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const testRgb = hslToRgb(hsl.h, hsl.s, mid);
    const ratio = contrastRatio(testRgb, bg);

    if (ratio >= 4.5) {
      bestColor = testRgb;
      if (goDarker) { lo = mid; } else { hi = mid; }
    } else {
      if (goDarker) { hi = mid; } else { lo = mid; }
    }
  }

  if (!bestColor) {
    // Fallback: black or white
    if (contrastRatio({ r: 0, g: 0, b: 0 }, bg) >= 4.5) { return '#000000'; }
    return '#ffffff';
  }

  return `#${bestColor.r.toString(16).padStart(2, '0')}${bestColor.g.toString(16).padStart(2, '0')}${bestColor.b.toString(16).padStart(2, '0')}`;
}

/* ── Color math helpers (self-contained to avoid circular imports) ──── */

function relativeLuminanceSimple(c: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [c.r / 255, c.g / 255, c.b / 255].map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function rgbToHsl(c: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) { return { h: 0, s: 0, l }; }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) { h = ((g - b) / d + (g < b ? 6 : 0)) / 6; }
  else if (max === g) { h = ((b - r) / d + 2) / 6; }
  else { h = ((r - g) / d + 4) / 6; }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) { t += 1; }
    if (t > 1) { t -= 1; }
    if (t < 1 / 6) { return p + (q - p) * 6 * t; }
    if (t < 1 / 2) { return q; }
    if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}
