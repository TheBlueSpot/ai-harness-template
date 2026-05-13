import { Dot } from "lucide-solid";
import { harnessStore } from "../harness-store";

export function ConnectionBanner() {
  const state = harnessStore.state;

  return (
    <div class="rounded-full border border-(--border) bg-white/60 px-3 py-1.5 shadow-sm">
      <div
        class="flex items-center gap-2 text-[0.675rem] font-medium"
        classList={{
          "text-emerald-700": state.connectionState === "connected",
          "text-amber-700": state.connectionState === "connecting",
          "text-red-700": state.connectionState === "error",
          "text-(--muted)": state.connectionState !== "connected" && state.connectionState !== "connecting" && state.connectionState !== "error"
        }}
      >
        <Dot class="h-4 w-4" />
        <span class="capitalize">{state.connectionState}</span>
      </div>
      {state.connectionError ? (
        <div class="mt-1 text-[0.585rem] text-(--danger)">{state.connectionError}</div>
      ) : null}
    </div>
  );
}
