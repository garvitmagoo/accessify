import { createAltChecker } from './altCheck';

/**
 * Rule: img-alt
 * Every <img> and Next.js <Image> element must have an alt attribute.
 */
export const checkImgAlt = createAltChecker({
  tagName: ['img', 'Image'],
  ruleId: 'img-alt',
  message: 'Image element must have an `alt` attribute for screen readers.',
});
