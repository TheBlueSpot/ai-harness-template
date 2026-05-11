import { describe, expect, test } from "bun:test";
import { detectAssistantChatIntent } from "./assistant-intent";

describe("assistant chat intent detection", () => {
  test("detects explicit project assistant creation", () => {
    expect(detectAssistantChatIntent("create assistant named Catalog builder to execute todo-games.md")).toMatchObject({
      kind: "create-ready",
      name: "Catalog builder",
      scope: "project",
      purpose: "execute todo-games.md"
    });
  });

  test("detects make assistant wording", () => {
    expect(detectAssistantChatIntent("make Catalog builder an assistant for game catalog work")).toMatchObject({
      kind: "create-ready",
      name: "Catalog builder",
      scope: "project",
      purpose: "game catalog work"
    });
  });

  test("detects explicit global assistant creation", () => {
    expect(detectAssistantChatIntent("create global assistant named Release watcher to scan changelogs")).toMatchObject({
      kind: "create-ready",
      name: "Release watcher",
      scope: "global",
      purpose: "scan changelogs"
    });
  });

  test("asks purpose for local project assistant creation without purpose", () => {
    expect(detectAssistantChatIntent("create a new local project assistant kojima")).toMatchObject({
      kind: "create-needs-purpose",
      name: "kojima",
      scope: "project"
    });
    expect(detectAssistantChatIntent("create a local assistant named Kojima")).toMatchObject({
      kind: "create-needs-purpose",
      name: "Kojima",
      scope: "project"
    });
  });

  test("detects purpose delimiters and scope aliases", () => {
    expect(detectAssistantChatIntent("create project assistant named Kojima to watch docs")).toMatchObject({
      kind: "create-ready",
      name: "Kojima",
      scope: "project",
      purpose: "watch docs"
    });
    expect(detectAssistantChatIntent("create workspace assistant named Release watcher for changelogs")).toMatchObject({
      kind: "create-ready",
      name: "Release watcher",
      scope: "global",
      purpose: "changelogs"
    });
  });

  test("asks for named operator ongoing work", () => {
    expect(detectAssistantChatIntent("Catalog builder start executing todos")).toMatchObject({
      kind: "ambiguous",
      suggestedName: "Catalog builder"
    });
  });

  test("ignores complaint and run-code requests that mention assistants", () => {
    expect(
      detectAssistantChatIntent(`I keep running into an issue where this product wants me to choose and assistant but I just want to run the code.
Thread Id
'''
5ea22a55-1dd0-4ec7-9371-129c67f4dd4e
ec32e89b-08a3-41a5-80bf-6823701343f0
8e40122a-4916-4f36-b9fc-f883f30801da
'''`)
    ).toEqual({ kind: "none" });
    expect(detectAssistantChatIntent("Can you run the code instead of asking me to choose an assistant?")).toEqual({
      kind: "none"
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
