import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  ConnectionQuality,
  ParticipantEvent,
  Track,
  type Participant
} from "livekit-client";
import { SignalHigh, SignalLow, SignalZero, Volume2, VolumeX } from "lucide-react";
import CallControls from "./CallControls";

type Props = {
  participant: Participant;
  onLeave?: () => Promise<void>;
  onHideSelf?: () => void;
  remoteAudioMuted?: boolean;
  onToggleRemoteAudio?: () => Promise<void>;
  listenersWhoMutedMe?: readonly string[];
};

function participantInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

function connectionQualityDisplay(quality: ConnectionQuality) {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return { label: "Excellent connection", Icon: SignalHigh, tone: "strong" };
    case ConnectionQuality.Good:
      return { label: "Good connection", Icon: SignalHigh, tone: "strong" };
    case ConnectionQuality.Poor:
      return { label: "Poor connection", Icon: SignalLow, tone: "weak" };
    case ConnectionQuality.Lost:
      return { label: "Connection lost", Icon: SignalZero, tone: "lost" };
    default:
      return { label: "Connection quality unknown", Icon: SignalZero, tone: "unknown" };
  }
}

export default function CallTile({
  participant,
  onLeave,
  onHideSelf,
  remoteAudioMuted = false,
  onToggleRemoteAudio,
  listenersWhoMutedMe = []
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const [, refresh] = useState(0);
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const cameraTrack = cameraPublication?.track;
  const name = participant.name?.trim() || "Guest";

  function clearOverlayTimer() {
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
  }

  function revealOverlay() {
    clearOverlayTimer();
    setOverlayVisible(true);
    overlayTimerRef.current = window.setTimeout(() => {
      setOverlayVisible(false);
      overlayTimerRef.current = null;
    }, 2800);
  }

  function handleTilePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (event.pointerType === "mouse"
        || (target instanceof Element && target.closest("button"))) {
      return;
    }

    if (overlayVisible) {
      clearOverlayTimer();
      setOverlayVisible(false);
    } else {
      revealOverlay();
    }
  }

  useEffect(() => {
    const update = () => refresh((value) => value + 1);

    participant.on(ParticipantEvent.TrackPublished, update);
    participant.on(ParticipantEvent.TrackUnpublished, update);
    participant.on(ParticipantEvent.TrackSubscribed, update);
    participant.on(ParticipantEvent.TrackUnsubscribed, update);
    participant.on(ParticipantEvent.TrackMuted, update);
    participant.on(ParticipantEvent.TrackUnmuted, update);
    participant.on(ParticipantEvent.IsSpeakingChanged, update);
    participant.on(ParticipantEvent.ConnectionQualityChanged, update);

    return () => {
      participant.off(ParticipantEvent.TrackPublished, update);
      participant.off(ParticipantEvent.TrackUnpublished, update);
      participant.off(ParticipantEvent.TrackSubscribed, update);
      participant.off(ParticipantEvent.TrackUnsubscribed, update);
      participant.off(ParticipantEvent.TrackMuted, update);
      participant.off(ParticipantEvent.TrackUnmuted, update);
      participant.off(ParticipantEvent.IsSpeakingChanged, update);
      participant.off(ParticipantEvent.ConnectionQualityChanged, update);
    };
  }, [participant]);

  useEffect(() => () => clearOverlayTimer(), []);

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
  const connectionQuality = connectionQualityDisplay(participant.connectionQuality);
  const ConnectionQualityIcon = connectionQuality.Icon;
  const listenerMuteLabel = listenersWhoMutedMe.length === 1
    ? `${listenersWhoMutedMe[0]} cannot hear you`
    : `${listenersWhoMutedMe.length} participants cannot hear you`;

  return (
    <article
      className={`callTile ${participant.isLocal ? "local" : "remote"} ${participant.isSpeaking ? "speaking" : ""} ${overlayVisible ? "overlayVisible" : ""}`}
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

      {participant.isLocal && onLeave && onHideSelf && (
        <CallControls
          onLeave={onLeave}
          onHideSelf={onHideSelf}
          onInteract={revealOverlay}
        />
      )}

      {!participant.isLocal && onToggleRemoteAudio && (
        <button
          className={`callRemoteAudioButton ${remoteAudioMuted ? "muted" : ""}`}
          disabled={speakerBusy}
          aria-label={remoteAudioMuted ? `Hear ${name}` : `Mute ${name} for me`}
          aria-pressed={remoteAudioMuted}
          title={remoteAudioMuted ? `Hear ${name}` : `Mute ${name} for me`}
          onFocus={revealOverlay}
          onPointerDown={revealOverlay}
          onClick={async () => {
            setSpeakerBusy(true);
            try {
              await onToggleRemoteAudio();
            } finally {
              setSpeakerBusy(false);
            }
          }}
        >
          {remoteAudioMuted
            ? <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
            : <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" />}
        </button>
      )}

      {participant.isLocal && listenersWhoMutedMe.length > 0 && (
        <span
          className="callListenerMuteNotice"
          role="status"
          aria-label={listenerMuteLabel}
          title={listenerMuteLabel}
        >
          <VolumeX size={15} strokeWidth={2.2} aria-hidden="true" />
          {listenersWhoMutedMe.length > 1 && (
            <span aria-hidden="true">{listenersWhoMutedMe.length}</span>
          )}
        </span>
      )}

      <span
        className={`callConnectionQuality ${connectionQuality.tone}`}
        role="img"
        aria-label={connectionQuality.label}
        title={connectionQuality.label}
      >
        <ConnectionQualityIcon size={13} strokeWidth={2.3} aria-hidden="true" />
      </span>

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
