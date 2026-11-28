import { assetUrl } from "../shared/assets";

declare const __PAGES_UNIT_IMAGES__: Partial<Record<string, string>>;
const images = typeof __PAGES_UNIT_IMAGES__ === "undefined" ? {} : __PAGES_UNIT_IMAGES__;

export const PAGES_UNIT_FRAME_SIZE = 256;

export function usesPagesUnitArt(): boolean {
  return import.meta.env?.MODE === "pages" && document.documentElement.dataset.screenMode === "pc";
}

export function unitArtKey(unit: { kind: string; minion?: { variant: string } }): string {
  return unit.minion ? `minion-${unit.minion.variant}` : unit.kind;
}

export function pagesUnitImage(kind: string): string | undefined {
  const path = images[`${kind}.png`];
  return path && assetUrl(path);
}

export function unitPortrait(kind: string, original: string): string {
  if (!usesPagesUnitArt()) return original;
  const portrait = images[`icons/${kind}.png`];
  if (portrait) return assetUrl(portrait);
  return (kind.startsWith("minion-") ? pagesUnitImage(kind) : undefined) ?? original;
}

export function pagesTextureKey(kind: string): string {
  return `pages:${kind}`;
}
