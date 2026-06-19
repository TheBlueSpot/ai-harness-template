import { describe, expect, test } from "bun:test";
import { findChatFileReferenceAtPosition, findChatFileReferences, resolveChatFileTarget } from "./chat-file-links";

const context = {
  rootPath: "C:\\Users\\dev\\repo",
  filePaths: ["README.md", "harness/ui/src/app.tsx", "harness/ui/src/components/chat-panel.tsx"]
};

describe("chat file links", () => {
  test("resolves relative paths with line and column", () => {
    expect(resolveChatFileTarget("harness/ui/src/app.tsx:12:4", context)).toEqual({
      path: "harness/ui/src/app.tsx",
      line: 12,
      column: 4
    });
  });

  test("resolves absolute project paths back to workspace-relative IDE paths", () => {
    expect(resolveChatFileTarget("C:\\Users\\dev\\repo\\harness\\ui\\src\\app.tsx:7", context)).toEqual({
      path: "harness/ui/src/app.tsx",
      line: 7,
      column: undefined
    });
  });

  test("rejects absolute paths outside the project root", () => {
    expect(resolveChatFileTarget("C:\\Users\\dev\\other\\secret.ts", context)).toBeUndefined();
  });

  test("finds @file references and trims sentence punctuation", () => {
    expect(findChatFileReferences("check @harness/ui/src/app.tsx:9.", context)).toEqual([
      {
        index: 6,
        length: 25,
        text: "@harness/ui/src/app.tsx:9",
        target: { path: "harness/ui/src/app.tsx", line: 9, column: undefined }
      }
    ]);
  });

  test("finds the file under a textarea caret", () => {
    const text = "open @harness/ui/src/components/chat-panel.tsx please";
    expect(findChatFileReferenceAtPosition(text, text.indexOf("chat-panel"), context)?.target).toEqual({
      path: "harness/ui/src/components/chat-panel.tsx",
      line: undefined,
      column: undefined
    });
  });
});
