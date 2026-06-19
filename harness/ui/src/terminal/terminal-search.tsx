import { ArrowDown, ArrowUp, X } from "lucide-solid";
import { terminalStore } from "./terminal-store";
import { ActionButton } from "../components/action-button";
import { Input } from "../components/primitives/input";

export function TerminalSearch(props: { onNext: () => void; onPrevious: () => void }) {
  return (
    <div class="flex min-w-0 items-center gap-1 rounded-lg border border-(--border) bg-(--panel) px-2 py-1 shadow-sm">
      <Input
        aria-label="Search terminal"
        class="h-7 w-44 rounded-lg border-0 bg-transparent px-1 py-1 shadow-none"
        value={terminalStore.state.searchQuery}
        placeholder="Find..."
        onInput={(event) => terminalStore.setSearch(true, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.shiftKey ? props.onPrevious() : props.onNext();
          }
          if (event.key === "Escape") {
            terminalStore.setSearch(false, "");
          }
        }}
      />
      <ActionButton tooltip="Previous terminal match" ariaLabel="Previous terminal match" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<ArrowUp class="h-3.5 w-3.5" />} onClick={props.onPrevious} />
      <ActionButton tooltip="Next terminal match" ariaLabel="Next terminal match" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<ArrowDown class="h-3.5 w-3.5" />} onClick={props.onNext} />
      <ActionButton tooltip="Close terminal search" ariaLabel="Close terminal search" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<X class="h-3.5 w-3.5" />} onClick={() => terminalStore.setSearch(false, "")} />
    </div>
  );
}
