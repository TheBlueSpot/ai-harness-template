import { tracks } from "../src/data/tracks.js";

function createElement(tagName, id) {
  const element = document.createElement(tagName);
  if (id) element.id = id;
  document.body.appendChild(element);
  return element;
}

async function runSmoke() {
  if (!tracks.length) throw new Error("track list empty");
  const sceneRoot = createElement("div", "scene-root");
  const uiRoot = createElement("div", "ui-root");
  const mod = await import("../src/main.js");
  const { app, ready } = mod.bootApp({ sceneRoot, uiRoot });
  await ready;
  if (app.state !== "menu") throw new Error(`expected menu, got ${app.state}`);
  const selectedButton = document.querySelector(".track-card.is-selected");
  if (!selectedButton) throw new Error("menu selection missing");
  if (app.tracks.length !== tracks.length) throw new Error("track wiring mismatch");
  if (!app.selectedTrackId) throw new Error("missing selected track");
  const track = app.tracks.find((item) => item.id === app.selectedTrackId);
  if (!track?.audioUrl) throw new Error("missing audio source");
  if (!track?.provenance) throw new Error("missing provenance");
  if (!document.querySelector(".track-card")) throw new Error("menu not rendered");
  const trackButtons = [...document.querySelectorAll(".track-card")];
  trackButtons[trackButtons.length - 1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  if (app.selectedTrackId === track.id && trackButtons.length > 1) {
    throw new Error("track selection did not change");
  }
  const startButton = document.querySelector(".primary-action");
  if (!startButton) throw new Error("start button missing");
  startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline && app.state !== "gameplay") {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  if (app.state !== "gameplay") throw new Error(`expected gameplay, got ${app.state}`);
  if (!document.querySelector(".game-canvas")) throw new Error("canvas missing");
  return { ok: true, trackId: app.selectedTrackId };
}

runSmoke();
