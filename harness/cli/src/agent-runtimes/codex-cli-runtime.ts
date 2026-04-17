import type { AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { CliAgentAdapter } from "./cli-agent-adapter";
import {
  buildCliCapability,
  extractCodexFinalText,
  probeCliVersion,
  probeCodexAuth,
  probeInteractivePipeCompatibility,
  shouldSkipExpensiveCliProbes
} from "./cli-health";
import { CliProcessManager } from "./cli-process-manager";

const DEFAULT_MODEL_ID = "openai/gpt-5.4";

export class CodexCliRuntime implements AgentRuntime {
  readonly id = "codex-cli" as const;
  readonly label = "Codex CLI";

  private readonly processManager = new CliProcessManager();
  private readonly adapter = new CliAgentAdapter({
    label: this.label,
    buildCommand: ({ request, prompt }) => buildCodexProgrammaticCommand(request, prompt)
  });
  private capability: AgentRuntimeCapability | undefined;

  getAdapter() {
    return this.adapter;
  }

  getCapability() {
    return this.capability;
  }

  async refreshCapability() {
    const version = await probeCliVersion(this.processManager, "codex");
    if (!version) {
      this.capability = buildCliCapability({
        agentId: this.id,
        label: this.label,
        installed: false,
        authenticated: false,
        supportsInteractive: false,
        interactivePipeCompatible: false,
        supportsPlanning: true,
        supportsReview: true,
        healthMessage: "Install `codex` CLI to enable this runtime.",
        installCommand: "npm install -g @openai/codex",
        docsUrl: "https://platform.openai.com/docs/codex/cli"
      });
      return this.capability;
    }

    const skipExpensiveProbes = shouldSkipExpensiveCliProbes();
    const [authenticated, interactivePipeCompatible] = await Promise.all([
      skipExpensiveProbes ? Promise.resolve(true) : probeCodexAuth(this.processManager),
      probeInteractivePipeCompatibility(this.processManager, {
        executable: "codex",
        helpArgs: ["--help"]
      })
    ]);

    this.capability = buildCliCapability({
      agentId: this.id,
      label: this.label,
      installed: true,
      authenticated,
      version,
      supportsInteractive: interactivePipeCompatible,
      interactivePipeCompatible,
      supportsPlanning: true,
      supportsReview: true,
      healthMessage: authenticated ? undefined : "Run `codex login` before using this runtime.",
      installCommand: "npm install -g @openai/codex",
      authCommand: "codex login",
      docsUrl: "https://platform.openai.com/docs/codex/cli"
    });

    return this.capability;
  }

  getDefaultPlanningModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  getDefaultExecutionModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  getDefaultSubagentModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  buildInteractiveLaunch(input: { cwd: string; cols: number; rows: number; prompt?: string }) {
    return {
      cmd: [
        "codex",
        "--no-alt-screen",
        "-C",
        input.cwd,
        "-s",
        "workspace-write",
        "-a",
        "on-request",
        ...(input.prompt ? [input.prompt] : [])
      ],
      env: {}
    };
  }
}

function buildCodexProgrammaticCommand(request: PiAgentPromptRequest, prompt: string) {
  if (request.kind === "aggregator" && /\b(review|code review)\b/i.test(prompt)) {
    return {
      cmd: ["codex", "review", "--uncommitted", prompt],
      cwd: request.cwd
    };
  }

  const cmd = [
    "codex",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "-C",
    request.cwd,
    "-s",
    request.readOnly ? "read-only" : "workspace-write"
  ];

  const modelName = toCliModelName(request.modelId);
  if (modelName) {
    cmd.push("--model", modelName);
  }

  cmd.push(prompt);

  let buffered = "";

  return {
    cmd,
    cwd: request.cwd,
    parser: {
      onStdoutChunk(chunkText: string, emitDelta: (delta: string) => void) {
        buffered += chunkText;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
            if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
              emitDelta(parsed.item.text);
            }
          } catch {
            continue;
          }
        }
      },
      getText(stdout: string, stderr: string) {
        const text = extractCodexFinalText(stdout);
        return text || stderr.trim();
      }
    }
  };
}

function toCliModelName(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return modelId.includes("/") ? modelId.split("/", 2)[1] : modelId;
}

export const testExports = {
  buildCodexProgrammaticCommand
};
