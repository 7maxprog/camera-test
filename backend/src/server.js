import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "*";

const app = express();
app.use(cors({ origin: CLIENT_URL }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const peers = new Map();

function findPeerByRole(role) {
  for (const [socketId, peerRole] of peers) {
    if (peerRole === role) {
      return socketId;
    }
  }
  return null;
}

function handleDisconnect(socket) {
  const role = peers.get(socket.id);
  peers.delete(socket.id);

  if (role) {
    io.to("camera-room").emit("camera:peer-disconnected", role);
  }

  socket.leave("camera-room");
}

io.on("connection", (socket) => {
  socket.on("camera:join", (role) => {
    for (const [id, r] of peers) {
      if (r === role && id !== socket.id) {
        peers.delete(id);
      }
    }

    peers.set(socket.id, role);
    socket.join("camera-room");

    const targetRole = role === "mobile" ? "admin" : "mobile";
    const otherSocket = findPeerByRole(targetRole);

    if (otherSocket) {
      io.to(otherSocket).emit("camera:peer-joined", role);
      socket.emit("camera:peer-joined", targetRole);
    }
  });

  socket.on("camera:offer", (offer) => {
    const adminSocket = findPeerByRole("admin");
    if (adminSocket) {
      io.to(adminSocket).emit("camera:offer", offer);
    }
  });

  socket.on("camera:answer", (answer) => {
    const mobileSocket = findPeerByRole("mobile");
    if (mobileSocket) {
      io.to(mobileSocket).emit("camera:answer", answer);
    }
  });

  socket.on("camera:ice-candidate", (candidate) => {
    const senderRole = peers.get(socket.id);
    const targetRole = senderRole === "mobile" ? "admin" : "mobile";
    const targetSocket = findPeerByRole(targetRole);

    if (targetSocket) {
      io.to(targetSocket).emit("camera:ice-candidate", candidate);
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
  console.log(`Server listening on port ${PORT}`);
});
