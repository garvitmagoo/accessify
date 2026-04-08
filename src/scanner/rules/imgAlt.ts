import { createAltChecker } from './altCheck';

/**
 * Rule: img-alt
 * Every <img> element must have an alt attribute.
 */
export const checkImgAlt = createAltChecker({
  tagName: 'img',
  ruleId: 'img-alt',
  message: 'Image element must have an `alt` attribute for screen readers.',
});
