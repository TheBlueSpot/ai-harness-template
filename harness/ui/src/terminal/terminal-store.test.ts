import { beforeEach, describe, expect, test } from "bun:test";
import { terminalStore } from "./terminal-store";

const preferences = {
  scrollbackLimit: 1000,
  copyOnSelect: false,
  ctrlCMode: "auto" as const,
  rendererMode: "xterm-webgl" as const
};

describe("terminal store output model", () => {
  beforeEach(() => {
    terminalStore.resetForTests({ preferences });
  });

  test("trims copy buffer without marking xterm for reset", () => {
    const limit = preferences.scrollbackLimit * 160;
    const first = "a".repeat(limit + 10);

    terminalStore.appendOutput("terminal-1", first);
    terminalStore.appendOutput("terminal-1", "b");

    expect(terminalStore.state.outputBySessionId["terminal-1"]).toHaveLength(limit);
    expect(terminalStore.state.outputBySessionId["terminal-1"]?.endsWith("b")).toBe(true);
    expect(terminalStore.state.outputDeltaBySessionId["terminal-1"]).toBe("b");
    expect(terminalStore.state.outputVersionBySessionId["terminal-1"]).toBe(2);
    expect(terminalStore.state.outputResetVersionBySessionId["terminal-1"]).toBeUndefined();
  });

  test("snapshots mark one reset for renderer remounts", () => {
    terminalStore.replaceOutput("terminal-1", "snapshot");

    expect(terminalStore.state.outputBySessionId["terminal-1"]).toBe("snapshot");
    expect(terminalStore.state.outputDeltaBySessionId["terminal-1"]).toBe("");
    expect(terminalStore.state.outputVersionBySessionId["terminal-1"]).toBe(1);
    expect(terminalStore.state.outputResetVersionBySessionId["terminal-1"]).toBe(1);
  });
});
