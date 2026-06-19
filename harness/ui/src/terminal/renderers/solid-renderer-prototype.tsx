import { createMemo } from "solid-js";
import { VirtualList } from "../../components/primitives/virtual-list";

export function SolidTerminalRendererPrototype(props: { output: string }) {
  const rows = createMemo(() => props.output.split(/\r?\n/).map((line, index) => ({ id: `${index}`, line })));
  return (
    <VirtualList
      items={rows()}
      estimateSize={20}
      pagination={{ kind: "all" }}
      getKey={(row) => row.id}
      dataTest="solid-terminal-prototype"
    >
      {(row) => <div class="whitespace-pre font-mono text-[0.72rem] leading-5">{row.line || " "}</div>}
    </VirtualList>
  );
}
