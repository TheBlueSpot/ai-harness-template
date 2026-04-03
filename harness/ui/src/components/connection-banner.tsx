import { useHarnessStore } from "../store/use-harness-store";

export function ConnectionBanner() {
  const connectionState = useHarnessStore((state) => state.connectionState);
  const connectionError = useHarnessStore((state) => state.connectionError);

  return (
    <div className={`connection-banner connection-banner--${connectionState}`}>
      <span className="connection-banner__dot" />
      <div>
        <div className="connection-banner__state">{connectionState}</div>
        {connectionError ? <div className="connection-banner__error">{connectionError}</div> : null}
      </div>
    </div>
  );
}

