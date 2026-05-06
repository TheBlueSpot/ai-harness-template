function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawWindmill(ctx, windmill, angle) {
  ctx.save();
  ctx.translate(windmill.x, windmill.y);
  ctx.fillStyle = "rgba(255, 248, 228, 0.92)";
  ctx.strokeStyle = "rgba(62, 35, 10, 0.8)";
  ctx.lineWidth = 2;
  for (let i = 0; i < windmill.bladeCount; i += 1) {
    const bladeAngle = angle + (Math.PI * 2 * i) / windmill.bladeCount;
    ctx.save();
    ctx.rotate(bladeAngle);
    ctx.beginPath();
    ctx.moveTo(-8, -windmill.bladeWidth * 0.5);
    ctx.lineTo(windmill.radius, -windmill.bladeWidth * 0.5);
    ctx.lineTo(windmill.radius + 6, 0);
    ctx.lineTo(windmill.radius, windmill.bladeWidth * 0.5);
    ctx.lineTo(-8, windmill.bladeWidth * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#9b5f2f";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function render(ctx, frame) {
  const { bounds, hole, ball, windmillAngles, shotPreview } = frame;
  ctx.clearRect(0, 0, frame.width, frame.height);

  const sky = ctx.createLinearGradient(0, 0, 0, frame.height);
  sky.addColorStop(0, "#d6f6ff");
  sky.addColorStop(1, "#f2fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, frame.width, frame.height);

  ctx.fillStyle = "#bfe8a4";
  drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 28);
  ctx.fill();

  ctx.strokeStyle = "#4e7d30";
  ctx.lineWidth = 8;
  ctx.stroke();

  for (const patch of hole.sand) {
    ctx.fillStyle = "#dcc67f";
    drawRoundedRect(ctx, patch.x, patch.y, patch.width, patch.height, 18);
    ctx.fill();
  }

  for (const wall of hole.walls) {
    ctx.fillStyle = "#815833";
    drawRoundedRect(ctx, wall.x, wall.y, wall.width, wall.height, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    drawRoundedRect(ctx, wall.x + 4, wall.y + 4, wall.width - 8, wall.height - 8, 6);
    ctx.fill();
  }

  for (const bumper of hole.bumpers) {
    ctx.fillStyle = "#ef675f";
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(bumper.x - 4, bumper.y - 5, bumper.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  hole.windmills.forEach((windmill, index) => drawWindmill(ctx, windmill, windmillAngles[index]));

  ctx.fillStyle = "#1f4f1e";
  ctx.beginPath();
  ctx.arc(hole.cup.x, hole.cup.y, hole.cup.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#102f13";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f7f7f2";
  ctx.fillRect(hole.cup.x - 2, hole.cup.y - 42, 4, 28);
  ctx.fillStyle = "#ee684a";
  ctx.beginPath();
  ctx.moveTo(hole.cup.x + 2, hole.cup.y - 42);
  ctx.lineTo(hole.cup.x + 36, hole.cup.y - 31);
  ctx.lineTo(hole.cup.x + 2, hole.cup.y - 21);
  ctx.closePath();
  ctx.fill();

  if (shotPreview) {
    const arrowX = shotPreview.previewX;
    const arrowY = shotPreview.previewY;
    const arrowLength = 22 + shotPreview.power * 18;
    const backX = arrowX - shotPreview.aimX * arrowLength;
    const backY = arrowY - shotPreview.aimY * arrowLength;
    const leftX = backX - shotPreview.aimY * 8;
    const leftY = backY + shotPreview.aimX * 8;
    const rightX = backX + shotPreview.aimY * 8;
    const rightY = backY - shotPreview.aimX * 8;

    ctx.strokeStyle = "rgba(31, 79, 30, 0.46)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(backX, backY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(238, 104, 74, 0.92)";
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(238, 104, 74, 0.58)";
    ctx.beginPath();
    ctx.arc(arrowX, arrowY, 6 + 6 * shotPreview.power, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a5a61";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  ctx.arc(ball.x + 3, ball.y + 4, ball.radius * 0.86, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(25, 57, 28, 0.75)";
  ctx.font = "700 22px Arial";
  ctx.fillText(hole.name, bounds.x + 18, bounds.y + 30);

  if (frame.mode === "holeComplete") {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    drawRoundedRect(ctx, 330, 214, 300, 112, 20);
    ctx.fill();
    ctx.fillStyle = "#1e3a20";
    ctx.font = "700 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Hole Cleared", 480, 252);
    ctx.font = "400 18px Arial";
    ctx.fillText(`Hole strokes: ${frame.holeStrokes}  |  Press N or click`, 480, 286);
    ctx.textAlign = "left";
  }
}
