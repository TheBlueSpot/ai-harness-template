import type { TerminalPreferences } from "../../../shared/protocol";
import { queryParam } from "../lib/query-param";

export function shouldUseSolidTerminalRenderer(rendererMode: TerminalPreferences["rendererMode"]) {
  return rendererMode === "solid-prototype" || queryParam("terminal") === "solid";
}
