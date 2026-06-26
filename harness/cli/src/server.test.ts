import { setDefaultTimeout } from "bun:test";
import { registerServerRuntimeBudgetTests } from "./test-support/server-test-harness";

setDefaultTimeout(15000);

registerServerRuntimeBudgetTests();
