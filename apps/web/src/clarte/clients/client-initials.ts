/** Up to two initials of a Client's name, for its decorative mark. */
export function clientInitials(displayName: string): string {
  return displayName
    .replace(/[„“”"«»]/gu, '')
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}
