export function isEditableTarget(target: EventTarget | null | undefined) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  const role = target.getAttribute("role");
  return role === "textbox" || role === "combobox";
}
