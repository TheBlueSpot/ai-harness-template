export const RULE_SETS = [
  {
    id: "day-1",
    day: 1,
    shiftLimit: 5,
    passingScore: 3,
    maxStrikes: 2,
    requiredDocuments: ["passport", "photo"],
    activeRules: [
      { id: "passport", label: "Passport", note: "Passport number must be on file." },
      { id: "photo", label: "Face check", note: "Photo must match the entrant." },
    ],
  },
  {
    id: "day-2",
    day: 2,
    shiftLimit: 6,
    passingScore: 4,
    maxStrikes: 3,
    requiredDocuments: ["passport", "photo", "workPermit"],
    activeRules: [
      { id: "passport", label: "Passport", note: "Passport number must be valid." },
      { id: "photo", label: "Face check", note: "Photo must match the entrant." },
      { id: "permit", label: "Work permit", note: "Working entrants need a permit." },
    ],
  },
  {
    id: "day-3",
    day: 3,
    shiftLimit: 7,
    passingScore: 5,
    maxStrikes: 3,
    requiredDocuments: ["passport", "photo", "workPermit", "entryPass"],
    activeRules: [
      { id: "passport", label: "Passport", note: "Passport number must be valid." },
      { id: "photo", label: "Face check", note: "Photo must match the entrant." },
      { id: "permit", label: "Work permit", note: "Working entrants need a permit." },
      { id: "pass", label: "Entry pass", note: "Transit entrants need a valid pass." },
    ],
  },
];

export function getRuleSetForDay(day) {
  return RULE_SETS[Math.min(RULE_SETS.length - 1, Math.max(0, day - 1))];
}

