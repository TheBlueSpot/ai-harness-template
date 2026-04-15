import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import { canSelectProviderBrand, harnessStore, persistLocalPreferences } from "../harness-store";
import { pushToast } from "../toast-store";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

type PreferencesModalProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function PreferencesModal(props: PreferencesModalProps) {
  const state = harnessStore.state;

  function handleSave() {
    const openAiApiKey = state.openAiApiKeyDraft.trim() || undefined;
    const googleApiKey = state.googleApiKeyDraft.trim() || undefined;

    if (!openAiApiKey && !googleApiKey && !state.hasUsableApiKey && !state.hasStoredApiKey) {
      pushToast("API key required", "Enter provider key before sending chat.", "error");
      return;
    }

    if (!canSelectProviderBrand(state, state.providerBrand)) {
      pushToast("Provider key required", `Saved ${state.providerBrand === "gemini" ? "Gemini" : "GPT"} key required.`, "error");
      return;
    }

    persistLocalPreferences({
      openAiApiKey,
      googleApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey,
      googleApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen
    });

    props.sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey,
        googleApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen
      }
    });

    harnessStore.closePreferencesModal();
  }

  function handleClearApiKey() {
    persistLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen
    });

    props.sendCommand({
      type: "preferences.clearApiKey",
      requestId: createRequestId()
    });
  }

  return (
    <Dialog
      open={state.preferencesModalOpen}
      onClose={() => harnessStore.closePreferencesModal()}
      title="Workspace preferences"
      description="Manage local GPT and Gemini keys plus default workspace preferences."
      footer={
        <>
          <Button variant="ghost" onClick={() => harnessStore.closePreferencesModal()}>
            Dismiss
          </Button>
          <Button variant="secondary" onClick={handleClearApiKey}>
            Clear keys
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </>
      }
    >
      <div class="grid gap-3">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Active brand
          </span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.providerBrand}
            onInput={(event) => harnessStore.setProviderBrand(event.currentTarget.value as "gpt" | "gemini")}
          >
            <option value="gpt" disabled={!canSelectProviderBrand(state, "gpt")}>
              GPT
            </option>
            <option value="gemini" disabled={!canSelectProviderBrand(state, "gemini")}>
              Gemini
            </option>
          </select>
          <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">Brand switch stays disabled until matching key exists or you type one here.</p>
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            OpenAI API key
          </span>
          <Input
            type="password"
            value={state.openAiApiKeyDraft}
            placeholder="sk-..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setOpenAiApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Google API key
          </span>
          <Input
            type="password"
            value={state.googleApiKeyDraft}
            placeholder="AIza..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setGoogleApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">
          Keys stored in browser storage and local workspace storage on this machine.
        </p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex items-start gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.debugEnabled}
            onInput={(event) => harnessStore.setDebugEnabled(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-[color:var(--foreground)]">Verbose developer logging</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">Default on for new runs in this browser.</div>
          </div>
        </label>

        <label class="flex items-start gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.tracePanelDefaultOpen}
            onInput={(event) => harnessStore.setTracePanelDefaultOpen(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-[color:var(--foreground)]">Open trace panel by default</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">Controls initial layout after refresh.</div>
          </div>
        </label>
      </div>
    </Dialog>
  );
}
