import { mountApp } from "./mount-app";
import { HARNESS_APP_VERSION } from "../../shared/app-version";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

console.log(`Harness ${HARNESS_APP_VERSION} browser app starting`);

let dispose = mountApp(root);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    dispose();
  });
}
