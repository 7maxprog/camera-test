import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "*";

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", activeRooms: rooms.size, totalSockets: socketData.size });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// socketId -> { role: "admin" | "mobile", roomId: string }
const socketData = new Map();

// roomId -> { admin: socketId, mobile: socketId }
const rooms = new Map();

function getRoomId(data, socketId) {
  if (data && typeof data === "object" && data.roomId) {
    return String(data.roomId).trim();
  }
  const existing = socketData.get(socketId);
  return existing?.roomId || "default";
}

function handleDisconnect(socket) {
  const sData = socketData.get(socket.id);
  if (!sData) return;

  const { role, roomId } = sData;
  socketData.delete(socket.id);

  const room = rooms.get(roomId);
  if (room) {
    if (room[role] === socket.id) {
      delete room[role];
    }
    if (!room.admin && !room.mobile) {
      rooms.delete(roomId);
    }
    io.to(`room-${roomId}`).emit("camera:peer-disconnected", { role, roomId });
  }

  socket.leave(`room-${roomId}`);
}

io.on("connection", (socket) => {
  socket.on("camera:join", (payload) => {
    // payload can be "admin" | "mobile" or { role: "admin" | "mobile", roomId: string }
    const role = typeof payload === "string" ? payload : payload?.role || "mobile";
    const roomId = (typeof payload === "object" && payload?.roomId ? String(payload.roomId) : "default").trim();

    // Clean up if this socket was in another room
    const existing = socketData.get(socket.id);
    if (existing && existing.roomId !== roomId) {
      handleDisconnect(socket);
    }

    socketData.set(socket.id, { role, roomId });
    socket.join(`room-${roomId}`);

    const room = rooms.get(roomId) || {};
    // If another socket claimed this role in the room, replace it
    room[role] = socket.id;
    rooms.set(roomId, room);

    const targetRole = role === "mobile" ? "admin" : "mobile";
    const otherSocketId = room[targetRole];

    if (otherSocketId) {
      io.to(otherSocketId).emit("camera:peer-joined", { role, roomId });
      socket.emit("camera:peer-joined", { role: targetRole, roomId });
    }
  });

  socket.on("camera:offer", (payload) => {
    // payload can be offer or { roomId, offer }
    const offer = payload?.offer || payload;
    const roomId = getRoomId(payload, socket.id);
    const room = rooms.get(roomId);

    if (room?.admin) {
      io.to(room.admin).emit("camera:offer", { roomId, offer });
    }
  });

  socket.on("camera:answer", (payload) => {
    // payload can be answer or { roomId, answer }
    const answer = payload?.answer || payload;
    const roomId = getRoomId(payload, socket.id);
    const room = rooms.get(roomId);

    if (room?.mobile) {
      io.to(room.mobile).emit("camera:answer", { roomId, answer });
    }
  });

  socket.on("camera:ice-candidate", (payload) => {
    // payload can be candidate or { roomId, candidate }
    const candidate = payload?.candidate !== undefined ? payload.candidate : payload;
    const roomId = getRoomId(payload, socket.id);
    const sData = socketData.get(socket.id);
    const targetRole = sData?.role === "mobile" ? "admin" : "mobile";
    const room = rooms.get(roomId);

    if (room && room[targetRole]) {
      io.to(room[targetRole]).emit("camera:ice-candidate", { roomId, candidate });
    }
  });

  socket.on("camera:disconnect", () => {
    handleDisconnect(socket);
  });

  socket.on("disconnect", () => {
    handleDisconnect(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
