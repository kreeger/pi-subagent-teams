import type { TeamInputMatch } from "./types.js";

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function prefixPattern(alias: string): RegExp {
  const words = alias.trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(`^\\s*${words.join("\\s+")}(?::|(?:\\r?\\n)+)`, "i");
}

/** Resolve only standalone aliases and aliases anchored at the start of input. */
export function parseTeamInput(
  text: string,
  aliases: readonly string[],
): TeamInputMatch {
  const candidates = aliases
    .map((alias) => ({ alias, normalized: normalize(alias) }))
    .filter(({ normalized }) => normalized.length > 0)
    .sort((left, right) => right.normalized.length - left.normalized.length);
  const normalizedText = normalize(text);

  for (const candidate of candidates) {
    if (normalizedText === candidate.normalized) {
      return { kind: "standalone", alias: candidate.alias };
    }
  }

  const trimmed = text.trimStart();
  for (const candidate of candidates) {
    const match = prefixPattern(candidate.alias).exec(trimmed);
    if (match) {
      const remainder = trimmed.slice(match[0].length).trim();
      return remainder
        ? { kind: "prefix", alias: candidate.alias, remainder }
        : { kind: "standalone", alias: candidate.alias };
    }
  }

  return { kind: "none" };
}
