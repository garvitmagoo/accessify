/**
 * axe-core integration — maps our scanner rules to axe-core metadata
 * and provides validation helpers for fix scoring.
 */

import { validateJsxSyntax } from './jsxValidator';

// Re-export so existing imports from axeIntegration still work
export { validateJsxSyntax } from './jsxValidator';

// axe-core ships its rule metadata as JSON; we import the full spec
// so we can look up impact, WCAG tags, and help URLs at design time.
let _axeRules: AxeRuleMetadata[] | undefined;

export interface AxeRuleMetadata {
  ruleId: string;
  description: string;
  helpUrl: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
}

/** Map from our rule IDs to the corresponding axe-core rule IDs. */
const RULE_MAP: Record<string, string> = {
  'img-alt': 'image-alt',
  'button-label': 'button-name',
  'form-label': 'label',
  'aria-role': 'aria-allowed-role',
  'aria-pattern': 'aria-required-attr',
  'heading-order': 'heading-order',
  'color-contrast': 'color-contrast',
  'click-events-have-key-events': 'click-events-have-key-events',
  'no-positive-tabindex': 'tabindex',
  'autocomplete-valid': 'autocomplete-valid',
  'focus-visible': 'focus-visible',
  'no-mouse-only-hover': 'no-mouse-only-hover',
  'nextjs-image-alt': 'image-alt',
  'nextjs-link-text': 'link-name',
  'nextjs-head-lang': 'html-has-lang',
  'page-title': 'document-title',
  'anchor-is-valid': 'link-name',
  'no-redundant-roles': 'aria-allowed-role',
  'no-autofocus': 'no-autofocus',
  'interactive-supports-focus': 'interactive-supports-focus',
  'media-has-caption': 'video-caption',
  'no-access-key': 'accesskeys',
};

/** Impact → base confidence modifier. Higher impact = more confident the fix is important. */
const IMPACT_CONFIDENCE: Record<string, number> = {
  'critical': 95,
  'serious': 85,
  'moderate': 70,
  'minor': 55,
};

/** Per-rule static fix risk assessment. */
export interface StaticFixRisk {
  confidence: number;
  reasoning: string;
  caveat?: string;
}

/**
 * Risk profiles for each static fix. Even deterministic fixes carry risk:
 * - Some insert placeholder values the developer MUST fill in
 * - Some change semantics (heading level, role) that may cascade
 * - Some add boilerplate that may not match the app's logic
 */
const STATIC_FIX_RISKS: Record<string, StaticFixRisk | ((ctx?: string) => StaticFixRisk)> = {
  'img-alt': {
    confidence: 60,
    reasoning: 'Adds alt="" which marks the image as decorative (WCAG 1.1.1). If the image conveys information, this is wrong — the developer must supply a meaningful alt text.',
    caveat: 'Verify the image is truly decorative; informational images need descriptive alt text.',
  },
  'button-label': (ctx?: string) => {
    if (ctx && ctx.length > 0) {
      return {
        confidence: 85,
        reasoning: `Inferred label "${ctx}" from child icon component name (WCAG 4.1.2). Label is derived heuristically — verify it makes sense to users.`,
        caveat: 'Verify the inferred label accurately describes the button\'s action.',
      };
    }
    return {
      confidence: 45,
      reasoning: 'Adds an empty aria-label="" placeholder (WCAG 4.1.2). The developer MUST fill in a meaningful label — an empty label is just as inaccessible as none.',
      caveat: 'Empty aria-label provides no benefit; fill in a descriptive label immediately.',
    };
  },
  'form-label': {
    confidence: 45,
    reasoning: 'Adds an empty aria-label="" placeholder (WCAG 1.3.1). The developer MUST supply a descriptive label — screen readers will still announce this as unlabelled until filled in.',
    caveat: 'Consider using a visible <label> element instead for better UX; fill in the aria-label value.',
  },
  'click-events-have-key-events': {
    confidence: 55,
    reasoning: 'Adds role="button", tabIndex={0}, and a template onKeyDown handler (WCAG 2.1.1). The keyboard handler contains a placeholder comment and must be wired to the actual click logic.',
    caveat: 'The onKeyDown handler is a template — link it to the same logic as onClick. Consider using a <button> element instead.',
  },
  'aria-pattern': (ctx?: string) => {
    if (ctx?.includes('aria-expanded')) {
      return {
        confidence: 75,
        reasoning: 'Adds aria-expanded={false} required by the combobox/disclosure pattern (WCAG 4.1.2). Default false is safe but ensure it toggles correctly with the widget\'s state.',
      };
    }
    if (ctx?.includes('aria-controls') || ctx?.includes('aria-selected')) {
      return {
        confidence: 50,
        reasoning: 'Adds aria-controls="" and aria-selected={false} (WCAG 4.1.2). Both values are placeholders — aria-controls must reference the controlled panel\'s id.',
        caveat: 'aria-controls="" is invalid; fill in the target panel\'s id. Wire aria-selected to selection state.',
      };
    }
    return {
      confidence: 45,
      reasoning: 'Adds an empty aria-label="" placeholder for a required accessible name (WCAG 4.1.2). Must be filled in with a meaningful label.',
      caveat: 'Empty aria-label provides no benefit; fill in a descriptive label.',
    };
  },
  'heading-order': (ctx?: string) => {
    if (ctx?.includes('multiple-h1')) {
      return {
        confidence: 70,
        reasoning: 'Changes duplicate <h1> to <h2> (WCAG 1.3.1). Pages should have a single <h1>. Verify this heading isn\'t the intended page title.',
        caveat: 'If this component renders inside another layout that already has an <h1>, this fix is correct. Otherwise, check which <h1> is the real page title.',
      };
    }
    return {
      confidence: 65,
      reasoning: 'Adjusts heading level to maintain sequential hierarchy (WCAG 1.3.1). Heading order changes can cascade — other headings in the component may also need adjustment.',
      caveat: 'Check surrounding headings; fixing one level may require adjusting sibling headings too.',
    };
  },
  'aria-role': {
    confidence: 80,
    reasoning: 'Replaces an invalid ARIA role with the closest valid role by edit distance (WCAG 4.1.2). Likely a typo fix.',
    caveat: 'Verify the suggested role matches the element\'s intended behavior.',
  },
  'color-contrast': {
    confidence: 65,
    reasoning: 'Adjusts foreground color to meet WCAG 2.1 AA minimum contrast ratio of 4.5:1 (WCAG 1.4.3). The new color is computed algorithmically and may not match the design system.',
    caveat: 'The adjusted color meets contrast requirements but may not align with your design tokens. Consider using your nearest design-system color instead.',
  },
  'nextjs-image-alt': {
    confidence: 60,
    reasoning: 'Adds alt="" to Next.js Image, marking it as decorative (WCAG 1.1.1). If the image is informational, a descriptive alt is needed instead.',
    caveat: 'Same risk as img-alt: verify the image is truly decorative.',
  },
  'nextjs-head-lang': {
    confidence: 95,
    reasoning: 'Adds lang="en" to the HTML element (WCAG 3.1.1). Defaults to English — change it if the page language differs.',
  },
  'nextjs-link-text': {
    confidence: 45,
    reasoning: 'Adds an empty aria-label="" placeholder to Next.js Link (WCAG 2.4.4). Must be filled in; empty label is equally inaccessible.',
    caveat: 'Fill in a descriptive label describing the link destination.',
  },
  'autocomplete-valid': {
    confidence: 50,
    reasoning: 'Adds autoComplete="name" as a placeholder (WCAG 1.3.5). The actual autocomplete token depends on what the field collects (email, tel, address, etc.).',
    caveat: 'Change "name" to the correct token for this field: "email", "tel", "street-address", etc.',
  },
  'no-mouse-only-hover': {
    confidence: 55,
    reasoning: 'Adds an empty onFocus handler to pair with the mouse hover event (WCAG 2.1.1). The handler is a no-op placeholder and must be wired to show the same content as the hover.',
    caveat: 'The onFocus handler is empty — implement it to mirror the onMouseEnter/onMouseOver behavior.',
  },
  'anchor-is-valid': {
    confidence: 75,
    reasoning: 'Replaces `<a href="#">` with a `<button>` element (WCAG 2.4.4). If this element truly navigates, use a real URL instead.',
    caveat: 'Verify whether this element is an action (→ button) or navigation (→ real href).',
  },
  'no-redundant-roles': {
    confidence: 95,
    reasoning: 'Removes a redundant ARIA role that matches the element\'s implicit semantics. Safe to remove.',
  },
  'no-autofocus': {
    confidence: 70,
    reasoning: 'Removes autoFocus attribute (WCAG 3.2.1). Focus management should be done programmatically if needed.',
    caveat: 'If this is a search-only page or modal, autoFocus may be intentional. Verify before removing.',
  },
  'interactive-supports-focus': {
    confidence: 65,
    reasoning: 'Adds tabIndex={0} to make the element focusable (WCAG 2.1.1). Consider using a native interactive element (<button>) instead.',
    caveat: 'Adding tabIndex makes it focusable but doesn\'t add role semantics. A <button> may be more appropriate.',
  },
  'media-has-caption': {
    confidence: 50,
    reasoning: 'Adds a placeholder <track kind="captions"> element (WCAG 1.2.2). The src must point to a real caption file.',
    caveat: 'The track src is empty — provide a WebVTT (.vtt) caption file.',
  },
  'no-access-key': {
    confidence: 90,
    reasoning: 'Removes accessKey attribute. Access keys conflict with assistive technology shortcuts and are not discoverable.',
  },
};

function loadAxeRules(): AxeRuleMetadata[] {
  if (_axeRules) { return _axeRules; }

  try {
    // axe-core exposes its rules via the main export
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axe = require('axe-core');
    const rules: any[] = axe.getRules?.() ?? [];

    _axeRules = rules.map((r: any) => ({
      ruleId: r.ruleId,
      description: r.description ?? '',
      helpUrl: r.helpUrl ?? '',
      impact: r.impact ?? 'moderate',
      tags: r.tags ?? [],
    }));
  } catch {
    _axeRules = [];
  }
  return _axeRules;
}

/**
 * Look up axe-core metadata for one of our scanner rules.
 * Returns null if no mapping exists.
 */
export function getAxeMetadata(scannerRuleId: string): AxeRuleMetadata | null {
  const axeId = RULE_MAP[scannerRuleId];
  if (!axeId) { return null; }

  const rules = loadAxeRules();
  return rules.find(r => r.ruleId === axeId) ?? null;
}

/**
 * Get the WCAG criteria tags for a rule (e.g. ['wcag2a', 'wcag412']).
 */
export function getWcagTags(scannerRuleId: string): string[] {
  const meta = getAxeMetadata(scannerRuleId);
  if (!meta) { return []; }
  return meta.tags.filter(t => t.startsWith('wcag') || t.startsWith('best-practice'));
}

/**
 * Get the help URL from axe-core for a rule.
 */
export function getHelpUrl(scannerRuleId: string): string | null {
  return getAxeMetadata(scannerRuleId)?.helpUrl ?? null;
}

/**
 * Compute a base confidence score for a fix based on axe-core impact level
 * and whether the fix is a static (deterministic) or AI-generated fix.
 */
export function computeBaseConfidence(scannerRuleId: string, isStaticFix: boolean): number {
  if (isStaticFix) {
    const risk = getStaticFixRisk(scannerRuleId);
    return risk.confidence;
  }
  const meta = getAxeMetadata(scannerRuleId);
  const impact = meta?.impact ?? 'moderate';
  return IMPACT_CONFIDENCE[impact] ?? 70;
}

/**
 * Get detailed risk assessment for a static fix, including per-rule
 * confidence, reasoning, and caveats.
 * Pass `context` for rules whose risk depends on the specific diagnostic
 * (e.g. button-label with/without inferred icon label, heading-order sub-type).
 */
export function getStaticFixRisk(scannerRuleId: string, context?: string): StaticFixRisk {
  const entry = STATIC_FIX_RISKS[scannerRuleId];
  if (!entry) {
    // Fallback for unmapped rules
    return {
      confidence: 70,
      reasoning: 'Deterministic fix based on rule pattern.',
    };
  }
  if (typeof entry === 'function') {
    return entry(context);
  }
  return entry;
}

/**
 * Validate that an AI-proposed replacement actually addresses the rule.
 * Returns an adjusted confidence and validation notes.
 */
export function validateFix(
  rule: string,
  original: string,
  replacement: string,
): { adjustedConfidence: number; notes: string[] } {
  const notes: string[] = [];
  let confidence = computeBaseConfidence(rule, false);

  // Check that replacement differs from original
  if (original.trim() === replacement.trim()) {
    confidence = 0;
    notes.push('Replacement is identical to original');
    return { adjustedConfidence: confidence, notes };
  }

  // JSX syntax validation — reject broken code
  const syntaxResult = validateJsxSyntax(replacement);
  if (!syntaxResult.valid) {
    confidence = Math.max(5, confidence - 50);
    notes.push(`JSX syntax errors: ${syntaxResult.errors.slice(0, 3).join('; ')}`);
  }

  // Rule-specific validation
  switch (rule) {
    case 'img-alt':
      if (/\balt\s*=/.test(replacement) && !/\balt\s*=/.test(original)) {
        confidence = Math.min(100, confidence + 10);
        notes.push('alt attribute added correctly');
      } else if (!/\balt\s*=/.test(replacement)) {
        confidence = Math.max(10, confidence - 30);
        notes.push('Fix does not add alt attribute');
      }
      break;

    case 'button-label':
      if (/aria-label\s*=/.test(replacement) || /aria-labelledby\s*=/.test(replacement)) {
        confidence = Math.min(100, confidence + 10);
        notes.push('Accessible name added to button');
      }
      break;

    case 'form-label':
      if (/aria-label\s*=|<label/.test(replacement)) {
        confidence = Math.min(100, confidence + 10);
        notes.push('Label association added');
      }
      break;

    case 'heading-order': {
      const origH = original.match(/<h(\d)/);
      const replH = replacement.match(/<h(\d)/);
      if (origH && replH && origH[1] !== replH[1]) {
        confidence = Math.min(100, confidence + 5);
        notes.push(`Heading level changed from h${origH[1]} to h${replH[1]}`);
      }
      break;
    }

    case 'color-contrast': {
      const origColor = original.match(/color:\s*["']?([^"';]+)/);
      const replColor = replacement.match(/color:\s*["']?([^"';]+)/);
      if (origColor && replColor && origColor[1] !== replColor[1]) {
        confidence = Math.min(100, confidence + 5);
        notes.push('Foreground color adjusted for contrast');
      }
      break;
    }

    case 'click-events-have-key-events':
      if (/onKeyDown|onKeyUp|onKeyPress/.test(replacement)) {
        confidence = Math.min(100, confidence + 10);
        notes.push('Keyboard event handler added');
      }
      break;

    case 'aria-role':
      if (/role\s*=\s*"[a-z]+"/.test(replacement)) {
        confidence = Math.min(100, confidence + 5);
        notes.push('ARIA role updated');
      }
      break;
  }

  // Penalize if replacement removes significant content
  const origText = original.replace(/<[^>]*>/g, '').trim();
  const replText = replacement.replace(/<[^>]*>/g, '').trim();
  if (origText.length > 0 && replText.length < origText.length * 0.5) {
    confidence = Math.max(10, confidence - 20);
    notes.push('Warning: replacement removes significant text content');
  }

  // Penalize if replacement adds many new elements
  const origTags = (original.match(/<[A-Za-z]/g) || []).length;
  const replTags = (replacement.match(/<[A-Za-z]/g) || []).length;
  if (replTags > origTags + 4) {
    confidence = Math.max(10, confidence - 15);
    notes.push('Warning: replacement adds multiple new elements');
  }

  return { adjustedConfidence: Math.round(confidence), notes };
}
