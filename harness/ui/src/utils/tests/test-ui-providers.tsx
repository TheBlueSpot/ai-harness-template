/** @jsxImportSource solid-js */
import { render } from "solid-js/web";
import { UiStateProviders } from "../../store-providers";

const providerState = globalThis as typeof globalThis & { __padPilotUiProvidersMounted?: boolean };

export function mountTestUiProviders() {
  if (providerState.__padPilotUiProvidersMounted) {
    return;
  }

  const root = document.createElement("div");
  render(
    () => (
      <UiStateProviders>
        <div />
      </UiStateProviders>
    ),
    root
  );
  providerState.__padPilotUiProvidersMounted = true;
}
