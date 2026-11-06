// Blue stars show merge rank; a yellow star and number show fixed rarity.
export function unitSummaryMarkup(rank: number, rarity: number) {
 return `<div class="unit-meta" role="group" aria-label="강화·레어도·가격"><span class="unit-upgrade" role="img" aria-label="강화 ${rank}성" title="강화 ${rank}성">${'★'.repeat(rank)}</span><span class="unit-meta-divider" aria-hidden="true">·</span><span class="unit-rarity" data-rarity="${rarity}" role="img" aria-label="레어도 ${rarity}등급" title="레어도 ${rarity}등급">★${rarity}</span><span class="unit-meta-divider" aria-hidden="true">·</span><span class="unit-price" role="img" aria-label="가격 ${rarity}골드" title="가격 ${rarity}골드">${rarity}G</span></div>`;
}
