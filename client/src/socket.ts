import { io } from "socket.io-client";

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

export const socket = io(API_URL, {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("🟢 SOCKET CONNECTED:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("🔴 SOCKET DISCONNECTED:", reason);
});

socket.on("connect_error", (error) => {
  console.error("❌ SOCKET ERROR:", error.message);
});