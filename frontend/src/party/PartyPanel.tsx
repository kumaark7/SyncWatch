import type { Participant } from "../types";
import ChatPanel from "./chat/ChatPanel";
import type { ChatMessage } from "./chat/types";
import CallPanel from "./call/CallPanel";
import { useCall } from "./call/CallProvider";
import ParticipantsPanel from "./ParticipantsPanel";
import RoomCard from "./RoomCard";
import type { PartyTab } from "./types";
import type { MobileTab } from "../mobile/MobileBottomNav";

type Props = {
  roomId: string;
  participants: Participant[];
  clientId: string;
  connected: boolean;
  chatMessages: ChatMessage[];
  activeTab: PartyTab;
  mobileTab: MobileTab;
  unreadCount: number;
  selfViewHidden: boolean;
  onTabChange: (tab: PartyTab) => void;
  onClearUnread: () => void;
  onToggleSelfView: () => void;
  onSendChat: (text: string) => boolean;
  onChatError?: (message: string) => void;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
  canTransferHost: boolean;
  onTransferHost: (participant: Participant) => Promise<void>;
};

export default function PartyPanel(props: Props) {
  const { participantCount: callParticipantCount } = useCall();
  const activeTitle = props.activeTab === "people" ? "People" : props.activeTab === "chat" ? "Chat" : "Call";
  const activeCount = props.activeTab === "people"
    ? props.participants.length
    : props.activeTab === "chat"
      ? props.unreadCount
      : callParticipantCount;
  const showActiveCount = props.activeTab !== "chat" || activeCount > 0;

  function selectTab(tab: PartyTab) {
    props.onTabChange(tab);
    if (tab === "chat") {
      props.onClearUnread();
    }
  }

  return (
    <aside
      className="partyPanel"
      aria-label="Party panel"
      data-active-tab={props.activeTab}
      data-mobile-tab={props.mobileTab}
    >
      <div className="partyPanelHeader">
        <div className="partyPanelTitle">
          <span className="eyebrow">Party</span>
          <span className="partyTitleDivider" aria-hidden="true">·</span>
          <h2>{activeTitle}</h2>
        </div>
        {showActiveCount && (
          <span
            className="participantCount"
            aria-label={props.activeTab === "chat"
              ? `${activeCount} unread messages`
              : `${activeCount} ${activeTitle.toLowerCase()} items`}
          >
            {activeCount}
          </span>
        )}
      </div>

      <div className="partyPanelContent">
        <section
          id="party-people-panel"
          className="partyPanelPane partyPeoplePane"
          role="tabpanel"
          aria-labelledby="party-people-tab"
        >
          <div className="mobilePartySectionHeader" id="room-participants">
            <h2>Participants</h2>
            <span>{props.participants.length}</span>
          </div>
          <div className="peoplePanel">
            <ParticipantsPanel
              participants={props.participants}
              clientId={props.clientId}
              canTransferHost={props.canTransferHost}
              onTransferHost={props.onTransferHost}
            />
            <RoomCard
              roomId={props.roomId}
              onCopyRoom={props.onCopyRoom}
              onCopyInvite={props.onCopyInvite}
            />
          </div>
        </section>

        <section
          id="party-chat-panel"
          className="partyPanelPane partyChatPane"
          role="tabpanel"
          aria-labelledby="party-chat-tab"
        >
          <div className="mobilePartySectionHeader">
            <span>
              <span className="eyebrow">Room {props.roomId}</span>
              <h2>Chat</h2>
            </span>
            {!props.connected && <small>Reconnecting</small>}
          </div>
          <ChatPanel
            messages={props.chatMessages}
            clientId={props.clientId}
            connected={props.connected}
            onSend={props.onSendChat}
            onError={props.onChatError}
          />
        </section>

        <section
          id="party-call-panel"
          className="partyPanelPane partyCallPane"
          role="tabpanel"
          aria-labelledby="party-call-tab"
        >
          <div className="mobilePartySectionHeader">
            <span>
              <span className="eyebrow">Room {props.roomId}</span>
              <h2>Call</h2>
            </span>
          </div>
          <CallPanel
            selfViewHidden={props.selfViewHidden}
            onToggleSelfView={props.onToggleSelfView}
          />
        </section>
      </div>

      <div className="partyTabs" role="tablist" aria-label="Party modules">
        <button
          id="party-people-tab"
          className={props.activeTab === "people" ? "active" : ""}
          role="tab"
          aria-selected={props.activeTab === "people"}
          aria-controls="party-people-panel"
          onClick={() => selectTab("people")}
        >
          People
        </button>
        <button
          id="party-chat-tab"
          className={props.activeTab === "chat" ? "active" : ""}
          role="tab"
          aria-selected={props.activeTab === "chat"}
          aria-controls="party-chat-panel"
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
          aria-controls="party-call-panel"
          onClick={() => selectTab("call")}
        >
          Call
        </button>
      </div>
    </aside>
  );
}
