import { queryParam } from "./query-param";
import { harnessStore } from "../harness-store";

export function rightAlignedNumbersEnabled() {
  const queryValue = queryParam("number");
  if (queryValue === "right") {
    return true;
  }
  if (queryValue === "left" || queryValue === "off") {
    return false;
  }
  return harnessStore.state.numericRightAlignmentEnabled;
}
