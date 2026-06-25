import { For, createMemo } from "solid-js";
import { findChatFileReferences, type ChatFileLinkContext, type ChatFileTarget } from "../lib/chat-file-links";

export type FileLinkConfig = ChatFileLinkContext & {
  onOpenFile: (target: ChatFileTarget) => void;
};

type FileLinkedTextSegment =
  | { kind: "text"; text: string }
  | { kind: "file"; text: string; target: ChatFileTarget };

export type FileLinkedTextProps = {
  text: string | (() => string);
  fileLinks?: FileLinkConfig;
  class?: string;
};

export function FileLinkedText(props: FileLinkedTextProps) {
  const readText = () => (typeof props.text === "function" ? props.text() : props.text);
  const segments = createMemo(() => splitFileLinkedText(readText(), props.fileLinks));

  function handleFileClick(event: MouseEvent, target: ChatFileTarget) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    props.fileLinks?.onOpenFile(target);
  }

  return (
    <span class={props.class}>
      <For each={segments()}>
        {(segment) =>
          segment.kind === "file" ? (
            <button
              type="button"
              data-test-chat-file-link=""
              class="markdown-link markdown-file-link"
              onClick={(event) => handleFileClick(event, segment.target)}
            >
              {segment.text}
            </button>
          ) : (
            segment.text
          )
        }
      </For>
    </span>
  );
}

function splitFileLinkedText(text: string, fileLinks: FileLinkConfig | undefined): FileLinkedTextSegment[] {
  if (!fileLinks) {
    return [{ kind: "text", text }];
  }

  const references = findChatFileReferences(text, fileLinks);
  if (references.length === 0) {
    return [{ kind: "text", text }];
  }

  const segments: FileLinkedTextSegment[] = [];
  let cursor = 0;
  for (const reference of references) {
    if (reference.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, reference.index) });
    }
    segments.push({ kind: "file", text: reference.text, target: reference.target });
    cursor = reference.index + reference.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
