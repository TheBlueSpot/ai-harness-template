import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { createEffect, onCleanup, onMount } from "solid-js";
import { findTerminalLinks, openTerminalLink, resolveTerminalFileTarget, type TerminalLinkTarget } from "../terminal-links";
import { sendTerminalInput } from "../terminal-transport";
import { readTerminalTheme } from "../terminal-theme";

export type XtermRendererHandle = {
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  serialize: () => string;
};

export function XtermRenderer(props: {
  sessionId: string;
  output: string;
  outputDelta?: string;
  outputVersion?: number;
  outputResetVersion?: number;
  searchQuery: string;
  copyOnSelect: boolean;
  ctrlCMode: "auto" | "copy" | "sigint";
  sessionCwd: string;
  projectRoot: string;
  onOpenFile: (path: string, line?: number, column?: number) => void;
  onInput?: (input: string | Uint8Array) => void;
  onReady?: (handle: XtermRendererHandle) => void;
  onResize?: (cols: number, rows: number) => void;
}) {
  let host: HTMLDivElement | undefined;
  let terminal: Terminal | undefined;
  let fit: FitAddon | undefined;
  let search: SearchAddon | undefined;
  let serialize: SerializeAddon | undefined;
  let written = "";
  let seenOutputVersion = -1;
  let seenResetVersion = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      convertEol: true,
      fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace)",
      fontSize: 12,
      scrollback: 10000,
      theme: readTerminalTheme()
    });
    fit = new FitAddon();
    search = new SearchAddon();
    serialize = new SerializeAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(serialize);
    terminal.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault();
      window.open(uri, "_blank", "noopener,noreferrer");
    }));
    terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = terminal?.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true);
        if (!line) {
          callback(undefined);
          return;
        }
        const links = findTerminalLinks(line)
          .map((link) => {
            const target = resolveLinkTarget(link.target, props.sessionCwd, props.projectRoot);
            if (!target) {
              return undefined;
            }
            return {
              range: {
                start: { x: link.index + 1, y: bufferLineNumber },
                end: { x: link.index + link.length + 1, y: bufferLineNumber }
              },
              text: line.slice(link.index, link.index + link.length),
              activate(event: MouseEvent) {
                event.preventDefault();
                openTerminalLink(target, props.onOpenFile);
              }
            };
          })
          .filter((link): link is NonNullable<typeof link> => Boolean(link));
        callback(links.length ? links : undefined);
      }
    });
    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL is an optional acceleration path; xterm continues with DOM/canvas rendering.
    }
    terminal.open(host!);
    fit.fit();
    props.onResize?.(terminal.cols, terminal.rows);
    terminal.onData((data) => {
      if (props.onInput) {
        props.onInput(data);
        return;
      }
      sendTerminalInput(props.sessionId, data);
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && event.type === "keydown") {
        const selection = terminal?.getSelection();
        if (props.ctrlCMode === "copy" || (props.ctrlCMode === "auto" && selection)) {
          if (selection) {
            void navigator.clipboard?.writeText(selection);
          }
          return false;
        }
      }
      return true;
    });
    terminal.onSelectionChange(() => {
      if (!props.copyOnSelect || !terminal) {
        return;
      }
      if (copyTimer) {
        clearTimeout(copyTimer);
      }
      copyTimer = setTimeout(() => {
        const selection = terminal?.getSelection();
        if (selection) {
          void navigator.clipboard?.writeText(selection);
        }
      }, 180);
    });
    const resizeObserver = new ResizeObserver(() => {
      fit?.fit();
      if (terminal) {
        props.onResize?.(terminal.cols, terminal.rows);
      }
    });
    resizeObserver.observe(host!);
    props.onReady?.({
      findNext: (query) => Boolean(search?.findNext(query)),
      findPrevious: (query) => Boolean(search?.findPrevious(query)),
      serialize: () => serialize?.serialize() ?? ""
    });
    onCleanup(() => {
      resizeObserver.disconnect();
      terminal?.dispose();
    });
  });

  createEffect(() => {
    if (!terminal) {
      return;
    }
    if (typeof props.outputVersion === "number") {
      const resetVersion = props.outputResetVersion ?? 0;
      if (seenOutputVersion === -1 || resetVersion !== seenResetVersion) {
        terminal.reset();
        terminal.write(props.output);
        written = props.output;
        seenOutputVersion = props.outputVersion;
        seenResetVersion = resetVersion;
        return;
      }
      if (props.outputVersion === seenOutputVersion) {
        return;
      }
      const next = props.output.startsWith(written) ? props.output.slice(written.length) : props.outputDelta ?? "";
      if (next) {
        terminal.write(next);
      }
      written = props.output;
      seenOutputVersion = props.outputVersion;
      return;
    }
    const output = props.output;
    if (output === written) {
      return;
    }
    if (!output.startsWith(written)) {
      terminal.reset();
      terminal.write(output);
      written = output;
      return;
    }
    const next = output.slice(written.length);
    written = output;
    terminal.write(next);
  });

  createEffect(() => {
    if (terminal) {
      terminal.options.theme = readTerminalTheme();
    }
  });

  createEffect(() => {
    if (props.searchQuery) {
      search?.findNext(props.searchQuery);
    }
  });

  return <div ref={host} class="h-full min-h-0 w-full overflow-hidden" data-test-xterm-renderer="" />;
}

function resolveLinkTarget(target: TerminalLinkTarget, sessionCwd: string, projectRoot: string): TerminalLinkTarget | undefined {
  if (target.kind === "url") {
    return target;
  }
  return resolveTerminalFileTarget(target, sessionCwd, projectRoot);
}
