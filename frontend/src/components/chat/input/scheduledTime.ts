export function formatScheduledTime(time: number): string {
  const [day, month, year, hour, minute] = scheduledTimeParts(time);
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

export function scheduledTimeParts(time: number): string[] {
  const date = new Date(time);
  return [date.getDate(), date.getMonth() + 1, date.getFullYear(), date.getHours(), date.getMinutes()]
    .map((value, index) => String(value).padStart(index === 2 ? 4 : 2, '0'));
}

export function parseScheduledTime(parts: string[]): number | undefined {
  if (parts.length !== 5 || !parts.every((part, index) => (index === 2 ? /^\d{4}$/ : /^\d{2}$/).test(part))) return undefined;
  const [day, month, year, hour, minute] = parts.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return undefined;
  return date.getTime();
}
