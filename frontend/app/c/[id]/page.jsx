"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { io } from "socket.io-client";
import { Video, VideoOff, Camera, AlertCircle } from "lucide-react";

const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

export default function MobileCameraRoomPage({ params }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams?.id || "default";

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceQueueRef = useRef([]);
  const isAdminOnlineRef = useRef(false);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    iceQueueRef.current = [];
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const startStreaming = useCallback(async () => {
    const stream = streamRef.current;
    const socket = socketRef.current;
    if (!stream || !socket) return;

    try {
      cleanupPeer();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("camera:ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === "failed" || state === "closed") {
          cleanupPeer();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("camera:offer", { roomId, offer });
    } catch (err) {
      console.error("Error creating WebRTC offer:", err);
    }
  }, [cleanupPeer, roomId]);

  // Socket connection lifecycle (runs once per roomId)
  useEffect(() => {
    const signalingUrl =
      process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

    const socket = io(signalingUrl, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("camera:join", { role: "mobile", roomId });
    });

    socket.on("camera:peer-joined", (payload) => {
      const role = typeof payload === "string" ? payload : payload?.role;
      const eventRoomId = payload?.roomId;

      if ((!eventRoomId || eventRoomId === roomId) && role === "admin") {
        isAdminOnlineRef.current = true;
        if (streamRef.current) {
          startStreaming();
        }
      }
    });

    socket.on("camera:answer", async (payload) => {
      const answer = payload?.answer || payload;
      const eventRoomId = payload?.roomId;

      if (eventRoomId && eventRoomId !== roomId) return;

      try {
        const pc = peerConnectionRef.current;
        if (pc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          while (iceQueueRef.current.length > 0) {
            const candidate = iceQueueRef.current.shift();
            if (candidate) {
              await pc
                .addIceCandidate(new RTCIceCandidate(candidate))
                .catch((e) => console.warn("Failed adding queued ICE candidate", e));
            }
          }
        }
      } catch (err) {
        console.error("Failed to process answer:", err);
      }
    });

    socket.on("camera:ice-candidate", async (payload) => {
      const candidate =
        payload?.candidate !== undefined ? payload.candidate : payload;
      const eventRoomId = payload?.roomId;

      if (eventRoomId && eventRoomId !== roomId) return;
      if (!candidate) return;

      try {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc
            .addIceCandidate(new RTCIceCandidate(candidate))
            .catch((e) => console.warn("Failed adding ICE candidate", e));
        } else {
          iceQueueRef.current.push(candidate);
        }
      } catch (err) {
        console.warn("ICE candidate error:", err);
      }
    });

    socket.on("camera:peer-disconnected", (payload) => {
      const role = typeof payload === "string" ? payload : payload?.role;
      const eventRoomId = payload?.roomId;

      if ((!eventRoomId || eventRoomId === roomId) && role === "admin") {
        isAdminOnlineRef.current = false;
        cleanupPeer();
      }
    });

    return () => {
      socket.emit("camera:disconnect", { roomId });
      socket.disconnect();
      cleanupPeer();
      cleanupStream();
    };
  }, [roomId, startStreaming, cleanupPeer, cleanupStream]);

  const startCamera = async () => {
    setError(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream;
      try {
        // Request Front Camera (user-facing)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback constraint
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      }

      streamRef.current = stream;
      setIsActive(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      if (socketRef.current) {
        socketRef.current.emit("camera:join", { role: "mobile", roomId });
        if (isAdminOnlineRef.current) {
          startStreaming();
        }
      }
    } catch (err) {
      console.error("Camera access error:", err);
      if (err.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access in browser.");
      } else if (err.name === "NotFoundError") {
        setError("No front camera found on this device.");
      } else {
        setError("Could not open front camera.");
      }
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    cleanupPeer();
    cleanupStream();
    if (socketRef.current) {
      socketRef.current.emit("camera:disconnect", { roomId });
    }
    setError(null);
  };

  return (
    <main className="h-[100dvh] w-full bg-black text-white flex flex-col p-4 sm:p-6 max-w-lg mx-auto select-none overflow-hidden">
      {/* Video Preview Container - fully responsive flex-1 */}
      <div className="flex-1 w-full relative rounded-3xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl flex items-center justify-center min-h-0">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover scale-x-[-1] ${isActive ? "block" : "hidden"}`}
        />

        {!isActive && (
          <div className="text-center p-6 space-y-2">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center text-zinc-600">
              <Camera className="h-7 w-7" />
            </div>
            <p className="text-zinc-500 text-sm font-medium">
              Camera preview
            </p>
          </div>
        )}
      </div>

      {/* Error Notice if any */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Action Buttons Bar */}
      <div className="flex gap-3 pt-4 shrink-0">
        <button
          onClick={startCamera}
          disabled={isActive}
          className="flex-1 py-4 px-4 rounded-2xl bg-white hover:bg-zinc-200 active:scale-[0.98] text-black font-semibold text-base transition-all flex items-center justify-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg cursor-pointer"
        >
          <Video className="h-5 w-5" />
          <span>Start</span>
        </button>

        <button
          onClick={stopCamera}
          disabled={!isActive}
          className="flex-1 py-4 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] border border-zinc-800 text-white font-semibold text-base transition-all flex items-center justify-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <VideoOff className="h-5 w-5 text-zinc-400" />
          <span>Stop</span>
        </button>
      </div>
    </main>
  );
}
