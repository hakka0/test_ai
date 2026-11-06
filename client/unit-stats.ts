import type { Stats } from "../shared/model";
import { attackSpeedFor } from "../shared/attack-speed";

// Inline SVG keeps small icons sharp at every device scale, without font/emoji
// differences or duplicate SVG IDs when the overview is copied into a dialog.
const criticalFragment = '<path data-critical-fragment fill="currentColor" d="M2 2l6 3 3-4 2 6 7-2-3 6 5 3-8 2-3 6-2-8-7 1 3-6Z"/>';
export const UNIT_STAT_ICONS = [
  { id: "hp", name: "체력", color: "#65d793", text: "피해를 버티는 최대 체력입니다.",
    shape: '<path fill="currentColor" d="M12 21 3.9 13.4C-2 7.8 5.8-1 12 5.5 18.2-1 26 7.8 20.1 13.4Z"/>' },
  { id: "attack", name: "공격력", color: "#ff667a", text: "기본 공격의 피해 계산에 사용하는 공격력입니다.",
    shape: '<g transform="rotate(35 12 12)"><path fill="currentColor" d="M8 19V9c0-3 4-7 4-7s4 4 4 7v10ZM7 20h10v3H7Z"/><path stroke="#0e1523" stroke-width="1.5" d="M8 15h8"/></g>' },
  { id: "defense", name: "방어력", color: "#66baff", text: "높을수록 받는 공격 피해가 감소합니다.",
    shape: '<path fill="currentColor" d="m12 2 9 3v6c0 6-9 11-9 11S3 17 3 11V5Z"/><path stroke="#d9efff" stroke-width="1.3" stroke-linecap="round" d="M12 5v13"/>' },
  { id: "crit-chance", name: "치명타 확률", color: "#ffd45c", text: "공격이 치명타로 적중할 확률입니다.", shape: criticalFragment },
  { id: "crit-damage", name: "치명타 피해", color: "#ffd45c", text: "치명타의 총 피해 배율입니다. 150%는 일반 타격의 1.5배입니다.",
    shape: criticalFragment + '<path data-critical-up d="M19 23v-9m-3 3 3-3 3 3" stroke="#0e1523" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 23v-9m-3 3 3-3 3 3" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: "attack-speed", name: "공격 속도", color: "#ffd45c", text: "초당 기본 공격 횟수입니다. 1.00은 1초에 1회이며, 높을수록 빠릅니다.",
    shape: '<g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m6-1 2 2m-8 3v4l3 2"/></g>' },
  { id: "range", name: "사거리", color: "#f1f5f9", text: "기본 공격이 닿는 최대 거리입니다. 단위는 전장 칸입니다.",
    shape: '<path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4"/>' },
] as const;

export const UNIT_STAT_HELP = Object.fromEntries(UNIT_STAT_ICONS.map(s =>
  ["stat-" + s.id, { title: s.name, text: s.text }]));

export function unitStatsMarkup(stats: Stats, interactive=true): string {
  const speed = attackSpeedFor(stats.interval);
  const values = { hp: String(stats.hp), attack: String(stats.attack), defense: String(stats.defense),
    "crit-chance": `${stats.critChance}%`, "crit-damage": `${stats.critDamage}%`,
    "attack-speed": speed.text, range: String(stats.range) };
  return '<div class="stats" role="group" aria-label="유닛 능력치">' + UNIT_STAT_ICONS.map(s => {
    const value = values[s.id], spoken = s.id === "range" ? value + "칸"
      : s.id === "attack-speed" ? value + "회/초 · " + speed.grade : value;
    const attributes=interactive?`type="button" class="stat help-trigger" data-help="stat-${s.id}" data-help-title="${s.name} ${spoken}" aria-label="${s.name} ${spoken} 도움말" aria-expanded="false" aria-controls="game-help-tooltip"`:`class="stat" aria-label="${s.name} ${spoken}"`;
    return `<${interactive?'button':'div'} ${attributes} data-stat="${s.id}"><svg class="stat-icon" viewBox="0 0 24 24" fill="none" style="color:${s.color}" aria-hidden="true" focusable="false">${s.shape}</svg><span class="stat-value"><span class="stat-label" aria-hidden="true">${s.name}</span><strong>${value}</strong>${s.id === "attack-speed" ? `<span class="attack-speed-grade">${speed.grade}</span>` : ""}</span></${interactive?'button':'div'}>`;
  }).join("") + "</div>";
}
