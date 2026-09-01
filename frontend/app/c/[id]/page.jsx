"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { io } from "socket.io-client";
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Radio,
  Wifi,
  WifiOff,
  AlertCircle,
  ShieldCheck,
  Zap,
  ZapOff,
} from "lucide-react";

const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

const STATUS_CONFIG = {
  disconnected: {
    label: "Disconnected",
    color: "bg-zinc-500",
    textColor: "text-zinc-400",
    borderColor: "border-zinc-700",
  },
  waiting: {
    label: "Waiting for Admin",
    color: "bg-amber-500 animate-pulse",
    textColor: "text-amber-400",
    borderColor: "border-amber-500/30",
  },
  connecting: {
    label: "Connecting...",
    color: "bg-blue-500 animate-pulse",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/30",
  },
  connected: {
    label: "Live Streaming",
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-500/30",
  },
  stopped: {
    label: "Camera Stopped",
    color: "bg-zinc-500",
    textColor: "text-zinc-400",
    borderColor: "border-zinc-700",
  },
};

export default function MobileCameraRoomPage({ params }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams?.id || "default";

  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); // back camera by default for mobile
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isAdminOnline, setIsAdminOnline] = useState(false);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceQueueRef = useRef([]);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
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
      socketRef.current.emit("camera:disconnect", { roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [cleanupPeer, roomId]);

  const startStreaming = useCallback(
    async (socket) => {
      const stream = streamRef.current;
      if (!stream || !socket) return;

      try {
        cleanupPeer();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("camera:ice-candidate", {
              roomId,
              candidate: event.candidate,
            });
          }
        };

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          if (state === "connected" || state === "completed") {
            setStatus("connected");
            setError(null);
          } else if (state === "disconnected") {
            setStatus("connecting");
          } else if (state === "failed" || state === "closed") {
            setStatus("waiting");
            cleanupPeer();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("camera:offer", { roomId, offer });
        setStatus("connecting");
      } catch (err) {
        console.error("Failed to create offer:", err);
        setError("Failed to create offer");
        setStatus("waiting");
      }
    },
    [cleanupPeer, roomId]
  );

  const startCamera = useCallback(
    async (targetFacing = facingMode) => {
      setError(null);

      try {
        // Stop any old stream first if switching
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const constraints = {
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        // Check torch capability
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities?.();
          setHasTorch(Boolean(capabilities?.torch));
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        const signalingUrl =
          process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

        let socket = socketRef.current;
        if (!socket || !socket.connected) {
          socket = io(signalingUrl, {
            transports: ["websocket", "polling"],
          });
          socketRef.current = socket;

          socket.on("connect", () => {
            socket.emit("camera:join", { role: "mobile", roomId });
            setStatus("waiting");
          });

          socket.on("camera:peer-joined", (payload) => {
            const role = typeof payload === "string" ? payload : payload?.role;
            const eventRoomId = payload?.roomId;

            if ((!eventRoomId || eventRoomId === roomId) && role === "admin") {
              setIsAdminOnline(true);
              startStreaming(socket);
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
                      .catch((e) => {
                        console.warn("Failed to add queued ICE candidate", e);
                      });
                  }
                }
              }
            } catch (err) {
              console.error("Failed to process answer:", err);
              setError("Failed to process answer");
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
                  .catch((e) => {
                    console.warn("Failed to add ICE candidate", e);
                  });
              } else {
                iceQueueRef.current.push(candidate);
              }
            } catch (err) {
              console.warn("Error handling ICE candidate:", err);
            }
          });

          socket.on("camera:peer-disconnected", (payload) => {
            const role = typeof payload === "string" ? payload : payload?.role;
            const eventRoomId = payload?.roomId;

            if ((!eventRoomId || eventRoomId === roomId) && role === "admin") {
              setIsAdminOnline(false);
              setStatus("waiting");
              cleanupPeer();
            }
          });

          socket.on("connect_error", () => {
            setError("Cannot connect to signaling server");
            setStatus("disconnected");
          });
        } else {
          // If socket already connected and admin is online, restart stream
          socket.emit("camera:join", { role: "mobile", roomId });
          if (isAdminOnline) {
            startStreaming(socket);
          }
        }
      } catch (err) {
        console.error("Camera access error:", err);
        if (err.name === "NotAllowedError") {
          setError("Camera permission was denied. Please allow camera access in browser settings.");
        } else if (err.name === "NotFoundError") {
          setError("No camera device was found on this phone.");
        } else {
          setError(`Camera error: ${err.message || "Failed to start camera"}`);
        }
        setStatus("disconnected");
      }
    },
    [facingMode, roomId, isAdminOnline, cleanupPeer, startStreaming]
  );

  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    if (isCameraActive) {
      await startCamera(nextFacing);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn("Failed to toggle torch:", err);
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("camera:disconnect", { roomId });
    }
    cleanupAll();
    setStatus("stopped");
    setError(null);
  }, [cleanupAll, roomId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socketRef.current) {
        socketRef.current.emit("camera:disconnect", { roomId });
      }
      cleanupAll();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanupAll();
    };
  }, [cleanupAll, roomId]);

  const isCameraActive =
    status === "waiting" || status === "connecting" || status === "connected";

  const currentStatus = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Header Info */}
      <header className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Camera className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Camera Feed</h1>
              <p className="text-xs text-zinc-400 font-mono">
                ID: <span className="text-zinc-200 font-medium">{roomId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs shadow-inner">
            <span className={`h-2 w-2 rounded-full ${currentStatus.color}`} />
            <span className={`font-medium ${currentStatus.textColor}`}>
              {currentStatus.label}
            </span>
          </div>
        </div>

        {/* Room & Admin connection banner */}
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center gap-2 text-zinc-400">
            {isAdminOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium">Admin is viewing</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
                <span>Admin offline</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
            <span>Encrypted WebRTC</span>
          </div>
        </div>
      </header>

      {/* Main Video Viewport */}
      <div className="relative my-4 flex-1 flex flex-col justify-center">
        <div className="relative aspect-[9/16] sm:aspect-video w-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl flex items-center justify-center">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isCameraActive ? "block" : "hidden"} ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />

          {!isCameraActive && (
            <div className="text-center p-6 space-y-3">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-zinc-500">
                <CameraOff className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-300">Camera is Inactive</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-[220px] mx-auto">
                  Tap "Start Camera" below to begin streaming live to the admin panel.
                </p>
              </div>
            </div>
          )}

          {/* On-video live indicators */}
          {status === "connected" && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-red-500/40 text-[11px] font-semibold text-red-400 tracking-wider uppercase shadow-lg">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              LIVE
            </div>
          )}

          {/* Quick Floating Controls when Camera Active */}
          {isCameraActive && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {hasTorch && (
                <button
                  onClick={toggleTorch}
                  className={`p-2.5 rounded-full backdrop-blur-md border transition-all ${
                    torchOn
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-black/50 border-white/10 text-zinc-300 hover:bg-black/70"
                  }`}
                  title="Toggle Flashlight"
                >
                  {torchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                </button>
              )}

              <button
                onClick={toggleCameraFacing}
                className="p-2.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 text-zinc-300 transition-all active:scale-95"
                title="Switch Camera (Front/Back)"
              >
                <SwitchCamera className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2.5 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="flex-1">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <footer className="space-y-3 pb-2">
        <div className="flex gap-3">
          <button
            onClick={() => startCamera()}
            disabled={isCameraActive}
            className="flex-1 py-3.5 px-4 rounded-xl bg-white text-zinc-950 font-semibold text-sm transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-white/5 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Camera className="h-4 w-4" />
            Start Camera
          </button>

          <button
            onClick={stopCamera}
            disabled={!isCameraActive}
            className="flex-1 py-3.5 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium text-sm transition-all hover:bg-zinc-800 hover:text-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            <CameraOff className="h-4 w-4" />
            Stop Camera
          </button>
        </div>

        <p className="text-[11px] text-center text-zinc-500">
          Make sure your browser has permission to access your camera.
        </p>
      </footer>
    </main>
  );
}
