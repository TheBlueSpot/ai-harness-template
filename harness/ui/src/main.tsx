import { mountApp } from "./mount-app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

let dispose = mountApp(root);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    dispose();
  });
}
