/** Public assets live below Vite's configured base on GitHub project Pages. */
export function assetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? "/"}${path.replace(/^\//, "")}`;
}
