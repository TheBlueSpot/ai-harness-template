import { expect, test } from "bun:test";
import { builtinModes } from "./modes";
import {
  AUTO_MODE_CONFIDENCE_THRESHOLD,
  AUTO_MODE_MARGIN_THRESHOLD,
  PLANNER_BYPASS_CONFIDENCE,
  PLANNER_BYPASS_MAX_WORDS,
  detectAutoMode,
  extractWorkspaceAction,
  isDirectWorkspaceImplementTask,
  scoreBuiltinModeIntent
} from "./mode-intent";

// ---------------------------------------------------------------------------
// ask
// ---------------------------------------------------------------------------

test("ask: info-question starter with question mark", () => {
  const detected = detectAutoMode("What do each of the different modes do?", builtinModes);
  expect(detected?.modeId).toBe("ask");
  expect(detected?.confidence).toBeGreaterThanOrEqual(AUTO_MODE_CONFIDENCE_THRESHOLD);
});

test("ask: explain-starter without question mark", () => {
  const detected = detectAutoMode("Explain how the planner resolves modes", builtinModes);
  expect(detected?.modeId).toBe("ask");
});

test("ask: 'break this down' starter", () => {
  const detected = detectAutoMode("Break this down: why does the planner pick a mode?", builtinModes);
  expect(detected?.modeId).toBe("ask");
});

test("ask: compare with 'vs' boosts ask", () => {
  const detected = detectAutoMode("Compare Option A vs Option B", builtinModes);
  expect(detected?.modeId).toBe("ask");
});

test("ask: 'tell me why' starter", () => {
  const detected = detectAutoMode("Tell me why the websocket bridge uses zod", builtinModes);
  expect(detected?.modeId).toBe("ask");
});

test("ask: hedging ('no code', 'read only') reinforces ask", () => {
  const detected = detectAutoMode(
    "What's the purpose of this module? Explanation only, no code.",
    builtinModes
  );
  expect(detected?.modeId).toBe("ask");
});

test("ask: 'what is the difference' pattern", () => {
  const detected = detectAutoMode("What is the difference between these modes?", builtinModes);
  expect(detected?.modeId).toBe("ask");
});

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

test("plan: 'plan ...' starter", () => {
  const detected = detectAutoMode("Plan the safest rollout strategy before implementing anything.", builtinModes);
  expect(detected?.modeId).toBe("plan");
});

test("plan: 'design ...' starter", () => {
  const detected = detectAutoMode("Design a caching layer from scratch", builtinModes);
  expect(detected?.modeId).toBe("plan");
});

test("plan: new plan vocabulary (milestones, phases, acceptance criteria)", () => {
  const detected = detectAutoMode("Outline the milestones, phases, and acceptance criteria.", builtinModes);
  expect(detected?.modeId).toBe("plan");
});

test("plan: plan gate dominates despite implement vocab", () => {
  const detected = detectAutoMode(
    "don't implement, just plan: add feature X, Y, and Z",
    builtinModes
  );
  expect(detected?.modeId).toBe("plan");
});

test("plan: 'redesign' matches planVocab", () => {
  const scores = scoreBuiltinModeIntent("Redesign the auth strategy end-to-end");
  const planScore = scores.find((entry) => entry.modeId === "plan")?.confidence ?? 0;
  expect(planScore).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// debug
// ---------------------------------------------------------------------------

test("debug: 'debug ...' starter with symptoms and root cause", () => {
  const detected = detectAutoMode("Debug this flaky login bug and find root cause.", builtinModes);
  expect(detected?.modeId).toBe("debug");
});

test("debug: 'investigate' + traceback evidence", () => {
  const detected = detectAutoMode("Investigate this regression and grab a traceback", builtinModes);
  expect(detected?.modeId).toBe("debug");
});

test("debug: stack-frame evidence routes to debug", () => {
  const detected = detectAutoMode(
    "The build is failing: at Foo.bar (/path/to/file.ts:12:3)",
    builtinModes
  );
  expect(detected?.modeId).toBe("debug");
});

test("debug: typed-error evidence", () => {
  const detected = detectAutoMode(
    "This keeps failing with TypeError: cannot read properties of undefined",
    builtinModes
  );
  expect(detected?.modeId).toBe("debug");
});

test("debug: 'keeps failing' phrase", () => {
  const detected = detectAutoMode("Auth service keeps failing intermittently", builtinModes);
  expect(detected?.modeId).toBe("debug");
});

test("debug: ENOENT / errno evidence", () => {
  const scores = scoreBuiltinModeIntent("config load blows up with ENOENT");
  const debugScore = scores.find((entry) => entry.modeId === "debug")?.confidence ?? 0;
  const implementScore = scores.find((entry) => entry.modeId === "implement")?.confidence ?? 0;
  expect(debugScore).toBeGreaterThan(implementScore);
});

// ---------------------------------------------------------------------------
// review
// ---------------------------------------------------------------------------

test("review: 'review PR diff' pattern", () => {
  const detected = detectAutoMode("Review this PR diff for regressions and missing tests.", builtinModes);
  expect(detected?.modeId).toBe("review");
});

test("review: critique with feedback and pros/cons", () => {
  const detected = detectAutoMode(
    "Critique this patch and share feedback with pros and cons",
    builtinModes
  );
  expect(detected?.modeId).toBe("review");
});

test("review: 'sanity check my approach'", () => {
  const detected = detectAutoMode("Sanity check my approach to caching", builtinModes);
  expect(detected?.modeId).toBe("review");
});

test("review: 'audit' starter", () => {
  const detected = detectAutoMode("Audit the auth layer for security concerns", builtinModes);
  expect(detected?.modeId).toBe("review");
});

// ---------------------------------------------------------------------------
// implement
// ---------------------------------------------------------------------------

test("implement: implement starter with tests", () => {
  const detected = detectAutoMode("Implement auth refresh support and add tests.", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

test("implement: refactor with provider artifact", () => {
  const detected = detectAutoMode("Refactor the auth provider to use zod", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

test("implement: make dark-mode toggle", () => {
  const detected = detectAutoMode("Make a dark mode toggle", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

test("implement: workspace artifact signals boost implement score", () => {
  const withArtifact =
    scoreBuiltinModeIntent("Update package.json schema").find((entry) => entry.modeId === "implement")
      ?.confidence ?? 0;
  const withoutArtifact =
    scoreBuiltinModeIntent("Update things").find((entry) => entry.modeId === "implement")?.confidence ?? 0;
  expect(withArtifact).toBeGreaterThan(withoutArtifact);
});

test("implement: 'scaffold' / 'stub' imperative", () => {
  const detected = detectAutoMode("Scaffold a new zod schema for the capability registry", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

// ---------------------------------------------------------------------------
// planner bypass (direct workspace action → implement @ PLANNER_BYPASS_CONFIDENCE)
// ---------------------------------------------------------------------------

test("bypass: 'Make folder /pacman' fires at PLANNER_BYPASS_CONFIDENCE", () => {
  const detected = detectAutoMode("Make folder /pacman", builtinModes);
  expect(detected?.modeId).toBe("implement");
  expect(detected?.confidence).toBe(PLANNER_BYPASS_CONFIDENCE);
});

test("bypass: 'Create readme.md'", () => {
  const detected = detectAutoMode("Create readme.md", builtinModes);
  expect(detected?.modeId).toBe("implement");
  expect(detected?.confidence).toBe(PLANNER_BYPASS_CONFIDENCE);
});

test("bypass: polite prefix with path", () => {
  const detected = detectAutoMode("Could you add config file at ./pkg/config.json", builtinModes);
  expect(detected?.modeId).toBe("implement");
  expect(detected?.confidence).toBe(PLANNER_BYPASS_CONFIDENCE);
});

test("bypass: correction-style follow-up still routes to implement", () => {
  const input = "no inside the cwd make a new folder tetris";
  const detected = detectAutoMode(input, builtinModes);
  expect(isDirectWorkspaceImplementTask(input)).toBe(true);
  expect(detected?.modeId).toBe("implement");
  expect(detected?.confidence).toBe(PLANNER_BYPASS_CONFIDENCE);
});

test("bypass: location-only correction inherits prior workspace action from recent messages", () => {
  const input = "no inside the cwd";
  const context = {
    recentMessages: [
      { role: "user" as const, content: "create folder /tetris" },
      {
        role: "assistant" as const,
        content: "Tried create `C:\\Users\\MindOverMelee\\ai-harness-template\\context\\tetris` but write was blocked."
      }
    ]
  };
  const detected = detectAutoMode(input, builtinModes, context);
  expect(extractWorkspaceAction(input, context)).toMatchObject({
    artifact: "folder",
    target: "tetris",
    inherited: true
  });
  expect(isDirectWorkspaceImplementTask(input, context)).toBe(true);
  expect(detected?.modeId).toBe("implement");
  expect(detected?.confidence).toBe(PLANNER_BYPASS_CONFIDENCE);
});

test("bypass: accepts all common path styles", () => {
  expect(isDirectWorkspaceImplementTask("Write ./src/foo.ts")).toBe(true);
  expect(isDirectWorkspaceImplementTask("Write ../foo/bar.ts")).toBe(true);
  expect(isDirectWorkspaceImplementTask("Write ~/notes.md")).toBe(true);
  expect(isDirectWorkspaceImplementTask("Write pkg/mod.ts")).toBe(true);
  expect(isDirectWorkspaceImplementTask("Create folder at C:\\temp\\pacman")).toBe(true);
});

test("bypass: rejects questions", () => {
  expect(isDirectWorkspaceImplementTask("Can you create a folder?")).toBe(false);
});

test("bypass: rejects multi-part prompts", () => {
  expect(isDirectWorkspaceImplementTask("Create folder /a and delete folder /b")).toBe(false);
  expect(isDirectWorkspaceImplementTask("Create /a; then delete /b")).toBe(false);
});

test("bypass: rejects complexity keywords", () => {
  expect(isDirectWorkspaceImplementTask("Refactor the script path")).toBe(false);
  expect(isDirectWorkspaceImplementTask("Fix the bug in server.ts")).toBe(false);
  expect(isDirectWorkspaceImplementTask("Add tests to api")).toBe(false);
});

test("bypass: requires at least one artifact, path, or file reference", () => {
  expect(isDirectWorkspaceImplementTask("Create something nice")).toBe(false);
  expect(isDirectWorkspaceImplementTask("Update the readme")).toBe(true);
  expect(isDirectWorkspaceImplementTask("Write notes.md")).toBe(true);
});

test("bypass: rejects long prompts beyond PLANNER_BYPASS_MAX_WORDS", () => {
  const base = "Create a folder at ./src";
  const padding = Array.from({ length: PLANNER_BYPASS_MAX_WORDS + 5 }, () => "word").join(" ");
  expect(isDirectWorkspaceImplementTask(`${base} ${padding}`)).toBe(false);
});

test("bypass: implement starter without artifact does not short-circuit", () => {
  expect(isDirectWorkspaceImplementTask("Implement auth refresh support and add tests.")).toBe(false);
  const detected = detectAutoMode("Implement auth refresh support and add tests.", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

// ---------------------------------------------------------------------------
// short-circuits
// ---------------------------------------------------------------------------

test("short: bare mode name returns confidence 1", () => {
  for (const id of ["ask", "plan", "debug", "review", "implement"] as const) {
    const detected = detectAutoMode(id, builtinModes);
    expect(detected?.modeId).toBe(id);
    expect(detected?.confidence).toBe(1);
  }
});

test("short: bare mode name still respects available-mode filter", () => {
  const noImplement = builtinModes.filter((mode) => mode.id !== "implement");
  const detected = detectAutoMode("implement", noImplement);
  expect(detected).toBeUndefined();
});

test("short: two-word non-match falls through to scoring", () => {
  const scores = scoreBuiltinModeIntent("hello there");
  expect(scores.length).toBe(5);
  for (const entry of scores) {
    expect(entry.confidence).toBeLessThan(AUTO_MODE_CONFIDENCE_THRESHOLD);
  }
});

// ---------------------------------------------------------------------------
// ambiguity — correctly returns undefined
// ---------------------------------------------------------------------------

test("ambiguous: 'how do I fix this flaky bug?' → undefined", () => {
  const detected = detectAutoMode("How do I fix this flaky login bug?", builtinModes);
  expect(detected).toBeUndefined();
});

test("ambiguous: 'fix and patch error' → undefined", () => {
  const detected = detectAutoMode("Fix login and patch the error handler", builtinModes);
  expect(detected).toBeUndefined();
});

test("ambiguous: 'should we redesign auth?' → undefined", () => {
  const detected = detectAutoMode("Should we redesign the auth flow?", builtinModes);
  expect(detected).toBeUndefined();
});

// ---------------------------------------------------------------------------
// cross-mode penalties and disambiguation
// ---------------------------------------------------------------------------

test("disambig: question-style + action keeps debug over ask", () => {
  const scores = scoreBuiltinModeIntent("Can you fix this broken login bug?");
  const askScore = scores.find((entry) => entry.modeId === "ask")?.confidence ?? 0;
  const debugScore = scores.find((entry) => entry.modeId === "debug")?.confidence ?? 0;
  expect(debugScore).toBeGreaterThan(askScore);
});

test("disambig: plan gate zeroes implement lead", () => {
  const scores = scoreBuiltinModeIntent("Don't implement, just plan: add a caching layer");
  const planScore = scores.find((entry) => entry.modeId === "plan")?.confidence ?? 0;
  const implementScore = scores.find((entry) => entry.modeId === "implement")?.confidence ?? 0;
  expect(planScore).toBeGreaterThan(implementScore);
  expect(planScore).toBeGreaterThanOrEqual(AUTO_MODE_CONFIDENCE_THRESHOLD);
});

test("disambig: review artifacts trump stray implement verbs", () => {
  const scores = scoreBuiltinModeIntent("Review this diff: approve or reject the proposed changes");
  const reviewScore = scores.find((entry) => entry.modeId === "review")?.confidence ?? 0;
  const implementScore = scores.find((entry) => entry.modeId === "implement")?.confidence ?? 0;
  expect(reviewScore).toBeGreaterThan(implementScore);
});

test("disambig: stack-frame without implement verb pulls away from implement", () => {
  const scores = scoreBuiltinModeIntent("at Foo.bar (/path/to/file.ts:12:3) throw new Error('boom')");
  const debugScore = scores.find((entry) => entry.modeId === "debug")?.confidence ?? 0;
  const implementScore = scores.find((entry) => entry.modeId === "implement")?.confidence ?? 0;
  expect(debugScore).toBeGreaterThan(implementScore);
});

test("disambig: question-style dampens implement", () => {
  const imperative = scoreBuiltinModeIntent("Implement auth refresh support").find(
    (entry) => entry.modeId === "implement"
  )?.confidence ?? 0;
  const interrogative = scoreBuiltinModeIntent("Should I implement auth refresh support?").find(
    (entry) => entry.modeId === "implement"
  )?.confidence ?? 0;
  expect(imperative).toBeGreaterThan(interrogative);
});

// ---------------------------------------------------------------------------
// filtering and availability
// ---------------------------------------------------------------------------

test("filter: strips entries for modes not in availableModes", () => {
  const askOnly = [{ id: "ask" }];
  const detected = detectAutoMode("Implement auth refresh support and add tests.", askOnly);
  expect(detected).toBeUndefined();
});

test("filter: planner bypass disabled when implement unavailable", () => {
  const noImplement = builtinModes.filter((mode) => mode.id !== "implement");
  const detected = detectAutoMode("Create readme.md", noImplement);
  expect(detected?.modeId).not.toBe("implement");
});

test("filter: empty availableModes returns undefined", () => {
  const detected = detectAutoMode("Implement auth refresh support and add tests.", []);
  expect(detected).toBeUndefined();
});

// ---------------------------------------------------------------------------
// edge cases and invariants
// ---------------------------------------------------------------------------

test("edge: empty and whitespace-only input returns undefined", () => {
  expect(detectAutoMode("", builtinModes)).toBeUndefined();
  expect(detectAutoMode("   ", builtinModes)).toBeUndefined();
  expect(detectAutoMode("\t\n", builtinModes)).toBeUndefined();
});

test("edge: isDirectWorkspaceImplementTask rejects empty and whitespace", () => {
  expect(isDirectWorkspaceImplementTask("")).toBe(false);
  expect(isDirectWorkspaceImplementTask("   ")).toBe(false);
});

test("invariant: all confidences in [0, 1]", () => {
  const samples = [
    "What is happening here?",
    "Plan the rollout before implementing",
    "Debug this TypeError: cannot read properties of undefined",
    "Review this PR diff",
    "Implement feature X with tests",
    "Fix login and patch error",
    "hello world",
    "",
    "a"
  ];
  for (const sample of samples) {
    for (const entry of scoreBuiltinModeIntent(sample)) {
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  }
});

test("invariant: thresholds and bypass confidence are consistent", () => {
  expect(AUTO_MODE_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
  expect(AUTO_MODE_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  expect(AUTO_MODE_MARGIN_THRESHOLD).toBeGreaterThan(0);
  expect(AUTO_MODE_MARGIN_THRESHOLD).toBeLessThan(AUTO_MODE_CONFIDENCE_THRESHOLD);
  expect(PLANNER_BYPASS_CONFIDENCE).toBeGreaterThan(AUTO_MODE_CONFIDENCE_THRESHOLD);
  expect(PLANNER_BYPASS_CONFIDENCE).toBeLessThanOrEqual(1);
});

test("invariant: scoreBuiltinModeIntent is pure across repeated calls", () => {
  const sample = "Review this PR diff for regressions and missing tests.";
  const first = scoreBuiltinModeIntent(sample);
  const second = scoreBuiltinModeIntent(sample);
  expect(first).toEqual(second);
});

test("invariant: margin threshold prevents low-separation auto-switch", () => {
  // Equally weighted debug vs implement signals.
  const detected = detectAutoMode("Fix login and patch the error handler", builtinModes);
  expect(detected).toBeUndefined();
});
