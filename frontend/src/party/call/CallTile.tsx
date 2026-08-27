import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  ParticipantEvent,
  Track,
  type Participant
} from "livekit-client";
import CallControls from "./CallControls";

type Props = {
  participant: Participant;
  onLeave?: () => Promise<void>;
};

function participantInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

export default function CallTile({ participant, onLeave }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [, refresh] = useState(0);
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const cameraTrack = cameraPublication?.track;
  const name = participant.name?.trim() || "Guest";

  function clearControlsTimer() {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }

  function revealControls() {
    if (!participant.isLocal) {
      return;
    }

    clearControlsTimer();
    setControlsVisible(true);
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimerRef.current = null;
    }, 2800);
  }

  function handleTilePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (!participant.isLocal
        || event.pointerType === "mouse"
        || (target instanceof Element && target.closest("button"))) {
      return;
    }

    if (controlsVisible) {
      clearControlsTimer();
      setControlsVisible(false);
    } else {
      revealControls();
    }
  }

  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    const events = [
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.IsSpeakingChanged
    ];

    events.forEach((event) => participant.on(event, update));
    return () => {
      events.forEach((event) => participant.off(event, update));
    };
  }, [participant]);

  useEffect(() => () => clearControlsTimer(), []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !cameraTrack || cameraPublication?.isMuted) {
      return;
    }

    cameraTrack.attach(element);
    return () => {
      cameraTrack.detach(element);
    };
  }, [cameraPublication?.isMuted, cameraTrack]);

  const cameraVisible = Boolean(cameraTrack && !cameraPublication?.isMuted);

  return (
    <article
      className={`callTile ${participant.isLocal ? "local" : "remote"} ${participant.isSpeaking ? "speaking" : ""} ${controlsVisible ? "controlsVisible" : ""}`}
      tabIndex={participant.isLocal ? 0 : undefined}
      aria-label={participant.isLocal ? `${name}, your call preview` : `${name} call participant`}
      onPointerDown={handleTilePointerDown}
    >
      {cameraVisible ? (
        <video
          ref={videoRef}
          className={`callTileVideo ${participant.isLocal ? "self" : ""}`}
          autoPlay
          playsInline
          muted={participant.isLocal}
          aria-hidden="true"
        />
      ) : (
        <div className="callTileAvatar" role="img" aria-label={`${name} camera off`}>
          {participantInitial(name)}
        </div>
      )}

      {participant.isLocal && onLeave && (
        <CallControls onLeave={onLeave} onInteract={revealControls} />
      )}

      <div className="callTileCaption">
        <span title={name}>{participant.isLocal ? "You" : name}</span>
        <span
          className={`callMicState ${participant.isMicrophoneEnabled ? "on" : "off"}`}
          aria-label={participant.isMicrophoneEnabled ? "Microphone on" : "Microphone off"}
          title={participant.isMicrophoneEnabled ? "Microphone on" : "Microphone off"}
        >
          {participant.isMicrophoneEnabled ? "Mic on" : "Mic off"}
        </span>
      </div>
    </article>
  );
}
