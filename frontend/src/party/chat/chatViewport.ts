type ChatListElement = Pick<HTMLElement, "scrollHeight" | "scrollTop">;
type ChatInputElement = Pick<HTMLTextAreaElement, "focus" | "scrollIntoView">;

export function scrollChatToLatest(element: ChatListElement) {
  element.scrollTop = element.scrollHeight;
}

export function focusChatInput(element: ChatInputElement) {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest" });
}
