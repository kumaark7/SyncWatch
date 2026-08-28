import { useState, type KeyboardEvent } from "react";
import type { ChatMessage as ChatMessageType } from "./types";

type Props = {
  messages: ChatMessageType[];
  own: boolean;
  showTimestamp: boolean;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function senderInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

export default function ChatMessage({ messages, own, showTimestamp }: Props) {
  const [timestampRevealed, setTimestampRevealed] = useState(false);
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];
  const timestampVisible = showTimestamp || timestampRevealed;

  if (!firstMessage || !lastMessage) {
    return null;
  }

  function toggleTimestamp() {
    if (!showTimestamp) {
      setTimestampRevealed((visible) => !visible);
    }
  }

  function handleTimestampKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleTimestamp();
    }
  }

  if (firstMessage.type !== "USER") {
    return (
      <li
        className="chatSystemMessage"
        role="button"
        tabIndex={0}
        aria-label={`${firstMessage.text}. ${timestampVisible ? "Hide" : "Show"} timestamp`}
        onClick={toggleTimestamp}
        onKeyDown={handleTimestampKeyDown}
      >
        <span>{firstMessage.text}</span>
        {timestampVisible && (
          <time dateTime={new Date(firstMessage.timestamp).toISOString()}>
            {formatTime(firstMessage.timestamp)}
          </time>
        )}
      </li>
    );
  }

  return (
    <li className={own ? "chatMessageRow own" : "chatMessageRow"}>
      {!own && (
        <span className="chatMessageAvatar" aria-hidden="true">
          {senderInitial(firstMessage.senderName)}
        </span>
      )}

      <div className="chatMessageGroup">
        <div
          className="chatMessageBubble"
          role="button"
          tabIndex={0}
          aria-label={`${timestampVisible ? "Hide" : "Show"} message timestamp`}
          onClick={toggleTimestamp}
          onKeyDown={handleTimestampKeyDown}
        >
          {!own && <strong>{firstMessage.senderName}</strong>}
          {messages.map((message) => (
            <p key={message.id}>{message.text}</p>
          ))}
        </div>
        {timestampVisible && (
          <time dateTime={new Date(lastMessage.timestamp).toISOString()}>
            {formatTime(lastMessage.timestamp)}
          </time>
        )}
      </div>

      {own && (
        <span className="chatMessageAvatar" aria-hidden="true">
          {senderInitial(firstMessage.senderName)}
        </span>
      )}
    </li>
  );
}
