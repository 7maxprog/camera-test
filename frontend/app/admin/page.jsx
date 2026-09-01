"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io } from "socket.io-client";

const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

export default function AdminPage() {
  const [status, setStatus] = useState("waiting");
  const [error, setError] = useState(null);

  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceQueueRef = useRef([]);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    iceQueueRef.current = [];
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const handleOffer = useCallback(
    async (offer, socket) => {
      try {
        cleanupPeer();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0] && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.play().catch(() => {});
            setStatus("connected");
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("camera:ice-candidate", event.candidate);
          }
        };

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          if (state === "connected" || state === "completed") {
            setStatus("connected");
          } else if (state === "disconnected" || state === "failed") {
            setStatus("waiting");
            cleanupPeer();
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        while (iceQueueRef.current.length > 0) {
          const candidate = iceQueueRef.current.shift();
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("camera:answer", answer);
      } catch {
        setError("Failed to process offer");
        setStatus("waiting");
      }
    },
    [cleanupPeer]
  );

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("camera:disconnect");
    }
    cleanupPeer();
    setStatus("waiting");
    setError(null);
  }, [cleanupPeer]);

  useEffect(() => {
    const signalingUrl =
      process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

    const socket = io(signalingUrl, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("camera:join", "admin");
      setStatus("waiting");
    });

    socket.on("camera:offer", (offer) => {
      handleOffer(offer, socket);
    });

    socket.on("camera:ice-candidate", async (candidate) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceQueueRef.current.push(candidate);
        }
      } catch {
        setError("Failed to add ICE candidate");
      }
    });

    socket.on("camera:peer-disconnected", (role) => {
      if (role === "mobile") {
        setStatus("waiting");
        cleanupPeer();
      }
    });

    socket.on("connect_error", () => {
      setError("Cannot connect to signaling server");
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("camera:disconnect");
        socketRef.current.disconnect();
      }
      cleanupPeer();
    };
  }, [handleOffer, cleanupPeer]);

  const isConnected = status === "connected";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="text-sm text-zinc-400">
                {isConnected ? "Mobile connected" : "Waiting for mobile..."}
              </span>
            </div>
          </div>

          {isConnected && (
            <button
              onClick={disconnect}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-opacity hover:opacity-90 cursor-pointer"
            >
              Disconnect
            </button>
          )}
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${isConnected ? "block" : "hidden"}`}
          />
          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-zinc-500">Waiting for mobile...</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
