import { render } from "solid-js/web";
import { App } from "./app";
import { UiStateProviders } from "./store-providers";
import "./styles.css";

export function mountApp(root: HTMLElement) {
  return render(
    () => (
      <UiStateProviders>
        <App />
      </UiStateProviders>
    ),
    root
  );
}
