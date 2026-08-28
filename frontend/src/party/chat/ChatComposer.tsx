import { KeyboardEvent, useState } from "react";

const MAX_MESSAGE_LENGTH = 1000;

type Props = {
  disabled: boolean;
  onSend: (text: string) => boolean;
  onError?: (message: string) => void;
};

export default function ChatComposer({ disabled, onSend, onError }: Props) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const tooLong = text.length > MAX_MESSAGE_LENGTH;
  const canSend = !disabled && trimmed.length > 0 && !tooLong;

  function send() {
    if (tooLong) {
      onError?.("Messages can be up to 1000 characters.");
      return;
    }

    if (!canSend) {
      return;
    }

    if (onSend(trimmed)) {
      setText("");
    } else {
      onError?.("Chat connection unavailable.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="chatComposer">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message..."
        maxLength={MAX_MESSAGE_LENGTH + 1}
        disabled={disabled}
        rows={2}
      />
      <div className="chatComposerFooter">
        <span className={tooLong ? "chatLimit over" : "chatLimit"}>
          {text.length}/{MAX_MESSAGE_LENGTH}
        </span>
        <button className="primary compactButton" onClick={send} disabled={!canSend}>
          Send
        </button>
      </div>
    </div>
  );
}
