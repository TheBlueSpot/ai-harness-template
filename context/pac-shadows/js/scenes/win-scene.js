export const createWinScene = ({ assets }) => ({
  enter(runtime) {
    runtime.patchSharedState({
      sceneLabel: "Win",
      sceneHint: "Win state reached"
    });
    assets.sounds.win?.play(assets.audio);
  },
  onKeyDown(event, runtime) {
    if (event.code === "Enter" || event.code === "Space") {
      runtime.go("play");
    }
    if (event.code === "Escape") {
      runtime.go("menu");
    }
  },
  render(ctx) {
    drawOverlay(ctx, "#9be564", "You Win", "Press Enter to replay or Escape for menu.", assets.images["ui-panel"]);
  }
});

const drawOverlay = (ctx, accent, title, subtitle, panel) => {
  const width = ctx.canvas.clientWidth;
  const height = ctx.canvas.clientHeight;
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, width, height);
  if (panel) {
    ctx.drawImage(panel, width * 0.25, height * 0.28, width * 0.5, height * 0.44);
  } else {
    ctx.fillStyle = "rgba(7, 12, 24, 0.9)";
    ctx.fillRect(width * 0.25, height * 0.28, width * 0.5, height * 0.44);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(width * 0.25, height * 0.28, width * 0.5, height * 0.44);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "700 68px Trebuchet MS";
  ctx.fillText(title, width * 0.5, height * 0.46);
  ctx.fillStyle = "#f7f4ea";
  ctx.font = "400 20px Trebuchet MS";
  ctx.fillText(subtitle, width * 0.5, height * 0.56);
  ctx.textAlign = "left";
};
