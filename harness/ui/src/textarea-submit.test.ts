import { expect, it, mock } from "bun:test";
import { submitOnEnter } from "./textarea-submit";

it("submitOnEnter submits on Enter and leaves Shift+Enter for newline", () => {
  const handler = mock(() => undefined);
  const submit = submitOnEnter(handler);
  const enter = {
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    preventDefault: mock(() => undefined)
  } as unknown as KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: HTMLTextAreaElement };
  const shiftEnter = {
    key: "Enter",
    shiftKey: true,
    isComposing: false,
    preventDefault: mock(() => undefined)
  } as unknown as KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: HTMLTextAreaElement };

  submit(enter);
  submit(shiftEnter);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(enter.preventDefault).toHaveBeenCalledTimes(1);
  expect(shiftEnter.preventDefault).toHaveBeenCalledTimes(0);
});
