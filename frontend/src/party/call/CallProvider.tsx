import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RoomEventCallbacks
} from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { requestCallToken } from "./livekitApi";
import type { CallStatus } from "./types";

type CallContextValue = {
  status: CallStatus;
  participantCount: number;
  error: string | null;
  mutedRemoteParticipantIds: ReadonlySet<string>;
  listenersWhoMutedMe: ReadonlyMap<string, string>;
  joinCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  toggleRemoteAudio: (participantIdentity: string) => Promise<void>;
  clearError: () => void;
};

const SPEAKER_MUTE_TOPIC = "syncwatch-speaker-mute";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type SpeakerMuteSignal = {
  type: "SPEAKER_MUTE";
  muted: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

type Props = {
  roomId: string;
  clientId: string;
  onCallJoined?: () => void;
  onCallLeft?: () => void;
  children: ReactNode;
};

export default function CallProvider({
  roomId,
  clientId,
  onCallJoined,
  onCallLeft,
  children
}: Props) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [status, setStatus] = useState<CallStatus>("idle");
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mutedRemoteParticipantIds, setMutedRemoteParticipantIds] =
    useState<Set<string>>(() => new Set());
  const mutedRemoteParticipantIdsRef = useRef(mutedRemoteParticipantIds);
  const [listenersWhoMutedMe, setListenersWhoMutedMe] =
    useState<Map<string, string>>(() => new Map());

  const publishSpeakerMute = useCallback(async (
    participantIdentity: string,
    muted: boolean
  ) => {
    const signal: SpeakerMuteSignal = {
      type: "SPEAKER_MUTE",
      muted
    };

    await room.localParticipant.publishData(
      textEncoder.encode(JSON.stringify(signal)),
      {
        reliable: true,
        topic: SPEAKER_MUTE_TOPIC,
        destinationIdentities: [participantIdentity]
      }
    );
  }, [room]);

  useEffect(() => {
    mutedRemoteParticipantIdsRef.current = mutedRemoteParticipantIds;
  }, [mutedRemoteParticipantIds]);

  useEffect(() => {
    const updateParticipantCount = () => {
      setParticipantCount(
        room.state === ConnectionState.Connected
          || room.state === ConnectionState.Reconnecting
          ? room.remoteParticipants.size + 1
          : 0
      );
    };

    const handleTrackPublished: RoomEventCallbacks["trackPublished"] = (
      publication,
      participant
    ) => {
      if (
        publication.source === Track.Source.Microphone &&
        mutedRemoteParticipantIdsRef.current.has(participant.identity)
      ) {
        publication.setSubscribed(false);
      }
    };

    const handleParticipantConnected: RoomEventCallbacks["participantConnected"] = (
      participant
    ) => {
      updateParticipantCount();

      if (mutedRemoteParticipantIdsRef.current.has(participant.identity)) {
        participant
          .getTrackPublication(Track.Source.Microphone)
          ?.setSubscribed(false);
        void publishSpeakerMute(participant.identity, true).catch(() => {
          setError("Speaker status could not be shared with the participant");
        });
      }
    };

    const handleParticipantDisconnected: RoomEventCallbacks["participantDisconnected"] = (
      participant
    ) => {
      updateParticipantCount();
      setMutedRemoteParticipantIds((current) => {
        const next = new Set(current);
        next.delete(participant.identity);
        return next;
      });
      setListenersWhoMutedMe((current) => {
        const next = new Map(current);
        next.delete(participant.identity);
        return next;
      });
    };

    const handleDataReceived: RoomEventCallbacks["dataReceived"] = (
      payload,
      participant,
      _kind,
      topic
    ) => {
      if (topic !== SPEAKER_MUTE_TOPIC || !participant) {
        return;
      }

      try {
        const signal: unknown = JSON.parse(textDecoder.decode(payload));
        if (
          typeof signal !== "object" ||
          signal === null ||
          !("type" in signal) ||
          !("muted" in signal) ||
          signal.type !== "SPEAKER_MUTE" ||
          typeof signal.muted !== "boolean"
        ) {
          return;
        }

        setListenersWhoMutedMe((current) => {
          const next = new Map(current);
          if (signal.muted) {
            next.set(
              participant.identity,
              participant.name?.trim() || "A participant"
            );
          } else {
            next.delete(participant.identity);
          }
          return next;
        });
      } catch {
        // Ignore unrelated or malformed participant data.
      }
    };

    const handleConnectionState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        setStatus("connected");
      } else if (state === ConnectionState.Reconnecting) {
        setStatus("reconnecting");
      } else if (state === ConnectionState.Connecting) {
        setStatus("connecting");
      } else {
        setStatus("idle");
      }
      updateParticipantCount();
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionState);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    room.on(RoomEvent.DataReceived, handleDataReceived);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionState);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      void room.disconnect(true);
    };
  }, [publishSpeakerMute, room]);

  useEffect(() => {
    if (room.state !== ConnectionState.Disconnected) {
      void room.disconnect(true);
    }
    setStatus("idle");
    setParticipantCount(0);
    setError(null);
    setMutedRemoteParticipantIds(new Set());
    setListenersWhoMutedMe(new Map());
  }, [room, roomId, clientId]);

  const joinCall = useCallback(async () => {
    if (!roomId || !clientId || room.state !== ConnectionState.Disconnected) {
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      const credentials = await requestCallToken(roomId, clientId);
      await room.connect(credentials.serverUrl, credentials.token, {
        autoSubscribe: true
      });
      setStatus("connected");
      setParticipantCount(room.remoteParticipants.size + 1);
      onCallJoined?.();
    } catch (cause) {
      await room.disconnect(true);
      setStatus("idle");
      setParticipantCount(0);
      setError(cause instanceof Error ? cause.message : "Could not join room call");
    }
  }, [clientId, onCallJoined, room, roomId]);

  const leaveCall = useCallback(async () => {
    const wasJoined = room.state === ConnectionState.Connected
      || room.state === ConnectionState.Reconnecting;
    setError(null);
    await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await room.disconnect(true);
    setStatus("idle");
    setParticipantCount(0);
    setMutedRemoteParticipantIds(new Set());
    setListenersWhoMutedMe(new Map());
    if (wasJoined) {
      onCallLeft?.();
    }
  }, [onCallLeft, room]);

  const toggleRemoteAudio = useCallback(async (participantIdentity: string) => {
    const participant = room.remoteParticipants.get(participantIdentity);
    if (!participant) {
      return;
    }

    const muted = !mutedRemoteParticipantIds.has(participantIdentity);
    const microphonePublication = participant.getTrackPublication(
      Track.Source.Microphone
    );
    microphonePublication?.setSubscribed(!muted);

    setMutedRemoteParticipantIds((current) => {
      const next = new Set(current);
      if (muted) {
        next.add(participantIdentity);
      } else {
        next.delete(participantIdentity);
      }
      return next;
    });

    try {
      await publishSpeakerMute(participantIdentity, muted);
    } catch {
      microphonePublication?.setSubscribed(muted);
      setMutedRemoteParticipantIds((current) => {
        const next = new Set(current);
        if (muted) {
          next.delete(participantIdentity);
        } else {
          next.add(participantIdentity);
        }
        return next;
      });
      setError("Speaker status could not be shared with the participant");
    }
  }, [mutedRemoteParticipantIds, publishSpeakerMute, room]);

  const value = useMemo<CallContextValue>(() => ({
    status,
    participantCount,
    error,
    mutedRemoteParticipantIds,
    listenersWhoMutedMe,
    joinCall,
    leaveCall,
    toggleRemoteAudio,
    clearError: () => setError(null)
  }), [
    error,
    joinCall,
    leaveCall,
    listenersWhoMutedMe,
    mutedRemoteParticipantIds,
    participantCount,
    status,
    toggleRemoteAudio
  ]);

  return (
    <RoomContext.Provider value={room}>
      <CallContext.Provider value={value}>
        {children}
        {status !== "idle" && <RoomAudioRenderer />}
      </CallContext.Provider>
    </RoomContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used inside CallProvider");
  }
  return context;
}
