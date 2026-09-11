import { useCallback, useEffect, useRef, useState } from "react";
import { Client, TickerStrategy } from "@stomp/stompjs";
import { API_URL } from "./api";
import type { SyncEvent } from "./types";
import type { ChatMessage } from "./party/chat/types";

const wsUrl = () => API_URL.replace(/^http/, "ws") + "/ws";
export const ROOM_CLIENT_ID_STORAGE_KEY = "syncwatch-client-id";
let connectionSequence = 0;
const SAFE_CLOSE_REASONS = new Set([
  "Normal closure", "Going away", "Heartbeat timeout", "Session closed"
]);

function makeClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function getClientId(sessionClientId: string | null) {
  if (sessionClientId) {
    sessionStorage.setItem(ROOM_CLIENT_ID_STORAGE_KEY, sessionClientId);
    return sessionClientId;
  }

  const existing = sessionStorage.getItem(ROOM_CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const id = makeClientId();
  sessionStorage.setItem(ROOM_CLIENT_ID_STORAGE_KEY, id);
  return id;
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const seen = new Set(existing.map((message) => message.id));
  const merged = [...existing];

  for (const message of incoming) {
    if (seen.has(message.id)) {
      continue;
    }

    seen.add(message.id);
    merged.push(message);
  }

  return merged
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-100);
}

export function useRoomSocket(
  roomId: string,
  nameTag: string,
  sessionClientId: string | null,
  acceptEvent?: (event: SyncEvent) => boolean
) {
  const clientRef = useRef<Client | null>(null);
  const [clientId, setClientId] = useState(() => getClientId(sessionClientId));
  const clientIdRef = useRef(clientId);
  const roomJoinedRef = useRef(false);
  const connectionInputRef = useRef({ roomId: "", nameTag: "", generation: 0 });
  if (connectionInputRef.current.roomId !== roomId
      || connectionInputRef.current.nameTag !== nameTag) {
    connectionInputRef.current = {
      roomId,
      nameTag,
      generation: connectionInputRef.current.generation + 1
    };
  }
  const requestedConnectionGeneration = connectionInputRef.current.generation;

  const [connected, setConnected] = useState(false);
  const [connectionSnapshot, setConnectionSnapshot] = useState({
    roomId: "",
    version: 0,
    generation: 0
  });
  const [roomJoined, setRoomJoined] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastChatMessage, setLastChatMessage] = useState<ChatMessage | null>(null);

  const ensureClientIdentity = useCallback(() => {
    if (clientIdRef.current) {
      return clientIdRef.current;
    }

    const nextClientId = getClientId(sessionClientId);
    clientIdRef.current = nextClientId;
    setClientId(nextClientId);
    return nextClientId;
  }, [sessionClientId]);

  const resetClientIdentity = useCallback(() => {
    sessionStorage.removeItem(ROOM_CLIENT_ID_STORAGE_KEY);
    const nextClientId = getClientId(sessionClientId);
    clientIdRef.current = nextClientId;
    setClientId(nextClientId);
  }, [sessionClientId]);

  const clearClientIdentity = useCallback(() => {
    sessionStorage.removeItem(ROOM_CLIENT_ID_STORAGE_KEY);
    clientIdRef.current = "";
    setClientId("");
  }, []);

  useEffect(() => {
    setLastEvent(null);
    setChatMessages([]);
    setLastChatMessage(null);
  }, [roomId]);

  useEffect(() => {
    roomJoinedRef.current = false;
    setRoomJoined(false);
    setConnected(false);
    if (!roomId || !nameTag) return;

    let disposed = false;
    let attempt = 0;
    let connectedAt = 0;
    let connectedTick = 0;
    let serverOutgoingMs: number | null = null;
    let serverIncomingMs: number | null = null;
    const connection = ++connectionSequence;
    const diagnose = (
      event: string,
      details: Record<string, string | number | boolean | null> = {}
    ) => {
      // Free-form frames/reasons can contain secrets. Only allowlisted fields are logged.
      console.info("[SyncWatch STOMP]", {
        event, connection, attempt,
        timestamp: new Date().toISOString(),
        establishedAt: connectedAt ? new Date(connectedAt).toISOString() : null,
        uptimeMs: connectedAt ? Math.round(performance.now() - connectedTick) : 0,
        visibility: document.visibilityState,
        online: navigator.onLine,
        reconnectDelayMs: client.reconnectDelay,
        serverOutgoingMs, serverIncomingMs,
        ...details
      });
    };

    const client = new Client({
      brokerURL: wsUrl(),
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      heartbeatStrategy: TickerStrategy.Worker,

      beforeConnect: () => {
        if (disposed) return;
        attempt++;
        connectedAt = 0;
        serverOutgoingMs = null;
        serverIncomingMs = null;
        diagnose("connecting");
      },
      onConnect: (frame) => {
        if (disposed) return;
        connectedAt = Date.now();
        connectedTick = performance.now();
        const heartbeat = frame.headers["heart-beat"];
        const negotiated = /^\d+,\d+$/.test(heartbeat ?? "")
          ? heartbeat.split(",").map(Number)
          : [null, null];
        [serverOutgoingMs, serverIncomingMs] = negotiated;
        diagnose("connected");
        setConnected(true);

        client.subscribe(`/topic/room/${roomId}`, (message) => {
          if (disposed) return;
          const event = JSON.parse(message.body) as SyncEvent;
          if (acceptEvent && !acceptEvent(event)) return;
          if (event.type === "PARTICIPANTS") {
            const joined = Boolean(
              event.participants?.some(
                (participant) => participant.clientId === clientIdRef.current
              )
            );
            roomJoinedRef.current = joined;
            setRoomJoined(joined);
          }
          setLastEvent(event);
        });

        client.subscribe(`/topic/rooms/${roomId}/chat`, (message) => {
          if (disposed) return;
          const chatMessage = JSON.parse(message.body) as ChatMessage;
          setLastChatMessage(chatMessage);
          setChatMessages((existing) => mergeMessages(existing, [chatMessage]));
        });

        client.publish({
          destination: `/app/room/${roomId}/control`,
          body: JSON.stringify({
            type: "JOIN",
            time: 0,
            playing: false,
            clientId: clientIdRef.current,
            nameTag,
            clientSnapshotSupported: true
          })
        });
        setConnectionSnapshot((current) => ({
          roomId,
          version: current.version + 1,
          generation: requestedConnectionGeneration
        }));
      },

      onHeartbeatLost: () => {
        if (!disposed) diagnose("heartbeat-lost");
      },
      onStompError: () => {
        if (!disposed) diagnose("stomp-error");
      },
      onWebSocketError: () => {
        if (!disposed) diagnose("transport-error");
      },
      onDisconnect: () => {
        if (!disposed) diagnose("disconnect-receipt");
      },
      onWebSocketClose: (event) => {
        if (disposed) return;
        diagnose("transport-closed", {
          code: event.code,
          clean: event.wasClean,
          reason: !event.reason ? "not-provided"
            : SAFE_CLOSE_REASONS.has(event.reason) ? event.reason : "redacted",
          nextAttempt: client.active ? attempt + 1 : null
        });
        connectedAt = 0;
        roomJoinedRef.current = false;
        setRoomJoined(false);
        setConnected(false);
      }
    });

    clientRef.current = client;
    const onVisibilityChange = () => diagnose("visibility-changed");
    document.addEventListener("visibilitychange", onVisibilityChange);
    client.activate();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      diagnose("effect-cleanup");
      clientRef.current = null;
      roomJoinedRef.current = false;
      setRoomJoined(false);
      setConnected(false);
      void client.deactivate().catch(() => diagnose("deactivation-failed"));
    };
  }, [roomId, nameTag, acceptEvent, requestedConnectionGeneration]);

  const sendControl = useCallback(
    (
      type: "PLAY" | "PAUSE" | "SEEK",
      time: number,
      playing: boolean
    ) => {
      const client = clientRef.current;
      if (!client?.connected) return;

      client.publish({
        destination: `/app/room/${roomId}/control`,
        body: JSON.stringify({
          type,
          time,
          playing,
          clientId: clientIdRef.current
        })
      });
    },
    [roomId]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const client = clientRef.current;
      if (!client?.connected || !roomId || !roomJoinedRef.current) {
        return false;
      }

      try {
        client.publish({
          destination: `/app/rooms/${roomId}/chat`,
          body: JSON.stringify({ text })
        });
      } catch {
        return false;
      }

      return true;
    },
    [roomId]
  );

  const sendCallJoined = useCallback(() => {
    const client = clientRef.current;
    if (!client?.connected || !roomId || !roomJoinedRef.current) {
      return false;
    }

    try {
      client.publish({
        destination: `/app/rooms/${roomId}/chat/call-joined`,
        body: ""
      });
    } catch {
      return false;
    }

    return true;
  }, [roomId]);

  const sendCallLeft = useCallback(() => {
    const client = clientRef.current;
    if (!client?.connected || !roomId || !roomJoinedRef.current) {
      return false;
    }

    try {
      client.publish({
        destination: `/app/rooms/${roomId}/chat/call-left`,
        body: ""
      });
    } catch {
      return false;
    }

    return true;
  }, [roomId]);

  const mergeChatHistory = useCallback((messages: ChatMessage[]) => {
    setChatMessages((existing) => mergeMessages(existing, messages));
  }, []);

  return {
    connected,
    connectionVersion: connectionSnapshot.version,
    connectedRoomId: connectionSnapshot.roomId,
    connectedConnectionGeneration: connectionSnapshot.generation,
    requestedConnectionGeneration,
    chatReady: connected && roomJoined,
    lastEvent,
    sendControl,
    clientId,
    ensureClientIdentity,
    resetClientIdentity,
    clearClientIdentity,
    chatMessages,
    lastChatMessage,
    sendChatMessage,
    sendCallJoined,
    sendCallLeft,
    mergeChatHistory
  };
}
