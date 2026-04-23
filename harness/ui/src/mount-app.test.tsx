/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests } from "./utils/tests/store-test-utils";

mock.module("./harness-websocket", () => ({
  connectHarnessWebSocket: () => {
    return {
      sendCommand: () => undefined,
      dispose: mock(() => undefined)
    };
  }
}));

import { mountApp } from "./mount-app";

createUiTest("mountApp", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("disposes the current app tree cleanly before a remount", () => {
    const root = document.createElement("div");
    document.body.append(root);

    const firstDispose = mountApp(root);
    expect(root.querySelector("[data-test-app-shell]")).not.toBeNull();

    firstDispose();
    expect(root.innerHTML).toBe("");

    const secondDispose = mountApp(root);
    expect(root.querySelector("[data-test-app-shell]")).not.toBeNull();

    secondDispose();
    expect(root.innerHTML).toBe("");
  });
});
