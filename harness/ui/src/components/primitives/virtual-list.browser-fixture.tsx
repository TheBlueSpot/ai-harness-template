/** @jsxImportSource solid-js */
import { createMemo, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";
import "../../styles.css";
import { VirtualList } from "./virtual-list";

type FixtureItem = {
  id: string;
  title: string;
  detail: string;
  height: number;
};

const reverseItems: FixtureItem[] = Array.from({ length: 140 }, (_, index) => ({
  id: `reverse-${index}`,
  title: `Reverse row ${index}`,
  detail: `This reverse first-paint row ${index} has enough text to exercise measured row geometry before any tab switch.`,
  height: index % 5 === 0 ? 112 : index % 3 === 0 ? 86 : 58
}));

const forwardItems: FixtureItem[] = Array.from({ length: 90 }, (_, index) => ({
  id: `forward-${index}`,
  title: `Forward row ${index}`,
  detail: `This forward row ${index} checks non-sticky first-paint geometry.`,
  height: index % 4 === 0 ? 98 : 62
}));

function FixtureApp() {
  const [tab, setTab] = createSignal<"reverse" | "forward" | "empty">("reverse");
  const [expanded, setExpanded] = createSignal(false);
  const ready = createMemo(() => (expanded() ? "1" : "0"));

  onMount(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setExpanded(true));
    });
  });

  return (
    <main
      data-test-fixture-ready={ready()}
      style={{
        height: "620px",
        width: "760px",
        display: "flex",
        "flex-direction": "column",
        gap: "12px",
        padding: "16px",
        "box-sizing": "border-box"
      }}
    >
      <nav style={{ display: "flex", gap: "8px" }}>
        <button type="button" data-test-fixture-tab="reverse" onClick={() => setTab("reverse")}>
          Reverse
        </button>
        <button type="button" data-test-fixture-tab="forward" onClick={() => setTab("forward")}>
          Forward
        </button>
        <button type="button" data-test-fixture-tab="empty" onClick={() => setTab("empty")}>
          Empty
        </button>
      </nav>
      <section
        data-test-fixture-host=""
        style={{
          display: "flex",
          "flex-direction": "column",
          "min-height": "0",
          height: expanded() ? "420px" : "1px",
          border: "1px solid #999"
        }}
      >
        {tab() === "reverse" ? (
          <VirtualList
            dataTest="browser-reverse"
            class="min-h-0 flex-1 pr-2"
            contentClass="w-full"
            itemClass="pb-2"
            items={reverseItems}
            getKey={(item) => item.id}
            estimateSize={44}
            pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
            overscan={4}
            stickToEnd
          >
            {(item) => <FixtureRow item={item} />}
          </VirtualList>
        ) : null}
        {tab() === "forward" ? (
          <VirtualList
            dataTest="browser-forward"
            class="min-h-0 flex-1 pr-2"
            contentClass="w-full"
            itemClass="pb-2"
            items={forwardItems}
            getKey={(item) => item.id}
            estimateSize={48}
            pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
            overscan={4}
          >
            {(item) => <FixtureRow item={item} />}
          </VirtualList>
        ) : null}
      </section>
    </main>
  );
}

function FixtureRow(props: { item: FixtureItem }) {
  return (
    <article
      data-test-fixture-row={props.item.id}
      style={{
        height: `${props.item.height}px`,
        border: "1px solid #0f766e",
        padding: "8px",
        "box-sizing": "border-box",
        background: "white"
      }}
    >
      <strong>{props.item.title}</strong>
      <p style={{ margin: "6px 0 0" }}>{props.item.detail}</p>
    </article>
  );
}

render(() => <FixtureApp />, document.getElementById("root")!);
