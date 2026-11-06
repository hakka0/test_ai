import { createBoard } from "../client/board";
import { newMatch, prepare, startCombat } from "../shared/engine";
import { snapshotFor } from "../shared/snapshot";
import { newTestPlayer, neutralDamage } from "./fixtures";
import { SkillSystem } from "../shared/skills";
import type { CombatEvent, Kind } from "../shared/model";

const match = newMatch();
match.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")];
prepare(match, 0);
startCombat(match, 1);
const base = snapshotFor(match, "a", 1, "attribute-fixture");
base.events = []; base.eventId = 0;
const { scene, game } = createBoard();

const fixture = {
  scene, game,
  pair(source: Kind, target: Kind, options: { reduced?: boolean; reverse?: boolean; lethal?: boolean; targetShield?: number; sourcePosition?: { x: number; y: number }; targetPosition?: { x: number; y: number } } = {}) {
    scene.resetVisuals();
    scene.reduced = options.reduced ?? false;
    scene.selfId = options.reverse ? "b" : "a";
    const s = structuredClone(base);
    Object.assign(s.fighters[0], { kind: source, x: 2, y: 4, hp: 100, maxHp: 100 }, options.sourcePosition);
    Object.assign(s.fighters[1], { kind: target, x: 2, y: 2, hp: options.lethal ? 0 : 100, maxHp: 100, shield: options.targetShield ?? 0 }, options.targetPosition);
    scene.snapshot = s;
    scene.update(scene.time.now, 16);
  },
  emit(type: CombatEvent["type"], skillId = "nova", amount = 12) {
    const s = scene.snapshot!;
    s.events = [{ id: ++s.eventId, type, source: s.fighters[0].id, target: s.fighters[1].id, amount, skillId }];
    scene.update(scene.time.now, 16);
  },
  skill(id: string, cost: number, active = false) {
    scene.snapshot!.fighters[0].skills = [{ id, cost, active, cooldownUntil: 0, activations: active ? 1 : 0 }];
    scene.update(scene.time.now, 16);
  },
  strike(incoming: number, shield: number, hp = 100, type: "attack" | "skillDamage" = "attack", shieldAfter?: number, critical = false) {
    const battle = structuredClone(match);
    battle.events = []; battle.eventId = scene.snapshot!.eventId;
    battle.fighters.forEach((fighter, i) => Object.assign(fighter, scene.snapshot!.fighters[i], {
      hp: i === 1 ? hp : 100, maxHp: 100, shield: i === 1 ? shield : 0,
      equipment: [], skills: [], buffs: [], contribution: { damageDealt: 0, damageTaken: 0, healing: 0, shieldBlocked: 0 },
    }));
    neutralDamage(...battle.fighters);
    battle.fighters[0].stats.critChance = critical ? 100 : 0;
    new SkillSystem(battle, 10).damage(battle.fighters[0], battle.fighters[1], incoming, type === "attack" ? "basic" : "skill", type === "skillDamage" ? "nova" : undefined);
    if (shieldAfter !== undefined) battle.fighters[1].shield = shieldAfter;
    scene.snapshot = snapshotFor(battle, "a", 10, "attribute-fixture");
    scene.update(scene.time.now, 16);
    return scene.snapshot.events;
  },
  inspect() {
    const sprite = (scene as any).sprites.get(scene.snapshot!.fighters[1].id);
    return {
      effects: scene.children.list.filter(o => o.getData("combatEffect")).map(o => ({
        role: o.getData("role"), attribute: o.getData("attribute"),
        commands: (o as any).commandBuffer ?? [], color: (o as any).style?.color,
        text: (o as any).text, width: (o as any).width, height: (o as any).height,
        x: (o as any).x, y: (o as any).y,
        rotation: (o as any).rotation, scaleX: (o as any).scaleX, scaleY: (o as any).scaleY, alpha: (o as any).alpha,
      })),
      targetTint: sprite?.tintTopLeft,
    };
  },
  unitVisuals() {
    return scene.snapshot!.fighters.map(unit => {
      const sprite = (scene as any).sprites.get(unit.id), anchor = (scene as any).visual.get(unit.id);
      const name = (scene as any).names.get(unit.id);
      return { id: unit.id, x: sprite?.x, y: sprite?.y, angle: sprite?.angle, alpha: sprite?.alpha,
        imageWidth: sprite?.width, imageHeight: sprite?.height, displayWidth: sprite?.displayWidth, displayHeight: sprite?.displayHeight,
        flipX: sprite?.flipX, pose: sprite?.getData("unitMotion"), healthBar: sprite?.getData("healthBar"), skillIndicator: sprite?.getData("skillIndicator"), anchor, nameX: name?.x, nameY: name?.y };
    });
  },
};
(window as any).combatFixture = fixture;
