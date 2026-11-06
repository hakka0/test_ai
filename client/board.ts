import { assetUrl } from "../shared/assets";
import {unitDefinition} from "../shared/minions";
import { SKILLS } from "../shared/skill-catalog";
import Phaser from "phaser";
import { UNITS } from "../shared/catalog";
import { COMBAT_ATTRIBUTES } from "../shared/combat-attributes";
import { CombatEffects, type EffectUnit } from "./combat-effects";
import { UnitMotion } from "./unit-motion";
import { HealthTrail, HEALTH_TRAIL_COLOR } from "./health-trail";
import { skillIndicator } from "./skill-indicator";
import { directionFrame, unitImageSize } from "./unit-appearance";
import { BLUE_ARCHIVE_KINDS, SPRITE_FRAME_SIZE } from "../shared/blue-archive";
import type { Snapshot, Unit, FighterSnapshot } from "../shared/model";
import { COLS, ROWS } from "../shared/model";
import { WIDTH, HEIGHT, MARGIN, CELL, preparationPosition, displayPosition } from "./board-geometry";
type DisplayUnit = Unit & {
  hp?: number;
  maxHp?: number;
  shield?: number;
  skills?: FighterSnapshot["skills"];
};
export class Board extends Phaser.Scene {
  snapshot: Snapshot | null = null;
  selfId = "";
  selected = "";
  dragging = "";
  readOnly = false;
  private skipEvents = false;
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private tiles!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private selectionTile!: Phaser.GameObjects.Graphics;
  private selectionArrow!: Phaser.GameObjects.Graphics;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private names = new Map<string, Phaser.GameObjects.Text>();
  private ranks = new Map<string, Phaser.GameObjects.Text>();
  private lastEvent = 0;
  private effects?: CombatEffects;
  private motion = new UnitMotion();
  private healthTrail = new HealthTrail();
  private attackTargets = new Map<string, string>();
  private visualContext = "";
  private visual = new Map<string, { x: number; y: number }>();
  constructor() {
    super("Board");
  }
  switchView(){this.resetVisuals();this.skipEvents=true;}
  resetVisuals() {
    this.selectionTile?.clear().setVisible(false).setData('unitId','');
    this.selectionArrow?.clear().setVisible(false).setData('unitId','');
    this.effects?.clear();
    this.motion.clear(); this.attackTargets.clear(); this.visualContext = "";
    this.healthTrail.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    for (const name of this.names.values()) name.destroy();
    for (const rank of this.ranks.values()) rank.destroy();
    this.ranks.clear();
    this.sprites.clear(); this.names.clear(); this.visual.clear();
    this.lastEvent = 0;
  }
  preload() {
    for (const [id, def] of Object.entries(UNITS)) {
      if (def.spriteSheet) {
        this.load.spritesheet(id, def.spriteSheet, { frameWidth: SPRITE_FRAME_SIZE, frameHeight: SPRITE_FRAME_SIZE });
      } else this.load.image(id, def.image);
    }
    for(const variant of ["sentry","drone"])this.load.image(`minion-${variant}`,assetUrl(`/units/minion-${variant}.svg`));
  }
  create() {
    for (const kind of BLUE_ARCHIVE_KINDS) {
      if (this.textures.exists(kind)) this.textures.get(kind).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.tiles = this.add.graphics();
    this.bars = this.add.graphics().setDepth(20);
    this.selectionTile = this.add.graphics().setDepth(5).setData('selectionIndicator','cell');
    this.selectionArrow = this.add.graphics().setDepth(24).setData('selectionIndicator','arrow');
    this.effects = new CombatEffects(this);
    this.events.once("shutdown", () => this.resetVisuals());

  }
  getUnits(): DisplayUnit[] {
    const s = this.snapshot;
    if (!s) return [];
    if (
      s.phase === "combat" ||
      s.phase === "result" ||
      (s.phase === "finished" && s.fighters.length)
    )
      return s.fighters;
    return s.players.flatMap((p, i) =>
      p.units
        .filter((u) => u.x >= 0)
        .map((u) => ({
          ...u,
          ...preparationPosition(i, u.x, u.y),
        })),
    );
  }
  displayPosition(u: { x: number; y: number }) {
    const reverse = this.snapshot?.players[1]?.id === this.selfId;
    return displayPosition(reverse, u.x, u.y);
  }
  unitAt(x: number, y: number) {
    return this.getUnits().find((u) => {
      const p = this.displayPosition(u);
      return p.x === x && p.y === y && ("hp" in u ? u.hp! > 0 : true);
    });
  }
  update(time: number, delta: number) {
    if (!this.tiles) return;
    const context = this.snapshot ? `${this.snapshot.roomId}:${this.snapshot.round}:${this.selfId}` : "";
    if (context !== this.visualContext || (this.snapshot && this.snapshot.eventId < this.lastEvent)) {
      this.resetVisuals(); this.visualContext = context;
    }
    if(this.skipEvents){this.lastEvent=this.snapshot?.eventId??0;this.skipEvents=false;}
    this.effects?.update(this.reduced);
    const g = this.tiles;
    const selectedOwn = this.snapshot?.players.find(p => p.id === this.selfId)?.units.some(u => u.id === this.selected);
    g.clear();
    g.fillStyle(0xb9c9ce);
    g.fillRoundedRect(22, 30, WIDTH - 44, HEIGHT - 60, 15);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const own = y >= ROWS / 2;
        g.fillStyle(
          own
            ? (x + y) % 2
              ? 0xd0dedc
              : 0xc8d7d7
            : (x + y) % 2
              ? 0xbecbd1
              : 0xc5d0d5,
        );
        g.fillRoundedRect(
          MARGIN + x * CELL + 2,
          MARGIN + y * CELL + 2,
          CELL - 4,
          CELL - 4,
          8,
        );
        if (selectedOwn && own && !this.readOnly && this.snapshot?.phase === "prepare") {
          g.lineStyle(1, 0x5c8f99, 0.35);
          g.strokeRoundedRect(
            MARGIN + x * CELL + 2,
            MARGIN + y * CELL + 2,
            CELL - 4,
            CELL - 4,
            8,
          );
        }
      }
    g.lineStyle(2, 0x5c8f99, 0.4);
    g.lineBetween(MARGIN, HEIGHT / 2, WIDTH - MARGIN, HEIGHT / 2);
    this.bars.clear();
    const present = new Set<string>();
    const units = this.getUnits();
    const byId = new Map(units.map(u => [u.id, u]));
    const fighting = this.snapshot?.phase === "combat";
    const alive = units.filter(u => u.hp !== undefined && u.hp > 0);
    for (const u of units) {
      if (u.hp !== undefined && u.hp <= 0) continue;
      present.add(u.id);
      const p = this.displayPosition(u),
        tx = MARGIN + (p.x + 0.5) * CELL,
        ty = MARGIN + (p.y + 0.5) * CELL;
      const own = u.owner === this.selfId;
      const directional = !u.minion && Boolean(UNITS[u.kind].spriteSheet) && this.textures.exists(u.kind);
      let image = this.sprites.get(u.id);
      if (!image) {
        image = this.add
          .image(tx, ty, u.minion ? `minion-${u.minion.variant}` : u.kind, directional ? directionFrame(0, 0, own) : undefined)
          .setDepth(10).setData("directional", directional);
        this.sprites.set(u.id, image);
        this.visual.set(u.id, { x: tx, y: ty });
        this.names.set(
          u.id,
          this.add
            .text(tx, ty + 34, unitDefinition(u).name, {
              fontFamily: "sans-serif",
              fontSize: "12px",
              color: "#294e67",
              backgroundColor: "#dce5dfed",
              padding: { left: 3, right: 3, top: 1, bottom: 1 },
            })
            .setOrigin(0.5)
            .setDepth(21),
        );
        this.ranks.set(u.id,this.add.text(tx,ty+34,'',{fontFamily:'sans-serif',fontSize:'12px',color:'#285e83',backgroundColor:'#dce5dfed',padding:{left:1,right:3,top:1,bottom:1}}).setOrigin(0,0.5).setDepth(21));
      }
      image.setAlpha(this.dragging === u.id ? 0.3 : 1);
      const imageSize = unitImageSize(image.width, image.height);
      image.setDisplaySize(imageSize.width, imageSize.height);
      this.names.get(u.id)!.setText(unitDefinition(u).name).setAlpha(this.dragging === u.id ? 0.35 : 1);
      this.ranks.get(u.id)!.setText('★'.repeat(u.rank)).setAlpha(this.dragging===u.id?0.35:1);
      const v = this.visual.get(u.id)!;
      const lerp = this.reduced ? 1 : 1 - Math.exp(-delta / 55);
      v.x += (tx - v.x) * lerp;
      v.y += (ty - v.y) * lerp;
      // Quiet portrait frames support preparation; combat keeps only a ground
      // shadow so gunfire, health bars and moving characters stay readable.
      if (this.snapshot?.phase === 'prepare' && this.dragging !== u.id) {
        g.fillStyle(0x365365, 0.3);
        g.fillRoundedRect(v.x - CELL * 0.43, v.y - CELL * 0.44, CELL * 0.86, CELL * 0.86, 10);
        g.lineStyle(1, 0x9dc2cf, 0.22);
        g.strokeRoundedRect(v.x - CELL * 0.43, v.y - CELL * 0.44, CELL * 0.86, CELL * 0.86, 10);
      }
      g.fillStyle(0x02070d, 0.28);
      g.fillEllipse(v.x, v.y + CELL * 0.32, CELL * 0.65, CELL * 0.12);
      image.setPosition(v.x, v.y - 4);
      const remembered = byId.get(this.attackTargets.get(u.id) ?? "");
      const target = fighting ? (remembered && remembered.hp! > 0 && remembered.owner !== u.owner ? remembered
        : alive.filter(enemy => enemy.owner !== u.owner).sort((a, b) =>
          (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0]) : undefined;
      const aim = target ? this.displayPosition(target) : undefined;
      if (directional && (fighting || u.hp === undefined)) {
        const frame = directionFrame(aim ? aim.x - p.x : 0, aim ? aim.y - p.y : 0, own);
        if (Number(image.frame.name) !== frame) image.setFrame(frame);
      }
      this.motion.update(u.id, {
        x: v.x, y: v.y, targetX: tx, targetY: ty,
        aim: aim ? { x: MARGIN + (aim.x + 0.5) * CELL - v.x, y: MARGIN + (aim.y + 0.5) * CELL - v.y } : undefined,
        facing: own ? 1 : -1, now: time, delta, reduced: this.reduced,
        idle: this.dragging !== u.id,
        halfHeight: imageSize.height / 2,
      });
      this.names.get(u.id)!.setPosition(v.x, v.y + 34);
      this.ranks.get(u.id)!.setPosition(v.x+this.names.get(u.id)!.width/2+1,v.y+34);
      const resources = (u.skills ?? []).filter(
        (state) => SKILLS[state.id]?.resource,
      );
      resources.forEach((state, index) => {
        const resource = SKILLS[state.id].resource!;
        const y = v.y - 31 + index * 6;
        this.bars.fillStyle(0xb8cbd1);
        this.bars.fillRect(v.x - 32, y, 64, 4);
        this.bars.fillStyle(state.active ? COMBAT_ATTRIBUTES[UNITS[u.kind].attackAttribute].color : 0x91b8ff);
        this.bars.fillRect(
          v.x - 32,
          y,
          64 * Math.min(1, state.cost / resource.max),
          4,
        );
      });
      const indicator = skillIndicator(u.skills ?? [], time, this.reduced);
      image.setData("skillIndicator", indicator);
      if (indicator.visible) {
        const color = COMBAT_ATTRIBUTES[UNITS[u.kind].attackAttribute].color;
        // A segmented floor indicator leaves the body, name and shield readable.
        this.bars.lineStyle(2, color, indicator.alpha);
        for (let i = 0; i < 10; i++) {
          const amount = indicator.active ? 1 : Math.min(1, Math.max(0, indicator.charge * 10 - i));
          if (!amount) continue;
          const points = Array.from({ length: 5 }, (_, j) => {
            const angle = -Math.PI / 2 + (i + 0.1 + j / 4 * 0.8 * amount) * Math.PI / 5 + indicator.rotation;
            return { x: v.x + Math.cos(angle) * 37, y: v.y + 23 + Math.sin(angle) * 12 };
          });
          this.bars.strokePoints(points, false);
        }
        if (indicator.active) {
          this.bars.fillStyle(0xffffff, indicator.alpha);
          for (const angle of [indicator.rotation, indicator.rotation + Math.PI])
            this.bars.fillCircle(v.x + Math.cos(angle) * 37, v.y + 23 + Math.sin(angle) * 12, 1.5);
        }
      }
      const mine = u.owner === this.selfId;
      this.bars.lineStyle(2, mine ? 0x8ce2c5 : 0xe69db5, 0.9);
      this.bars.strokeEllipse(v.x, v.y + 25, 70, 15);
      if (u.hp !== undefined) {
        const health = this.healthTrail.update(u.id, u.hp, u.maxHp || 1, time, this.reduced);
        image.setData("healthBar", health);
        this.bars.fillStyle(0xb8cbd1);
        this.bars.fillRoundedRect(v.x - 32, v.y - 40, 64, 6, 3);
        if (health.trail > health.current) {
          this.bars.fillStyle(HEALTH_TRAIL_COLOR, 0.9);
          this.bars.fillRoundedRect(v.x - 32, v.y - 40, 64 * health.trail, 6, 3);
        }
        this.bars.fillStyle(mine ? 0x8ce2c5 : 0xe69db5);
        this.bars.fillRoundedRect(
          v.x - 32,
          v.y - 40,
          64 * health.current,
          6,
          3,
        );
        if (u.shield) {
          this.bars.lineStyle(1, COMBAT_ATTRIBUTES[UNITS[u.kind].defenseAttribute].color, 0.22);
          this.bars.strokeEllipse(v.x, v.y - 4, 68, 76);
          this.bars.fillStyle(COMBAT_ATTRIBUTES[UNITS[u.kind].defenseAttribute].color);
          this.bars.fillRect(
            v.x - 32,
            v.y - 44,
            64 * Math.min(1, u.shield / 60),
            2,
          );
        }
      } else {
        image.data?.remove("healthBar"); this.healthTrail.remove(u.id);
      }
    }
    const endpoint = (id: string): EffectUnit | undefined => {
      const unit = byId.get(id);
      if (!unit) return;
      const sprite = this.sprites.get(id), p = this.displayPosition(unit);
      return {
        kind: unit.kind, sprite,
        x: sprite?.x ?? MARGIN + (p.x + 0.5) * CELL,
        y: sprite?.y ?? MARGIN + (p.y + 0.5) * CELL - 4,
      };
    };
    for (const e of this.snapshot?.events ?? []) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      const source = endpoint(e.source), target = endpoint(e.target);
      if ((e.type === "attack" || e.type === "skillDamage") && source && target) {
        this.attackTargets.set(e.source, e.target);
        this.motion.attack(e.source, target.x - source.x, target.y - source.y, time);
        if (!this.reduced) {
          this.motion.hit(e.target, target.x - source.x, target.y - source.y, time);
        }
      }
      if (e.type === "death") this.motion.die(e.target, time);
      if (e.type === "skillStart" && !this.reduced) this.motion.cast(e.source, time);
      this.effects?.play(e, source, target);
    }
    for (const [id, sprite] of this.sprites) {
      if (!present.has(id)) {
        const unit = byId.get(id);
        if (unit?.hp !== undefined && unit.hp <= 0) {
          this.motion.die(id, time);
          sprite.data?.remove("healthBar"); this.healthTrail.remove(id);
          sprite.data?.remove("skillIndicator");
          this.names.get(id)?.destroy(); this.names.delete(id);
          this.ranks.get(id)?.destroy(); this.ranks.delete(id);
        } else {
          this.removeUnitVisual(id); continue;
        }
      }
      const pose = this.motion.pose(id, time, this.reduced), v = this.visual.get(id)!;
      if (pose.finished) { this.removeUnitVisual(id); continue; }
      const imageSize = unitImageSize(sprite.width, sprite.height);
      sprite.setPosition(v.x + pose.x, v.y - 4 + pose.y)
        .setAngle(pose.angle).setFlipX(!sprite.getData("directional") && pose.flipX)
        .setDisplaySize(imageSize.width * pose.scaleX, imageSize.height * pose.scaleY)
        .setAlpha(pose.alpha * (this.dragging === id ? 0.3 : 1))
        .setDepth(pose.dying ? 9 : 10).setData("unitMotion", pose);
    }
    this.drawSelection(time, units);
  }
  private drawSelection(time: number, units: DisplayUnit[]) {
    this.selectionTile.clear().setVisible(false).setData('unitId','');
    this.selectionArrow.clear().setVisible(false).setData('unitId','');
    const unit = units.find(u => u.id === this.selected && (u.hp === undefined || u.hp > 0));
    const sprite = unit && this.sprites.get(unit.id);
    if (!unit || !sprite) return;
    const color = 0xffd84a, p = this.displayPosition(unit);
    const pulse = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(time / 260);
    const tile = this.selectionTile.setVisible(true).setData('unitId',unit.id)
      .setPosition(MARGIN + (p.x + 0.5) * CELL, MARGIN + (p.y + 0.5) * CELL);
    for (const [width, alpha] of [[12,0.09],[7,0.23],[3,0.95]]) {
      tile.lineStyle(width,color,alpha * pulse);
      tile.strokeRoundedRect(-CELL / 2 + 3,-CELL / 2 + 3,CELL - 6,CELL - 6,7);
    }
    const worldPixel = WIDTH / Math.max(1,this.scale.displaySize.width);
    const width = Math.min(CELL / 2,Math.max(22,8 * worldPixel)), height = width * 0.58;
    const bob = this.reduced ? 0 : Math.sin(time / 240) * Math.max(3,Math.min(7,worldPixel * 1.5));
    const anchor = this.visual.get(unit.id)!;
    // Leave the image, HP/resource bars and the top edge of the canvas clear.
    const tipY = Math.max(height + 5,Math.min(sprite.getBounds().top - 6,anchor.y - 52) + bob);
    const arrow = this.selectionArrow.setVisible(true).setData('unitId',unit.id)
      .setPosition(sprite.x,tipY).setAlpha(this.dragging === unit.id ? 0.45 : 1);
    arrow.lineStyle(8,color,0.12 * pulse).strokeTriangle(-width / 2,-height,width / 2,-height,0,0);
    arrow.lineStyle(4,color,0.3 * pulse).strokeTriangle(-width / 2,-height,width / 2,-height,0,0);
    arrow.fillStyle(color).fillTriangle(-width / 2,-height,width / 2,-height,0,0);
    arrow.lineStyle(1,0xfff4b0,0.9).strokeTriangle(-width / 2,-height,width / 2,-height,0,0);
  }
  private removeUnitVisual(id: string) {
    this.sprites.get(id)?.destroy(); this.sprites.delete(id);
    this.names.get(id)?.destroy(); this.names.delete(id);
    this.ranks.get(id)?.destroy(); this.ranks.delete(id);
    this.visual.delete(id); this.motion.remove(id); this.attackTargets.delete(id);
    this.healthTrail.remove(id);
  }
}
export function createBoard() {
  const scene = new Board();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "board",
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: "#d1dcdb",
    scene: [scene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    fps: { target: 60 },
    audio: { noAudio: true },
  });
  return { scene, game };
}
