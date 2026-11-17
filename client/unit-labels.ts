import type { UnitRole } from '../shared/blue-archive';
import type { Trait } from '../shared/model';
import { TRAITS } from '../shared/synergy';
import { traitIcon } from './synergy-ui';

// Distinct silhouettes remain readable beside the labels at 16px.
const roles: Record<UnitRole, {id: string; paths: string}> = {
 '딜러': {id: 'dealer', paths: '<path d="m15 3 6 0 0 6-11 11-6-6Z"/><path d="m4 12 8 8M8 16l-5 5M17 7l-7 7"/>'},
 '탱커': {id: 'tank', paths: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 7v10"/>'},
 '서포터': {id: 'support', paths: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a5 5 0 0 1 8-4 5 5 0 0 1 8 4Z"/><path d="M12 9v6m-3-3h6"/>'},
};

export function unitIdentityMarkup(role: UnitRole, trait: Trait): string {
 const icon = roles[role];
 return `<div class="unit-identity" aria-label="역할과 조합"><span class="unit-role-badge" data-role="${icon.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icon.paths}</svg>${role}</span><span class="unit-trait-badge" data-trait="${trait}">${traitIcon(trait)}${TRAITS[trait].name}</span></div>`;
}
