import { useTracks, VideoTrack } from "@livekit/components-react";
import { ScreenShare } from "lucide-react";
import { Track } from "livekit-client";

type Props = {
  roomId: string;
  activeClientId: string | null;
  activeDisplayName: string | null;
};

export default function ScreenShareStage({
  roomId,
  activeClientId,
  activeDisplayName
}: Props) {
  const tracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: false
  });
  if (!activeClientId) {
    return null;
  }

  const expectedIdentity = `syncwatch:${roomId}:${activeClientId}`;
  const activeTrack = tracks.find(
    (track) => track.participant.identity === expectedIdentity
  );
  if (!activeTrack) {
    return null;
  }

  const sharer = activeDisplayName?.trim()
    || activeTrack.participant.name?.trim()
    || "A participant";

  return (
    <section className="screenShareStage" aria-label={`${sharer} is sharing their screen`}>
      <VideoTrack
        trackRef={activeTrack}
        className="screenShareVideo"
        playsInline
      />
      <div className="screenShareLabel">
        <ScreenShare size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>{sharer} is sharing</span>
      </div>
    </section>
  );
}
