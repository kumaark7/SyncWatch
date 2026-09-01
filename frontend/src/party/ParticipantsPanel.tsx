import { Crown } from "lucide-react";
import { useState } from "react";
import type { Participant } from "../types";

type Props = {
  participants: Participant[];
  clientId: string;
  canTransferHost: boolean;
  onTransferHost: (participant: Participant) => Promise<void>;
};

export default function ParticipantsPanel({
  participants,
  clientId,
  canTransferHost,
  onTransferHost
}: Props) {
  const [transferringClientId, setTransferringClientId] = useState<string | null>(null);

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
            {canTransferHost && !isYou && (
              <button
                type="button"
                className="participantHostTransfer"
                disabled={transferringClientId !== null}
                aria-label={`Make ${participant.nameTag} the room host`}
                title={`Make ${participant.nameTag} Host`}
                onClick={async () => {
                  setTransferringClientId(participant.clientId);
                  try {
                    await onTransferHost(participant);
                  } finally {
                    setTransferringClientId(null);
                  }
                }}
              >
                <Crown size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>{transferringClientId === participant.clientId ? "Transferring" : "Make Host"}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
