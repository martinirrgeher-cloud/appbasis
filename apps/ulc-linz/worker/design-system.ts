import appTheme from "../appbasis.theme.json";
import { renderAppBasisEmbeddedFoundationCss } from "../../../packages/ui/embedded-foundation";

/**
 * App-specific adapter. The Factory owns the design primitives, while
 * appbasis.theme.json owns this application's branding. The official
 * PWA icon remains the app's artwork and is not a global default.
 */
export const ULC_DESIGN_SYSTEM_CSS = renderAppBasisEmbeddedFoundationCss(appTheme);

// One mobile header layout for all four training pages. The app's component
// choices remain local, while shared geometry stays here rather than drifting
// between otherwise identical modules.
export const ULC_TRAINING_PAGE_HEADER_CSS = `
@media (max-width: 600px) {
  .ab-training-page-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    margin-bottom: 10px;
    padding-block: 8px;
  }
  .ab-training-page-header > div:first-child { min-width: 0; flex: 1 1 170px; }
  .ab-training-page-header .eyebrow,
  .ab-training-page-header .summary { display: none; }
  .ab-training-page-header h1 { margin: 0; overflow-wrap: anywhere; }
  .exercise-catalog-hero-actions { justify-content: flex-start; width: 100%; }
  .exercise-catalog-hero-actions .button:not([hidden]) { min-height: 40px; }
  .exercise-catalog-hero-actions #exercise-catalog-new { margin-left: auto; }
  #training-block-new:not([hidden]) { flex: 0 0 40px; min-height: 40px; }
  .training-documentation-hero > .button { align-self: flex-start; min-height: 40px; white-space: normal; }
  .training-plan-week-nav { min-width: 0; }
  .training-plan-week-nav .button { min-height: 40px; }
}
`;
