export type Room = {
  id: string;
  hostSocketId?: string;
  fileId?: string;
  fileName?: string;
  accessToken?: string;
  playing: boolean;
  time: number;
  updatedAt: number;
};

export const rooms = new Map<string, Room>();

export function makeRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function currentRoomTime(room: Room) {
  if (!room.playing) return room.time;
  return room.time + (Date.now() - room.updatedAt) / 1000;
}
