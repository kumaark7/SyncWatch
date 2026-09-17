import { useEffect, useRef, useState } from "react";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import { focusChatInput, scrollChatToLatest } from "./chatViewport";
import type { ChatMessage as ChatMessageType } from "./types";

type Props = {
  messages: ChatMessageType[];
  clientId: string;
  connected: boolean;
  onSend: (text: string) => boolean;
  onError?: (message: string) => void;
  active: boolean;
  focusRequest: number;
};

function nearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 72;
}

function groupConsecutiveMessages(messages: ChatMessageType[]) {
  const groups: ChatMessageType[][] = [];

  for (const message of messages) {
    const previousGroup = groups[groups.length - 1];
    const previousMessage = previousGroup?.[0];
    if (message.type === "USER"
        && previousMessage?.type === "USER"
        && previousMessage.senderId === message.senderId) {
      previousGroup.push(message);
    } else {
      groups.push([message]);
    }
  }

  return groups;
}

export default function ChatPanel({
  messages,
  clientId,
  connected,
  onSend,
  onError,
  active,
  focusRequest
}: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const messageGroups = groupConsecutiveMessages(messages);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollChatToLatest(list);
      setHasNewMessages(false);
    } else {
      setHasNewMessages(messages.length > 0);
    }
  }, [messages]);

  useEffect(() => {
    const list = listRef.current;
    if (!active || !list) {
      return;
    }

    scrollChatToLatest(list);
    shouldStickToBottomRef.current = true;
    setHasNewMessages(false);
  }, [active]);

  useEffect(() => {
    if (active && focusRequest > 0 && composerRef.current) {
      focusChatInput(composerRef.current);
    }
  }, [active, focusRequest]);

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

    scrollChatToLatest(list);
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
            messageGroups.map((messageGroup, index) => (
              <ChatMessage
                key={messageGroup[0].id}
                messages={messageGroup}
                own={messageGroup[0].senderId === clientId}
                showTimestamp={index === messageGroups.length - 1}
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

      <ChatComposer
        ref={composerRef}
        disabled={!connected}
        onSend={onSend}
        onError={onError}
      />
    </section>
  );
}
