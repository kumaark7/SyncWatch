import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  Room,
  RoomEvent
} from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { requestCallToken } from "./livekitApi";
import type { CallStatus } from "./types";

type CallContextValue = {
  status: CallStatus;
  participantCount: number;
  error: string | null;
  joinCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  clearError: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

type Props = {
  roomId: string;
  clientId: string;
  children: ReactNode;
};

export default function CallProvider({ roomId, clientId, children }: Props) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [status, setStatus] = useState<CallStatus>("idle");
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateParticipantCount = () => {
      setParticipantCount(
        room.state === ConnectionState.Connected
          || room.state === ConnectionState.Reconnecting
          ? room.remoteParticipants.size + 1
          : 0
      );
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
    room.on(RoomEvent.ParticipantConnected, updateParticipantCount);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipantCount);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionState);
      room.off(RoomEvent.ParticipantConnected, updateParticipantCount);
      room.off(RoomEvent.ParticipantDisconnected, updateParticipantCount);
      void room.disconnect(true);
    };
  }, [room]);

  useEffect(() => {
    if (room.state !== ConnectionState.Disconnected) {
      void room.disconnect(true);
    }
    setStatus("idle");
    setParticipantCount(0);
    setError(null);
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
    } catch (cause) {
      await room.disconnect(true);
      setStatus("idle");
      setParticipantCount(0);
      setError(cause instanceof Error ? cause.message : "Could not join room call");
    }
  }, [clientId, room, roomId]);

  const leaveCall = useCallback(async () => {
    setError(null);
    await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await room.disconnect(true);
    setStatus("idle");
    setParticipantCount(0);
  }, [room]);

  const value = useMemo<CallContextValue>(() => ({
    status,
    participantCount,
    error,
    joinCall,
    leaveCall,
    clearError: () => setError(null)
  }), [error, joinCall, leaveCall, participantCount, status]);

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
