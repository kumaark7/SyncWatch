import { useEffect, useState } from "react";
import { API_URL } from "./api";
import DrivePicker from "./DrivePicker";
import VideoPlayer from "./VideoPlayer";
import { useRoomSocket } from "./useRoomSocket";
import type { RoomState } from "./types";
import "./style.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const TOKEN_EXPIRY_SKEW_MS = 60000;

type GoogleConnection = {
  accessToken: string;
  expiresAt: number;
};

function roomFromUrl() {
  const match =
    window.location.pathname.match(
      /^\/room\/([A-Z0-9]+)/i
    );

  return match?.[1]?.toUpperCase() || "";
}

function googleApisReady() {
  return Boolean(
    window.google?.accounts?.oauth2 &&
      window.gapi
  );
}

export default function App() {
  const [roomId, setRoomId] =
    useState(roomFromUrl());

  const [joinCode, setJoinCode] =
    useState("");

  const [room, setRoom] =
    useState<RoomState | null>(null);

  const [toast, setToast] =
    useState("");

  /*
   * Temporary Google OAuth connection.
   *
   * This is intentionally kept only in React memory.
   * It disappears after page refresh.
   */
  const [googleConnection, setGoogleConnection] =
    useState<GoogleConnection | null>(null);

  const [googleReady, setGoogleReady] =
    useState(googleApisReady());

  const {
    connected,
    lastEvent,
    sendControl,
    clientId
  } = useRoomSocket(roomId);

  /*
   * Wait for Google APIs to load.
   */
  useEffect(() => {
    if (googleReady) {
      return;
    }

    const timer =
      window.setInterval(() => {
        if (googleApisReady()) {
          setGoogleReady(true);

          window.clearInterval(
            timer
          );
        }
      }, 250);

    return () =>
      window.clearInterval(timer);
  }, [googleReady]);

  /*
   * Load room information from Spring Boot.
   *
   * This is also what restores the host role
   * after refreshing the page, because clientId
   * is preserved by useRoomSocket().
   */
  useEffect(() => {
    if (!roomId) {
      return;
    }

    fetch(
      `${API_URL}/api/rooms/${roomId}?clientId=${encodeURIComponent(
        clientId
      )}`
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Room not found"
          );
        }

        return response.json();
      })
      .then((data) => {
        setRoom(data);
      })
      .catch(() => {
        setRoom(null);
      });
  }, [roomId, clientId]);

  /*
   * Process WebSocket events.
   */
  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    setRoom((previous) => {
      if (!previous) {
        return previous;
      }

      const eventHost =
        lastEvent.hostClientId;

      const isHost =
        Boolean(eventHost) &&
        eventHost === clientId;

      /*
       * Host selected a file.
       */
      if (
        lastEvent.type ===
        "FILE_SELECTED"
      ) {
        return {
          ...previous,

          hasFile: true,

          fileName:
            lastEvent.fileName ??
            "Google Drive video",

          playing: false,

          currentTime: 0,

          serverTime:
            lastEvent.serverTime,

          hostAssigned: true,

          isHost
        };
      }

      /*
       * Host cleared the file.
       */
      if (
        lastEvent.type ===
        "FILE_CLEARED"
      ) {
        return {
          ...previous,

          hasFile: false,

          fileName: null,

          playing: false,

          currentTime: 0,

          serverTime:
            lastEvent.serverTime,

          hostAssigned:
            Boolean(eventHost) ||
            previous.hostAssigned,

          isHost: eventHost
            ? isHost
            : previous.isHost
        };
      }

      /*
       * PLAY / PAUSE / SEEK / STATE
       */
      return {
        ...previous,

        playing:
          lastEvent.playing,

        currentTime:
          lastEvent.time,

        serverTime:
          lastEvent.serverTime,

        hostAssigned:
          Boolean(eventHost) ||
          previous.hostAssigned,

        isHost: eventHost
          ? isHost
          : previous.isHost
      };
    });
  }, [lastEvent, clientId]);

  /*
   * If this browser becomes a guest,
   * remove its local Google connection.
   */
  useEffect(() => {
    if (
      room &&
      !room.isHost
    ) {
      setGoogleConnection(null);
    }
  }, [room]);

  /*
   * CREATE ROOM
   */
  async function createRoom() {
    const response =
      await fetch(
        `${API_URL}/api/rooms?clientId=${encodeURIComponent(
          clientId
        )}`,
        {
          method: "POST"
        }
      );

    if (!response.ok) {
      alert(
        "Could not create room."
      );

      return;
    }

    const data =
      await response.json();

    history.pushState(
      {},
      "",
      `/room/${data.roomId}`
    );

    setRoomId(
      data.roomId
    );

    setRoom(data);
  }

  /*
   * JOIN ROOM
   */
  async function joinRoom() {
    const code =
      joinCode
        .trim()
        .toUpperCase();

    if (!code) {
      return;
    }

    const response =
      await fetch(
        `${API_URL}/api/rooms/${code}?clientId=${encodeURIComponent(
          clientId
        )}`
      );

    if (!response.ok) {
      alert(
        "Room not found."
      );

      return;
    }

    const data =
      await response.json();

    history.pushState(
      {},
      "",
      `/room/${code}?guest=1`
    );

    setRoomId(code);

    setRoom(data);
  }

  /*
   * Request a Google Drive access token.
   */
  function requestGoogleAccessToken(
    prompt = ""
  ) {
    return new Promise<GoogleConnection | null>(
      (resolve) => {
        if (!CLIENT_ID) {
          alert(
            "Missing VITE_GOOGLE_CLIENT_ID in frontend/.env"
          );

          resolve(null);

          return;
        }

        if (
          !googleReady ||
          !window.google?.accounts?.oauth2
        ) {
          resolve(null);

          return;
        }

        const tokenClient =
          window.google.accounts.oauth2.initTokenClient(
            {
              client_id:
                CLIENT_ID,

              scope:
                DRIVE_SCOPE,

              callback: (
                tokenResponse: any
              ) => {
                if (
                  tokenResponse.error ||
                  !tokenResponse.access_token
                ) {
                  console.error(
                    "Google OAuth token error:",
                    tokenResponse.error ||
                      "No access token returned"
                  );

                  alert(
                    "Google Drive authorization failed. Please try again."
                  );

                  resolve(null);

                  return;
                }

                const expiresInSeconds =
                  Number(
                    tokenResponse.expires_in
                  ) || 3600;

                resolve({
                  accessToken:
                    tokenResponse.access_token,

                  expiresAt:
                    Date.now() +
                    expiresInSeconds *
                      1000 -
                    TOKEN_EXPIRY_SKEW_MS
                });
              },

              error_callback: (
                error: any
              ) => {
                console.error(
                  "Google OAuth popup error:",
                  error
                );

                resolve(null);
              }
            }
          );

        tokenClient.requestAccessToken({
          prompt
        });
      }
    );
  }

  /*
   * CONNECT GOOGLE DRIVE
   *
   * This is the only way to establish
   * a Google Drive connection.
   */
  async function connectGoogleDrive() {
    if (!googleReady) {
      return;
    }

    /*
     * Already connected?
     */
    if (
      googleConnection &&
      googleConnection.expiresAt >
        Date.now()
    ) {
      setToast(
        "Google Drive already connected"
      );

      window.setTimeout(
        () => setToast(""),
        2000
      );

      return;
    }

    /*
     * Explicit Google authorization.
     */
    const connection =
      await requestGoogleAccessToken(
        "consent"
      );

    if (!connection) {
      return;
    }

    setGoogleConnection(
      connection
    );

    setToast(
      "Google Drive connected"
    );

    window.setTimeout(
      () => setToast(""),
      2000
    );
  }

  /*
   * Get a valid Google Drive token.
   *
   * If the token expired or disappeared
   * after refresh, request a new one.
   */
  async function getValidGoogleAccessToken() {
    if (!googleReady) {
      return null;
    }

    /*
     * Existing valid token.
     */
    if (
      googleConnection &&
      googleConnection.expiresAt >
        Date.now()
    ) {
      return (
        googleConnection.accessToken
      );
    }

    /*
     * No valid connection.
     *
     * We deliberately do NOT automatically
     * reconnect here.
     *
     * The user must press
     * "Connect Google Drive".
     */
    setToast(
      "Please connect Google Drive first."
    );

    window.setTimeout(
      () => setToast(""),
      2500
    );

    return null;
  }

  /*
   * SELECT DRIVE FILE
   */
  async function selectFile(file: {
    id: string;
    name: string;
    accessToken: string;
  }) {
    const response =
      await fetch(
        `${API_URL}/api/rooms/${roomId}/file`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            fileId:
              file.id,

            fileName:
              file.name,

            accessToken:
              file.accessToken,

            clientId
          })
        }
      );

    if (!response.ok) {
      const result =
        await response
          .json()
          .catch(() => null);

      alert(
        result?.error ||
          "Could not attach Drive file."
      );

      return;
    }

    const state =
      await response.json();

    setRoom(state);
  }

  /*
   * DISCONNECT GOOGLE DRIVE
   *
   * This does TWO things:
   *
   * 1. Revoke the temporary Google token.
   * 2. Tell Spring Boot to clear the room's
   *    Drive file.
   *
   * After this finishes, the UI returns to:
   *
   *     Connect Google Drive
   */
  async function disconnectGoogleDrive() {
    const token =
      googleConnection?.accessToken;

    /*
     * Immediately remove local connection state.
     */
    setGoogleConnection(
      null
    );

    /*
     * Revoke the Google access token.
     */
    if (
      token &&
      googleReady &&
      window.google?.accounts?.oauth2
    ) {
      window.google.accounts.oauth2.revoke(
        token,
        () => {}
      );
    }

    /*
     * Only the host can clear the
     * Drive file from the room.
     */
    if (room?.isHost) {
      const response =
        await fetch(
          `${API_URL}/api/rooms/${roomId}/file?clientId=${encodeURIComponent(
            clientId
          )}`,
          {
            method: "DELETE"
          }
        );

      if (!response.ok) {
        const result =
          await response
            .json()
            .catch(() => null);

        alert(
          result?.error ||
            "Could not disconnect Google Drive."
        );

        /*
         * We failed to disconnect
         * from the server.
         *
         * Keep the local state disconnected,
         * but report the server error.
         */
        return;
      }

      const state =
        await response.json();

      setRoom(state);
    }

    setToast(
      "Google Drive disconnected"
    );

    window.setTimeout(
      () => setToast(""),
      2000
    );
  }

  /*
   * COPY INVITE
   */
  async function copyInvite() {
    const inviteUrl =
      `${window.location.origin}/room/${roomId}?guest=1`;

    try {
      await navigator.clipboard.writeText(
        inviteUrl
      );

      setToast(
        "Guest invite copied!"
      );
    } catch {
      setToast(
        "Couldn't copy invite"
      );
    }

    window.setTimeout(
      () => setToast(""),
      2000
    );
  }

  /*
   * HOME PAGE
   */
  if (!roomId) {
    return (
      <main className="shell home">

        <h1>
          SyncWatch
        </h1>

        <p>
          Java full-stack Google Drive
          watch party.
        </p>

        <button
          className="primary"
          onClick={createRoom}
        >
          Create Room
        </button>

        <div className="join">

          <input
            value={joinCode}
            onChange={(event) =>
              setJoinCode(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                "Enter"
              ) {
                void joinRoom();
              }
            }}
            placeholder="Room code"
            maxLength={6}
          />

          <button
            onClick={() =>
              void joinRoom()
            }
          >
            Join
          </button>

        </div>

      </main>
    );
  }

  /*
   * ROOM NOT FOUND
   */
  if (!room) {
    return (
      <main className="shell home">

        <h1>
          Room not found
        </h1>

      </main>
    );
  }

  /*
   * Only host can manage Google Drive.
   */
  const canManageGoogle =
    room.isHost;

  return (
    <main className="shell">

      {/* HEADER */}

      <header>

        <div>

          <strong>
            SyncWatch
          </strong>

          <span className="muted">
            {" "}
            Room {roomId}
          </span>

          <span className="muted">
            {" "}
            {room.isHost
              ? "★ Host"
              : "Guest"}
          </span>

          <span className="muted">
            {" "}
            {connected
              ? "● Synced"
              : "● Reconnecting"}
          </span>

        </div>

        <button
          onClick={() =>
            void copyInvite()
          }
        >
          Copy invite
        </button>

      </header>

      {/* VIDEO PLAYER */}

      <VideoPlayer
        roomId={roomId}

        hasFile={
          room.hasFile
        }

        fileName={
          room.fileName
        }

        initialTime={
          room.currentTime
        }

        initialPlaying={
          room.playing
        }

        syncEvent={
          lastEvent
        }

        onControl={
          sendControl
        }

        clientId={
          clientId
        }

        isHost={
          room.isHost
        }
      />

      {/* BOTTOM SECTION */}

      <section className="bottom">

        <div>

          <div className="muted">
            Now playing
          </div>

          <div>
            {room.fileName ||
              "No video selected"}
          </div>

        </div>

        {canManageGoogle && (

          <div className="googleActions">

            {/*
             * STATE 1:
             *
             * No active Google connection.
             *
             * Show ONLY:
             *
             * Connect Google Drive
             *
             * This happens:
             *
             * - initially
             * - after refresh
             * - after disconnect
             */
            !googleConnection ? (

              <button
                className="primary"
                disabled={
                  !googleReady
                }
                onClick={() =>
                  void connectGoogleDrive()
                }
              >
                {googleReady
                  ? "Connect Google Drive"
                  : "Loading Google Drive..."}
              </button>

            ) : (

              /*
               * STATE 2:
               *
               * Google connection exists.
               *
               * Show:
               *
               * Connected
               * Choose Video
               * Disconnect
               */
              <>

                <span className="muted">
                  Google Drive:
                  {" "}
                  Connected
                </span>

                <DrivePicker
                  disabled={
                    !googleReady
                  }

                  getAccessToken={
                    getValidGoogleAccessToken
                  }

                  onSelected={
                    selectFile
                  }
                />

                <button
                  disabled={
                    !googleReady
                  }
                  onClick={() =>
                    void disconnectGoogleDrive()
                  }
                >
                  {googleReady
                    ? "Disconnect Google"
                    : "Loading Google Drive..."}
                </button>

              </>

            )}

          </div>

        )}

      </section>

      {/* TOAST */}

      {toast && (

        <div
          className="toast"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>

      )}

    </main>
  );
}