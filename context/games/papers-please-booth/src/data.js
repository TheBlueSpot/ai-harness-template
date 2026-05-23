export const DOCUMENT_TEMPLATES = {
  passport: {
    id: "passport",
    label: "Passport",
    kind: "identity",
    ruleId: "passport",
    validValues: ["A-1942", "B-7710", "C-3084", "D-5591"],
  },
  workPermit: {
    id: "work-permit",
    label: "Work permit",
    kind: "access",
    ruleId: "permit",
    validValues: ["Permit B12", "Permit C31", "Permit D08"],
  },
  photo: {
    id: "photo",
    label: "Face check",
    kind: "biometric",
    ruleId: "photo",
    validValues: ["Matches face"],
  },
  entryPass: {
    id: "entry-pass",
    label: "Entry pass",
    kind: "access",
    ruleId: "pass",
    validValues: ["Zone pass", "Transit pass"],
  },
};

export const ENTRANT_TEMPLATES = [
  {
    id: "visitor-1",
    name: "Mira Sol",
    origin: "Orvech",
    documents: {
      passport: "A-1942",
      workPermit: "Permit B12",
      photo: "Matches face",
      entryPass: "Zone pass",
    },
    intent: "work",
  },
  {
    id: "visitor-2",
    name: "Borin Vale",
    origin: "Republia",
    documents: {
      passport: "B-7710",
      workPermit: "Permit C31",
      photo: "Matches face",
      entryPass: "Zone pass",
    },
    intent: "work",
  },
  {
    id: "visitor-3",
    name: "Lina Park",
    origin: "Kolechia",
    documents: {
      passport: "C-3084",
      workPermit: "Permit D08",
      photo: "Mismatch",
      entryPass: "Transit pass",
    },
    intent: "travel",
  },
  {
    id: "visitor-4",
    name: "Tomas Reed",
    origin: "Antegria",
    documents: {
      passport: "D-5591",
      workPermit: "Expired",
      photo: "Matches face",
      entryPass: "Zone pass",
    },
    intent: "work",
  },
  {
    id: "visitor-5",
    name: "Nadia Ilya",
    origin: "Arstotzka",
    documents: {
      passport: "A-1942",
      workPermit: "Permit B12",
      photo: "Matches face",
      entryPass: "Zone pass",
    },
    intent: "work",
  },
];

