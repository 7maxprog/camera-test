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

// socketId -> Map<roomId, role>
const socketRooms = new Map();

// roomId -> { admin: socketId, mobile: socketId }
const rooms = new Map();

function getRoomId(data, socketId) {
  if (data && typeof data === "object" && data.roomId) {
    return String(data.roomId).trim();
  }
  const userRooms = socketRooms.get(socketId);
  if (userRooms && userRooms.size > 0) {
    return Array.from(userRooms.keys())[0];
  }
  return "default";
}

function handleSocketDisconnect(socket) {
  const userRooms = socketRooms.get(socket.id);
  if (!userRooms) return;

  for (const [roomId, role] of userRooms) {
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

  socketRooms.delete(socket.id);
}

io.on("connection", (socket) => {
  socket.on("camera:join", (payload) => {
    // payload: { role: "admin" | "mobile", roomId: string } or role string
    const role = typeof payload === "string" ? payload : payload?.role || "mobile";
    const roomId = (typeof payload === "object" && payload?.roomId ? String(payload.roomId) : "default").trim();

    // 1. Track in socketRooms
    let userRooms = socketRooms.get(socket.id);
    if (!userRooms) {
      userRooms = new Map();
      socketRooms.set(socket.id, userRooms);
    }
    userRooms.set(roomId, role);

    // 2. Join Socket.io room channel
    socket.join(`room-${roomId}`);

    // 3. Track in rooms registry
    let room = rooms.get(roomId);
    if (!room) {
      room = {};
      rooms.set(roomId, room);
    }
    room[role] = socket.id;

    // 4. If other peer is already in this room, notify both peers immediately
    const targetRole = role === "mobile" ? "admin" : "mobile";
    const otherSocketId = room[targetRole];

    if (otherSocketId) {
      io.to(otherSocketId).emit("camera:peer-joined", { role, roomId });
      socket.emit("camera:peer-joined", { role: targetRole, roomId });
    }
  });

  socket.on("camera:leave", (payload) => {
    const roomId = (typeof payload === "object" && payload?.roomId ? String(payload.roomId) : "default").trim();
    const userRooms = socketRooms.get(socket.id);
    const role = userRooms?.get(roomId) || payload?.role || "admin";

    if (userRooms) {
      userRooms.delete(roomId);
      if (userRooms.size === 0) {
        socketRooms.delete(socket.id);
      }
    }

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
  });

  socket.on("camera:offer", (payload) => {
    const offer = payload?.offer || payload;
    const roomId = getRoomId(payload, socket.id);
    const room = rooms.get(roomId);

    if (room?.admin) {
      io.to(room.admin).emit("camera:offer", { roomId, offer });
    }
  });

  socket.on("camera:answer", (payload) => {
    const answer = payload?.answer || payload;
    const roomId = getRoomId(payload, socket.id);
    const room = rooms.get(roomId);

    if (room?.mobile) {
      io.to(room.mobile).emit("camera:answer", { roomId, answer });
    }
  });

  socket.on("camera:ice-candidate", (payload) => {
    const candidate = payload?.candidate !== undefined ? payload.candidate : payload;
    const roomId = getRoomId(payload, socket.id);
    const userRooms = socketRooms.get(socket.id);
    const role = userRooms?.get(roomId) || (payload?.role ? payload.role : "mobile");
    const targetRole = role === "mobile" ? "admin" : "mobile";
    const room = rooms.get(roomId);

    if (room && room[targetRole]) {
      io.to(room[targetRole]).emit("camera:ice-candidate", { roomId, candidate });
    }
  });

  socket.on("camera:disconnect", (payload) => {
    const roomId = payload?.roomId;
    if (roomId) {
      const userRooms = socketRooms.get(socket.id);
      const role = userRooms?.get(roomId) || payload?.role || "mobile";
      if (userRooms) {
        userRooms.delete(roomId);
      }
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
    } else {
      handleSocketDisconnect(socket);
    }
  });

  socket.on("disconnect", () => {
    handleSocketDisconnect(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
