import type { Participant } from "../types";
import ParticipantsPanel from "./ParticipantsPanel";
import RoomCard from "./RoomCard";
import type { PartyTab } from "./types";

type Props = {
  roomId: string;
  participants: Participant[];
  clientId: string;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
};

export default function PartyPanel(props: Props) {
  const activeTab: PartyTab = "people";

  return (
    <aside className="partyPanel" aria-label="Party panel" data-active-tab={activeTab}>
      <div className="partyPanelHeader">
        <div>
          <div className="eyebrow">Party</div>
          <h2>People</h2>
        </div>
        <span className="participantCount">{props.participants.length}</span>
      </div>

      <ParticipantsPanel participants={props.participants} clientId={props.clientId} />

      <RoomCard
        roomId={props.roomId}
        onCopyRoom={props.onCopyRoom}
        onCopyInvite={props.onCopyInvite}
      />
    </aside>
  );
}
