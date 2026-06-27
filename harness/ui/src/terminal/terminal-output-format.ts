export function normalizeTerminalGlyphSpacing(input: string) {
  return input
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" ? part : normalizeGlyphSpacedLine(part)))
    .join("");
}

function normalizeGlyphSpacedLine(line: string) {
  if (!isGlyphSpacedLine(line)) {
    return line;
  }
  return line.replace(/(\S) (?=\S)/g, "$1").replace(/ {2,}/g, " ");
}

function isGlyphSpacedLine(line: string) {
  const trimmed = line.trim();
  if (trimmed.length < 8 || /[A-Za-z]{3}/.test(trimmed)) {
    return false;
  }
  const glyphs = trimmed.replace(/\s+/g, "");
  if (glyphs.length < 4) {
    return false;
  }

  let separatedPairs = 0;
  for (let index = 0; index < trimmed.length - 2; index += 1) {
    if (/\S/.test(trimmed[index] ?? "") && trimmed[index + 1] === " " && /\S/.test(trimmed[index + 2] ?? "")) {
      separatedPairs += 1;
    }
  }
  return separatedPairs >= Math.max(4, Math.floor(glyphs.length * 0.45));
}
