"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { createPeerConnection } from "@/lib/webrtc";
import StatusBadge from "@/components/StatusBadge";

export default function AdminPage() {
  const [status, setStatus] = useState("waiting-mobile");
  const [error, setError] = useState(null);

  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const { socketRef, connect } = useSocket("admin");

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const handleOffer = useCallback(
    async (offer, socket) => {
      try {
        cleanup();

        const pc = createPeerConnection();
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setStatus("mobile-connected");
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
            setStatus("mobile-connected");
          } else if (state === "disconnected" || state === "failed") {
            setStatus("waiting-mobile");
            cleanup();
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            setStatus("waiting-mobile");
            cleanup();
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("camera:answer", answer);

        setStatus("mobile-connected");
      } catch (err) {
        setError("Failed to process WebRTC offer");
        setStatus("waiting-mobile");
      }
    },
    [cleanup]
  );

  const setupSocketListeners = useCallback(
    (socket) => {
      socket.on("camera:offer", (offer) => {
        handleOffer(offer, socket);
      });

      socket.on("camera:ice-candidate", async (candidate) => {
        try {
          const pc = peerConnectionRef.current;
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          setError("Failed to add ICE candidate");
        }
      });

      socket.on("camera:peer-disconnected", (role) => {
        if (role === "mobile") {
          setStatus("waiting-mobile");
          cleanup();
        }
      });

      socket.on("connect_error", () => {
        setError("Cannot connect to signaling server");
      });
    },
    [handleOffer, cleanup]
  );

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit("camera:disconnect");
    }
    cleanup();
    setStatus("waiting-mobile");
    setError(null);
  }, [socketRef, cleanup]);

  useEffect(() => {
    const socket = connect();
    setupSocketListeners(socket);

    return () => {
      const s = socketRef.current;
      if (s) {
        s.emit("camera:disconnect");
      }
      cleanup();
    };
  }, [connect, setupSocketListeners, socketRef, cleanup]);

  const isConnected = status === "mobile-connected";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <StatusBadge status={status} />
          </div>

          {isConnected && (
            <button
              onClick={disconnect}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-300 transition-opacity hover:opacity-90"
            >
              Disconnect
            </button>
          )}
        </div>

        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface">
          {isConnected ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                {status === "waiting-mobile"
                  ? "Waiting for mobile..."
                  : "Connecting..."}
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
