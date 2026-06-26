import { parseServerEventFrame, type ServerEvent } from "../harness/shared/protocol";

type BenchArgs = {
  events: number;
  batchSize: number;
  runs: number;
  network: boolean;
};

type BenchRow = {
  name: string;
  frames: number;
  bytes: number;
  ms: number;
  eventsPerSecond: number;
  backpressured?: number;
};

const encoder = new TextEncoder();

const args = parseArgs(Bun.argv.slice(2));
const events = createAssistantDeltaEvents(args.events);

console.log(`websocket batch benchmark`);
console.log(`events=${args.events} batchSize=${args.batchSize} runs=${args.runs} network=${args.network}`);

const individualFrames = serializeIndividualFrames(events);
const batchedFrames = serializeBatchFrames(events, args.batchSize);

const codecRows = runCodecBenchmarks(events, individualFrames, batchedFrames, args.batchSize, args.runs);
printRows("codec", codecRows);

if (args.network) {
  const networkRows = await runNetworkBenchmarks(individualFrames, batchedFrames, args.events, args.runs);
  printRows("loopback websocket", networkRows);
}

function parseArgs(rawArgs: string[]): BenchArgs {
  const getNumber = (name: string, fallback: number) => {
    const prefix = `--${name}=`;
    const value = rawArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };

  return {
    events: getNumber("events", 20_000),
    batchSize: getNumber("batch-size", 32),
    runs: getNumber("runs", 5),
    network: !rawArgs.includes("--no-network")
  };
}

function createAssistantDeltaEvents(count: number): ServerEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "assistant.chat.delta",
    requestId: `bench-${index}`,
    payload: {
      assistantId: "assistant-bench",
      sessionId: "session-bench",
      delta: `chunk-${index % 100}:abcdefghijklmnopqrstuvwxyz`
    }
  }));
}

function serializeIndividualFrames(input: ServerEvent[]) {
  return input.map((event) => JSON.stringify(event));
}

function serializeBatchFrames(input: ServerEvent[], batchSize: number) {
  const frames: string[] = [];
  for (let index = 0; index < input.length; index += batchSize) {
    const chunk = input.slice(index, index + batchSize).map((event) => JSON.stringify(event));
    frames.push(
      chunk.length === 1
        ? chunk[0]!
        : `{"type":"server.events-batch","payload":{"events":[${chunk.join(",")}]}}`
    );
  }
  return frames;
}

function runCodecBenchmarks(input: ServerEvent[], individual: string[], batched: string[], batchSize: number, runs: number): BenchRow[] {
  const individualBytes = byteLength(individual);
  const batchedBytes = byteLength(batched);
  return [
    {
      name: "server serialize individual",
      frames: individual.length,
      bytes: individualBytes,
      ms: medianTimed(runs, () => serializeIndividualFrames(input).length),
      eventsPerSecond: 0
    },
    {
      name: "server serialize batched",
      frames: batched.length,
      bytes: batchedBytes,
      ms: medianTimed(runs, () => serializeBatchFrames(input, batchSize).length),
      eventsPerSecond: 0
    },
    {
      name: "client parse individual",
      frames: individual.length,
      bytes: individualBytes,
      ms: medianTimed(runs, () => parseFrames(individual)),
      eventsPerSecond: 0
    },
    {
      name: "client parse batched",
      frames: batched.length,
      bytes: batchedBytes,
      ms: medianTimed(runs, () => parseFrames(batched)),
      eventsPerSecond: 0
    }
  ].map((row) => ({
    ...row,
    eventsPerSecond: Math.round(input.length / (row.ms / 1000))
  }));
}

async function runNetworkBenchmarks(individualFrames: string[], batchedFrames: string[], eventCount: number, runs: number): Promise<BenchRow[]> {
  const individualBytes = byteLength(individualFrames);
  const batchedBytes = byteLength(batchedFrames);
  const individualTrial = await medianAsyncTimed(runs, () => runLoopbackTrial(individualFrames, eventCount, false));
  const individualCorkTrial = await medianAsyncTimed(runs, () => runLoopbackTrial(individualFrames, eventCount, true));
  const batchTrial = await medianAsyncTimed(runs, () => runLoopbackTrial(batchedFrames, eventCount, false));
  return [
    {
      name: "individual frames",
      frames: individualFrames.length,
      bytes: individualBytes,
      ms: individualTrial.ms,
      eventsPerSecond: Math.round(eventCount / (individualTrial.ms / 1000)),
      backpressured: individualTrial.backpressured
    },
    {
      name: "individual frames + cork",
      frames: individualFrames.length,
      bytes: individualBytes,
      ms: individualCorkTrial.ms,
      eventsPerSecond: Math.round(eventCount / (individualCorkTrial.ms / 1000)),
      backpressured: individualCorkTrial.backpressured
    },
    {
      name: "batched frames",
      frames: batchedFrames.length,
      bytes: batchedBytes,
      ms: batchTrial.ms,
      eventsPerSecond: Math.round(eventCount / (batchTrial.ms / 1000)),
      backpressured: batchTrial.backpressured
    }
  ];
}

function parseFrames(frames: string[]) {
  let count = 0;
  for (const frame of frames) {
    count += parseServerEventFrame(JSON.parse(frame)).length;
  }
  return count;
}

function byteLength(frames: string[]) {
  let total = 0;
  for (const frame of frames) {
    total += encoder.encode(frame).byteLength;
  }
  return total;
}

function medianTimed(runs: number, callback: () => number) {
  const values: number[] = [];
  for (let index = 0; index < runs + 1; index += 1) {
    const started = performance.now();
    const result = callback();
    if (result <= 0) {
      throw new Error("benchmark callback produced no work");
    }
    const elapsed = performance.now() - started;
    if (index > 0) {
      values.push(elapsed);
    }
  }
  return median(values);
}

async function medianAsyncTimed(
  runs: number,
  callback: () => Promise<{ ms: number; backpressured: number }>
) {
  const values: Array<{ ms: number; backpressured: number }> = [];
  for (let index = 0; index < runs + 1; index += 1) {
    const result = await callback();
    if (index > 0) {
      values.push(result);
    }
  }
  const sorted = [...values].sort((left, right) => left.ms - right.ms);
  return sorted[Math.floor(sorted.length / 2)] ?? { ms: 0, backpressured: 0 };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function runLoopbackTrial(frames: string[], expectedEvents: number, cork: boolean) {
  return await new Promise<{ ms: number; backpressured: number }>((resolve, reject) => {
    let started = 0;
    let received = 0;
    let backpressured = 0;
    let timeout: ReturnType<typeof setTimeout>;
    let server: { stop(force?: boolean): void; port?: number } | undefined;
    let socket: WebSocket | undefined;
    const cleanup = () => {
      clearTimeout(timeout);
      socket?.close();
      server?.stop(true);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("loopback benchmark timed out"));
    }, 15_000);

    server = Bun.serve<{ role: "bench" }>({
      port: 0,
      fetch(request, serverInstance) {
        if (serverInstance.upgrade(request, { data: { role: "bench" } })) {
          return;
        }
        return new Response("websocket batch benchmark", { status: 200 });
      },
      websocket: {
        message(ws, message) {
          if (message !== "start") {
            return;
          }
          const sendFrames = () => {
            for (const frame of frames) {
              const status = ws.send(frame);
              if (status === -1) {
                backpressured += 1;
              }
            }
          };
          if (cork) {
            ws.cork(sendFrames);
          } else {
            sendFrames();
          }
        }
      }
    });

    const port = server.port;
    if (port === undefined) {
      cleanup();
      reject(new Error("loopback benchmark server did not bind a port"));
      return;
    }
    socket = new WebSocket(`ws://127.0.0.1:${port}`);

    socket.addEventListener("open", () => {
      started = performance.now();
      socket.send("start");
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      received += parseServerEventFrame(JSON.parse(event.data)).length;
      if (received >= expectedEvents) {
        const ms = performance.now() - started;
        cleanup();
        resolve({ ms, backpressured });
      }
    });
    socket.addEventListener("error", () => {
      cleanup();
      reject(new Error("loopback websocket failed"));
    });
  });
}

function printRows(title: string, rows: BenchRow[]) {
  console.log(`\n${title}`);
  console.log("name,frames,bytes,ms,events/s,backpressured");
  for (const row of rows) {
    console.log(
      [
        row.name,
        row.frames,
        row.bytes,
        row.ms.toFixed(2),
        row.eventsPerSecond,
        row.backpressured ?? ""
      ].join(",")
    );
  }
}
