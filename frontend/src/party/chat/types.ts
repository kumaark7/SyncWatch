export type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "USER" | "SYSTEM_JOIN" | "SYSTEM_LEAVE" | "SYSTEM_CALL_JOIN" | "SYSTEM_CALL_LEAVE";
  text: string;
  timestamp: number;
};
