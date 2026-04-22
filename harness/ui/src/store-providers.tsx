import { createContext, onCleanup, useContext, type JSX } from "solid-js";
import {
  createHarnessStore,
  type HarnessStoreApi,
  requireHarnessStore,
  setActiveHarnessStore
} from "./harness-store";
import {
  createToastStoreForProvider,
  type ToastStoreApi,
  requireToastStore,
  setActiveToastStore
} from "./toast-store";

const HarnessStoreContext = createContext<HarnessStoreApi>();
const ToastStoreContext = createContext<ToastStoreApi>();

export function UiStateProviders(props: { children: JSX.Element }) {
  const harnessStore = createHarnessStore();
  const toastStore = createToastStoreForProvider();

  setActiveHarnessStore(harnessStore);
  setActiveToastStore(toastStore);

  onCleanup(() => {
    toastStore.dispose();
    setActiveHarnessStore(undefined);
    setActiveToastStore(undefined);
  });

  return (
    <HarnessStoreContext.Provider value={harnessStore}>
      <ToastStoreContext.Provider value={toastStore}>{props.children}</ToastStoreContext.Provider>
    </HarnessStoreContext.Provider>
  );
}

export function useHarnessStore() {
  return useContext(HarnessStoreContext) ?? requireHarnessStore();
}

export function useToastStore() {
  return useContext(ToastStoreContext) ?? requireToastStore();
}
