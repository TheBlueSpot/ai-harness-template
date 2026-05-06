import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { WorkspaceRepository } from "./workspace-repository";

const createCalls: unknown[] = [];

mock.module("@google/genai", () => ({
  GoogleGenAI: class {
    caches = {
      create: async (input: unknown) => {
        createCalls.push(input);
        return { name: `cachedContents/test-${createCalls.length}` };
      }
    };
  }
}));

function createRepository() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return new WorkspaceRepository(path.join(tempRoot, `gemini-cache-${crypto.randomUUID()}.sqlite`), process.cwd(), {
    durability: "test-fast"
  });
}

function addProject(repository: WorkspaceRepository) {
  const rootPath = path.join(process.cwd(), ".tmp-test-data", `project-${crypto.randomUUID()}`);
  mkdirSync(rootPath, { recursive: true });
  return repository.addProject(rootPath);
}

function createMessage() {
  return {
    id: "message-1",
    role: "user" as const,
    kind: "plain" as const,
    content: "Review this",
    createdAt: "2026-05-02T00:00:00.000Z",
    attachments: [
      {
        id: "attachment-1",
        key: "attachment-1",
        kind: "text" as const,
        name: "notes.md",
        mimeType: "text/markdown",
        sizeBytes: 12,
        url: "https://utfs.io/f/attachment-1",
        uploadedAt: "2026-05-02T00:00:00.000Z"
      }
    ]
  };
}

describe("Gemini cached contents", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    createCalls.length = 0;
    globalThis.fetch = Object.assign(mock(async () => new Response("stable attachment text")), {
      preconnect: originalFetch.preconnect
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("cache miss creates a 24h resource and hit reuses DB record", async () => {
    const { prepareGeminiCachedAttachmentContext } = await import("./gemini-cached-contents");
    const repository = createRepository();
    const project = addProject(repository);
    const input = {
      repository,
      projectId: project.id,
      modelId: "google/gemini-3-flash-preview",
      messages: [createMessage()],
      googleApiKey: "key",
      now: new Date("2026-05-02T00:00:00.000Z")
    };

    const created = await prepareGeminiCachedAttachmentContext(input);
    const reused = await prepareGeminiCachedAttachmentContext({
      ...input,
      now: new Date("2026-05-02T01:00:00.000Z")
    });

    expect(created?.cachedContentName).toBe("cachedContents/test-1");
    expect(reused?.cachedContentName).toBe("cachedContents/test-1");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      model: "gemini-3-flash-preview",
      config: {
        ttl: "86400s"
      }
    });
  });

  test("model mismatch does not reuse existing cache record", async () => {
    const { prepareGeminiCachedAttachmentContext } = await import("./gemini-cached-contents");
    const repository = createRepository();
    const project = addProject(repository);
    const base = {
      repository,
      projectId: project.id,
      messages: [createMessage()],
      googleApiKey: "key",
      now: new Date("2026-05-02T00:00:00.000Z")
    };

    await prepareGeminiCachedAttachmentContext({ ...base, modelId: "google/gemini-3-flash-preview" });
    await prepareGeminiCachedAttachmentContext({ ...base, modelId: "google/gemini-3-pro-preview" });

    expect(createCalls).toHaveLength(2);
  });
});
