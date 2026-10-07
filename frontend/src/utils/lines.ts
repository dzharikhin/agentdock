/** Non-empty trimmed lines. */
export const parseLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/** `name<separator>value` lines; lines without a name are skipped. */
export const parsePairs = (value: string, separator: string) => parseLines(value).flatMap((line) => {
  const index = line.indexOf(separator);
  return index > 0 ? [{ name: line.slice(0, index).trim(), value: line.slice(index + separator.length).trim() }] : [];
});
