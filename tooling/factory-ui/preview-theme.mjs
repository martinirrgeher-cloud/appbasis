const DARK_FOREGROUND = "#000000";
const LIGHT_FOREGROUND = "#ffffff";
const MINIMUM_TEXT_CONTRAST = 4.5;

export function previewAccentForeground(accent) {
  const background = parseHexColor(accent);
  if (background === null) return DARK_FOREGROUND;

  const backgroundLuminance = relativeLuminance(background);
  const darkContrast = contrastRatio(backgroundLuminance, 0);

  // WCAG contrast against pure black and white has no gap below 4.5:1:
  // if black is below the threshold, the same background necessarily has
  // sufficient contrast against white. Prefer black whenever it already passes.
  return darkContrast >= MINIMUM_TEXT_CONTRAST ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}

export function contrastRatioForHex(first, second) {
  const firstColor = parseHexColor(first);
  const secondColor = parseHexColor(second);
  if (firstColor === null || secondColor === null) return null;
  return contrastRatio(relativeLuminance(firstColor), relativeLuminance(secondColor));
}

function parseHexColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function relativeLuminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(firstLuminance, secondLuminance) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
