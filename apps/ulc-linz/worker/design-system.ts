/**
 * ULC UI-01 design foundations.
 *
 * Only shared visual primitives live here. Existing module-specific input,
 * authorization, auto-save and dialog behavior must remain untouched.
 * The first opt-in page is U12 (inherited by U14 and Kindertraining).
 */
export const ULC_DESIGN_SYSTEM_CSS = `:root {
  --ulc-brand: #147a46;
  --ulc-brand-contrast: #ffffff;
  --ulc-brand-soft: #e8f5ed;
  --ulc-color-page: #f8fafc;
  --ulc-color-surface: #ffffff;
  --ulc-color-text: #0f172a;
  --ulc-color-secondary: #475569;
  --ulc-color-border: #e2e8f0;
  --ulc-warning-border: #d4a017;
  --ulc-warning-tint: #facc15;
  --ulc-warning-edge: #eab308;
  --ulc-space-1: 4px;
  --ulc-space-2: 8px;
  --ulc-space-3: 12px;
  --ulc-space-4: 16px;
  --ulc-radius-card: 12px;
  --ulc-radius-control: 9px;
  --ulc-touch-target: 44px;
  --ulc-page-title-size: 1.4rem;
}
.ulc-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ulc-space-2);
  min-width: 0;
  margin: 0 0 var(--ulc-space-2);
}
.ulc-page-header__title { min-width: 0; }
.ulc-page-header__title h1 {
  margin: 0;
  font-size: var(--ulc-page-title-size);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -.025em;
  overflow-wrap: anywhere;
}
.ulc-page-header__title small {
  display: block;
  margin-top: 2px;
  font-size: .75rem;
  line-height: 1.3;
  color: var(--ulc-color-secondary);
  overflow-wrap: anywhere;
}
.ulc-ui-icon-action {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  min-width: var(--ulc-touch-target);
  min-height: var(--ulc-touch-target);
  padding: 0;
  border-radius: var(--ulc-radius-control);
  cursor: pointer;
}
.ulc-ui-icon-action:focus-visible,
.ulc-page-header :is(button, a):focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ulc-brand) 40%, white);
  outline-offset: 2px;
}
.ulc-ui-panel {
  min-width: 0;
  border: 1px solid var(--ulc-color-border);
  border-radius: var(--ulc-radius-card);
  background: var(--ulc-color-surface);
}
.ulc-ui-panel--pending {
  border-color: var(--ulc-warning-border);
  background: color-mix(in srgb, var(--ulc-warning-tint) 23%, var(--ulc-color-surface));
  box-shadow: inset 3px 0 0 var(--ulc-warning-edge);
}
@media (prefers-reduced-motion: reduce) {
  .ulc-ui-icon-action { transition: none; }
}
`;
