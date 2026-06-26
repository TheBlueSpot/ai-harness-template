import { mock } from "bun:test";
import { fileURLToPath } from "node:url";

if (process.env.HARNESS_TEST_SKIP_UI_PRELOAD !== "1") {
  const [{ GlobalRegistrator }, { SolidPlugin }, solidWeb] = await Promise.all([
    import("@happy-dom/global-registrator"),
    import("@dschz/bun-plugin-solid"),
    import("solid-js/web/dist/web.js")
  ]);
  const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

  if (!globalState.__padPilotHappyDomRegistered) {
    GlobalRegistrator.register();
    globalState.__padPilotHappyDomRegistered = true;
  }

  const solidWebPath = fileURLToPath(import.meta.resolve("solid-js/web/dist/web.js"));
  await Bun.plugin({
    name: "solid-js-web-dom-alias",
    setup(build) {
      build.onResolve({ filter: /^solid-js\/web$/ }, () => ({ path: solidWebPath }));
    }
  });

  await Bun.plugin(
    SolidPlugin({
      generate: "dom",
      hydratable: false,
      sourceMaps: "inline",
      debug: false
    })
  );

  mock.module("solid-js/web", () => solidWeb);
  mock.module("solid-js/web/dist/server.js", () => solidWeb);

  (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
}
