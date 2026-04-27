import { describe, expect, test } from "bun:test";
import { detectAssistantChatIntent } from "./assistant-intent";

describe("assistant chat intent detection", () => {
  test("detects explicit project assistant creation", () => {
    expect(detectAssistantChatIntent("create assistant named Catalog builder to execute todo-games.md")).toMatchObject({
      kind: "create",
      name: "Catalog builder",
      scope: "project"
    });
  });

  test("detects make assistant wording", () => {
    expect(detectAssistantChatIntent("make Catalog builder an assistant for game catalog work")).toMatchObject({
      kind: "create",
      name: "Catalog builder",
      scope: "project"
    });
  });

  test("detects explicit global assistant creation", () => {
    expect(detectAssistantChatIntent("create global assistant named Release watcher to scan changelogs")).toMatchObject({
      kind: "create",
      name: "Release watcher",
      scope: "global"
    });
  });

  test("asks for named operator ongoing work", () => {
    expect(detectAssistantChatIntent("Catalog builder start executing todos")).toMatchObject({
      kind: "ambiguous",
      suggestedName: "Catalog builder"
    });
  });

  test("ignores normal imperatives", () => {
    expect(detectAssistantChatIntent("start executing todos")).toEqual({ kind: "none" });
    expect(detectAssistantChatIntent("create folder catalog-builder")).toEqual({ kind: "none" });
  });

  test("rejects unsafe names", () => {
    expect(detectAssistantChatIntent("Catalog/builder start executing todos")).toEqual({ kind: "none" });
    expect(detectAssistantChatIntent("Very long named assistant with too many words start executing todos")).toEqual({
      kind: "none"
    });
  });
});
