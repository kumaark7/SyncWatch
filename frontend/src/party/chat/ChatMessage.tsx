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
  const [revealedTimestampId, setRevealedTimestampId] = useState<string | null>(null);
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  if (!firstMessage || !lastMessage) {
    return null;
  }

  function toggleTimestamp(messageId: string, alwaysVisible = false) {
    if (alwaysVisible) {
      return;
    }

    setRevealedTimestampId((current) => current === messageId ? null : messageId);
  }

  function handleTimestampKeyDown(
    event: KeyboardEvent<HTMLElement>,
    messageId: string,
    alwaysVisible = false
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleTimestamp(messageId, alwaysVisible);
    }
  }

  if (firstMessage.type !== "USER") {
    const timestampVisible = showTimestamp || revealedTimestampId === firstMessage.id;
    return (
      <li
        className="chatSystemMessage"
        role="button"
        tabIndex={0}
        aria-label={`${firstMessage.text}. ${timestampVisible ? "Hide" : "Show"} timestamp`}
        onClick={() => toggleTimestamp(firstMessage.id, showTimestamp)}
        onKeyDown={(event) => handleTimestampKeyDown(
          event,
          firstMessage.id,
          showTimestamp
        )}
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
        {messages.map((message, index) => {
          const timestampVisible = (
            showTimestamp && message.id === lastMessage.id
          ) || revealedTimestampId === message.id;
          const timestampAlwaysVisible = showTimestamp && message.id === lastMessage.id;

          return (
            <div className="chatMessageItem" key={message.id}>
              <div
                className="chatMessageBubble"
                role="button"
                tabIndex={0}
                aria-label={`${timestampVisible ? "Hide" : "Show"} message timestamp`}
                onClick={() => toggleTimestamp(message.id, timestampAlwaysVisible)}
                onKeyDown={(event) => handleTimestampKeyDown(
                  event,
                  message.id,
                  timestampAlwaysVisible
                )}
              >
                {!own && index === 0 && <strong>{firstMessage.senderName}</strong>}
                <p>{message.text}</p>
              </div>
              {timestampVisible && (
                <time dateTime={new Date(message.timestamp).toISOString()}>
                  {formatTime(message.timestamp)}
                </time>
              )}
            </div>
          );
        })}
      </div>

      {own && (
        <span className="chatMessageAvatar" aria-hidden="true">
          {senderInitial(firstMessage.senderName)}
        </span>
      )}
    </li>
  );
}
