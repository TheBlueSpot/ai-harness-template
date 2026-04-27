import { TEAM_COLORS, TEAM_IDS, WORLD_DIMENSIONS } from "../game/config.js";
import { getAssetDescriptor } from "../assets/UnitSprites.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assetCache = new Map();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  worldToScreen(state, x, y) {
    return {
      x: (x - state.camera.x) * state.camera.zoom,
      y: (y - state.camera.y) * state.camera.zoom,
    };
  }

  getImage(src) {
    let image = this.assetCache.get(src);
    if (!image) {
      image = new Image();
      image.src = src;
      this.assetCache.set(src, image);
    }
    return image;
  }

  render(state) {
    this.resize();
    const { ctx } = this;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);
    this.drawSky(width, height);
    this.drawGround(state, width, height);
    this.drawFrontLine(state, height);

    const entities = state.entityIds
      .map((id) => state.entities.get(id))
      .filter(Boolean)
      .sort((left, right) => (left.position?.y ?? 0) - (right.position?.y ?? 0));

    for (const entity of entities) {
      this.drawEntity(state, entity);
    }

    this.drawFormationGuides(state);
    this.drawSelection(state);
    this.drawFooterLegend(state, width, height);
  }

  drawSky(width, height) {
    const { ctx } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#15283a");
    gradient.addColorStop(0.55, "#192e43");
    gradient.addColorStop(1, "#24311e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let index = 0; index < 12; index += 1) {
      ctx.beginPath();
      ctx.arc((width / 12) * index + 40, 90 + Math.sin(index) * 18, 2 + (index % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGround(state, width, height) {
    const { ctx } = this;
    const groundY = this.worldToScreen(state, 0, state.world.groundY).y;
    const gradient = ctx.createLinearGradient(0, groundY - 40, 0, height);
    gradient.addColorStop(0, "#475531");
    gradient.addColorStop(1, "#1b2415");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, groundY, width, height - groundY);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width, groundY);
    ctx.stroke();
  }

  drawFrontLine(state, height) {
    const { ctx } = this;
    const screen = this.worldToScreen(state, state.world.frontLineX, 0);
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "rgba(248, 203, 116, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screen.x, 60);
    ctx.lineTo(screen.x, height - 80);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(248, 203, 116, 0.92)";
    ctx.font = "600 14px Trebuchet MS";
    ctx.fillText("Frontline", screen.x + 10, 78);
  }

  drawEntity(state, entity) {
    const { ctx } = this;
    const { x, y } = this.worldToScreen(state, entity.position.x, entity.position.y);
    const renderWidth = (entity.render?.width ?? 90) * state.camera.zoom;
    const renderHeight = (entity.render?.height ?? 90) * state.camera.zoom;
    const asset = getAssetDescriptor(entity);
    const image = this.getImage(asset.src);

    const flip = entity.render?.facing === -1 ? -1 : 1;
    const bob = entity.entityType === "unit" ? Math.sin(state.clock.elapsed * 3 + entity.render.bobPhase) * 3 : 0;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(flip, 1);
    ctx.globalAlpha = entity.alive === false && entity.entityType !== "unit" ? 0.35 : 1;
    if (image.complete) {
      ctx.drawImage(image, -renderWidth / 2, -renderHeight, renderWidth, renderHeight);
    } else {
      ctx.fillStyle = TEAM_COLORS[entity.team]?.accent ?? "#ffffff";
      ctx.fillRect(-renderWidth / 4, -renderHeight / 2, renderWidth / 2, renderHeight / 2);
    }
    ctx.restore();

    this.drawHealthBar(state, entity, x, y - renderHeight + 8, renderWidth);
    this.drawSelectionRing(state, entity, x, y);
  }

  drawFormationGuides(state) {
    const { ctx } = this;

    for (const team of [TEAM_IDS.PLAYER, TEAM_IDS.ENEMY]) {
      const anchor = state.formations?.anchors?.[team];
      if (!anchor) {
        continue;
      }

      const point = this.worldToScreen(state, anchor.x, anchor.y);
      ctx.save();
      ctx.fillStyle = team === TEAM_IDS.PLAYER ? "rgba(124, 215, 235, 0.8)" : "rgba(239, 123, 111, 0.8)";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 28);
      ctx.lineTo(point.x + 10, point.y - 8);
      ctx.lineTo(point.x - 10, point.y - 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const entity of state.entities.values()) {
      if (!entity || entity.entityType !== "unit" || !entity.desiredPosition) {
        continue;
      }

      const origin = this.worldToScreen(state, entity.position.x, entity.position.y - 14);
      const target = this.worldToScreen(state, entity.desiredPosition.x, entity.desiredPosition.y - 14);
      ctx.save();
      ctx.strokeStyle = entity.team === TEAM_IDS.PLAYER ? "rgba(124, 215, 235, 0.2)" : "rgba(239, 123, 111, 0.14)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawHealthBar(state, entity, x, y, width) {
    const hp = entity.stats?.hp ?? entity.resource?.amount ?? 1;
    const maxHp = entity.stats?.maxHp ?? entity.resource?.maxAmount ?? 1;
    const ratio = clamp(hp / Math.max(1, maxHp), 0, 1);
    const barWidth = Math.max(36, width * 0.68);
    const barHeight = 6;

    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
    ctx.fillStyle = entity.team === TEAM_IDS.ENEMY ? "#ef7b6f" : "#7adf9d";
    ctx.fillRect(x - barWidth / 2, y, barWidth * ratio, barHeight);
  }

  drawSelectionRing(state, entity, x, y) {
    const { ctx } = this;
    const isSelected = state.selection.selectedIds.includes(entity.id);
    const isPossessed = state.selection.possessionTargetId === entity.id;
    if (!isSelected && !isPossessed) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = isPossessed ? "rgba(248, 203, 116, 0.95)" : "rgba(124, 215, 235, 0.85)";
    ctx.lineWidth = isPossessed ? 4 : 2;
    ctx.beginPath();
    ctx.arc(x, y + 2, entity.collision.selectionRadius ?? 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawSelection(state) {
    const box = state.selection.box;
    if (!box) {
      return;
    }

    const { ctx } = this;
    const x = Math.min(box.startX, box.currentX);
    const y = Math.min(box.startY, box.currentY);
    const width = Math.abs(box.currentX - box.startX);
    const height = Math.abs(box.currentY - box.startY);

    ctx.save();
    ctx.fillStyle = "rgba(124, 215, 235, 0.12)";
    ctx.strokeStyle = "rgba(124, 215, 235, 0.8)";
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  drawFooterLegend(state, width, height) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(10,17,27,0.72)";
    ctx.fillRect(16, height - 46, 700, 30);
    ctx.fillStyle = "#f4efe2";
    ctx.font = "14px Trebuchet MS";
    ctx.fillText(
      `Left drag: multi-select | Left click: possess | Right click: issue ${state.commandState.activeCommandId} | Space: possessed attack`,
      28,
      height - 25,
    );
  }
}
