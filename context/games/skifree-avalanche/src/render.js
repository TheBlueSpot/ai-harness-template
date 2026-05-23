import { CONFIG, SECTION_COLORS } from "./data.js";

export function render(ctx, frame) {
  const sectionIndex = Math.min(
    SECTION_COLORS.length - 1,
    Math.floor((CONFIG.courseLength - frame.distance) / (CONFIG.courseLength / SECTION_COLORS.length))
  );
  const colors = SECTION_COLORS[sectionIndex];

  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
  ctx.fillStyle = colors.sky;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  const slopeTop = 70;
  ctx.fillStyle = colors.snow;
  ctx.beginPath();
  ctx.moveTo(0, slopeTop);
  ctx.lineTo(CONFIG.width, slopeTop + 24);
  ctx.lineTo(CONFIG.width, CONFIG.height);
  ctx.lineTo(0, CONFIG.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = colors.shade;
  ctx.lineWidth = 2;
  for (let i = -1; i < 8; i += 1) {
    const y = slopeTop + i * 84 + ((frame.distance * 0.45) % 84);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CONFIG.width, y + 24);
    ctx.stroke();
  }

  for (const gate of frame.gates) {
    const left = gate.x - gate.width * 0.5;
    const right = gate.x + gate.width * 0.5;
    ctx.strokeStyle = gate.passed ? "#87a7bb" : "#d74f4f";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(left, gate.y - 12);
    ctx.lineTo(left, gate.y + 16);
    ctx.moveTo(right, gate.y - 12);
    ctx.lineTo(right, gate.y + 16);
    ctx.stroke();
    ctx.strokeStyle = gate.passed ? "#9fc2d7" : "#4fa4e2";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 6, gate.y - 10);
    ctx.lineTo(right - 6, gate.y - 10);
    ctx.stroke();
  }

  for (const tree of frame.trees) {
    if (tree.type === "rock") {
      ctx.fillStyle = "#7f8b95";
      ctx.beginPath();
      ctx.moveTo(tree.x - 18, tree.y + 14);
      ctx.lineTo(tree.x - 6, tree.y - 12);
      ctx.lineTo(tree.x + 18, tree.y - 4);
      ctx.lineTo(tree.x + 12, tree.y + 16);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    ctx.fillStyle = "#2e6d4d";
    ctx.beginPath();
    ctx.moveTo(tree.x, tree.y - 26);
    ctx.lineTo(tree.x - 22, tree.y + 8);
    ctx.lineTo(tree.x + 22, tree.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5b3924";
    ctx.fillRect(tree.x - 4, tree.y + 8, 8, 16);
  }

  for (const log of frame.logs) {
    ctx.fillStyle = "#6b442d";
    ctx.fillRect(log.x - log.width * 0.5, log.y - 8, log.width, 16);
  }

  for (const ramp of frame.ramps) {
    ctx.fillStyle = "#e7d7b7";
    ctx.beginPath();
    ctx.moveTo(ramp.x - ramp.width * 0.5, ramp.y + 10);
    ctx.lineTo(ramp.x + ramp.width * 0.5, ramp.y + 10);
    ctx.lineTo(ramp.x + ramp.width * 0.5 - 14, ramp.y - 8);
    ctx.lineTo(ramp.x - ramp.width * 0.5 + 14, ramp.y - 8);
    ctx.closePath();
    ctx.fill();
  }

  for (const trail of frame.trails) {
    ctx.strokeStyle = `rgba(132, 173, 201, ${trail.life * 0.22})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(trail.x - 7, trail.y);
    ctx.lineTo(trail.x - 3, trail.y + 10);
    ctx.moveTo(trail.x + 7, trail.y);
    ctx.lineTo(trail.x + 3, trail.y + 10);
    ctx.stroke();
  }

  const jumpLift = frame.player.jumpTimer > 0 ? Math.sin((1 - frame.player.jumpTimer / 0.8) * Math.PI) * 26 : 0;
  ctx.save();
  ctx.translate(frame.player.x, frame.player.y - jumpLift);
  ctx.rotate(frame.player.vx * 0.0012);
  ctx.fillStyle = frame.player.flash > 0 ? "#ffe39d" : "#c83f52";
  ctx.fillRect(-10, -18, 20, 26);
  ctx.fillStyle = "#173355";
  ctx.beginPath();
  ctx.arc(0, -24, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#223f67";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-18, 16);
  ctx.lineTo(18, 12);
  ctx.stroke();
  ctx.restore();

  const avalancheTop = CONFIG.height - Math.max(0, frame.avalanche.distanceBehind);
  ctx.fillStyle = "rgba(225, 239, 248, 0.95)";
  ctx.fillRect(0, avalancheTop, CONFIG.width, CONFIG.height - avalancheTop);
  ctx.fillStyle = "rgba(188, 214, 228, 0.75)";
  for (let i = 0; i < 14; i += 1) {
    const x = i * 80 + ((frame.distance * 0.7) % 80);
    ctx.beginPath();
    ctx.arc(x, avalancheTop + 10 + (i % 3) * 7, 18 + (i % 4) * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (frame.mode !== "playing") {
    ctx.fillStyle = "rgba(8, 18, 34, 0.45)";
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  }
}
