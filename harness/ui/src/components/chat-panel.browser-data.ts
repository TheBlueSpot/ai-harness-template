import { createChatMessage, type ChatMessage } from "../../../shared/protocol";

export const PROJECT_CHAT_BROWSER_TARGET_TEXT = "Project chat browser message 159";
export const ASSISTANT_CHAT_BROWSER_TARGET_TEXT = "Assistant chat browser message 159";
export const PROJECT_CHAT_BROWSER_MESSAGE_COUNT = 160;

export function createProjectChatBrowserMessages(idPrefix: string, options: { tallFromIndex?: number } = {}): ChatMessage[] {
  return Array.from({ length: PROJECT_CHAT_BROWSER_MESSAGE_COUNT }, (_, index) =>
    createChatMessage(index % 2 === 0 ? "user" : "assistant", createBrowserContent("Project chat browser message", index, options), {
      id: `${idPrefix}-${index}`
    })
  );
}

export function createAssistantChatBrowserMessages(idPrefix: string, options: { tallFromIndex?: number } = {}): ChatMessage[] {
  return Array.from({ length: PROJECT_CHAT_BROWSER_MESSAGE_COUNT }, (_, index) =>
    createChatMessage(index % 2 === 0 ? "user" : "assistant", createBrowserContent("Assistant chat browser message", index, options), {
      id: `${idPrefix}-${index}`
    })
  );
}

function createBrowserContent(label: string, index: number, options: { tallFromIndex?: number }) {
  if (index < (options.tallFromIndex ?? 0)) {
    const title = `${label} ${index}`;
    return `${title}\n\nMeasured transcript short row ${index}.`;
  }
  return createTallBrowserContent(label, index);
}

function createTallBrowserContent(label: string, index: number) {
  const title = `${label} ${index}`;
  if (index === PROJECT_CHAT_BROWSER_MESSAGE_COUNT - 1) {
    return [
      title,
      "",
      "Latest message body deliberately runs taller than the transcript estimate so first-load bottom anchoring must survive row measurement changes.",
      createParagraphBlock(index, 12),
      createCodeBlock(index, 16)
    ].join("\n");
  }
  if (index % 5 === 0) {
    return [title, "", createCodeBlock(index, 22), createParagraphBlock(index, 5)].join("\n");
  }
  if (index % 3 === 0) {
    return [title, "", createParagraphBlock(index, 10)].join("\n");
  }
  return [title, "", createParagraphBlock(index, 3)].join("\n");
}

function createParagraphBlock(index: number, lines: number) {
  return Array.from(
    { length: lines },
    (_, lineIndex) =>
      `Measured transcript paragraph ${index}.${lineIndex}: this row expands after the virtualizer's estimate and keeps enough text to wrap in the browser viewport.`
  ).join("\n\n");
}

function createCodeBlock(index: number, lines: number) {
  return [
    "```ts",
    ...Array.from(
      { length: lines },
      (_, lineIndex) => `const measuredProjectChatLine${lineIndex} = "message-${index}-line-${lineIndex}-keeps-the-row-tall";`
    ),
    "```"
  ].join("\n");
}
