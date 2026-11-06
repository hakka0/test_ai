import type Phaser from "phaser";
import { UNITS, EQUIPMENT } from "../shared/catalog";
import { COMBAT_ATTRIBUTES, type CombatAttribute } from "../shared/combat-attributes";
import type { CombatEvent, Kind } from "../shared/model";
import { SKILLS } from "../shared/skill-catalog";

export type EffectUnit = { kind: Kind; x: number; y: number; sprite?: Phaser.GameObjects.Image };
export const BARRIER_DAMAGE_COLOR = "#b8eaff";
const damageFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
type EffectAnimation = { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; ease?: string };

// Shapes are deliberately shared across weapons. Attribute ownership is independent
// of the shape, so weapon-specific animation can be added later.
export class CombatEffects {
  private objects = new Set<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text>();
  private flashes = new Map<Phaser.GameObjects.Image, number>();
  private reduced = false;
  constructor(private scene: Phaser.Scene) {}

  clear() {
    for (const object of this.objects) {
      this.scene.tweens.killTweensOf(object);
      object.destroy();
    }
    this.objects.clear();
    for (const sprite of this.flashes.keys()) if (sprite.active) sprite.clearTint();
    this.flashes.clear();
  }

  update(reduced: boolean) {
    if (reduced !== this.reduced) this.clear();
    this.reduced = reduced;
    for (const [sprite, until] of this.flashes) {
      if (!sprite.active || this.scene.time.now >= until) {
        if (sprite.active) sprite.clearTint();
        this.flashes.delete(sprite);
      }
    }
  }

  private keep<T extends Phaser.GameObjects.Graphics | Phaser.GameObjects.Text>(
    object: T, role: string, attribute: CombatAttribute | undefined, duration: number, rise = 0,
    animation: EffectAnimation = {},
  ): T {
    object.setData({ combatEffect: true, role, attribute });
    this.objects.add(object);
    this.scene.tweens.add({
      targets: object, alpha: { value: 0, ease: "Linear" }, y: object.y - rise, duration, ...animation,
      onComplete: () => { this.objects.delete(object); object.destroy(); },
    });
    return object;
  }

  private muzzleAndTracer(event: CombatEvent, source: EffectUnit, target: EffectUnit, attribute: CombatAttribute) {
    const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
    if (distance <= 1) return;
    const ux = dx / distance, uy = dy / distance, angle = Math.atan2(dy, dx);
    const offset = Math.min(26, distance * 0.25), color = COMBAT_ATTRIBUTES[attribute].color;
    const variant = event.id % 4, strength = event.type === "skillDamage" ? 1.15 : 1;
    const length = (20 + variant * 2) * strength, spread = (5 + (variant % 3)) * strength;
    const muzzle = this.scene.add.graphics().setDepth(16)
      .setPosition(source.x + ux * offset, source.y + uy * offset).setRotation(angle);
    // Soft outer light, uneven colored flame and a small bright core share one
    // object, keeping the flash short and inexpensive during group combat.
    muzzle.fillStyle(color, 0.13); muzzle.fillEllipse(length * 0.25, 0, length * 1.8, spread * 2.5);
    muzzle.fillStyle(color, 0.38); muzzle.fillTriangle(-4, -spread, length * 0.8, 0, -4, spread);
    muzzle.fillStyle(color, 0.95);
    muzzle.fillPoints([
      { x: -3, y: 0 }, { x: 1, y: -spread * 0.4 }, { x: length * 0.45, y: -spread },
      { x: length * 0.62, y: -2 }, { x: length, y: variant - 1.5 },
      { x: length * 0.55, y: 2 }, { x: length * 0.35, y: spread * 0.8 }, { x: 0, y: spread * 0.35 },
    ], true);
    muzzle.fillStyle(0xffffff, 0.95); muzzle.fillTriangle(-1, -2, length * 0.6, 0, -1, 2); muzzle.fillCircle(0, 0, 2);
    this.keep(muzzle, "muzzle", attribute, 95, 0, { scaleX: 1.25, scaleY: 0.75, ease: "Cubic.Out" });

    // The hit is already authoritative. This is a contracting afterimage at the
    // hit point, rather than a projectile that delays damage or leaves a full ray.
    const tail = Math.min(distance - offset, 140, Math.max(18, distance * 0.65));
    const headWidth = event.type === "skillDamage" ? 2.8 : 2.2;
    const tracer = this.scene.add.graphics().setDepth(15).setPosition(target.x, target.y).setRotation(angle);
    for (let i = 0; i < 6; i++) {
      const a = i / 6, b = (i + 1) / 6;
      tracer.fillStyle(color, 0.18 + b * 0.72);
      tracer.fillPoints([
        { x: -tail * (1 - a), y: -(0.1 + a * headWidth) },
        { x: -tail * (1 - b), y: -(0.1 + b * headWidth) },
        { x: -tail * (1 - b), y: 0.1 + b * headWidth },
        { x: -tail * (1 - a), y: 0.1 + a * headWidth },
      ], true);
    }
    tracer.fillStyle(0xffffff, 0.9); tracer.fillTriangle(-tail * 0.38, 0, 0, -0.7, 0, 0.7);
    this.keep(tracer, "tracer", attribute, 135, 0, { scaleX: 0.45, ease: "Cubic.Out" });
  }

  private impact(event: CombatEvent, source: EffectUnit | undefined, target: EffectUnit, attribute: CombatAttribute) {
    const color = COMBAT_ATTRIBUTES[attribute].color;
    const impact = this.scene.add.graphics().setPosition(target.x, target.y).setDepth(17);
    impact.lineStyle(2, color, 0.85);
    impact.strokeCircle(0, 0, this.reduced ? 13 : 12);
    if (this.reduced) {
      this.keep(impact, "impact", attribute, 160);
      return;
    }
    impact.lineStyle(1, 0xffffff, 0.5); impact.strokeCircle(0, 0, 5);
    impact.fillStyle(color, 0.22); impact.fillCircle(0, 0, 5);
    impact.setScale(0.55);
    this.keep(impact, "impact", attribute, 190, 0, { scaleX: 1.65, scaleY: 1.65, ease: "Cubic.Out" });
    const angle = source && Math.hypot(target.x - source.x, target.y - source.y) > 1
      ? Math.atan2(target.y - source.y, target.x - source.x) : -Math.PI / 2;
    const count = event.type === "skillDamage" ? 7 : 5;
    // Drop only secondary particles under load; damage numbers and the primary
    // muzzle/tracer/impact remain available for every event.
    for (let i = 0; i < count && this.objects.size < 160; i++) {
      const fan = (i / (count - 1) - 0.5) * 1.6 + Math.sin(event.id * 2.7 + i) * 0.12;
      const direction = angle + fan, reach = 30 + ((event.id * 7 + i * 11) % 23);
      const spark = this.scene.add.graphics().setPosition(target.x + Math.cos(direction) * 10, target.y + Math.sin(direction) * 10).setDepth(18).setRotation(direction);
      spark.fillStyle(color, 0.95); spark.fillTriangle(-5, -1.4, 5 + i % 3, 0, -5, 1.4);
      spark.fillStyle(0xffffff, 0.8); spark.fillRect(1, -0.45, 3, 0.9);
      this.keep(spark, "impact-spark", attribute, 150 + i * 15, 0, {
        x: target.x + Math.cos(direction) * (reach + 10),
        y: target.y + Math.sin(direction) * (reach + 10) + 4,
        scaleX: 0.25, scaleY: 0.25, ease: "Cubic.Out",
      });
    }
    if (target.sprite?.active) {
      // Multiplicative tint retains the character's features under the sparks.
      target.sprite.setTint(color);
      this.flashes.set(target.sprite, this.scene.time.now + 55);
    }
  }

  private damageNumber(target: EffectUnit, amount: number, color: string,
    role: "damage" | "shield-damage", attribute: CombatAttribute | undefined, offsetY: number, critical = false) {
    const text = this.scene.add.text(target.x, target.y + offsetY, `−${damageFormat.format(amount)}${critical ? "!" : ""}`, {
      fontFamily: "sans-serif", fontSize: critical ? "24px" : "20px", fontStyle: "bold",
      color, stroke: "#101827", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.keep(text, role, attribute, 550, 28);
  }

  private barrierHit(event: CombatEvent, source: EffectUnit | undefined, target: EffectUnit, attribute: CombatAttribute) {
    const color = COMBAT_ATTRIBUTES[attribute].color;
    const facing = source && Math.hypot(source.x - target.x, source.y - target.y) > 1
      ? Math.atan2(source.y - target.y, source.x - target.x) : Math.PI / 2;
    const wave = this.scene.add.graphics().setPosition(target.x, target.y).setRotation(facing).setDepth(19);
    const arc = (radius: number) => Array.from({ length: 13 }, (_, i) => {
      const angle = -0.8 + i / 12 * 1.6;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    wave.fillStyle(color, 0.18); wave.fillPoints([...arc(32), ...arc(39).reverse()], true);
    wave.lineStyle(3, color, 0.95); wave.strokePoints(arc(36), false);
    wave.lineStyle(1, 0xffffff, 0.8); wave.strokePoints(arc(38), false);
    if (this.reduced) this.keep(wave, "shield-hit", attribute, 160);
    else {
      wave.setScale(0.9);
      this.keep(wave, "shield-hit", attribute, 220, 0, { scaleX: 1.12, scaleY: 1.12, ease: "Cubic.Out" });
    }
    if (!event.shieldBroken) return;
    const broken = this.scene.add.graphics().setPosition(target.x, target.y).setDepth(19);
    broken.lineStyle(2, color, 0.9);
    for (let i = 0; i < 6; i++) {
      const points = [0.12, 0.5, 0.88].map(t => {
        const angle = (i + t) * Math.PI / 3;
        return { x: Math.cos(angle) * 34, y: Math.sin(angle) * 38 };
      });
      broken.strokePoints(points, false);
    }
    this.keep(broken, "shield-break", attribute, this.reduced ? 160 : 250, 0,
      this.reduced ? {} : { scaleX: 1.18, scaleY: 1.18, ease: "Cubic.Out" });
    if (this.reduced) return;
    for (let i = 0; i < 6 && this.objects.size < 160; i++) {
      const angle = i * Math.PI / 3 + event.id * 0.15;
      const x = Math.cos(angle), y = Math.sin(angle);
      const shard = this.scene.add.graphics().setPosition(target.x + x * 32, target.y + y * 36).setRotation(angle).setDepth(19);
      const points = [{ x: -4, y: -6 }, { x: 5, y: -4 }, { x: 4, y: 5 }, { x: -3, y: 6 }];
      shard.fillStyle(color, 0.5); shard.fillPoints(points, true);
      shard.lineStyle(1, color, 1); shard.strokePoints(points, true);
      shard.lineStyle(1, 0xffffff, 0.65); shard.lineBetween(-4, -6, 5, -4);
      this.keep(shard, "shield-fragment", attribute, 240 + i * 15, 0, {
        x: target.x + x * 57, y: target.y + y * 59 + 10,
        rotation: angle + (i % 2 ? 0.7 : -0.7), scaleX: 0.55, scaleY: 0.55, ease: "Cubic.Out",
      });
    }
  }

  private skillCast(event: CombatEvent, source: EffectUnit, attribute: CombatAttribute) {
    const color = COMBAT_ATTRIBUTES[attribute].color;
    const ring = this.scene.add.graphics().setPosition(source.x, source.y + 24).setDepth(14);
    ring.fillStyle(color, 0.08); ring.fillEllipse(0, 0, 68, 24);
    ring.lineStyle(2, color, 0.9);
    for (let i = 0; i < 8; i++) {
      const points = Array.from({ length: 5 }, (_, j) => {
        const angle = (i + 0.1 + j / 4 * 0.8) * Math.PI / 4;
        return { x: Math.cos(angle) * 34, y: Math.sin(angle) * 12 };
      });
      ring.strokePoints(points, false);
    }
    ring.lineStyle(1, 0xffffff, 0.7); ring.strokeEllipse(0, 0, 44, 14);
    if (!this.reduced) ring.setScale(0.7);
    this.keep(ring, "cast", attribute, this.reduced ? 180 : 380, 0,
      this.reduced ? {} : { scaleX: 1.25, scaleY: 1.25, ease: "Cubic.Out" });
    if (!this.reduced && this.objects.size < 160) {
      const focus = this.scene.add.graphics().setPosition(source.x, source.y - 3).setDepth(16).setScale(1.15);
      focus.lineStyle(2, color, 0.8);
      for (const side of [-1, 1]) {
        focus.lineBetween(side * 27, -12, side * 32, -6);
        focus.lineBetween(side * 32, -6, side * 27, 0);
        focus.lineBetween(side * 27, 4, side * 32, 10);
      }
      this.keep(focus, "cast-focus", attribute, 220, 0, { scaleX: 0.8, scaleY: 0.8, ease: "Cubic.Out" });
    }
    // Repeated activations replace only this caster's old name, preventing a
    // stack of labels from covering resource bars during rapid skill chains.
    for (const object of this.objects) {
      if (object.getData("role") === "skill-label" && object.getData("source") === event.source) {
        this.scene.tweens.killTweensOf(object); this.objects.delete(object); object.destroy();
      }
    }
    const label = this.scene.add.text(source.x, source.y - 51, SKILLS[event.skillId ?? ""]?.name ?? "스킬", {
      fontFamily: "sans-serif", fontSize: "15px", fontStyle: "bold",
      color: COMBAT_ATTRIBUTES[attribute].css, backgroundColor: "#19243bdd",
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
    }).setOrigin(0.5).setDepth(40).setData("source", event.source);
    this.keep(label, "skill-label", attribute, 1000, this.reduced ? 0 : 12);
  }

  private skillEnd(source: EffectUnit, attribute: CombatAttribute) {
    const ring = this.scene.add.graphics().setPosition(source.x, source.y + 24).setDepth(14);
    ring.lineStyle(1.5, COMBAT_ATTRIBUTES[attribute].color, 0.7);
    ring.strokeEllipse(0, 0, 72, 24);
    this.keep(ring, "skill-end", attribute, this.reduced ? 160 : 280, 0,
      this.reduced ? {} : { scaleX: 0.65, scaleY: 0.65, ease: "Cubic.In" });
  }

  private heal(target: EffectUnit, attribute: CombatAttribute) {
    const color = COMBAT_ATTRIBUTES[attribute].color;
    const heal = this.scene.add.graphics().setPosition(target.x, target.y - 2).setDepth(18);
    heal.fillStyle(color, 0.15); heal.fillCircle(0, -4, 17);
    heal.lineStyle(1.5, color, 0.75); heal.strokeEllipse(0, 23, 48, 14);
    for (const [x, y, size] of [[0, -5, 9], [-17, 9, 5], [17, 3, 5]]) {
      heal.fillStyle(color, 0.85);
      heal.fillRect(x - size / 2, y - 1.5, size, 3);
      heal.fillRect(x - 1.5, y - size / 2, 3, size);
    }
    heal.fillStyle(0xffffff, 0.9); heal.fillRect(-1, -8, 2, 6); heal.fillRect(-3, -6, 6, 2);
    this.keep(heal, "heal", attribute, this.reduced ? 160 : 480, this.reduced ? 0 : 10,
      this.reduced ? {} : { scaleX: 1.12, scaleY: 1.12, ease: "Sine.Out" });
  }

  play(event: CombatEvent, source?: EffectUnit, target?: EffectUnit) {
    if(event.type==='loot'&&event.loot&&source){
      const loot=event.loot,color=loot.type==='gold'?0xffd663:loot.type==='unit'?0x78d6ff:0xc19aff;
      const x=source.x+(loot.type==='gold'?-25:25),y=source.y-32;
      const icon=this.scene.add.graphics().setPosition(x,y).setDepth(35).setData({lootType:loot.type,lootId:loot.id});
      icon.fillStyle(color,.2).fillCircle(0,0,19);icon.fillStyle(color,1);
      if(loot.type==='gold'){icon.fillCircle(0,0,11);icon.lineStyle(2,0x76501e).strokeCircle(0,0,7);}
      else if(loot.type==='item'){icon.fillRoundedRect(-11,-10,22,20,4);icon.lineStyle(2,0x482b70).lineBetween(-9,-2,9,-2);icon.lineBetween(0,-9,0,9);}
      else{icon.fillCircle(0,-5,7);icon.fillRoundedRect(-10,3,20,12,5);}
      const label=loot.type==='gold'?`+${loot.amount}G`:loot.type==='unit'?`+${UNITS[loot.kind].name}`:`+${EQUIPMENT[loot.definition].name}`;
      const text=this.scene.add.text(x,y+20,label,{fontFamily:'sans-serif',fontSize:'13px',color:'#fff5d6',stroke:'#142132',strokeThickness:4}).setOrigin(.5).setDepth(36).setData({lootType:loot.type,lootId:loot.id});
      this.keep(icon,'loot',undefined,1600,this.reduced?0:-28,this.reduced?{}:{ease:'Bounce.Out'});
      this.keep(text,'loot-label',undefined,1600,this.reduced?0:-28,this.reduced?{}:{ease:'Bounce.Out'});
      return;
    }
    const attack = source ? UNITS[source.kind].attackAttribute : undefined;
    const defense = target ? UNITS[target.kind].defenseAttribute : undefined;
    if (event.type === "skillStart" && source && attack) {
      this.skillCast(event, source, attack);
      return;
    }
    if (event.type === "skillEnd" && source && attack) {
      this.skillEnd(source, attack);
      return;
    }
    if (event.type === "heal" && target && defense && event.amount > 0) {
      this.heal(target, defense);
      return;
    }
    if (event.type === "shield" && target && defense) {
      const g = this.scene.add.graphics().setPosition(target.x, target.y).setDepth(16);
      g.lineStyle(2, COMBAT_ATTRIBUTES[defense].color, 0.8);
      g.strokeEllipse(0, 0, 68, 76);
      g.lineStyle(1, 0xffffff, 0.5); g.strokeEllipse(0, 0, 60, 68);
      for (const side of [-1, 1]) {
        g.fillStyle(COMBAT_ATTRIBUTES[defense].color, 0.1);
        g.fillTriangle(side * 33, -16, side * 25, -9, side * 32, 1);
      }
      if (!this.reduced) g.setScale(0.85);
      this.keep(g, "shield", defense, this.reduced ? 180 : 350, 0,
        this.reduced ? {} : { scaleX: 1.08, scaleY: 1.08, ease: "Cubic.Out" });
      return;
    }
    if (event.type !== "attack" && event.type !== "skillDamage") return;
    if (!target || !defense) return;

    // Both endpoints are rendered immediately: the server has already resolved
    // damage. Visual travel must never delay or change the combat simulation.
    if (source && attack && !this.reduced) {
      this.muzzleAndTracer(event, source, target, attack);
    }
    const shield = Math.max(0, event.shieldDamage ?? 0);
    const health = Math.max(0, event.healthDamage ?? event.amount);
    if (shield > 0) this.barrierHit(event, source, target, defense);
    if (health > 0 || shield === 0) this.impact(event, source, target, defense);
    if (!this.reduced) {
      // Never infer absorption from the target's current shield: another hit may
      // have broken it, or a skill may have replenished it in the same snapshot.
      const split = shield > 0 && health > 0;
      if (shield > 0) this.damageNumber(target, shield, BARRIER_DAMAGE_COLOR, "shield-damage", undefined, split ? (event.critical ? -34 : -28) : -12, event.critical);
      if (health > 0) this.damageNumber(target, health, attack ? COMBAT_ATTRIBUTES[attack].css : "#ffffff", "damage", attack, split ? 0 : -12, event.critical);
    }
  }
}
