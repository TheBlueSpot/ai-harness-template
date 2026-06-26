/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { toastStore } from "../toast-store";
import { MarkdownContent } from "./markdown-content";

createUiTest("MarkdownContent", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders markdown structure plus GFM features", () => {
    render(() => (
      <MarkdownContent
        content={`# Heading

Paragraph with **bold** and ~~strike~~.

> Quote line

- one
- two

1. first
2. second

Visit https://example.com

| a | b |
| - | - |
| 1 | 2 |

- [x] done

Footnote here.[^1]

[^1]: Footnote body`}
      />
    ));

    expect(screen.getByRole("heading", { name: "Heading" }).tagName).toBe("H1");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("strike").tagName).toBe("DEL");
    expect(screen.getByText("Quote line").closest("blockquote")).not.toBeNull();
    expect(screen.getByRole("table")).not.toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("link", { name: "https://example.com" })).not.toBeNull();
    expect(screen.getByText("Footnote body")).not.toBeNull();
  });

  it("preserves single-line breaks through remark-breaks", () => {
    render(() => <MarkdownContent content={"line one\nline two"} />);

    const lineBreak = document.querySelector("br");
    expect(lineBreak).not.toBeNull();
  });

  it("renders inline code with the contrast chip class", () => {
    render(() => <MarkdownContent content={"Run `assistant-actions` from chat."} />);

    const inlineCode = screen.getByText("assistant-actions");
    expect(inlineCode.tagName).toBe("CODE");
    expect(inlineCode.className).toContain("markdown-inline-code");
  });

  it("drops raw html and blocks unsafe links while hardening safe links", () => {
    render(() => (
      <MarkdownContent
        content={`<script>alert(1)</script>
<b>bold</b>
[Docs](https://example.com)
[Footnote](#fn1)
[Bad](javascript:alert(1))`}
      />
    ));

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("b")).toBeNull();

    const docsLink = screen.getByRole("link", { name: "Docs" });
    expect(docsLink.getAttribute("target")).toBe("_blank");
    expect(docsLink.getAttribute("rel")).toBe("noopener noreferrer");

    const footnoteLink = screen.getByRole("link", { name: "Footnote" });
    expect(footnoteLink.getAttribute("href")).toBe("#fn1");
    expect(footnoteLink.getAttribute("target")).toBeNull();

    expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
  });

  it("renders highlighted fenced code blocks and copies code", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied.push(value);
        }
      }
    });

    render(() => <MarkdownContent content={"```ts\nconst value = 1;\n```"} />);

    expect(document.querySelector(".markdown-code-block")).not.toBeNull();
    expect(document.querySelector(".hljs-keyword")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy code block" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(copied).toEqual(["const value = 1;\n"]);
    expect(toastStore.toasts[0]?.title).toBe("Code copied");
  });

  it("skips syntax highlighting while content is live", () => {
    render(() => <MarkdownContent content={"```ts\nconst value = 1;\n```"} live />);

    expect(document.querySelector(".markdown-code-block")).not.toBeNull();
    expect(document.querySelector(".hljs-keyword")).toBeNull();
  });

  it("surfaces copy failure", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        }
      }
    });

    render(() => <MarkdownContent content={"```txt\ncopy me\n```"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code block" }));
    await Promise.resolve();

    expect(toastStore.toasts[0]?.title).toBe("Copy failed");
  });

  it("opens detected file paths on control click", () => {
    const opened: unknown[] = [];
    render(() => (
      <MarkdownContent
        content={"Changed harness/ui/src/app.tsx:12:4."}
        fileLinks={{
          rootPath: "C:\\repo",
          filePaths: ["harness/ui/src/app.tsx"],
          onOpenFile: (target) => opened.push(target)
        }}
      />
    ));

    const fileLink = screen.getByRole("button", { name: "harness/ui/src/app.tsx:12:4" });
    fireEvent.click(fileLink);
    expect(opened).toEqual([]);

    fireEvent.click(fileLink, { ctrlKey: true });
    expect(opened).toEqual([{ path: "harness/ui/src/app.tsx", line: 12, column: 4 }]);
  });

  it("opens inline code file paths on control click", () => {
    const opened: unknown[] = [];
    render(() => (
      <MarkdownContent
        content={"Check `harness/ui/src/app.tsx:12`."}
        fileLinks={{
          rootPath: "C:\\repo",
          filePaths: ["harness/ui/src/app.tsx"],
          onOpenFile: (target) => opened.push(target)
        }}
      />
    ));

    const fileLink = screen.getByRole("button", { name: "harness/ui/src/app.tsx:12" });
    fireEvent.click(fileLink, { metaKey: true });

    expect(opened).toEqual([{ path: "harness/ui/src/app.tsx", line: 12, column: undefined }]);
  });
});
