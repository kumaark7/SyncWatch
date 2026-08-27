import { useEffect, useState } from "react";
import type { Participant } from "../types";
import ChatPanel from "./chat/ChatPanel";
import type { ChatMessage } from "./chat/types";
import ParticipantsPanel from "./ParticipantsPanel";
import RoomCard from "./RoomCard";
import type { PartyTab } from "./types";

type Props = {
  roomId: string;
  participants: Participant[];
  clientId: string;
  connected: boolean;
  chatMessages: ChatMessage[];
  lastChatMessage: ChatMessage | null;
  onSendChat: (text: string) => boolean;
  onChatError?: (message: string) => void;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
};

export default function PartyPanel(props: Props) {
  const [activeTab, setActiveTab] = useState<PartyTab>("people");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!props.lastChatMessage || props.lastChatMessage.senderId === props.clientId) {
      return;
    }

    if (activeTab === "chat") {
      return;
    }

    setUnreadCount((count) => count + 1);
  }, [props.lastChatMessage, props.clientId, activeTab]);

  function selectTab(tab: PartyTab) {
    setActiveTab(tab);
    if (tab === "chat") {
      setUnreadCount(0);
    }
  }

  return (
    <aside className="partyPanel" aria-label="Party panel" data-active-tab={activeTab}>
      <div className="partyPanelHeader">
        <div>
          <div className="eyebrow">Party</div>
          <h2>{activeTab === "people" ? "People" : "Chat"}</h2>
        </div>
        <span className="participantCount">
          {activeTab === "people" ? props.participants.length : props.chatMessages.length}
        </span>
      </div>

      <div className="partyTabs" role="tablist" aria-label="Party modules">
        <button
          className={activeTab === "people" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "people"}
          onClick={() => selectTab("people")}
        >
          People
        </button>
        <button
          className={activeTab === "chat" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "chat"}
          onClick={() => selectTab("chat")}
        >
          Chat
          {unreadCount > 0 && <span className="unreadBadge">{unreadCount}</span>}
        </button>
      </div>

      {activeTab === "people" ? (
        <ParticipantsPanel participants={props.participants} clientId={props.clientId} />
      ) : (
        <ChatPanel
          messages={props.chatMessages}
          clientId={props.clientId}
          connected={props.connected}
          onSend={props.onSendChat}
          onError={props.onChatError}
        />
      )}

      {activeTab === "people" && (
        <RoomCard
          roomId={props.roomId}
          onCopyRoom={props.onCopyRoom}
          onCopyInvite={props.onCopyInvite}
        />
      )}
    </aside>
  );
}
