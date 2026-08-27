import type { Participant } from "../types";
import ChatPanel from "./chat/ChatPanel";
import type { ChatMessage } from "./chat/types";
import CallPanel from "./call/CallPanel";
import { useCall } from "./call/CallProvider";
import ParticipantsPanel from "./ParticipantsPanel";
import RoomCard from "./RoomCard";
import type { PartyTab } from "./types";

type Props = {
  roomId: string;
  participants: Participant[];
  clientId: string;
  connected: boolean;
  chatMessages: ChatMessage[];
  activeTab: PartyTab;
  unreadCount: number;
  onTabChange: (tab: PartyTab) => void;
  onClearUnread: () => void;
  onSendChat: (text: string) => boolean;
  onChatError?: (message: string) => void;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
};

export default function PartyPanel(props: Props) {
  const { participantCount: callParticipantCount } = useCall();
  const activeTitle = props.activeTab === "people" ? "People" : props.activeTab === "chat" ? "Chat" : "Call";
  const activeCount = props.activeTab === "people"
    ? props.participants.length
    : props.activeTab === "chat"
      ? props.chatMessages.length
      : callParticipantCount;

  function selectTab(tab: PartyTab) {
    props.onTabChange(tab);
    if (tab === "chat") {
      props.onClearUnread();
    }
  }

  return (
    <aside className="partyPanel" aria-label="Party panel" data-active-tab={props.activeTab}>
      <div className="partyPanelHeader">
        <div className="partyPanelTitle">
          <span className="eyebrow">Party</span>
          <span className="partyTitleDivider" aria-hidden="true">·</span>
          <h2>{activeTitle}</h2>
        </div>
        <span className="participantCount" aria-label={`${activeCount} ${activeTitle.toLowerCase()} items`}>
          {activeCount}
        </span>
      </div>

      <div
        className="partyPanelContent"
        id="party-active-panel"
        role="tabpanel"
        aria-labelledby={`party-${props.activeTab}-tab`}
      >
        {props.activeTab === "people" ? (
          <div className="peoplePanel">
            <ParticipantsPanel participants={props.participants} clientId={props.clientId} />
            <RoomCard
              roomId={props.roomId}
              onCopyRoom={props.onCopyRoom}
              onCopyInvite={props.onCopyInvite}
            />
          </div>
        ) : props.activeTab === "chat" ? (
          <ChatPanel
            messages={props.chatMessages}
            clientId={props.clientId}
            connected={props.connected}
            onSend={props.onSendChat}
            onError={props.onChatError}
          />
        ) : (
          <CallPanel />
        )}
      </div>

      <div className="partyTabs" role="tablist" aria-label="Party modules">
        <button
          id="party-people-tab"
          className={props.activeTab === "people" ? "active" : ""}
          role="tab"
          aria-selected={props.activeTab === "people"}
          aria-controls="party-active-panel"
          onClick={() => selectTab("people")}
        >
          People
        </button>
        <button
          id="party-chat-tab"
          className={props.activeTab === "chat" ? "active" : ""}
          role="tab"
          aria-selected={props.activeTab === "chat"}
          aria-controls="party-active-panel"
          onClick={() => selectTab("chat")}
        >
          Chat
          {props.unreadCount > 0 && <span className="unreadBadge">{props.unreadCount}</span>}
        </button>
        <button
          id="party-call-tab"
          className={props.activeTab === "call" ? "active" : ""}
          role="tab"
          aria-selected={props.activeTab === "call"}
          aria-controls="party-active-panel"
          onClick={() => selectTab("call")}
        >
          Call
        </button>
      </div>
    </aside>
  );
}
