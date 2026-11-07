import appTheme from "../appbasis.theme.json";
import { renderAppBasisEmbeddedFoundationCss } from "../../../packages/ui/embedded-foundation";

/**
 * App-specific adapter. The Factory owns the design primitives, while
 * appbasis.theme.json owns this application's branding. The official
 * PWA icon remains the app's artwork and is not a global default.
 */
export const ULC_DESIGN_SYSTEM_CSS = renderAppBasisEmbeddedFoundationCss(appTheme);
