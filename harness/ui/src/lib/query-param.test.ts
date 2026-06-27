import { expect, test } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { queryParam } from "./query-param";

function setUrlForTest(url: string) {
  (window as typeof window & { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

createUiTest("queryParam", () => {
  test("reads query string values", () => {
    const originalUrl = window.location.href;
    try {
      setUrlForTest("http://localhost/?terminal=solid&number=right");

      expect(queryParam("terminal")).toBe("solid");
      expect(queryParam("number")).toBe("right");
      expect(queryParam("missing")).toBeUndefined();
    } finally {
      setUrlForTest(originalUrl);
    }
  });
});
