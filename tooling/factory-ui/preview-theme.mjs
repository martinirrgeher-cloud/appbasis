const DARK_FOREGROUND = "#0f172a";
const LIGHT_FOREGROUND = "#ffffff";

export function previewAccentForeground(accent) {
  const background = parseHexColor(accent);
  if (background === null) return DARK_FOREGROUND;

  const backgroundLuminance = relativeLuminance(background);
  const darkContrast = contrastRatio(
    backgroundLuminance,
    relativeLuminance(parseHexColor(DARK_FOREGROUND)),
  );
  const lightContrast = contrastRatio(
    backgroundLuminance,
    relativeLuminance(parseHexColor(LIGHT_FOREGROUND)),
  );

  return darkContrast >= lightContrast ? DARK_FOREGROUND : LIGHT_FOREGROUND;
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
