import type { Participant } from "../types";

type Props = {
  participants: Participant[];
  clientId: string;
};

export default function ParticipantsPanel({ participants, clientId }: Props) {
  return (
    <ul className="participantList">
      {participants.map((participant) => {
        const isYou = participant.clientId === clientId;

        return (
          <li className="participant" key={participant.clientId}>
            <span className="participantAvatar" aria-hidden="true">
              {participant.nameTag.slice(0, 1).toUpperCase()}
              <span className="onlineDot" />
            </span>
            <span className="participantText">
              <strong>{participant.nameTag}</strong>
              <span className="participantMeta">
                {participant.host ? "Host" : "Watching"}
                {isYou ? " · You" : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
