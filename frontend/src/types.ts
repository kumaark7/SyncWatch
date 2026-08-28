export type RoomState = {
  roomId: string;
  roomName: string;
  fileName: string | null;
  hasFile: boolean;
  playing: boolean;
  currentTime: number;
  serverTime: number;
  hostAssigned: boolean;
  isHost: boolean;
};

export type SyncEvent = {
  type:
    | "STATE"
    | "PLAY"
    | "PAUSE"
    | "SEEK"
    | "FILE_SELECTED"
    | "FILE_CLEARED"
    | "PARTICIPANTS";
  time: number;
  playing: boolean;
  fileName?: string | null;
  serverTime: number;
  senderClientId?: string | null;
  hostClientId?: string | null;
  seekId?: number | null;
  participants?: Participant[] | null;
};

export type Participant = {
  clientId: string;
  nameTag: string;
  host: boolean;
};
