import { useEffect, useRef, useState } from "react";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "./types";

type Props = {
  messages: ChatMessageType[];
  clientId: string;
  connected: boolean;
  onSend: (text: string) => boolean;
  onError?: (message: string) => void;
};

function nearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 72;
}

export default function ChatPanel({ messages, clientId, connected, onSend, onError }: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      setHasNewMessages(false);
    } else {
      setHasNewMessages(messages.length > 0);
    }
  }, [messages]);

  function onScroll() {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const atBottom = nearBottom(list);
    shouldStickToBottomRef.current = atBottom;
    if (atBottom) {
      setHasNewMessages(false);
    }
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (!list) {
      return;
    }

    list.scrollTop = list.scrollHeight;
    shouldStickToBottomRef.current = true;
    setHasNewMessages(false);
  }

  return (
    <section className="chatPanel" aria-label="Room chat">
      <div className="chatMessagesWrap">
        <ul className="chatMessages" ref={listRef} onScroll={onScroll}>
          {messages.length === 0 ? (
            <li className="chatEmpty">No messages yet.</li>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                own={message.senderId === clientId}
              />
            ))
          )}
        </ul>
        {hasNewMessages && (
          <button className="newMessagesButton" onClick={jumpToLatest}>
            New messages
          </button>
        )}
      </div>

      <ChatComposer disabled={!connected} onSend={onSend} onError={onError} />
    </section>
  );
}
