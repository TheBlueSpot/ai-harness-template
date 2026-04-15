import { afterEach, beforeAll, describe } from "bun:test";
import { cleanup } from "@solidjs/testing-library";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

function ensureHappyDom() {
  if (globalState.__padPilotHappyDomRegistered) {
    return;
  }

  GlobalRegistrator.register();
  globalState.__padPilotHappyDomRegistered = true;
}

ensureHappyDom();

export const createUiTest = (componentName: string, suite: () => void) => {
  beforeAll(() => {
    ensureHappyDom();
  });

  describe(componentName, () => {
    afterEach(() => {
      cleanup();
    });

    suite();
  });
};
