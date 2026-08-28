type Props = {
  roomId: string;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
};

export default function RoomCard({ roomId, onCopyRoom, onCopyInvite }: Props) {
  return (
    <section className="roomCard">
      <div className="eyebrow">Room</div>
      <div className="roomCodeRow">
        <strong>{roomId}</strong>
        <button className="compactButton" onClick={onCopyRoom}>Copy</button>
      </div>
      <button className="primary inviteButton" onClick={onCopyInvite}>
        Invite Friends
      </button>
    </section>
  );
}
