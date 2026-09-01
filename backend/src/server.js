import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import setupSignaling from "./socket/signaling.js";

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const app = express();

app.use(cors({ origin: CLIENT_URL }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

setupSignaling(io);

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
