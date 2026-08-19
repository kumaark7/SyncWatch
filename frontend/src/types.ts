export type RoomState = {
  roomId: string;
  fileName: string | null;
  hasFile: boolean;
  playing: boolean;
  currentTime: number;
  serverTime: number;
  hostAssigned: boolean;
  isHost: boolean;
};

export type SyncEvent = {
  type: "STATE" | "PLAY" | "PAUSE" | "SEEK" | "FILE_SELECTED";
  time: number;
  playing: boolean;
  fileName?: string | null;
  serverTime: number;
  senderClientId?: string | null;
  hostClientId?: string | null;
};
