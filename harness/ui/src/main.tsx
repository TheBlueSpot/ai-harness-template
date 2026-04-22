import { render } from "solid-js/web";
import { App } from "./app";
import { UiStateProviders } from "./store-providers";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

render(
  () => (
    <UiStateProviders>
      <App />
    </UiStateProviders>
  ),
  root
);
