import { Bot, Brain, Clipboard, ClipboardList, Cpu, Play, RefreshCcw, Split, MessageSquareMore } from "lucide-solid";

export function getModeDropdownIcon(modeId: string) {
  switch (modeId) {
    case "ask":
      return <MessageSquareMore class="h-3 w-3" />;
    case "plan":
      return <ClipboardList class="h-3 w-3" />;
    case "implement":
      return <Play class="h-3 w-3" />;
    case "debug":
      return <RefreshCcw class="h-3 w-3" />;
    case "review":
      return <Clipboard class="h-3 w-3" />;
    default:
      return <Split class="h-3 w-3" />;
  }
}

export function getAgentDropdownIcon(agentId: string) {
  switch (agentId) {
    case "pi":
      return <Brain class="h-3 w-3" />;
    case "copilot-cli":
      return <Bot class="h-3 w-3" />;
    case "codex-cli":
      return <Cpu class="h-3 w-3" />;
    default:
      return <Bot class="h-3 w-3" />;
  }
}
