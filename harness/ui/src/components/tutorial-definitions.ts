export type TutorialStepDefinition = {
  targetId: string;
  title: string;
  body: string;
  fallback: string;
};

export type TutorialDefinition = {
  id: string;
  title: string;
  summary: string;
  steps: TutorialStepDefinition[];
};

export const tutorialDefinitions: TutorialDefinition[] = [
  {
    id: "open-project",
    title: "Open a project",
    summary: "Pick a workspace root so threads, plans, and runs stay scoped to one repo.",
    steps: [
      {
        targetId: "open-project",
        title: "Open the project switcher",
        body: "Start here. Open an existing repo or browse to a local folder.",
        fallback: "If the open-project button is not visible yet, switch to the chat surface and wait for the first-run card."
      },
      {
        targetId: "project-sidebar",
        title: "Confirm active project context",
        body: "Project context, thread history, and mode defaults all live in the active project shell.",
        fallback: "If the project sidebar is hidden, expand the desktop layout or use the mobile sheet menu."
      }
    ]
  },
  {
    id: "connect-provider-runtime",
    title: "Connect provider or runtime",
    summary: "Attach a Pi provider key or authenticate a CLI runtime before the first task.",
    steps: [
      {
        targetId: "help-preferences",
        title: "Open preferences",
        body: "Preferences holds API keys, default provider brand, and runtime-related defaults.",
        fallback: "If the preferences button is not mounted yet, wait for the header to finish rendering."
      },
      {
        targetId: "agent-select",
        title: "Pick the execution runtime",
        body: "Pi uses provider keys. Codex CLI and Copilot CLI need local install and auth health.",
        fallback: "If the agent selector is missing, open any project first so the composer controls render."
      }
    ]
  },
  {
    id: "send-first-task",
    title: "Send the first task",
    summary: "Write the request in the composer, then send or refine the generated plan.",
    steps: [
      {
        targetId: "chat-composer",
        title: "Write the task",
        body: "Describe the goal, constraints, and expected verification so the plan is scoped tightly.",
        fallback: "If the composer is not visible, open a project and return to the chat surface."
      },
      {
        targetId: "chat-send",
        title: "Send or refine",
        body: "The send button becomes answer, refine, or send based on the current run state.",
        fallback: "If the send button is disabled, check the setup card above the composer for the blocking requirement."
      }
    ]
  },
  {
    id: "plan-review",
    title: "Review plan and execute",
    summary: "Inspect the plan summary, refine if needed, then start execution from the active plan card.",
    steps: [
      {
        targetId: "plan-start",
        title: "Start from the active plan card",
        body: "When a plan is ready, use the plan card controls to execute immediately or after countdown.",
        fallback: "If the plan start action is not visible, send a task first and wait for planner output."
      },
      {
        targetId: "trace-panel-toggle",
        title: "Open trace when needed",
        body: "The trace panel is where you inspect planner, executor, and subagent transitions during review.",
        fallback: "If trace toggle is hidden, wait for the header controls to finish rendering, then open trace from the header."
      }
    ]
  }
];

export function getTutorialDefinition(tutorialId: string | undefined) {
  return tutorialDefinitions.find((tutorial) => tutorial.id === tutorialId);
}
