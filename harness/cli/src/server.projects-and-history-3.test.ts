import { setDefaultTimeout } from "bun:test";
import { registerServerProjectsAndHistoryTests } from "./test-support/server-test-harness";

setDefaultTimeout(30000);

registerServerProjectsAndHistoryTests({ shardIndex: 3, shardCount: 4 });
