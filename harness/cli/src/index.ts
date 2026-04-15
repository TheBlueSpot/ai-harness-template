import { startHarnessServer } from "./server";

const port = Number(Bun.env.HARNESS_PORT ?? 8787);
const serverOnly = process.argv.includes("--server-only");

await startHarnessServer({
  port: Number.isFinite(port) ? port : 8787,
  serverOnly
});
