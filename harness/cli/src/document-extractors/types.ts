export type DocumentExtractionStatus = "ok" | "ocr-required" | "no-text";

export type DocumentExtractionResult =
  | {
      status: "ok";
      text: string;
    }
  | {
      status: "ocr-required";
      reason: string;
    }
  | {
      status: "no-text";
      reason: string;
    };
