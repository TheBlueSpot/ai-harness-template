import { setDefaultTimeout } from "bun:test";
import { registerServerProjectsAndHistoryTests } from "./test-support/server-test-harness";

setDefaultTimeout(30000);

registerServerProjectsAndHistoryTests({ shardIndex: 0, shardCount: 4 });
