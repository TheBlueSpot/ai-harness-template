import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import * as solidWeb from "solid-js/web/dist/web.js";

const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

if (!globalState.__padPilotHappyDomRegistered) {
  GlobalRegistrator.register();
  globalState.__padPilotHappyDomRegistered = true;
}

await Bun.plugin(
  SolidPlugin({
    generate: "dom",
    hydratable: false,
    sourceMaps: "inline",
    debug: false
  })
);

mock.module("solid-js/web", () => solidWeb);

(globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
