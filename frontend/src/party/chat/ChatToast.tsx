import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./types";

const DISPLAY_MS = 3800;
const PREVIEW_LENGTH = 110;
const MAX_VISIBLE = 3;

type Notification = {
  message: ChatMessage;
};

type Props = {
  message: ChatMessage | null;
  clientId: string;
  chatVisible: boolean;
  suspended: boolean;
  onOpenChat?: () => void;
};

function initial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

function preview(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > PREVIEW_LENGTH
    ? `${clean.slice(0, PREVIEW_LENGTH - 1)}…`
    : clean;
}

function ChatToastItem({
  notification,
  suspended,
  onDismiss,
  onOpenChat
}: {
  notification: Notification;
  suspended: boolean;
  onDismiss: () => void;
  onOpenChat?: () => void;
}) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    const timer = window.setTimeout(() => dismissRef.current(), DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [notification.message.id, suspended]);

  const { message } = notification;
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  const content = (
    <>
      <div className="chatToastAvatar" aria-hidden="true">
        {initial(message.senderName)}
      </div>
      <div className="chatToastBody">
        <div className="chatToastMeta">
          <strong>{message.senderName}</strong>
          <time dateTime={new Date(message.timestamp).toISOString()}>{time}</time>
        </div>
        <p>{preview(message.text)}</p>
      </div>
    </>
  );

  return (
    <article
      className={`chatToast ${onOpenChat ? "clickable" : ""}`}
      aria-label={`Message from ${message.senderName}`}
    >
      {onOpenChat ? (
        <button
          className="chatToastOpen"
          aria-label={`Open chat message from ${message.senderName}`}
          onClick={onOpenChat}
        >
          {content}
        </button>
      ) : (
        <div className="chatToastOpen">{content}</div>
      )}
      <button
        className="chatToastClose"
        aria-label="Dismiss chat notification"
        title="Dismiss notification"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
      >
        &times;
      </button>
    </article>
  );
}

export default function ChatToastStack({
  message,
  clientId,
  chatVisible,
  suspended,
  onOpenChat
}: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (chatVisible) {
      setNotifications([]);
    }
  }, [chatVisible]);

  useEffect(() => {
    if (!message
        || (message.type !== "USER"
          && message.type !== "SYSTEM_CALL_JOIN"
          && message.type !== "SYSTEM_CALL_LEAVE")
        || message.senderId === clientId
        || seenIdsRef.current.has(message.id)) {
      return;
    }

    seenIdsRef.current.add(message.id);
    if (chatVisible) {
      return;
    }

    setNotifications((current) => [
      ...current,
      { message }
    ].slice(-MAX_VISIBLE));
  }, [chatVisible, clientId, message]);

  function dismiss(id: string) {
    setNotifications((current) => current.filter(({ message: item }) => item.id !== id));
  }

  if (suspended || notifications.length === 0) {
    return null;
  }

  return (
    <aside className="chatToastStack" aria-label="Chat notifications" aria-live="polite">
      {notifications.map((notification) => (
        <ChatToastItem
          key={notification.message.id}
          notification={notification}
          suspended={suspended}
          onDismiss={() => dismiss(notification.message.id)}
          onOpenChat={onOpenChat ? () => {
            onOpenChat();
            dismiss(notification.message.id);
          } : undefined}
        />
      ))}
    </aside>
  );
}
