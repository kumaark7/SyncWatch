export type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "USER" | "SYSTEM_JOIN" | "SYSTEM_LEAVE";
  text: string;
  timestamp: number;
};
