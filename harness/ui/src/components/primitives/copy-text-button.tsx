import type { JSX } from "solid-js";
import { Copy } from "lucide-solid";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";

type CopyTextButtonProps = {
  value: string;
  tooltip: string;
  copiedTitle?: string;
  copiedDescription?: string;
  failedTitle?: string;
  failedDescription?: string;
  ariaLabel?: string;
  class?: string;
  variant?: "default" | "secondary" | "ghost" | "warning" | "danger";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
  disabledReason?: string;
  children?: JSX.Element;
};

export function CopyTextButton(props: CopyTextButtonProps) {
  const canCopy = () => props.value.trim().length > 0;

  async function handleCopy() {
    if (!canCopy()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(props.value);
      pushToast(props.copiedTitle ?? "Copied", props.copiedDescription ?? "Copied to clipboard.");
    } catch {
      pushToast(props.failedTitle ?? "Copy failed", props.failedDescription ?? "Clipboard permission denied.", "error");
    }
  }

  return (
    <span data-test-copy-text-button="">
      <ActionButton
        tooltip={props.tooltip}
        disabled={props.disabled || !canCopy()}
        disabledReason={props.disabled ? props.disabledReason : props.disabledReason ?? "Nothing to copy"}
        icon={<Copy class="h-3.5 w-3.5" />}
        class={props.class}
        variant={props.variant}
        size={props.size}
        ariaLabel={props.ariaLabel ?? props.tooltip}
        onClick={() => void handleCopy()}
      >
        {props.children}
      </ActionButton>
    </span>
  );
}
