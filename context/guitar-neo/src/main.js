import { App } from "./app/App.js";

export function bootApp({ sceneRoot = document.getElementById("scene-root"), uiRoot = document.getElementById("ui-root") } = {}) {
  const app = new App({
    sceneRoot,
    uiRoot,
  });
  const ready = app.start();
  return { app, ready };
}

export const { app, ready: appReady } = bootApp({
  sceneRoot: document.getElementById("scene-root"),
  uiRoot: document.getElementById("ui-root"),
});
