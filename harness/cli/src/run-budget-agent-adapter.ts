import type { ProjectId, RunRuntimeBudget } from "../../shared/protocol";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "./pi-agent-adapter";
import type { WorkspaceRepository } from "./workspace-repository";

export class RunBudgetAgentAdapter implements PiAgentAdapter {
  constructor(
    private readonly inner: PiAgentAdapter,
    private readonly repository: WorkspaceRepository,
    private readonly projectId: ProjectId,
    private readonly runId: string
  ) {}

  setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
    this.inner.setApiKey(provider, apiKey);
  }

  hasApiKey(provider: PiApiKeyProvider) {
    return this.inner.hasApiKey(provider);
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    const budget = this.repository.reserveAgentRunTurn(this.projectId, this.runId);
    return this.inner.runPrompt(withRuntimeBudgetPrompt(request, budget));
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const budget = this.repository.reserveAgentRunTurn(this.projectId, this.runId);
    const controller = await this.inner.startExecution(withRuntimeBudgetPrompt(request, budget));
    return new RunBudgetExecutionController(controller, this.repository, this.projectId, this.runId);
  }
}

class RunBudgetExecutionController implements PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;

  constructor(
    private readonly inner: PiAgentExecutionController,
    private readonly repository: WorkspaceRepository,
    private readonly projectId: ProjectId,
    private readonly runId: string
  ) {
    this.result = inner.result;
  }

  continueWithPrompt(prompt?: string) {
    const budget = this.repository.reserveAgentRunTurn(this.projectId, this.runId);
    return this.inner.continueWithPrompt(appendRuntimeBudgetSection(prompt ?? "continue", budget));
  }

  abort() {
    return this.inner.abort();
  }

  dispose() {
    this.inner.dispose();
  }
}

function withRuntimeBudgetPrompt(request: PiAgentPromptRequest, budget: RunRuntimeBudget | undefined): PiAgentPromptRequest {
  return {
    ...request,
    prompt: appendRuntimeBudgetSection(request.prompt, budget)
  };
}

function appendRuntimeBudgetSection(prompt: string, budget: RunRuntimeBudget | undefined) {
  if (!budget) {
    return prompt;
  }

  return [
    prompt,
    "",
    "# Runtime Budget",
    `Turn limit: ${budget.maxTurns}`,
    `Current turn: ${budget.currentTurn}`,
    `Remaining turns after this: ${budget.remainingTurns}`,
    "If remaining turns are 0, finish now. Do not start new discovery, questions, or optional verification."
  ].join("\n");
}
