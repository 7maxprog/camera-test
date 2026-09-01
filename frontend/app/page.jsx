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

const STATUS_LABELS = {
  disconnected: "Disconnected",
  waiting: "Waiting for admin",
  connecting: "Connecting",
  connected: "Connected",
  stopped: "Camera stopped",
};

const STATUS_COLORS = {
  disconnected: "bg-zinc-500",
  waiting: "bg-amber-500",
  connecting: "bg-blue-500",
  connected: "bg-emerald-500",
  stopped: "bg-zinc-500",
};

export default function MobileCameraPage() {
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceQueueRef = useRef([]);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    iceQueueRef.current = [];
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupPeer();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [cleanupPeer]);

  const startStreaming = useCallback(
    async (socket) => {
      const stream = streamRef.current;
      if (!stream) return;

      try {
        cleanupPeer();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

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

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("camera:offer", offer);
        setStatus("connecting");
      } catch {
        setError("Failed to create offer");
        setStatus("waiting");
      }
    },
    [cleanupPeer]
  );

  const startCamera = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      streamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const signalingUrl =
        process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

      const socket = io(signalingUrl, {
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("camera:join", "mobile");
        setStatus("waiting");
        startStreaming(socket);
      });

      socket.on("camera:answer", async (answer) => {
        try {
          const pc = peerConnectionRef.current;
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            while (iceQueueRef.current.length > 0) {
              const candidate = iceQueueRef.current.shift();
              await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            }
          }
        } catch {
          setError("Failed to process answer");
        }
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

      socket.on("camera:peer-joined", (role) => {
        if (role === "admin") {
          startStreaming(socket);
        }
      });

      socket.on("camera:peer-disconnected", (role) => {
        if (role === "admin") {
          setStatus("waiting");
          cleanupPeer();
        }
      });

      socket.on("connect_error", () => {
        setError("Cannot connect to signaling server");
        setStatus("disconnected");
      });
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError("Camera permission denied");
      } else if (err.name === "NotFoundError") {
        setError("No camera device found");
      } else {
        setError("Failed to access camera");
      }
      setStatus("disconnected");
    }
  }, [cleanupPeer, startStreaming]);

  const stopCamera = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("camera:disconnect");
    }
    cleanupAll();
    setStatus("stopped");
    setError(null);
  }, [cleanupAll]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socketRef.current) {
        socketRef.current.emit("camera:disconnect");
      }
      cleanupAll();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanupAll();
    };
  }, [cleanupAll]);

  const isCameraActive =
    status === "waiting" ||
    status === "connecting" ||
    status === "connected";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Camera</h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.disconnected}`}
            />
            <span className="text-sm text-zinc-400">
              {STATUS_LABELS[status] || STATUS_LABELS.disconnected}
            </span>
          </div>
        </div>

        <div className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={startCamera}
            disabled={isCameraActive}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Start Camera
          </button>
          <button
            onClick={stopCamera}
            disabled={!isCameraActive}
            className="flex-1 rounded-lg border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Stop Camera
          </button>
        </div>
      </div>
    </main>
  );
}
