import { Dot } from "lucide-solid";
import { harnessStore } from "../harness-store";

export function ConnectionBanner() {
  const state = harnessStore.state;

  const toneClass = () => {
    switch (state.connectionState) {
      case "connected":
        return "text-emerald-700";
      case "connecting":
        return "text-amber-700";
      case "error":
        return "text-red-700";
      default:
        return "text-[color:var(--muted)]";
    }
  };

  return (
    <div class="rounded-full border border-[color:var(--border)] bg-white/60 px-3 py-1.5 shadow-sm">
      <div class={`flex items-center gap-2 text-[0.675rem] font-medium ${toneClass()}`}>
        <Dot class="h-4 w-4" />
        <span class="capitalize">{state.connectionState}</span>
      </div>
      {state.connectionError ? (
        <div class="mt-1 text-[0.585rem] text-[color:var(--danger)]">{state.connectionError}</div>
      ) : null}
    </div>
  );
}
