import { Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export type PrimitivePortalLayer = "dialog" | "popover" | "tooltip" | "tutorial";

type PrimitivePortalProps = {
  active?: boolean;
  layer: PrimitivePortalLayer;
  children: JSX.Element;
};

const portalRoots = new Map<PrimitivePortalLayer, HTMLDivElement>();

export function shouldBypassPortalForTests() {
  return (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals === true;
}

export function PrimitivePortal(props: PrimitivePortalProps) {
  return (
    <Show when={props.active ?? true}>
      <Show when={shouldBypassPortalForTests()} fallback={<Portal mount={getPrimitivePortalRoot(props.layer)}>{props.children}</Portal>}>
        {props.children}
      </Show>
    </Show>
  );
}

export function getPrimitivePortalRoot(layer: PrimitivePortalLayer) {
  const existingRoot = portalRoots.get(layer);
  if (existingRoot?.isConnected) {
    return existingRoot;
  }

  const documentRoot = document.querySelector<HTMLDivElement>(`[data-primitive-portal-layer="${layer}"]`);
  if (documentRoot) {
    portalRoots.set(layer, documentRoot);
    return documentRoot;
  }

  const root = document.createElement("div");
  root.dataset.testPrimitivePortalRoot = "";
  root.dataset.primitivePortalLayer = layer;
  document.body.append(root);
  portalRoots.set(layer, root);
  return root;
}
