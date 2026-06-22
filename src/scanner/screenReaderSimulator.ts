import * as ts from "typescript";

export interface ScreenReaderAnnouncement {
  element: string;
  role: string;
  accessibleName: string;
  announcement: string;
  line: number;
  column: number;
  hasIssue: boolean;
  issueMessage?: string;
  /** Grouping category for filtering in the panel */
  category:
    | "landmark"
    | "heading"
    | "interactive"
    | "form"
    | "table"
    | "list"
    | "image"
    | "live-region"
    | "other";
  /** Additional description from aria-describedby or aria-description */
  description?: string;
}

export interface TabStop {
  element: string;
  role: string;
  accessibleName: string;
  line: number;
  column: number;
  tabIndex: number;
  hasIssue: boolean;
  issueMessage?: string;
}

const LANDMARK_ELEMENTS: Record<string, string> = {
  nav: "navigation",
  main: "main",
  aside: "complementary",
  header: "banner",
  footer: "contentinfo",
  section: "region",
  form: "form",
};

const HEADING_RE = /^h([1-6])$/;

const JSX_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/**
 * Walk the JSX AST and produce a list of announcements simulating what
 * a screen reader would say for each semantic / interactive element.
 */
export function simulateScreenReader(
  sourceCode: string,
  fileName: string,
): ScreenReaderAnnouncement[] {
  const isTsx =
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".html");
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const announcements: ScreenReaderAnnouncement[] = [];

  /** Map from id → label text, built in a pre-pass */
  const labelMap = new Map<string, string>();

  function decodeJsxEntities(text: string): string {
    return text.replace(
      /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
      (match, entity: string) => {
        if (entity[0] === "#") {
          const isHex = entity[1]?.toLowerCase() === "x";
          const raw = isHex ? entity.slice(2) : entity.slice(1);
          const codePoint = parseInt(raw, isHex ? 16 : 10);
          return Number.isFinite(codePoint) &&
            codePoint >= 0 &&
            codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : match;
        }
        return JSX_ENTITY_MAP[entity] ?? match;
      },
    );
  }

  function normalizeAnnouncementText(text: string): string {
    return decodeJsxEntities(text)
      // Strip JSX comments {/* ... */}
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Returns true if a string looks like raw code / CSS classes rather than
   * human-readable text. Used as a safety gate before inserting text into
   * announcements.
   */
  function looksLikeCode(text: string): boolean {
    // Tailwind / CSS utility class patterns: "text-[#fff]", "bg-red-500", "hover:border-white/5", etc.
    const utilityClassPattern = /(?:^|\s)(?:[\w-]+:)?(?:[a-z][\w-]*-\[.+?\]|[a-z][\w-]*-[\w./]+)/;
    // JSX / expression syntax: unmatched brackets, closing tags, arrow functions
    const codeSyntaxPattern = /[{}()[\]<>;]|=>|&&|\|\||\?\./;
    // If more than 30% of the string is non-alphanumeric (excluding basic punctuation)
    const stripped = text.replace(/[a-zA-Z0-9\s.,!?'"©®™$€£¥:–—-]/g, "");
    const specialCharRatio = stripped.length / Math.max(text.length, 1);

    return utilityClassPattern.test(text) || codeSyntaxPattern.test(text) || specialCharRatio > 0.3;
  }

  function getAttr(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
    name: string,
  ): string | undefined {
    for (const prop of node.attributes.properties) {
      if (!ts.isJsxAttribute(prop) || prop.name.getText(sourceFile) !== name) {
        continue;
      }
      if (!prop.initializer) {
        return "";
      }
      if (ts.isStringLiteral(prop.initializer)) {
        return normalizeAnnouncementText(prop.initializer.text);
      }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        if (ts.isStringLiteral(prop.initializer.expression)) {
          return normalizeAnnouncementText(prop.initializer.expression.text);
        }
        // For non-string expressions, try to produce a friendly textual
        // representation instead of dumping raw code. This avoids showing
        // large JS/JSX snippets in the screen reader panel (e.g. map() calls).
        return stringifyExpression(prop.initializer.expression);
      }
      return "";
    }
    return undefined;
  }

  function getTextContent(element: ts.JsxElement): string {
    const parts: string[] = [];
    for (const child of element.children) {
      if (ts.isJsxText(child)) {
        const t = normalizeAnnouncementText(child.getText(sourceFile));
        if (t && !looksLikeCode(t)) {
          parts.push(t);
        }
      } else if (ts.isJsxExpression(child) && child.expression) {
        // Avoid inserting raw expression source into the announcement.
        // Prefer literal text, nested JSX text, or a friendly placeholder.
        if (ts.isStringLiteral(child.expression)) {
          parts.push(normalizeAnnouncementText(child.expression.text));
        } else if (ts.isNoSubstitutionTemplateLiteral(child.expression)) {
          parts.push(normalizeAnnouncementText(child.expression.text));
        } else if (ts.isJsxElement(child.expression)) {
          parts.push(getTextContent(child.expression));
        } else if (
          ts.isParenthesizedExpression(child.expression) &&
          ts.isJsxElement(child.expression.expression)
        ) {
          parts.push(getTextContent(child.expression.expression));
        } else if (ts.isJsxSelfClosingElement(child.expression)) {
          // Self-closing components don't contribute textual content.
        } else {
          const text = stringifyExpression(child.expression);
          if (text && !looksLikeCode(text)) {
            parts.push(text);
          }
        }
      } else if (ts.isJsxElement(child)) {
        // Recurse into child elements to extract only text, not raw JSX
        parts.push(getTextContent(child));
      } else if (ts.isJsxFragment(child)) {
        // Recurse into fragments
        for (const fragChild of child.children) {
          if (ts.isJsxText(fragChild)) {
            const t = normalizeAnnouncementText(fragChild.getText(sourceFile));
            if (t && !looksLikeCode(t)) {
              parts.push(t);
            }
          } else if (ts.isJsxElement(fragChild)) {
            parts.push(getTextContent(fragChild));
          }
        }
      }
      // Deliberately skip JsxSelfClosingElement children — they don't
      // contribute text content (e.g. <Box />, <Icon />, <br />).
    }
    return normalizeAnnouncementText(parts.join(" "));
  }

  // ── Pre-pass: collect <label htmlFor="id">text</label> and <InputLabel>text</InputLabel> ──
  function collectLabels(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
      const tag = node.tagName.getText(sourceFile).toLowerCase();
      if (
        tag === "label" ||
        node.tagName.getText(sourceFile) === "InputLabel"
      ) {
        const htmlFor = getAttr(node, "htmlFor") || getAttr(node, "for");
        if (htmlFor) {
          const text = ts.isJsxElement(node.parent)
            ? getTextContent(node.parent)
            : stringifyExpression(node.parent as ts.Node);
          if (text) {
            labelMap.set(htmlFor, text);
          }
        }
      }
    }
    ts.forEachChild(node, collectLabels);
  }
  collectLabels(sourceFile);

  /**
   * Produce a compact, friendly string for arbitrary expressions so the
   * screen reader preview doesn't show raw code. Examples:
   *  - identifiers -> "{varName}"
   *  - array/map expressions -> "" (dynamic list)
   *  - JSX expressions or complex nodes -> "" (omit rather than "[dynamic]")
   *  - string literals -> the text
   *  - numeric literals -> the number as text
   */
  function stringifyExpression(node: ts.Node): string {
    if (ts.isIdentifier(node)) {
      return `{${node.getText(sourceFile)}}`;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return normalizeAnnouncementText(node.text);
    }
    if (ts.isNumericLiteral(node)) {
      return node.text;
    }
    if (ts.isParenthesizedExpression(node)) {
      if (ts.isJsxElement(node.expression)) {
        return getTextContent(node.expression);
      }
      if (ts.isJsxSelfClosingElement(node.expression)) {
        return "";
      }
      return stringifyExpression(node.expression);
    }
    // Ternary: try to extract text from the truthy branch only as a hint
    if (ts.isConditionalExpression(node)) {
      const whenTrue = stringifyExpression(node.whenTrue);
      if (whenTrue && !looksLikeCode(whenTrue)) {
        return whenTrue;
      }
      return "";
    }
    // Logical expressions (&&, ||, ??) — try the right operand
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const right = stringifyExpression(node.right);
        if (right && !looksLikeCode(right)) {
          return right;
        }
        return "";
      }
      // String concatenation with +
      if (op === ts.SyntaxKind.PlusToken) {
        const left = stringifyExpression(node.left);
        const right = stringifyExpression(node.right);
        const result = [left, right].filter(Boolean).join(" ");
        return result && !looksLikeCode(result) ? result : "";
      }
      return "";
    }
    // Template literals: extract the static text parts, use placeholders for spans
    if (ts.isTemplateExpression(node)) {
      const parts: string[] = [];
      const head = node.head.text;
      if (head.trim()) {
        parts.push(head.trim());
      }
      for (const span of node.templateSpans) {
        // For template spans, try to get a short representation
        const spanExpr = stringifyExpression(span.expression);
        if (spanExpr && !looksLikeCode(spanExpr)) {
          parts.push(spanExpr);
        }
        const literal = span.literal.text;
        if (literal.trim()) {
          parts.push(literal.trim());
        }
      }
      const result = parts.join(" ");
      return result && !looksLikeCode(result) ? result : "";
    }
    if (
      ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const text = node.getText(sourceFile);
      // Array iteration / formatting — produces dynamic content, omit
      if (/\bmap\b|\bfilter\b|\bjoin\b|\breduce\b|\bforEach\b/.test(text)) {
        return "";
      }
      // Common text formatting calls (e.g. t("key"), intl.formatMessage, etc.)
      if (/\bt\(|\bformat\b|\btoString\b/.test(text)) {
        return "";
      }
      return "";
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return "";
    }
    if (ts.isTaggedTemplateExpression(node)) {
      return "";
    }
    if (ts.isArrayLiteralExpression(node)) {
      return "";
    }
    if (ts.isObjectLiteralExpression(node)) {
      return "";
    }
    if (ts.isAwaitExpression(node)) {
      return "";
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      return stringifyExpression(node.expression);
    }
    if (ts.isNonNullExpression(node)) {
      return stringifyExpression(node.expression);
    }
    // For anything else, don't leak raw code — return empty
    return "";
  }

  /** Components that accept a `label` prop for accessible naming */
  const LABEL_PROP_COMPONENTS = new Set([
    "TextField",
    "Select",
    "Autocomplete",
    "Checkbox",
    "Radio",
    "Switch",
    "Slider",
    "Rating",
    "DatePicker",
    "TimePicker",
    "DateTimePicker",
    "Input",
    "NativeSelect",
    "OutlinedInput",
    "FilledInput",
    // Chakra UI
    "NumberInput",
    "PinInput",
    // Ant Design
    "InputNumber",
  ]);

  /** Resolve the accessible name for a form component, checking label prop, htmlFor, aria-label, etc. */
  function resolveFormLabel(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
    tagName: string,
  ): string {
    // 1. aria-label / aria-labelledby always wins
    const ariaLabel = getAttr(node, "aria-label");
    if (ariaLabel) {
      return ariaLabel;
    }
    const ariaLabelledBy = getAttr(node, "aria-labelledby");
    if (ariaLabelledBy) {
      return ariaLabelledBy;
    }

    // 2. Component `label` prop (MUI, Chakra, etc.)
    if (LABEL_PROP_COMPONENTS.has(tagName)) {
      const labelProp = getAttr(node, "label");
      if (labelProp) {
        return labelProp;
      }
    }

    // 3. htmlFor/id-based label association
    const id = getAttr(node, "id");
    if (id && labelMap.has(id)) {
      return labelMap.get(id)!;
    }

    // 4. title or placeholder as fallback
    const title = getAttr(node, "title");
    if (title) {
      return title;
    }
    const placeholder = getAttr(node, "placeholder");
    if (placeholder) {
      return placeholder;
    }

    return "";
  }

  /** Check if a node is hidden from screen readers via aria-hidden="true" */
  function isAriaHidden(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  ): boolean {
    const val = getAttr(node, "aria-hidden");
    return val === "true" || val === "";
  }

  /** Build a suffix string for ARIA states like expanded, pressed, checked */
  function getAriaStates(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  ): string {
    const states: string[] = [];
    const expanded = getAttr(node, "aria-expanded");
    if (expanded !== undefined) {
      states.push(expanded === "true" ? "expanded" : "collapsed");
    }
    const pressed = getAttr(node, "aria-pressed");
    if (pressed !== undefined) {
      states.push(
        pressed === "true"
          ? "pressed"
          : pressed === "mixed"
            ? "partially pressed"
            : "not pressed",
      );
    }
    const checked = getAttr(node, "aria-checked");
    if (checked !== undefined) {
      states.push(
        checked === "true"
          ? "checked"
          : checked === "mixed"
            ? "partially checked"
            : "not checked",
      );
    }
    const disabled =
      getAttr(node, "aria-disabled") || getAttr(node, "disabled");
    if (disabled !== undefined && disabled !== "false") {
      states.push("dimmed");
    }
    const required =
      getAttr(node, "aria-required") || getAttr(node, "required");
    if (required !== undefined && required !== "false") {
      states.push("required");
    }
    const current = getAttr(node, "aria-current");
    if (current && current !== "false") {
      states.push(`current ${current === "true" ? "item" : current}`);
    }
    return states.length ? ", " + states.join(", ") : "";
  }

  /** Get aria-describedby or aria-description text */
  function getDescription(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  ): string | undefined {
    return (
      getAttr(node, "aria-description") ||
      getAttr(node, "aria-describedby") ||
      undefined
    );
  }

  function process(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  ): void {
    // Skip aria-hidden elements
    if (isAriaHidden(node)) {
      return;
    }

    const tagName = node.tagName.getText(sourceFile);
    const tagLower = tagName.toLowerCase();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    const ariaLabel = getAttr(node, "aria-label");
    const ariaLabelledBy = getAttr(node, "aria-labelledby");
    const role = getAttr(node, "role");
    const title = getAttr(node, "title");
    const ariaStates = getAriaStates(node);
    const description = getDescription(node);

    let textContent = "";
    if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
      textContent = getTextContent(node.parent);
    }

    const computedName =
      ariaLabel || ariaLabelledBy || textContent || title || "";

    const descSuffix = description ? `. Description: "${description}"` : "";

    // ── Images ──
    if (tagLower === "img") {
      const alt = getAttr(node, "alt");
      if (alt !== undefined && alt !== "") {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "image",
          accessibleName: alt,
          announcement: `"${alt}", image${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "image",
          description,
        });
      } else if (alt === "") {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "image",
          accessibleName: "(decorative)",
          announcement: "(decorative image — hidden from screen reader)",
          line,
          column: character,
          hasIssue: false,
          category: "image",
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "image",
          accessibleName: "",
          announcement: "image (NO ACCESSIBLE NAME)",
          line,
          column: character,
          hasIssue: true,
          issueMessage:
            "Image is missing alt text — screen reader cannot describe it",
          category: "image",
        });
      }
      return;
    }

    // ── Headings ──
    const headingMatch = tagLower.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1];
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: `heading level ${level}`,
          accessibleName: name,
          announcement: `"${name}", heading level ${level}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "heading",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: `heading level ${level}`,
          accessibleName: "",
          announcement: `heading level ${level} (EMPTY)`,
          line,
          column: character,
          hasIssue: true,
          issueMessage: "Heading has no text content",
          category: "heading",
        });
      }
      return;
    }

    // ── Buttons ──
    const BUTTON_COMPONENTS = [
      "button",
      "iconbutton",
      "fab",
      "togglebutton",
      "loadingbutton",
      "splitbutton",
    ];
    if (
      BUTTON_COMPONENTS.includes(tagLower) ||
      tagName === "IconButton" ||
      tagName === "Fab" ||
      tagName === "ToggleButton"
    ) {
      const name = computedName || getAttr(node, "label") || "";
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "button",
          accessibleName: name,
          announcement: `"${name}", button${ariaStates}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "interactive",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "button",
          accessibleName: "",
          announcement: "button (NO ACCESSIBLE NAME)",
          line,
          column: character,
          hasIssue: true,
          issueMessage:
            "Button has no accessible name — screen reader cannot identify it",
          category: "interactive",
        });
      }
      return;
    }

    // ── Chip / Tag ──
    if (tagName === "Chip" || tagName === "Tag" || tagName === "Badge") {
      const name = computedName || getAttr(node, "label") || "";
      if (name) {
        const clickable =
          getAttr(node, "onClick") !== undefined ||
          getAttr(node, "onDelete") !== undefined;
        const roleStr = clickable ? "button" : "status";
        announcements.push({
          element: `<${tagName}>`,
          role: role || roleStr,
          accessibleName: name,
          announcement: `"${name}", ${tagName.toLowerCase()}${ariaStates}`,
          line,
          column: character,
          hasIssue: false,
          category: clickable ? "interactive" : "other",
        });
      }
      return;
    }

    // ── Links ──
    if (tagLower === "a" || tagName === "Link" || tagName === "NavLink") {
      const href = getAttr(node, "href") || getAttr(node, "to");
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "link",
          accessibleName: name,
          announcement: `"${name}", link${ariaStates}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "interactive",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "link",
          accessibleName: "",
          announcement: `link (NO ACCESSIBLE NAME)${href ? ` → ${href}` : ""}`,
          line,
          column: character,
          hasIssue: true,
          issueMessage: "Link has no accessible name",
          category: "interactive",
        });
      }
      return;
    }

    // ── FormControlLabel (wraps Checkbox, Radio, Switch with a label) ──
    if (tagName === "FormControlLabel") {
      // Extract label — may be a string literal or JSX expression like label={<Typography>Text</Typography>}
      let labelText = ariaLabel || "";
      if (!labelText) {
        for (const prop of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(prop) ||
            prop.name.getText(sourceFile) !== "label"
          ) {
            continue;
          }
          if (prop.initializer) {
            if (ts.isStringLiteral(prop.initializer)) {
              labelText = prop.initializer.text;
            } else if (
              ts.isJsxExpression(prop.initializer) &&
              prop.initializer.expression
            ) {
              const expr = prop.initializer.expression;
              if (ts.isStringLiteral(expr)) {
                labelText = expr.text;
              } else if (ts.isJsxElement(expr)) {
                labelText = getTextContent(expr);
              } else if (ts.isJsxSelfClosingElement(expr)) {
                // Self-closing JSX has no text content
                labelText = "";
              } else if (
                ts.isTemplateExpression(expr) ||
                ts.isNoSubstitutionTemplateLiteral(expr)
              ) {
                labelText = expr.getText(sourceFile);
              }
            }
          }
          break;
        }
      }
      // Determine control type from the `control` prop (e.g. control={<Checkbox />})
      let controlType = "checkbox";
      for (const prop of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(prop) ||
          prop.name.getText(sourceFile) !== "control"
        ) {
          continue;
        }
        if (
          prop.initializer &&
          ts.isJsxExpression(prop.initializer) &&
          prop.initializer.expression
        ) {
          const expr = prop.initializer.expression;
          if (ts.isJsxSelfClosingElement(expr)) {
            const ctrlTag = expr.tagName.getText(sourceFile).toLowerCase();
            if (ctrlTag === "radio") {
              controlType = "radio";
            } else if (ctrlTag === "switch") {
              controlType = "switch";
            } else {
              controlType = ctrlTag;
            }
          }
        }
      }
      if (labelText) {
        announcements.push({
          element: `<${tagName}>`,
          role: role || controlType,
          accessibleName: labelText,
          announcement: `"${labelText}", ${controlType}${ariaStates}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "form",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: role || controlType,
          accessibleName: "",
          announcement: `${controlType} (NO ACCESSIBLE NAME)`,
          line,
          column: character,
          hasIssue: true,
          issueMessage: "FormControlLabel is missing its label prop",
          category: "form",
        });
      }
      return;
    }

    // ── Form inputs ──
    if (
      tagLower === "input" ||
      tagLower === "select" ||
      tagLower === "textarea" ||
      LABEL_PROP_COMPONENTS.has(tagName)
    ) {
      const type = getAttr(node, "type") || "text";
      const placeholder = getAttr(node, "placeholder");
      const name = resolveFormLabel(node, tagName);
      const inputType =
        tagLower === "input"
          ? type
          : LABEL_PROP_COMPONENTS.has(tagName)
            ? tagLower
            : tagLower;

      if (name) {
        const extra =
          placeholder && name !== placeholder
            ? `, placeholder: "${placeholder}"`
            : "";
        announcements.push({
          element: `<${tagName}>`,
          role: role || inputType,
          accessibleName: name,
          announcement: `"${name}", ${inputType}${extra}${ariaStates}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "form",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: role || inputType,
          accessibleName: "",
          announcement: `${inputType} (NO ACCESSIBLE NAME)`,
          line,
          column: character,
          hasIssue: true,
          issueMessage: `Form ${inputType} has no label — screen reader cannot identify it`,
          category: "form",
        });
      }
      return;
    }

    // ── Tables ──
    if (tagLower === "table") {
      const name = computedName;
      announcements.push({
        element: `<${tagName}>`,
        role: role || "table",
        accessibleName: name,
        announcement: name ? `"${name}", table` : "table",
        line,
        column: character,
        hasIssue: false,
        category: "table",
        description,
      });
      return;
    }
    if (tagLower === "caption") {
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: "caption",
          accessibleName: name,
          announcement: `table caption: "${name}"`,
          line,
          column: character,
          hasIssue: false,
          category: "table",
        });
      }
      return;
    }
    if (tagLower === "th") {
      const scope = getAttr(node, "scope");
      const name = computedName;
      const scopeInfo = scope ? ` (${scope} header)` : "";
      announcements.push({
        element: `<${tagName}>`,
        role: role || "columnheader",
        accessibleName: name,
        announcement: name
          ? `"${name}", column header${scopeInfo}`
          : `column header${scopeInfo} (EMPTY)`,
        line,
        column: character,
        hasIssue: !name,
        issueMessage: !name ? "Table header is empty" : undefined,
        category: "table",
      });
      return;
    }

    // ── Lists ──
    if (tagLower === "ul" || tagLower === "ol") {
      const name = computedName;
      const listType = tagLower === "ol" ? "ordered list" : "list";
      // Count <li> children
      let itemCount = 0;
      if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
        for (const child of node.parent.children) {
          if (ts.isJsxElement(child)) {
            const childTag = child.openingElement.tagName
              .getText(sourceFile)
              .toLowerCase();
            if (childTag === "li") {
              itemCount++;
            }
          }
        }
      }
      const countInfo = itemCount > 0 ? `, ${itemCount} items` : "";
      announcements.push({
        element: `<${tagName}>`,
        role: role || "list",
        accessibleName: name,
        announcement: name
          ? `"${name}", ${listType}${countInfo}`
          : `${listType}${countInfo}`,
        line,
        column: character,
        hasIssue: false,
        category: "list",
        description,
      });
      return;
    }
    if (tagLower === "li") {
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: role || "listitem",
          accessibleName: name,
          announcement: `"${name}", list item`,
          line,
          column: character,
          hasIssue: false,
          category: "list",
        });
      }
      return;
    }

    // ── Dialog / Modal ──
    if (tagLower === "dialog" || role === "dialog" || role === "alertdialog") {
      const name = computedName;
      const dialogRole = role || "dialog";
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: dialogRole,
          accessibleName: name,
          announcement: `"${name}", ${dialogRole}${descSuffix}`,
          line,
          column: character,
          hasIssue: false,
          category: "landmark",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: dialogRole,
          accessibleName: "",
          announcement: `${dialogRole} (NO ACCESSIBLE NAME)`,
          line,
          column: character,
          hasIssue: true,
          issueMessage:
            "Dialog should have an accessible name via aria-label or aria-labelledby",
          category: "landmark",
        });
      }
      return;
    }

    // ── Details / Summary ──
    if (tagLower === "summary") {
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: "button",
          accessibleName: name,
          announcement: `"${name}", disclosure triangle, collapsed`,
          line,
          column: character,
          hasIssue: false,
          category: "interactive",
        });
      }
      return;
    }
    if (tagLower === "details") {
      announcements.push({
        element: `<${tagName}>`,
        role: "group",
        accessibleName: computedName,
        announcement: computedName
          ? `"${computedName}", details group`
          : "details group",
        line,
        column: character,
        hasIssue: false,
        category: "other",
      });
      return;
    }

    // ── Fieldset / Legend ──
    if (tagLower === "fieldset") {
      const name = computedName;
      announcements.push({
        element: `<${tagName}>`,
        role: role || "group",
        accessibleName: name,
        announcement: name ? `"${name}", group` : "group",
        line,
        column: character,
        hasIssue: !name,
        issueMessage: !name
          ? "Fieldset should have a <legend> or aria-label"
          : undefined,
        category: "form",
        description,
      });
      return;
    }
    if (tagLower === "legend") {
      const name = computedName;
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: "legend",
          accessibleName: name,
          announcement: `group label: "${name}"`,
          line,
          column: character,
          hasIssue: false,
          category: "form",
        });
      }
      return;
    }

    // ── Live regions ──
    const ariaLive = getAttr(node, "aria-live");
    if (ariaLive && ariaLive !== "off") {
      const name = computedName;
      announcements.push({
        element: `<${tagName}>`,
        role: role || `${ariaLive} live region`,
        accessibleName: name,
        announcement: name
          ? `live region (${ariaLive}): "${name}"`
          : `live region (${ariaLive})`,
        line,
        column: character,
        hasIssue: false,
        category: "live-region",
        description,
      });
      return;
    }
    if (
      role === "alert" ||
      role === "status" ||
      role === "log" ||
      role === "timer" ||
      role === "marquee"
    ) {
      const name = computedName;
      announcements.push({
        element: `<${tagName}>`,
        role,
        accessibleName: name,
        announcement: name ? `"${name}", ${role}` : role,
        line,
        column: character,
        hasIssue: false,
        category: "live-region",
        description,
      });
      return;
    }

    // ── Landmark elements ──
    if (LANDMARK_ELEMENTS[tagLower]) {
      const landmark = LANDMARK_ELEMENTS[tagLower];
      const name = computedName;
      const needsLabel = tagLower === "section" || tagLower === "form";
      if (name) {
        announcements.push({
          element: `<${tagName}>`,
          role: landmark,
          accessibleName: name,
          announcement: `"${name}", ${landmark} landmark`,
          line,
          column: character,
          hasIssue: false,
          category: "landmark",
          description,
        });
      } else {
        announcements.push({
          element: `<${tagName}>`,
          role: landmark,
          accessibleName: "",
          announcement: `${landmark} landmark`,
          line,
          column: character,
          hasIssue: needsLabel,
          issueMessage: needsLabel
            ? `<${tagLower}> landmark should have an aria-label`
            : undefined,
          category: "landmark",
        });
      }
      return;
    }

    // ── Elements with explicit role ──
    if (role) {
      const name = computedName;
      announcements.push({
        element: `<${tagName}>`,
        role,
        accessibleName: name,
        announcement: name
          ? `"${name}", ${role}${ariaStates}${descSuffix}`
          : `${role} (no accessible name)${ariaStates}`,
        line,
        column: character,
        hasIssue: !name,
        issueMessage: !name
          ? `Element with role="${role}" should have an accessible name`
          : undefined,
        category: "other",
        description,
      });
      return;
    }

    // ── Elements with aria-label but no role ──
    if (ariaLabel) {
      announcements.push({
        element: `<${tagName}>`,
        role: "generic",
        accessibleName: ariaLabel,
        announcement: `"${ariaLabel}"${descSuffix}`,
        line,
        column: character,
        hasIssue: false,
        category: "other",
        description,
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      // Skip entire subtree if aria-hidden
      if (isAriaHidden(node)) {
        return;
      }
      process(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return announcements;
}

/* ── Tab Order Simulation ──────────────────────────────────────────────── */

const FOCUSABLE_ELEMENTS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
]);

/**
 * Walk the JSX AST and produce the keyboard Tab order — the sequence of
 * elements a user would reach by pressing Tab. Elements with tabIndex > 0
 * come first (sorted ascending), then tabIndex=0 and natively focusable
 * elements in source order. Elements with tabIndex=-1 are skipped.
 */
export function simulateTabOrder(
  sourceCode: string,
  fileName: string,
): TabStop[] {
  const isTsx =
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".html");
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const stops: TabStop[] = [];

  function getAttrVal(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
    name: string,
  ): string | undefined {
    for (const prop of node.attributes.properties) {
      if (!ts.isJsxAttribute(prop) || prop.name.getText(sourceFile) !== name) {
        continue;
      }
      if (!prop.initializer) {
        return "";
      }
      if (ts.isStringLiteral(prop.initializer)) {
        return prop.initializer.text;
      }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        if (ts.isStringLiteral(prop.initializer.expression)) {
          return prop.initializer.expression.text;
        }
        if (ts.isNumericLiteral(prop.initializer.expression)) {
          return prop.initializer.expression.text;
        }
      }
      return undefined;
    }
    return undefined;
  }

  function getTabIndex(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  ): number | undefined {
    for (const prop of node.attributes.properties) {
      if (
        !ts.isJsxAttribute(prop) ||
        prop.name.getText(sourceFile) !== "tabIndex"
      ) {
        continue;
      }
      if (!prop.initializer) {
        return 0;
      }
      if (ts.isStringLiteral(prop.initializer)) {
        const n = parseInt(prop.initializer.text, 10);
        return isNaN(n) ? undefined : n;
      }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        if (ts.isNumericLiteral(prop.initializer.expression)) {
          return Number(prop.initializer.expression.text);
        }
        if (
          ts.isPrefixUnaryExpression(prop.initializer.expression) &&
          prop.initializer.expression.operator === ts.SyntaxKind.MinusToken &&
          ts.isNumericLiteral(prop.initializer.expression.operand)
        ) {
          return -Number(prop.initializer.expression.operand.text);
        }
      }
      return undefined;
    }
    return undefined;
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const tagLower = tagName.toLowerCase();

      // Check aria-hidden
      const ariaHidden = getAttrVal(node, "aria-hidden");
      if (ariaHidden === "true" || ariaHidden === "") {
        return;
      }

      // Check if disabled
      const disabled = getAttrVal(node, "disabled");
      if (disabled !== undefined) {
        ts.forEachChild(node, visit);
        return;
      }

      const explicitTabIndex = getTabIndex(node);
      const isNativelyFocusable = FOCUSABLE_ELEMENTS.has(tagLower);

      // Skip hidden inputs
      if (tagLower === "input") {
        const type = getAttrVal(node, "type");
        if (type === "hidden") {
          ts.forEachChild(node, visit);
          return;
        }
      }

      // Determine if this element is in the tab order
      let tabIndex: number | undefined;
      if (explicitTabIndex !== undefined) {
        if (explicitTabIndex >= 0) {
          tabIndex = explicitTabIndex;
        }
        // tabIndex = -1 → not in tab order
      } else if (isNativelyFocusable) {
        // <a> only if it has href
        if (tagLower === "a") {
          const href = getAttrVal(node, "href");
          if (href !== undefined) {
            tabIndex = 0;
          }
        } else {
          tabIndex = 0;
        }
      }

      if (tabIndex !== undefined && tabIndex >= 0) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        const ariaLabel = getAttrVal(node, "aria-label");
        const role = getAttrVal(node, "role");
        let accessibleName = ariaLabel || "";

        // Try to get text content for named elements
        if (
          !accessibleName &&
          ts.isJsxOpeningElement(node) &&
          ts.isJsxElement(node.parent)
        ) {
          const parts: string[] = [];
          for (const child of node.parent.children) {
            if (ts.isJsxText(child)) {
              const t = child.getText(sourceFile).trim();
              if (t) {
                parts.push(t);
              }
            }
          }
          accessibleName = parts.join(" ").replace(/\s+/g, " ").trim();
        }

        // Determine role
        let inferredRole = role || "";
        if (!inferredRole) {
          if (tagLower === "a") {
            inferredRole = "link";
          } else if (tagLower === "button" || tagLower === "summary") {
            inferredRole = "button";
          } else if (tagLower === "input") {
            const type = getAttrVal(node, "type") || "text";
            if (type === "checkbox") {
              inferredRole = "checkbox";
            } else if (type === "radio") {
              inferredRole = "radio";
            } else if (
              type === "submit" ||
              type === "reset" ||
              type === "button"
            ) {
              inferredRole = "button";
            } else {
              inferredRole = "textbox";
            }
          } else if (tagLower === "select") {
            inferredRole = "combobox";
          } else if (tagLower === "textarea") {
            inferredRole = "textbox";
          } else {
            inferredRole = tagLower;
          }
        }

        const hasIssue =
          tabIndex > 0 ||
          (!accessibleName &&
            isNativelyFocusable &&
            tagLower !== "input" &&
            tagLower !== "textarea" &&
            tagLower !== "select");

        stops.push({
          element: `<${tagName}>`,
          role: inferredRole,
          accessibleName,
          line,
          column: character,
          tabIndex,
          hasIssue,
          issueMessage:
            tabIndex > 0
              ? `Positive tabIndex (${tabIndex}) disrupts natural tab order`
              : !accessibleName && hasIssue
                ? "Focusable element has no accessible name"
                : undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Sort: positive tabIndex first (ascending), then tabIndex=0 in source order
  stops.sort((a, b) => {
    if (a.tabIndex > 0 && b.tabIndex > 0) {
      return a.tabIndex - b.tabIndex;
    }
    if (a.tabIndex > 0) {
      return -1;
    }
    if (b.tabIndex > 0) {
      return 1;
    }
    return 0; // preserve source order for tabIndex=0
  });

  return stops;
}
