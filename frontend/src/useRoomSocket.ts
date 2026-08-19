import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import { API_URL } from "./api";
import type { SyncEvent } from "./types";

const wsUrl = () => API_URL.replace(/^http/, "ws") + "/ws";

function makeClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export function useRoomSocket(roomId: string) {
  const clientRef = useRef<Client | null>(null);
  const clientIdRef = useRef(makeClientId());

  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const client = new Client({
      brokerURL: wsUrl(),
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      onConnect: () => {
        setConnected(true);

        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const event = JSON.parse(message.body) as SyncEvent;
          setLastEvent(event);
        });

        client.publish({
          destination: `/app/room/${roomId}/control`,
          body: JSON.stringify({
            type: "JOIN",
            time: 0,
            playing: false,
            clientId: clientIdRef.current
          })
        });
      },

      onWebSocketClose: () => {
        setConnected(false);
      }
    });

    clientRef.current = client;
    client.activate();

    return () => {
      clientRef.current = null;
      void client.deactivate();
    };
  }, [roomId]);

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

  return {
    connected,
    lastEvent,
    sendControl,
    clientId: clientIdRef.current
  };
}
