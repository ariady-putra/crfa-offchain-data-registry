export * as bf from "./blockfrost";
export * as cache from "./cache";
export * as lucid from "./lucid";

export function joinWords(words: string[]) {
  if (words.length < 2) return words.join("");
  if (words.length === 2) return words.join(" and ");

  const last = words.length - 1;
  return joinWords([words.slice(0, last).join(", "), words[last]]);
}
