type DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell> = {
  version: number;
  state: TState;
  handlerRefs: THandlerRefs;
  server: TServer;
  browserOpenedOnce: boolean;
  websocketShell: TWebSocketShell;
  pendingState?: TState;
  pendingHandlerRefs?: THandlerRefs;
  pendingApplyTimer?: ReturnType<typeof setTimeout>;
  pendingApplyBackoffStep?: number;
  trackedHotReloadSnapshot?: Map<string, number>;
};

const DEV_HARNESS_SERVER_SINGLETON_KEY = Symbol.for("pi-harness.dev-server");

export function getDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>() {
  const globalState = globalThis as typeof globalThis & {
    [DEV_HARNESS_SERVER_SINGLETON_KEY]?: DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>;
  };

  return globalState[DEV_HARNESS_SERVER_SINGLETON_KEY];
}

export function setDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>(
  singleton: DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>
) {
  const globalState = globalThis as typeof globalThis & {
    [DEV_HARNESS_SERVER_SINGLETON_KEY]?: DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>;
  };

  globalState[DEV_HARNESS_SERVER_SINGLETON_KEY] = singleton;
  return singleton;
}

export function clearDevHarnessServerSingleton() {
  const globalState = globalThis as typeof globalThis & {
    [DEV_HARNESS_SERVER_SINGLETON_KEY]?: unknown;
  };

  delete globalState[DEV_HARNESS_SERVER_SINGLETON_KEY];
}
