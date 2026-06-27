import { createMemo } from "solid-js";
import { VirtualList } from "../../components/primitives/virtual-list";
import { resolveTerminalKeyboardAction } from "../terminal-keybindings";
import { closeTerminalSearch, toggleTerminalSearch } from "../terminal-search-actions";
import { terminalStore } from "../terminal-store";

export function SolidTerminalRendererPrototype(props: {
  output: string;
  readOnly?: boolean;
  backspaceInput?: string;
  onInput?: (input: string | Uint8Array) => void;
}) {
  const rows = createMemo(() => props.output.split(/\r?\n/).map((line, index) => ({ id: `${index}`, line })));
  const sendInput = (input: string) => {
    if (props.readOnly) {
      return;
    }
    props.onInput?.(input);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && terminalStore.state.searchOpen) {
      consumeTerminalShortcut(event);
      closeTerminalSearch();
      return;
    }
    const action = resolveTerminalKeyboardAction(event);
    if (action === "toggle-search") {
      consumeTerminalShortcut(event);
      toggleTerminalSearch();
      return;
    }
    if (action === "send-interrupt") {
      consumeTerminalShortcut(event);
      sendInput("\x03");
      return;
    }
    if (action === "paste") {
      consumeTerminalShortcut(event);
      if (!props.readOnly) {
        void navigator.clipboard?.readText?.().then((text) => {
          if (text) {
            props.onInput?.(text);
          }
        }).catch(() => undefined);
      }
      return;
    }
    if (action === "copy" || action === "select-all") {
      return;
    }
    const input = resolveSolidTerminalInput(event, props.backspaceInput);
    if (!input) {
      return;
    }
    consumeTerminalShortcut(event);
    sendInput(input);
  };

  return (
    <div
      tabIndex={0}
      role="textbox"
      aria-label="Terminal output"
      aria-readonly={props.readOnly ? "true" : "false"}
      data-test-solid-terminal-input=""
      class="h-full min-h-0 focus:outline-none"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.currentTarget.focus()}
    >
      <VirtualList
        items={rows()}
        estimateSize={20}
        pagination={{ kind: "all" }}
        getKey={(row) => row.id}
        class="h-full bg-(--terminal-shell) px-3 py-2"
        contentClass="font-mono tracking-normal"
        dataTest="solid-terminal-prototype"
      >
        {(row) => <div class="terminal-solid-row whitespace-pre text-[0.76rem] leading-5 text-(--terminal-foreground)">{row.line || " "}</div>}
      </VirtualList>
    </div>
  );
}

function resolveSolidTerminalInput(event: KeyboardEvent, backspaceInput = "\x7f") {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  if (event.key.length === 1) {
    return event.key;
  }
  switch (event.key) {
    case "Backspace":
      return backspaceInput;
    case "Enter":
      return "\r";
    case "Tab":
      return "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    case "Home":
      return "\x1b[H";
    case "End":
      return "\x1b[F";
    case "Delete":
      return "\x1b[3~";
    case "PageUp":
      return "\x1b[5~";
    case "PageDown":
      return "\x1b[6~";
    default:
      return undefined;
  }
}

function consumeTerminalShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}
