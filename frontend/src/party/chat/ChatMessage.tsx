import type { ChatMessage as ChatMessageType } from "./types";

type Props = {
  message: ChatMessageType;
  own: boolean;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export default function ChatMessage({ message, own }: Props) {
  if (message.type !== "USER") {
    return (
      <li className="chatSystemMessage">
        <span>{message.text}</span>
        <time dateTime={new Date(message.timestamp).toISOString()}>
          {formatTime(message.timestamp)}
        </time>
      </li>
    );
  }

  return (
    <li className={own ? "chatMessage own" : "chatMessage"}>
      <div className="chatMessageHeader">
        <strong>{own ? "You" : message.senderName}</strong>
        <time dateTime={new Date(message.timestamp).toISOString()}>
          {formatTime(message.timestamp)}
        </time>
      </div>
      <p>{message.text}</p>
    </li>
  );
}
