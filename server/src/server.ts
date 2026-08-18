import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { currentRoomTime, makeRoomId, rooms } from "./rooms.js";

const PORT = Number(process.env.PORT || 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/rooms", (_req, res) => {
  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();

  rooms.set(id, {
    id,
    playing: false,
    time: 0,
    updatedAt: Date.now()
  });

  res.json({ roomId: id });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });

  res.json({
    id: room.id,
    fileName: room.fileName || null,
    hasFile: Boolean(room.fileId),
    playing: room.playing,
    time: currentRoomTime(room)
  });
});

app.post("/api/rooms/:roomId/file", (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });

  const { fileId, fileName, accessToken } = req.body ?? {};

  if (!fileId || !accessToken) {
    return res.status(400).json({ error: "fileId and accessToken are required" });
  }

  room.fileId = String(fileId);
  room.fileName = String(fileName || "Google Drive video");
  room.accessToken = String(accessToken);
  room.playing = false;
  room.time = 0;
  room.updatedAt = Date.now();

  io.to(room.id).emit("file-selected", {
    fileName: room.fileName
  });

  res.json({ ok: true });
});

app.get("/api/stream/:roomId", async (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());

  if (!room?.fileId || !room.accessToken) {
    return res.status(404).end();
  }

  const range = req.headers.range;

  try {
    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(room.fileId)}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${room.accessToken}`,
          ...(range ? { Range: range } : {})
        }
      }
    );

    if (!driveResponse.ok && driveResponse.status !== 206) {
      const body = await driveResponse.text();
      console.error("Drive error:", driveResponse.status, body);
      return res.status(driveResponse.status).end();
    }

    const passHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified"
    ];

    for (const name of passHeaders) {
      const value = driveResponse.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    // Drive may omit this in some responses; browsers expect byte-range support.
    if (!res.getHeader("Accept-Ranges")) {
      res.setHeader("Accept-Ranges", "bytes");
    }

    res.status(driveResponse.status);

    if (!driveResponse.body) return res.end();

    const reader = driveResponse.body.getReader();

    req.on("close", () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }

    res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId }) => {
    roomId = String(roomId || "").toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return;

    socket.join(roomId);

    if (!room.hostSocketId) {
      room.hostSocketId = socket.id;
    }

    socket.emit("room-state", {
      roomId,
      fileName: room.fileName || null,
      hasFile: Boolean(room.fileId),
      playing: room.playing,
      time: currentRoomTime(room),
      isHost: room.hostSocketId === socket.id
    });
  });

  socket.on("play", ({ roomId, time }) => {
    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) return;

    room.playing = true;
    room.time = Number(time) || 0;
    room.updatedAt = Date.now();

    socket.to(room.id).emit("play", {
      time: room.time,
      serverTime: room.updatedAt
    });
  });

  socket.on("pause", ({ roomId, time }) => {
    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) return;

    room.playing = false;
    room.time = Number(time) || 0;
    room.updatedAt = Date.now();

    socket.to(room.id).emit("pause", { time: room.time });
  });

  socket.on("seek", ({ roomId, time, playing }) => {
    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) return;

    room.time = Number(time) || 0;
    room.playing = Boolean(playing);
    room.updatedAt = Date.now();

    socket.to(room.id).emit("seek", {
      time: room.time,
      playing: room.playing
    });
  });

  socket.on("sync", ({ roomId, time, playing }) => {
    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) return;

    room.time = Number(time) || 0;
    room.playing = Boolean(playing);
    room.updatedAt = Date.now();

    socket.to(room.id).emit("sync", {
      time: currentRoomTime(room),
      playing: room.playing
    });
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = undefined;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
