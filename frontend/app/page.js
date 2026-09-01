"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { createPeerConnection } from "@/lib/webrtc";
import StatusBadge from "@/components/StatusBadge";

export default function MobilePage() {
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const { socketRef, connect } = useSocket("mobile");

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const createOffer = useCallback(
    async (pc, socket) => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("camera:offer", offer);
        setStatus("connecting");
      } catch (err) {
        setError("Failed to create WebRTC offer");
        setStatus("disconnected");
        cleanup();
      }
    },
    [cleanup]
  );

  const setupPeerConnection = useCallback(
    (socket, stream) => {
      const pc = createPeerConnection();
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
          setStatus("disconnected");
          cleanup();
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setStatus("disconnected");
          cleanup();
        }
      };

      return pc;
    },
    [cleanup]
  );

  const setupSocketListeners = useCallback(
    (socket, pc) => {
      socket.on("camera:answer", async (answer) => {
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (err) {
          setError("Failed to process answer");
        }
      });

      socket.on("camera:ice-candidate", async (candidate) => {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          setError("Failed to add ICE candidate");
        }
      });

      socket.on("camera:peer-joined", (role) => {
        if (role === "admin" && pc.signalingState === "stable" && streamRef.current) {
          createOffer(pc, socket);
        }
      });

      socket.on("camera:peer-disconnected", (role) => {
        if (role === "admin") {
          setStatus("waiting");

          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }

          if (streamRef.current) {
            const newPc = setupPeerConnection(socket, streamRef.current);
            setStatus("waiting");

            const adminCheck = () => {
              socket.off("camera:peer-joined", adminCheck);
            };
          }
        }
      });

      socket.on("connect_error", () => {
        setError("Cannot connect to signaling server");
        setStatus("disconnected");
      });
    },
    [createOffer, setupPeerConnection]
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
      }

      const socket = connect();
      const pc = setupPeerConnection(socket, stream);
      setupSocketListeners(socket, pc);

      socket.on("connect", () => {
        socket.emit("camera:join", "mobile");
        setStatus("waiting");
        createOffer(pc, socket);
      });

      if (socket.connected) {
        setStatus("waiting");
        createOffer(pc, socket);
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError("Camera permission denied");
      } else if (err.name === "NotFoundError") {
        setError("No camera device found");
      } else if (err.name === "NotReadableError") {
        setError("Camera is in use by another application");
      } else {
        setError("Failed to access camera");
      }
      setStatus("disconnected");
    }
  }, [connect, setupPeerConnection, setupSocketListeners, createOffer]);

  const stopCamera = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit("camera:disconnect");
    }
    cleanup();
    setStatus("stopped");
    setError(null);
  }, [socketRef, cleanup]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const socket = socketRef.current;
      if (socket) {
        socket.emit("camera:disconnect");
      }
      cleanup();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [socketRef, cleanup]);

  const isCameraActive =
    status === "waiting" ||
    status === "connecting" ||
    status === "connected";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Camera</h1>
          <StatusBadge status={status} />
        </div>

        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={startCamera}
            disabled={isCameraActive}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Camera
          </button>
          <button
            onClick={stopCamera}
            disabled={!isCameraActive}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-zinc-300 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Stop Camera
          </button>
        </div>
      </div>
    </main>
  );
}
