/**
 * Shared AppFactory visual foundation for server-rendered/embedded CSS runtimes.
 *
 * packages/ui/tokens.css and foundation.css remain the default CSS source for
 * stylesheet consumers. This renderer makes the same basic design primitives
 * available to Workers that embed a prebuilt /app.css response as a string.
 *
 * Branding is per app, not per feature module. Never interpolate unvalidated
 * theme data into a CSS string.
 */
export interface AppBasisEmbeddedTheme {
  readonly accentColor: string;
}

export function renderAppBasisEmbeddedFoundationCss(theme: AppBasisEmbeddedTheme): string {
  if (!theme || typeof theme.accentColor !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(theme.accentColor)) {
    throw new Error("AppBasis theme accentColor must be a 6-digit hex color.");
  }
  const brand = theme.accentColor.toLowerCase();
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(brand.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  const foreground = (luminance + 0.05) / 0.05 >= 4.5 ? "#000000" : "#ffffff";
  return `:root {
  --ab-brand-primary: ${brand};
  --ab-brand-soft: color-mix(in srgb, var(--ab-brand-primary) 12%, #ffffff);
  --ab-brand-contrast: ${foreground};
  --ab-surface-page: #f8fafc;
  --ab-surface-card: #ffffff;
  --ab-text-primary: #0f172a;
  --ab-text-secondary: #475569;
  --ab-border-default: #e2e8f0;
  --ab-state-warning-border: #d4a017;
  --ab-state-warning-tint: #facc15;
  --ab-state-warning-edge: #eab308;
  --ab-space-1: 4px;
  --ab-space-2: 8px;
  --ab-space-3: 12px;
  --ab-space-4: 16px;
  --ab-radius-card: 12px;
  --ab-radius-control: 10px;
  --ab-touch-target: 44px;
  --ab-page-title-size: 1.4rem;
}
.ab-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ab-space-2);
  min-width: 0;
  margin: 0 0 var(--ab-space-2);
}
.ab-page-header__copy { min-width: 0; }
.ab-page-header__copy h1 {
  margin: 0;
  font-size: var(--ab-page-title-size);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -.025em;
  overflow-wrap: anywhere;
}
.ab-page-header__copy small {
  display: block;
  margin-top: 2px;
  font-size: .75rem;
  line-height: 1.3;
  color: var(--ab-text-secondary);
  overflow-wrap: anywhere;
}
.ab-icon-button {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  min-width: var(--ab-touch-target);
  min-height: var(--ab-touch-target);
  padding: 0;
  border-radius: var(--ab-radius-control);
  cursor: pointer;
}
.ab-icon-button:focus-visible,
.ab-page-header :is(button, a):focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ab-brand-primary) 40%, white);
  outline-offset: 2px;
}
.ab-surface {
  min-width: 0;
  border: 1px solid var(--ab-border-default);
  border-radius: var(--ab-radius-card);
  background: var(--ab-surface-card);
}
.ab-surface--warning {
  border-color: var(--ab-state-warning-border);
  background: color-mix(in srgb, var(--ab-state-warning-tint) 23%, var(--ab-surface-card));
  box-shadow: inset 3px 0 0 var(--ab-state-warning-edge);
}
/* AppFactory disclosure: one chevron at the leading edge, rotated when open.
   Opt-in only: overflow action menus (•••) deliberately remain unchanged. */
.ab-disclosure {
  display: flex;
  align-items: center;
  gap: var(--ab-space-2);
  list-style: none;
  cursor: pointer;
}
.ab-disclosure::marker { content: ""; }
.ab-disclosure::-webkit-details-marker { display: none; }
.ab-disclosure::before {
  content: "";
  display: inline-block;
  flex: 0 0 9px;
  width: 9px;
  height: 9px;
  margin-right: 2px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 120ms ease;
}
details[open] > .ab-disclosure::before { transform: rotate(45deg); }
@media (prefers-reduced-motion: reduce) {
  .ab-icon-button, .ab-disclosure::before { transition: none; }
}
`;
}
