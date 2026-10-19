export const MAX_PLAYER_NAME_LENGTH = 40;

// Turns a pasted list into names, like the old Add Player modal:
//   "1. Clark" / "2) Diego" / "3- Lenon" / "- Ana" / "• Ben" / "* Cy"  ->  the name only.
// New: repeated names (any capitalization) are kept once, so the preview list
// never shows the same player twice (the old app crashed into duplicate React keys).
export function parseBulkNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const line of text.split("\n")) {
    const name = line
      .replace(/^\s*\d+[.)-]\s*/, "")
      .replace(/^[-•*]\s*/, "")
      .trim();
    const key = name.toLowerCase();
    if (name.length === 0 || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}
