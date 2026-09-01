export default function setupSignaling(io) {
  const peers = new Map();

  io.on("connection", (socket) => {
    socket.on("camera:join", (role) => {
      peers.set(socket.id, role);
      socket.join("camera-room");

      const otherSocket = findPeerByRole(
        peers,
        role === "mobile" ? "admin" : "mobile"
      );

      if (otherSocket) {
        io.to(otherSocket).emit("camera:peer-joined", role);
      }
    });

    socket.on("camera:offer", (offer) => {
      const adminSocket = findPeerByRole(peers, "admin");
      if (adminSocket) {
        io.to(adminSocket).emit("camera:offer", offer);
      }
    });

    socket.on("camera:answer", (answer) => {
      const mobileSocket = findPeerByRole(peers, "mobile");
      if (mobileSocket) {
        io.to(mobileSocket).emit("camera:answer", answer);
      }
    });

    socket.on("camera:ice-candidate", (candidate) => {
      const senderRole = peers.get(socket.id);
      const targetRole = senderRole === "mobile" ? "admin" : "mobile";
      const targetSocket = findPeerByRole(peers, targetRole);

      if (targetSocket) {
        io.to(targetSocket).emit("camera:ice-candidate", candidate);
      }
    });

    socket.on("camera:disconnect", () => {
      handleDisconnect(io, peers, socket);
    });

    socket.on("disconnect", () => {
      handleDisconnect(io, peers, socket);
    });
  });
}

function findPeerByRole(peers, role) {
  for (const [socketId, peerRole] of peers) {
    if (peerRole === role) {
      return socketId;
    }
  }
  return null;
}

function handleDisconnect(io, peers, socket) {
  const role = peers.get(socket.id);
  peers.delete(socket.id);

  if (role) {
    io.to("camera-room").emit("camera:peer-disconnected", role);
  }

  socket.leave("camera-room");
}
