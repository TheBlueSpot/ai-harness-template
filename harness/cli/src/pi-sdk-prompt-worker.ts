import { PiSdkAgentAdapter, type PiSdkPromptWorkerRequest, type PiSdkPromptWorkerResponse } from "./pi-agent-adapter";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PiSdkPromptWorkerRequest>) => void | Promise<void>) | null;
  postMessage(response: PiSdkPromptWorkerResponse): void;
};

workerScope.onmessage = async (event: MessageEvent<PiSdkPromptWorkerRequest>) => {
  const message = event.data;
  try {
    const adapter = new PiSdkAgentAdapter({ offloadRunPrompt: false });
    adapter.setAutoCompactContextThresholdPercent(message.autoCompactContextThresholdPercent);
    for (const [provider, apiKey] of Object.entries(message.apiKeys)) {
      if (apiKey) {
        adapter.setApiKey(provider as keyof PiSdkPromptWorkerRequest["apiKeys"], apiKey);
      }
    }

    const result = await adapter.runPrompt(message.request);
    postResponse({
      id: message.id,
      ok: true,
      result
    });
  } catch (error) {
    postResponse({
      id: message.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
};

function postResponse(response: PiSdkPromptWorkerResponse) {
  workerScope.postMessage(response);
}
