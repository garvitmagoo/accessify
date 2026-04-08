import { createAltChecker } from './altCheck';

/**
 * Rule: nextjs-image-alt
 * Next.js <Image> component (from next/image) must have an alt attribute.
 * Decorative images should use alt="" explicitly.
 */
export const checkNextjsImageAlt = createAltChecker({
  tagName: 'Image',
  ruleId: 'nextjs-image-alt',
  message: 'Next.js `<Image>` component must have an `alt` attribute. Use alt="" for decorative images.',
});
