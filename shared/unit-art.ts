import { assetUrl } from "./assets";

export type UnitArtStyle = "toon" | "pixel";

// Appearance is client-local. Both styles use the same unit kinds and rules.
export function unitArtStyle(search = ""): UnitArtStyle {
  return new URLSearchParams(search).get("art") === "pixel" ? "pixel" : "toon";
}

export const UNIT_ART_STYLE = unitArtStyle(typeof location === "undefined" ? "" : location.search);
export const UNIT_ART_FRAME_SIZE = UNIT_ART_STYLE === "toon" ? 256 : 128;

export function unitArtImage(id: string, portrait = false): string {
  const directory = UNIT_ART_STYLE === "toon" ? "blue-archive/toon" : "blue-archive";
  return assetUrl(`/units/${directory}/${portrait ? "icons/" : ""}${id}.png`);
}

export function minionArtImage(variant: "sentry" | "drone"): string {
  return assetUrl(UNIT_ART_STYLE === "toon"
    ? `/units/blue-archive/toon/minion-${variant}.png`
    : `/units/minion-${variant}.svg`);
}
