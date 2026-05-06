import { afterEach, beforeAll, describe } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mountTestUiProviders } from "./test-ui-providers";

const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

function ensureHappyDom() {
  if (globalState.__padPilotHappyDomRegistered) {
    return;
  }

  GlobalRegistrator.register();
  globalState.__padPilotHappyDomRegistered = true;
}

ensureHappyDom();
const { cleanup } = await import("@solidjs/testing-library");

export const createUiTest = (componentName: string, suite: () => void) => {
  beforeAll(() => {
    ensureHappyDom();
    mountTestUiProviders();
  });

  describe(componentName, () => {
    afterEach(() => {
      cleanup();
    });

    suite();
  });
};
