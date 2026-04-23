/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { Bot } from "lucide-solid";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { DropdownControl } from "./dropdown";

createUiTest("DropdownControl", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders selected option label", () => {
    render(() => (
      <DropdownControl
        kind="select"
        ariaLabel="Select agent"
        icon={<Bot class="h-3.5 w-3.5" />}
        value="pi"
        options={[
          { value: "pi", label: "Pi", description: "Planner-driven OpenAI runtime." },
          { value: "codex-cli", label: "Codex CLI", description: "Local Codex CLI runtime." }
        ]}
        onChange={() => undefined}
      />
    ));

    expect(screen.getByRole("button", { name: "Select agent" }).textContent).toContain("Pi");
  });

  it("can hide single-option dropdowns", () => {
    render(() => (
      <DropdownControl
        kind="select"
        ariaLabel="Select provider"
        icon={<Bot class="h-3.5 w-3.5" />}
        value="gpt"
        hideWhenSingleOption
        options={[{ value: "gpt", label: "GPT", description: "Only provider option." }]}
        onChange={() => undefined}
      />
    ));

    expect(screen.queryByRole("button", { name: "Select provider" })).toBeNull();
  });
});
