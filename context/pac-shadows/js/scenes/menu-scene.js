const TITLE = "Pac Shadows";

export const createMenuScene = ({ assets }) => ({
  enter(runtime) {
    runtime.patchSharedState({
      sceneLabel: "Menu",
      sceneHint: "Press Enter to enter play"
    });
    assets.sounds["menu-start"]?.play(assets.audio);
  },
  onKeyDown(event, runtime) {
    if (event.code === "Enter" || event.code === "Space") {
      assets.sounds["menu-start"]?.play(assets.audio);
      runtime.go("play");
    }
  },
  render(ctx, runtime) {
    const width = ctx.canvas.clientWidth;
    const height = ctx.canvas.clientHeight;
    drawBackdrop(ctx);
    drawPanel(ctx, width * 0.16, height * 0.2, width * 0.68, height * 0.6, assets.images["ui-panel"]);
    ctx.textAlign = "center";
    ctx.fillStyle = "#7ef8ff";
    ctx.font = "700 72px Trebuchet MS";
    ctx.fillText(TITLE, width * 0.5, height * 0.35);
    ctx.fillStyle = "#f7f4ea";
    ctx.font = "400 24px Trebuchet MS";
    ctx.fillText("Menu, play, win, and lose are separated by a scene machine.", width * 0.5, height * 0.43);
    ctx.fillStyle = "rgba(247,244,234,0.72)";
    ctx.font = "400 18px Trebuchet MS";
    ctx.fillText("Enter starts the play slice. Escape can return here from play.", width * 0.5, height * 0.49);
    ctx.fillStyle = "#9be564";
    ctx.font = "700 20px Trebuchet MS";
    ctx.fillText("Press Enter or Space", width * 0.5, height * 0.59);
    ctx.fillStyle = "rgba(247,244,234,0.62)";
    ctx.font = "400 14px Trebuchet MS";
    ctx.fillText(`Scene: ${runtime.getCurrentId()}`, width * 0.5, height * 0.66);
    ctx.textAlign = "left";
  }
});

const drawBackdrop = (ctx) => {
  const width = ctx.canvas.clientWidth;
  const height = ctx.canvas.clientHeight;
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, width, height);
  const light = ctx.createRadialGradient(width * 0.5, height * 0.35, 30, width * 0.5, height * 0.35, 400);
  light.addColorStop(0, "rgba(126,248,255,0.24)");
  light.addColorStop(1, "rgba(126,248,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
};

const drawPanel = (ctx, x, y, width, height, sprite) => {
  if (sprite) {
    ctx.drawImage(sprite, x, y, width, height);
    return;
  }

  ctx.fillStyle = "rgba(7, 12, 24, 0.85)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(x, y, width, height);
};
