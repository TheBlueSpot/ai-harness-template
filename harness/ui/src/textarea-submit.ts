export function submitOnEnter(handler: () => void) {
  return (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: Element }) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }

    event.preventDefault();
    handler();
  };
}
