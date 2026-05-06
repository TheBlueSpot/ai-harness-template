import type { Api, Model } from "@mariozechner/pi-ai";
import { formatCacheableUserBlocks, stableCloneJson, type CacheableUserBlock } from "./prompt-cache-assembly";

const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;
export const ANTHROPIC_CACHEABLE_USER_BLOCK_MIN_CHARS = 4000;

type JsonObject = Record<string, unknown>;

type TransformInput = {
  payload: unknown;
  model: Model<Api>;
  cacheableUserBlocks?: CacheableUserBlock[];
};

export function transformAnthropicCachePayload(input: TransformInput) {
  if (input.model.provider !== "anthropic" || input.model.api !== "anthropic-messages" || !isObject(input.payload)) {
    return undefined;
  }

  const payload = stableCloneJson(input.payload) as JsonObject;
  const cacheControl = resolveCacheControl(payload);
  stripCacheControls(payload);

  let breakpointCount = 0;
  if (applySystemCacheControl(payload, cacheControl)) {
    breakpointCount += 1;
  }

  if (applyToolsCacheControl(payload, cacheControl)) {
    breakpointCount += 1;
  }

  if (breakpointCount < ANTHROPIC_MAX_CACHE_BREAKPOINTS && applyCacheableUserBlocks(payload, input.cacheableUserBlocks, cacheControl)) {
    breakpointCount += 1;
  }

  if (breakpointCount < ANTHROPIC_MAX_CACHE_BREAKPOINTS && applyFrozenPlanCacheControl(payload, cacheControl)) {
    breakpointCount += 1;
  }

  return payload;
}

function resolveCacheControl(payload: JsonObject) {
  const existing = payload.cache_control;
  if (isObject(existing)) {
    return stableCloneJson(existing);
  }

  return { type: "ephemeral" };
}

function stripCacheControls(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      stripCacheControls(entry);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  delete value.cache_control;
  for (const entry of Object.values(value)) {
    stripCacheControls(entry);
  }
}

function applySystemCacheControl(payload: JsonObject, cacheControl: JsonObject) {
  const system = payload.system;
  if (typeof system === "string") {
    if (!system.trim()) {
      return false;
    }
    payload.system = [{ type: "text", text: system, cache_control: stableCloneJson(cacheControl) }];
    return true;
  }

  if (!Array.isArray(system) || system.length === 0) {
    return false;
  }

  const lastBlock = findLastObject(system);
  if (!lastBlock) {
    return false;
  }

  lastBlock.cache_control = stableCloneJson(cacheControl);
  return true;
}

function applyToolsCacheControl(payload: JsonObject, cacheControl: JsonObject) {
  const tools = payload.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    return false;
  }

  const sortedTools = tools
    .filter(isObject)
    .map((tool) => stableCloneJson(tool))
    .sort((left, right) => getName(left).localeCompare(getName(right)));
  if (sortedTools.length === 0) {
    return false;
  }

  sortedTools[sortedTools.length - 1]!.cache_control = stableCloneJson(cacheControl);
  payload.tools = sortedTools;
  return true;
}

function applyCacheableUserBlocks(payload: JsonObject, blocks: CacheableUserBlock[] | undefined, cacheControl: JsonObject) {
  const visibleBlocks = (blocks ?? []).filter((block) => block.text.trim().length > 0);
  const text = formatCacheableUserBlocks(visibleBlocks);
  if (text.length < ANTHROPIC_CACHEABLE_USER_BLOCK_MIN_CHARS) {
    return false;
  }

  const stableMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text,
        cache_control: stableCloneJson(cacheControl)
      }
    ]
  };

  payload.messages = [stableMessage, ...normalizeMessages(payload.messages)];
  return true;
}

function applyFrozenPlanCacheControl(payload: JsonObject, cacheControl: JsonObject) {
  const messages = normalizeMessages(payload.messages);
  const target = messages.find((message) => {
    if (!isObject(message) || message.role !== "user") {
      return false;
    }
    const text = extractMessageText(message);
    return text.length >= ANTHROPIC_CACHEABLE_USER_BLOCK_MIN_CHARS && /frozen execution plan|contract prerequisites/i.test(text);
  });

  if (!isObject(target)) {
    return false;
  }

  const content = target.content;
  if (typeof content === "string") {
    target.content = [{ type: "text", text: content, cache_control: stableCloneJson(cacheControl) }];
    payload.messages = messages;
    return true;
  }

  if (Array.isArray(content)) {
    const lastBlock = findLastObject(content);
    if (!lastBlock) {
      return false;
    }
    lastBlock.cache_control = stableCloneJson(cacheControl);
    payload.messages = messages;
    return true;
  }

  return false;
}

function normalizeMessages(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function findLastObject(values: unknown[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (isObject(value)) {
      return value;
    }
  }
  return undefined;
}

function extractMessageText(message: JsonObject) {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => (isObject(block) && typeof block.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

function getName(value: JsonObject) {
  return typeof value.name === "string" ? value.name : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const testExports = {
  stripCacheControls,
  applySystemCacheControl,
  applyToolsCacheControl,
  applyCacheableUserBlocks,
  applyFrozenPlanCacheControl
};
