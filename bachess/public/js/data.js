// 게임 데이터: 학생, 역할, 무기, 장비, 시너지, 적 웨이브
export const PC_MODE = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
export const COLS = PC_MODE ? 8 : 9;
export const SIDE_ROWS = PC_MODE ? 4 : 3;
export const ROWS = SIDE_ROWS * 2;
export const CW = 88;           // 칸 폭(px)
export const CH = 76;           // 칸 높이(px)
export const BOARD_W = COLS * CW;
export const BOARD_H = ROWS * CH;
const centerCol = (COLS - 1) / 2;
export const CENTER_COLS = Array.from({ length: COLS }, (_, col) => col)
  .sort((a, b) => Math.abs(a - centerCol) - Math.abs(b - centerCol));
export const FRONT_ROWS = Array.from({ length: SIDE_ROWS }, (_, row) => row);
export const BACK_ROWS = FRONT_ROWS.slice().reverse();
export const MAX_ROUND = 15;
export const BENCH_SIZE = 9;
export const STAR_MULT = [1, 1.8, 3.2];
export const SKILL_MULT = [1, 1.6, 2.6];
export const COST_MULT = [1, 1.25, 1.6, 2.05, 2.7];
export const COST_COLORS = ['#9aa7b8', '#4fbf6a', '#3d8df0', '#a45ce6', '#f0b020'];

export const SCHOOLS = {
  abydos:     { name: '아비도스',  color: '#37b6e8', letter: '아' },
  gehenna:    { name: '게헨나',    color: '#e2505c', letter: '게' },
  trinity:    { name: '트리니티',  color: '#e9a82e', letter: '트' },
  millennium: { name: '밀레니엄',  color: '#7d6be0', letter: '밀' },
};

export const ROLES = {
  tank:    { name: '탱커',   color: '#3a7ee0', hp: 720, atk: 24, as: 1.0, def: 0.18, desc: '전열에서 피해를 받아 내는 역할' },
  dealer:  { name: '딜러',   color: '#e2505c', hp: 430, atk: 36, as: 1.0, def: 0.04, desc: '높은 피해를 주는 화력 담당' },
  support: { name: '서포터', color: '#3dbd7e', hp: 470, atk: 22, as: 0.95, def: 0.07, desc: '회복, 배리어, 버프로 아군을 돕는 역할' },
};

// range: 칸 단위 사거리, atk/as: 무기별 보정
export const WEAPONS = {
  SG:  { name: '샷건',       range: 1, atk: 1.35, as: 0.75, pellets: 5, spread: 0.32, speed: 900,  color: '#ffb347', kick: 9, len: 18 },
  SMG: { name: '기관단총',   range: 2, atk: 0.52, as: 2.1,  pellets: 1, spread: 0.10, speed: 1100, color: '#ffe27a', kick: 3, len: 16 },
  AR:  { name: '돌격소총',   range: 3, atk: 0.95, as: 1.15, pellets: 1, spread: 0.04, speed: 1300, color: '#ffe9a0', kick: 5, len: 24 },
  HG:  { name: '권총',       range: 3, atk: 0.85, as: 1.05, pellets: 1, spread: 0.03, speed: 1200, color: '#fff0b8', kick: 4, len: 12 },
  MG:  { name: '기관총',     range: 4, atk: 0.50, as: 2.4,  pellets: 1, spread: 0.14, speed: 1200, color: '#ffc861', kick: 4, len: 28 },
  SR:  { name: '저격총',     range: 6, atk: 2.4,  as: 0.55, pellets: 1, spread: 0.0,  speed: 2400, color: '#8be4ff', kick: 12, len: 34 },
};

// ---------- 학생 ----------
// hair/eye/skin: 외형 색, outfit: [주색, 포인트색]
function student(def, imageKey, name = def.name) {
  if (!PC_MODE || !imageKey) return def;
  return { ...def, imageKey, name };
}
export const UNITS = [
  // ★1 코스트
  student({ key: 'serika',  name: '세리카',  school: 'abydos',     role: 'dealer',  weapon: 'SMG', cost: 1, hair: '#2b2b3a', eye: '#e8a43a', style: 'twin',  acc: 'ears',    halo: '#ffe56b', outfit: ['#f4f7fb', '#e8a43a'],
    skill: { name: '와일드 러시', type: 'buff', scope: 'self', as: 0.7, dur: 4, mana: [30, 70] } }, 'izuna', '이즈나'),
  student({ key: 'ayane',   name: '아야네',  school: 'abydos',     role: 'support', weapon: 'HG',  cost: 1, hair: '#c98fb0', eye: '#8a5bb0', style: 'bob',   acc: 'glasses', halo: '#ffe56b', outfit: ['#f4f7fb', '#58b8d8'],
    skill: { name: '응급 처치', type: 'heal', amt: 120, atkMult: 2.2, count: 1, mana: [30, 60] } }),
  student({ key: 'haruka',  name: '하루카',  school: 'gehenna',    role: 'tank',    weapon: 'SG',  cost: 1, hair: '#6b3a55', eye: '#d85a7a', style: 'long',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#d9444f'],
    skill: { name: '폭주 방어', type: 'barrier', pct: 0.22, dur: 5, taunt: 3, r: 0, mana: [30, 70] } }),
  student({ key: 'hanako',  name: '하나코',  school: 'trinity',    role: 'tank',    weapon: 'SG',  cost: 1, hair: '#f3d9a6', eye: '#e0a0b0', style: 'long',  acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#d4a847'],
    skill: { name: '방패 전개', type: 'barrier', pct: 0.13, dur: 5, taunt: 0, r: 1.6, mana: [30, 70] } }, 'natsu', '나츠'),
  student({ key: 'momoi',   name: '모모이',  school: 'millennium', role: 'dealer',  weapon: 'MG',  cost: 1, hair: '#f2c9a0', eye: '#e86a6a', style: 'twin',  acc: 'ears',    halo: '#ff9ad0', outfit: ['#454b86', '#f2a8d0'],
    skill: { name: '난사', type: 'barrage', shots: 8, mult: 0.8, mana: [30, 70] } }, 'maki', '마키'),
  student({ key: 'yuzu',    name: '유즈',    school: 'millennium', role: 'support', weapon: 'HG',  cost: 1, hair: '#e8d86a', eye: '#7a5ac0', style: 'pony',  acc: 'none',    halo: '#9ad0ff', outfit: ['#454b86', '#ffd24a'],
    skill: { name: '게임 개발 지원', type: 'buff', scope: 'near', r: 2.6, atkp: 0.25, as: 0.1, dur: 5, mana: [30, 65] } }, 'yuzu'),
  // 2 코스트
  student({ key: 'nonomi',  name: '노노미',  school: 'abydos',     role: 'tank',    weapon: 'SG',  cost: 2, hair: '#e9a65a', eye: '#58a8d8', style: 'long',  acc: 'none',    halo: '#ffe56b', outfit: ['#f4f7fb', '#58b8d8'],
    skill: { name: '서프라이즈 샷건', type: 'blast', mult: 2.4, r: 1.3, selfPct: 0.12, mana: [30, 75] } }),
  student({ key: 'mutsuki', name: '무츠키',  school: 'gehenna',    role: 'dealer',  weapon: 'SMG', cost: 2, hair: '#e8e0d0', eye: '#e84a5a', style: 'twin',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#e8e0d0'],
    skill: { name: '폭죽 대소동', type: 'blast', mult: 3.0, r: 1.5, mana: [30, 80] } }, 'neru', '네루'),
  student({ key: 'koharu',  name: '코하루',  school: 'trinity',    role: 'support', weapon: 'HG',  cost: 2, hair: '#f2b6c6', eye: '#e8688a', style: 'bob',   acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#f08aa8'],
    skill: { name: '치유의 기도', type: 'heal', amt: 140, atkMult: 2.5, count: 2, mana: [30, 70] } }, 'koharu'),
  student({ key: 'azusa',   name: '아즈사',  school: 'trinity',    role: 'dealer',  weapon: 'SR',  cost: 2, hair: '#3a2f4a', eye: '#6a58c0', style: 'long',  acc: 'none',    halo: '#fff2a0', outfit: ['#f6f3ea', '#4a4a7a'],
    skill: { name: '정조준 사격', type: 'burst', mult: 3.4, mana: [30, 70] } }, 'azusa'),
  student({ key: 'midori',  name: '미도리',  school: 'millennium', role: 'dealer',  weapon: 'MG',  cost: 2, hair: '#e6c86a', eye: '#4ab87a', style: 'short', acc: 'ears',    halo: '#a0ff9a', outfit: ['#454b86', '#6ad08a'],
    skill: { name: '탄막 전개', type: 'barrage', shots: 12, mult: 0.75, mana: [30, 80] } }, 'midori'),
  student({ key: 'kayoko',  name: '카요코',  school: 'gehenna',    role: 'dealer',  weapon: 'HG',  cost: 2, hair: '#3a3a4a', eye: '#d84a58', style: 'long',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#c04858'],
    skill: { name: '조커 샷', type: 'burst', mult: 3.2, mana: [30, 65] } }, 'haruna', '하루나'),
  // 3 코스트
  student({ key: 'shiroko', name: '시로코',  school: 'abydos',     role: 'dealer',  weapon: 'AR',  cost: 3, hair: '#c9d6e6', eye: '#3a9ad8', style: 'pony',  acc: 'none',    halo: '#ffe56b', outfit: ['#f4f7fb', '#3a9ad8'],
    skill: { name: '사막의 질주', type: 'barrage', shots: 10, mult: 0.95, mana: [35, 85] } }, 'shiroko'),
  student({ key: 'iori',    name: '이오리',  school: 'gehenna',    role: 'tank',    weapon: 'SG',  cost: 3, hair: '#4a3a4a', eye: '#e04a5a', style: 'twin',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#d9444f'],
    skill: { name: '지옥불 사격', type: 'blast', mult: 3.1, r: 1.6, selfPct: 0.15, taunt: 2, mana: [35, 85] } }, 'iori'),
  student({ key: 'hasumi',  name: '하스미',  school: 'trinity',    role: 'dealer',  weapon: 'AR',  cost: 3, hair: '#8a6a4a', eye: '#d89a3a', style: 'long',  acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#b88a3a'],
    skill: { name: '집중 저격', type: 'burst', mult: 4.2, mana: [35, 80] } }, 'wakamo', '와카모'),
  student({ key: 'yuuka',   name: '유우카',  school: 'millennium', role: 'tank',    weapon: 'SMG', cost: 3, hair: '#2f2f4a', eye: '#5a78d8', style: 'twin',  acc: 'none',    halo: '#9ad0ff', outfit: ['#454b86', '#c8d4f0'],
    skill: { name: '철벽 계산', type: 'barrier', pct: 0.2, dur: 5, taunt: 0, r: 2.2, mana: [35, 80] } }, 'yuuka'),
  student({ key: 'mari',    name: '마리',    school: 'trinity',    role: 'support', weapon: 'HG',  cost: 3, hair: '#f6e6a8', eye: '#6aa8e0', style: 'long',  acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#6aa8e0'],
    skill: { name: '수호의 기도', type: 'barrier', pct: 0.12, flat: 120, dur: 6, taunt: 0, r: 2.8, mana: [35, 80] } }, 'hifumi', '히후미'),
  // 4 코스트
  student({ key: 'hoshino', name: '호시노',  school: 'abydos',     role: 'tank',    weapon: 'SG',  cost: 4, hair: '#f0a0b8', eye: '#58b0e0', style: 'long',  acc: 'none',    halo: '#ffe56b', outfit: ['#f4f7fb', '#5a9ad0'],
    skill: { name: '방패 전술', type: 'barrier', pct: 0.42, dur: 6, taunt: 4, r: 0, mana: [40, 90] } }, 'hoshino'),
  student({ key: 'aru',     name: '아루',    school: 'gehenna',    role: 'dealer',  weapon: 'SR',  cost: 4, hair: '#f2f2f2', eye: '#e04a5a', style: 'long',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#e04a5a'],
    skill: { name: '아루 사장님의 일격', type: 'snipe', mult: 5.4, w: 0.6, mana: [40, 95] } }, 'aru'),
  student({ key: 'mika',    name: '미카',    school: 'trinity',    role: 'dealer',  weapon: 'AR',  cost: 4, hair: '#f6c8d0', eye: '#e86a9a', style: 'long',  acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#e87aa8'],
    skill: { name: '천둥 일제 사격', type: 'barrage', shots: 14, mult: 1.0, mana: [40, 90] } }, 'mika'),
  student({ key: 'noa',     name: '노아',    school: 'millennium', role: 'support', weapon: 'SMG', cost: 4, hair: '#f2e6c8', eye: '#6a78d8', style: 'long',  acc: 'none',    halo: '#9ad0ff', outfit: ['#454b86', '#e8e0f0'],
    skill: { name: '전술 지휘', type: 'buff', scope: 'team', atkp: 0.2, as: 0.35, dur: 6, mana: [40, 90] } }, 'noa'),
  // 5 코스트
  student({ key: 'hina',    name: '히나',    school: 'gehenna',    role: 'dealer',  weapon: 'MG',  cost: 5, hair: '#f2f2f6', eye: '#a05ac0', style: 'long',  acc: 'horn',    halo: '#ff8a8a', outfit: ['#3a3340', '#f2f2f6'],
    skill: { name: '풍기위원장의 사격', type: 'barrage', shots: 26, mult: 0.8, mana: [50, 110] } }, 'hina'),
  student({ key: 'alice',   name: '아리스',  school: 'millennium', role: 'dealer',  weapon: 'SR',  cost: 5, hair: '#2b2f4a', eye: '#58c8f0', style: 'long',  acc: 'none',    halo: '#7ae0ff', outfit: ['#454b86', '#58c8f0'],
    skill: { name: '빛이여!', type: 'snipe', mult: 10, w: 1.2, mana: [50, 110] } }, 'aris'),
  student({ key: 'nagisa',  name: '나기사',  school: 'trinity',    role: 'support', weapon: 'HG',  cost: 5, hair: '#f6f0d8', eye: '#6ab0e8', style: 'long',  acc: 'ribbon',  halo: '#fff2a0', outfit: ['#f6f3ea', '#8ab8e8'],
    skill: { name: '티 파티', type: 'heal', amt: 0, atkMult: 0, pct: 0.28, count: 0, shield: 0.12, mana: [50, 100] } }),
];
export const UNIT_BY_KEY = Object.fromEntries(UNITS.map((u) => [u.key, u]));
export const POOL_SIZE = [22, 18, 15, 12, 9];

// 상점 확률 (플레이어 레벨별 코스트 1~5)
export const SHOP_ODDS = {
  1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0], 4: [55, 30, 15, 0, 0], 5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0], 7: [19, 30, 35, 15, 1], 8: [15, 20, 35, 25, 5], 9: [10, 15, 30, 30, 15],
};
export const XP_NEED = { 1: 1, 2: 2, 3: 6, 4: 12, 5: 20, 6: 32, 7: 48, 8: 70 };
export const MAX_LEVEL = 9;

// ---------- 스탯 계산 ----------
export function baseStats(def, star) {
  const r = ROLES[def.role];
  const w = WEAPONS[def.weapon];
  const cm = COST_MULT[def.cost - 1];
  const sm = STAR_MULT[star - 1];
  return {
    hp: Math.round(r.hp * cm * sm),
    atk: Math.round(r.atk * cm * sm * w.atk * 10) / 10,
    as: Math.round(r.as * w.as * 100) / 100,
    def: r.def,
    range: w.range,
    manaMax: def.skill.mana[1],
    mana0: def.skill.mana[0],
  };
}

// ---------- 스킬 설명 ----------
export function skillDesc(def, star = 1) {
  const s = def.skill; const p = SKILL_MULT[star - 1];
  const f = (v) => Math.round(v * 100) + '%';
  const n = (v) => Math.round(v);
  switch (s.type) {
    case 'burst': return `대상에게 공격력의 <b>${f(s.mult * p)}</b> 피해를 주는 강력한 일격을 가한다.`;
    case 'barrage': return `사거리 내 적에게 공격력의 <b>${f(s.mult * p)}</b> 피해의 탄환을 <b>${s.shots}발</b> 연속 사격한다.`;
    case 'blast': return `대상 주변 ${s.r}칸에 공격력의 <b>${f(s.mult * p)}</b> 폭발 피해를 준다.` + (s.selfPct ? ` 자신도 최대 체력 ${f(s.selfPct * p)}의 배리어를 얻는다.` : '') + (s.taunt ? ` ${s.taunt}초간 적의 시선을 끈다.` : '');
    case 'barrier': {
      const who = s.r > 0 ? `주변 ${s.r}칸 아군에게` : '자신에게';
      return `${who} 최대 체력의 <b>${f(s.pct * p)}</b>${s.flat ? ` + ${n(s.flat * p)}` : ''}만큼 <b>배리어</b>를 ${s.dur}초간 부여한다.` + (s.taunt ? ` ${s.taunt}초간 적의 공격을 도발한다.` : '');
    }
    case 'heal': {
      if (s.pct) return `모든 아군의 체력을 최대 체력의 <b>${f(s.pct * p)}</b>만큼 회복하고 ${f(s.shield * p)} 배리어를 부여한다.`;
      return `체력이 가장 낮은 아군 <b>${s.count}명</b>을 <b>${n((s.amt + 0) * p)}</b> + 공격력의 ${f(s.atkMult * p)}만큼 회복한다.`;
    }
    case 'buff': {
      const sc = s.scope === 'self' ? '자신의' : s.scope === 'team' ? '모든 아군의' : `주변 ${s.r}칸 아군의`;
      const parts = [];
      if (s.atkp) parts.push(`공격력 +${f(s.atkp * p)}`);
      if (s.as) parts.push(`공격 속도 +${f(s.as * Math.min(p, 1.6))}`);
      return `${sc} ${parts.join(', ')} (${s.dur}초).`;
    }
    case 'snipe': return `전방 일직선의 모든 적에게 공격력의 <b>${f(s.mult * p)}</b> 관통 피해를 준다.`;
  }
  return '';
}

// ---------- 장비 ----------
export const COMPONENTS = {
  mag:    { name: '확장 탄창',     desc: '공격 속도 +20%', stats: { asPct: 0.2 },  color: '#f2b233', glyph: 'mag' },
  barrel: { name: '강화 총열',     desc: '공격력 +18%',    stats: { atkPct: 0.18 }, color: '#e2505c', glyph: 'barrel' },
  vest:   { name: '방탄 조끼',     desc: '체력 +220',      stats: { hp: 220 },     color: '#4fbf6a', glyph: 'vest' },
  plate:  { name: '방어 플레이트', desc: '방어력 +10%',    stats: { def: 0.10 },   color: '#3d8df0', glyph: 'plate' },
  cell:   { name: '에너지 셀',     desc: '시작 마나 +20',  stats: { mana0: 20 },   color: '#a45ce6', glyph: 'cell' },
};
export const COMP_KEYS = Object.keys(COMPONENTS);

const mergeStats = (a, b) => {
  const o = { ...a };
  for (const k in b) o[k] = (o[k] || 0) + b[k];
  return o;
};
const RECIPES_RAW = [
  ['mag', 'mag',       '속사 개조총',     '공격 속도 +50%',                                    { asPct: 0.5 }],
  ['barrel', 'barrel', '대구경 탄환',     '공격력 +48%',                                       { atkPct: 0.48 }],
  ['vest', 'vest',     '강화 외골격',     '체력 +620, 초당 체력 1% 회복',                      { hp: 620, regen: 0.01 }],
  ['plate', 'plate',   '중장갑',          '방어력 +28%',                                       { def: 0.28 }],
  ['cell', 'cell',     '마나 역류기',     '시작 마나 +40, 마나 획득 +50%',                     { mana0: 40, manaGain: 0.5 }],
  ['mag', 'barrel',    '전술 조준경',     '공속 +20%, 공격력 +18%, 치명타 +20%',               { asPct: 0.2, atkPct: 0.18, crit: 0.2 }],
  ['mag', 'vest',      '서바이벌 키트',   '공속 +20%, 체력 +220, 생명력 흡수 12%',             { asPct: 0.2, hp: 220, steal: 0.12 }],
  ['mag', 'plate',     '반동 흡수 개머리판', '공속 +20%, 방어력 +10%, 사거리 +1칸',             { asPct: 0.2, def: 0.1, range: 1 }],
  ['mag', 'cell',      '속사 모드',       '공속 +20%, 시작 마나 +20, 마나 획득 +30%',          { asPct: 0.2, mana0: 20, manaGain: 0.3 }],
  ['barrel', 'vest',   '돌격 장비',       '공격력 +18%, 체력 +220, 전투 시작 시 배리어 150',   { atkPct: 0.18, hp: 220, shield0: 150 }],
  ['barrel', 'plate',  '철갑탄',          '공격력 +18%, 방어력 +10%, 적 방어력 30% 무시',      { atkPct: 0.18, def: 0.1, pen: 0.3 }],
  ['barrel', 'cell',   '에너지 탄',       '공격력 +18%, 시작 마나 +20, 스킬 피해 +30%',        { atkPct: 0.18, mana0: 20, skillAmp: 0.3 }],
  ['vest', 'plate',    '전술 방패',       '체력 +220, 방어력 +10%, 전투 시작 시 배리어 260',   { hp: 220, def: 0.1, shield0: 260 }],
  ['vest', 'cell',     '재생 모듈',       '체력 +220, 시작 마나 +20, 초당 체력 2% 회복',       { hp: 220, mana0: 20, regen: 0.02 }],
  ['plate', 'cell',    '에너지 배리어',   '방어력 +10%, 시작 마나 +20, 피격 시 마나 +100%',    { def: 0.1, mana0: 20, hitMana: 1.0 }],
];
export const RECIPES = {};          // "a+b" -> item
export const ITEMS = {};            // key -> item
for (const k of COMP_KEYS) ITEMS[k] = { key: k, tier: 1, ...COMPONENTS[k] };
for (const [a, b, name, desc, stats] of RECIPES_RAW) {
  const key = a === b ? a + '2' : a + '_' + b;
  const color = COMPONENTS[a].color;
  const it = { key, tier: 2, name, desc, stats, parts: [a, b], color, color2: COMPONENTS[b].color };
  ITEMS[key] = it;
  RECIPES[a + '+' + b] = it; RECIPES[b + '+' + a] = it;
}
export function combine(a, b) { return RECIPES[a + '+' + b] || null; }

// ---------- 시너지 ----------
// scope: 'school' | 'role' | 'team'
export const SYNERGIES = {
  abydos: { name: '아비도스', kind: 'school', color: SCHOOLS.abydos.color, tiers: [2, 4], desc: '사막의 끈기',
    effects: [ { text: '아비도스 학생 체력 +20%', stats: { hpPct: 0.2 } }, { text: '아비도스 학생 체력 +40%, 방어력 +10%', stats: { hpPct: 0.4, def: 0.1 } } ] },
  gehenna: { name: '게헨나', kind: 'school', color: SCHOOLS.gehenna.color, tiers: [2, 4], desc: '무법의 화력',
    effects: [ { text: '게헨나 학생 치명타 확률 +15%', stats: { crit: 0.15 } }, { text: '게헨나 학생 치명타 확률 +30%, 치명타 피해 +40%', stats: { crit: 0.3, critDmg: 0.4 } } ] },
  trinity: { name: '트리니티', kind: 'school', color: SCHOOLS.trinity.color, tiers: [2, 4], desc: '티 파티의 기도',
    effects: [ { text: '트리니티 학생 마나 획득 +20%, 스킬 위력 +10%', stats: { manaGain: 0.2, skillAmp: 0.1 } }, { text: '트리니티 학생 마나 획득 +45%, 스킬 위력 +30%', stats: { manaGain: 0.45, skillAmp: 0.3 } } ] },
  millennium: { name: '밀레니엄', kind: 'school', color: SCHOOLS.millennium.color, tiers: [2, 4], desc: '첨단 과학',
    effects: [ { text: '밀레니엄 학생 공격 속도 +15%', stats: { asPct: 0.15 } }, { text: '밀레니엄 학생 공격 속도 +35%, 사거리 +1칸', stats: { asPct: 0.35, range: 1 } } ] },
  tank: { name: '탱커', kind: 'role', color: ROLES.tank.color, tiers: [2, 4], desc: '전열 사수',
    effects: [ { text: '탱커 방어력 +8%, 체력 +10%', stats: { def: 0.08, hpPct: 0.1 } }, { text: '탱커 방어력 +18%, 체력 +25%', stats: { def: 0.18, hpPct: 0.25 } } ] },
  dealer: { name: '딜러', kind: 'role', color: ROLES.dealer.color, tiers: [2, 4, 6], desc: '화력 집중',
    effects: [ { text: '딜러 공격력 +10%', stats: { atkPct: 0.1 } }, { text: '딜러 공격력 +22%', stats: { atkPct: 0.22 } }, { text: '딜러 공격력 +40%, 치명타 +10%', stats: { atkPct: 0.4, crit: 0.1 } } ] },
  support: { name: '서포터', kind: 'role', color: ROLES.support.color, tiers: [2, 3], desc: '전술 지원', teamWide: true,
    effects: [ { text: '모든 아군 시작 마나 +10', stats: { mana0: 10 } }, { text: '모든 아군 시작 마나 +25, 초당 체력 1.5% 회복', stats: { mana0: 25, regen: 0.015 } } ] },
};
export const SYNERGY_ORDER = ['abydos', 'gehenna', 'trinity', 'millennium', 'tank', 'dealer', 'support'];

// ---------- 적 ----------
export const ENEMY_TYPES = {
  grunt:   { name: '헬멧단 돌격병', role: 'tank',    weapon: 'SG',  hp: 420, atk: 20, color: '#e0b030' },
  rifle:   { name: '헬멧단 소총수', role: 'dealer',  weapon: 'AR',  hp: 300, atk: 26, color: '#4a8ad0' },
  gunner:  { name: '헬멧단 기관총수', role: 'dealer', weapon: 'MG', hp: 340, atk: 14, color: '#d06a40' },
  sniper:  { name: '헬멧단 저격수', role: 'dealer',  weapon: 'SR',  hp: 240, atk: 56, color: '#7a58c0' },
  medic:   { name: '헬멧단 의무병', role: 'support', weapon: 'HG',  hp: 320, atk: 14, color: '#40b080', skill: { name: '응급 처치', type: 'heal', amt: 90, atkMult: 2, count: 1, mana: [20, 70] } },
  boss1:   { name: '골리앗', role: 'tank', weapon: 'MG', hp: 3000, atk: 22, boss: true, scale: 1.7, color: '#6a7080',
    skill: { name: '포격', type: 'blast', mult: 3, r: 1.8, mana: [20, 70] } },
  boss2:   { name: '무장 헬기 "크로우"', role: 'dealer', weapon: 'MG', hp: 4600, atk: 26, boss: true, scale: 1.8, color: '#4a4a60',
    skill: { name: '기총 소사', type: 'barrage', shots: 22, mult: 0.7, mana: [20, 80] } },
  boss3:   { name: '거대 전차 "게부라"', role: 'tank', weapon: 'SR', hp: 6800, atk: 48, boss: true, scale: 2.0, color: '#7a3a4a',
    skill: { name: '주포 일제 사격', type: 'snipe', mult: 3.2, w: 1.0, mana: [20, 85] } },
};

// 라운드별 적 구성: [종류, 배율 보정] — 줄(row)은 종류별 자동 배치
const WAVES = {
  1: ['grunt', 'rifle'],
  2: ['grunt', 'rifle', 'rifle'],
  3: ['grunt', 'grunt', 'rifle', 'sniper'],
  4: ['grunt', 'grunt', 'rifle', 'gunner', 'medic'],
  5: ['boss1', 'grunt', 'rifle', 'rifle'],
  6: ['grunt', 'grunt', 'rifle', 'gunner', 'sniper', 'medic'],
  7: ['grunt', 'grunt', 'grunt', 'rifle', 'gunner', 'sniper', 'medic'],
  8: ['grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'sniper', 'sniper', 'medic'],
  9: ['grunt', 'grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'sniper', 'medic', 'medic'],
  10: ['boss2', 'grunt', 'grunt', 'rifle', 'gunner', 'sniper'],
  11: ['grunt', 'grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'gunner', 'sniper', 'medic'],
  12: ['grunt', 'grunt', 'grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'sniper', 'sniper', 'medic'],
  13: ['grunt', 'grunt', 'grunt', 'rifle', 'rifle', 'rifle', 'gunner', 'gunner', 'sniper', 'medic'],
  14: ['grunt', 'grunt', 'grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'gunner', 'sniper', 'sniper', 'medic'],
  15: ['boss3', 'grunt', 'grunt', 'rifle', 'rifle', 'gunner', 'sniper', 'medic'],
};
// 라운드별 스탯 배율
export const ROUND_MULT = [0, 0.55, 0.7, 0.85, 1.0, 1.05, 1.5, 1.85, 2.3, 2.8, 2.4, 3.6, 4.2, 4.8, 5.4, 3.2];

export function waveFor(round) {
  const list = WAVES[round] || WAVES[MAX_ROUND];
  const mult = ROUND_MULT[round] ?? 3.5;
  const out = [];
  const middle = SIDE_ROWS - 2;
  const rowOf = { grunt: SIDE_ROWS - 1, boss1: middle, boss2: middle, boss3: middle, rifle: middle, gunner: middle, sniper: 0, medic: 0 };
  const used = new Set();
  for (const t of list) {
    const row = rowOf[t];
    // 같은 줄에서 중앙부터 빈 칸 탐색
    let col = -1, r = row;
    for (let tries = 0; tries < SIDE_ROWS && col < 0; tries++) {
      for (const c of CENTER_COLS) { if (!used.has(r * COLS + c)) { col = c; break; } }
      if (col < 0) r = (r + 1) % SIDE_ROWS;
    }
    used.add(r * COLS + col);
    out.push({ type: t, col, row: r, mult });
  }
  return out;
}

export function describeWave(round) {
  const list = WAVES[round] || WAVES[MAX_ROUND];
  const counts = {};
  for (const t of list) counts[t] = (counts[t] || 0) + 1;
  return { counts, boss: list.some((t) => t.startsWith('boss')) };
}

// 라운드 보상: 장비 드롭
export function dropsFor(round) {
  if (round % 5 === 0) return 2;
  return round % 2 === 1 ? 1 : (round === 2 || round === 4 ? 1 : 0);
}
