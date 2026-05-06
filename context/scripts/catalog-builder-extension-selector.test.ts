import { describe, expect, test } from "bun:test";
import {
  buildExtensionCandidates,
  calculateFreshnessBoost,
  calculateRecencyWeight,
  detectWantingMoreFromReview,
  selectWeightedCandidate,
  type ReviewRow,
} from "./catalog-builder-extension-selector";

function makeReview(overrides: Partial<ReviewRow>): ReviewRow {
  return {
    slug: "sample-slug",
    rating: 4,
    likes: "",
    dislikes: "",
    broken: "",
    needs_additional_feedback: 0,
    updated_at: "2026-04-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("catalog-builder extension selector", () => {
  test("detects wanting-more sentiment from length and content phrases", () => {
    const result = detectWantingMoreFromReview({
      likes: "awesome visuals, i wish there was more content!",
      dislikes: "wanted more levels and more enemy types",
      broken: "game is way too short",
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.matchedSignals.map((signal) => signal.ruleId)).toContain("explicit-want-more");
    expect(result.matchedSignals.map((signal) => signal.ruleId)).toContain("more-levels");
    expect(result.matchedSignals.map((signal) => signal.ruleId)).toContain("too-short");
  });

  test("does not misclassify narrow tuning asks as wanting-more sentiment", () => {
    const result = detectWantingMoreFromReview({
      likes: "great pacing",
      dislikes: "more smoke at low health and more impact on shots",
      broken: "nothing broken",
    });

    expect(result.score).toBe(0);
    expect(result.matchedSignals).toHaveLength(0);
  });

  test("applies a fresh 20 percent boost and stronger recency weight to new reviews", () => {
    const now = new Date("2026-04-30T18:00:00.000Z");
    const freshUpdatedAt = "2026-04-30T16:00:00.000Z";
    const staleUpdatedAt = "2026-03-01T16:00:00.000Z";

    expect(calculateFreshnessBoost(freshUpdatedAt, now)).toBe(1.2);
    expect(calculateFreshnessBoost(staleUpdatedAt, now)).toBe(1);
    expect(calculateRecencyWeight(freshUpdatedAt, now)).toBeGreaterThan(calculateRecencyWeight(staleUpdatedAt, now));
  });

  test("filters to high-rated wanting-more candidates and preserves weight breakdown", () => {
    const candidates = buildExtensionCandidates(
      [
        makeReview({
          slug: "wanting-more",
          dislikes: "need at least 5 levels of this and more mechanics",
        }),
        makeReview({
          slug: "too-low-rated",
          rating: 3,
          dislikes: "more levels",
        }),
        makeReview({
          slug: "not-wanting-more",
          dislikes: "more smoke at low health",
        }),
      ],
      { now: new Date("2026-04-30T18:00:00.000Z") },
    );

    expect(candidates.map((candidate) => candidate.slug)).toEqual(["wanting-more"]);
    expect(candidates[0]?.wantingMoreScore).toBeGreaterThan(0);
    expect(candidates[0]?.weight).toBeGreaterThan(candidates[0]!.wantingMoreScore);
  });

  test("selection stays deterministic for the same seed", () => {
    const now = new Date("2026-04-30T18:00:00.000Z");
    const candidates = buildExtensionCandidates(
      [
        makeReview({
          slug: "asteroids-scrap-magnet",
          dislikes: "game needs to be 10x longer with more levels and dynamic features",
          broken: "game is way too short",
          updated_at: "2026-04-30T17:33:14.460Z",
        }),
        makeReview({
          slug: "bionic-swing",
          dislikes: "need at least 5 levels of this. more mechanics types of enemies and interactables",
          updated_at: "2026-04-30T16:56:22.842Z",
          rating: 5,
        }),
        makeReview({
          slug: "duck-hunt-gallery",
          dislikes: "wish there was a story or a narrative or more levels. the game ended in 1 minute",
          updated_at: "2026-04-30T09:40:02.253Z",
          rating: 5,
        }),
      ],
      { now },
    );

    const firstPick = selectWeightedCandidate(candidates, "stable-seed");
    const secondPick = selectWeightedCandidate(candidates, "stable-seed");
    const seededPicks = ["stable-seed", "alternate-seed", "third-seed", "fourth-seed"].map((seed) =>
      selectWeightedCandidate(candidates, seed).slug,
    );

    expect(firstPick.slug).toBe(secondPick.slug);
    expect(seededPicks).toContain(firstPick.slug);
    expect(new Set(seededPicks).size).toBeGreaterThan(1);
  });
});
