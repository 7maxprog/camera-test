"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  Plus,
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  Maximize2,
  Minimize2,
  ExternalLink,
  Radio,
  Camera,
  RotateCcw,
  Smartphone,
  Layers,
  LayoutGrid,
  Grid3X3,
  Columns2,
  Rows3,
  AlertCircle,
  ShieldCheck,
  X,
  Share2,
} from "lucide-react";

const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

const LOCAL_STORAGE_KEY = "cam_admin_sessions_v2";

// Individual Camera Card Component
function CameraFeedCard({
  session,
  socket,
  onDelete,
  onUpdateName,
  onExpand,
}) {
  const { id: roomId, name, createdAt } = session;

  const [status, setStatus] = useState("waiting");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(name || `Camera #${roomId.slice(-4)}`);

  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceQueueRef = useRef([]);

  // Full shareable URL
  const shareUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/c/${roomId}`;
    }
    return `/c/${roomId}`;
  }, [roomId]);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    iceQueueRef.current = [];
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleOffer = useCallback(
    async (offer) => {
      if (!socket) return;
      try {
        cleanupPeer();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0] && videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play().catch(() => {});
            setStatus("connected");
            setError(null);
          } else if (event.track && videoRef.current) {
            const stream = new MediaStream([event.track]);
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
            setStatus("connected");
            setError(null);
          }
        };

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
            setStatus("waiting");
          } else if (state === "failed" || state === "closed") {
            setStatus("waiting");
            cleanupPeer();
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

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

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("camera:answer", { roomId, answer });
      } catch (err) {
        console.error(`[Room ${roomId}] Failed to process offer:`, err);
        setError("Failed to process offer from phone");
        setStatus("waiting");
      }
    },
    [socket, roomId, cleanupPeer]
  );

  useEffect(() => {
    if (!socket) return;

    // Join room as admin
    socket.emit("camera:join", { role: "admin", roomId });

    const handleOfferEvent = (payload) => {
      const eventRoomId = payload?.roomId;
      const offer = payload?.offer || payload;
      if (eventRoomId === roomId) {
        handleOffer(offer);
      }
    };

    const handleIceCandidateEvent = async (payload) => {
      const eventRoomId = payload?.roomId;
      const candidate =
        payload?.candidate !== undefined ? payload.candidate : payload;

      if (eventRoomId !== roomId || !candidate) return;

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
    };

    const handlePeerJoinedEvent = (payload) => {
      const role = typeof payload === "string" ? payload : payload?.role;
      const eventRoomId = payload?.roomId;
      if (eventRoomId === roomId && role === "mobile") {
        setError(null);
        setStatus("connecting");
      }
    };

    const handlePeerDisconnectedEvent = (payload) => {
      const role = typeof payload === "string" ? payload : payload?.role;
      const eventRoomId = payload?.roomId;
      if (eventRoomId === roomId && role === "mobile") {
        setStatus("waiting");
        cleanupPeer();
      }
    };

    socket.on("camera:offer", handleOfferEvent);
    socket.on("camera:ice-candidate", handleIceCandidateEvent);
    socket.on("camera:peer-joined", handlePeerJoinedEvent);
    socket.on("camera:peer-disconnected", handlePeerDisconnectedEvent);

    return () => {
      socket.off("camera:offer", handleOfferEvent);
      socket.off("camera:ice-candidate", handleIceCandidateEvent);
      socket.off("camera:peer-joined", handlePeerJoinedEvent);
      socket.off("camera:peer-disconnected", handlePeerDisconnectedEvent);
      cleanupPeer();
    };
  }, [socket, roomId, handleOffer, cleanupPeer]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const saveName = () => {
    setIsEditingName(false);
    if (tempName.trim() && tempName !== name) {
      onUpdateName(roomId, tempName.trim());
    }
  };

  const isConnected = status === "connected";

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-200 hover:border-zinc-700/80 hover:shadow-xl">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
              isConnected
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                : status === "connecting"
                ? "bg-blue-500 animate-pulse"
                : "bg-amber-500 animate-pulse"
            }`}
          />
          {isEditingName ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              autoFocus
              className="text-sm font-semibold bg-zinc-800 text-zinc-100 px-2 py-0.5 rounded border border-zinc-700 focus:outline-none"
            />
          ) : (
            <span
              onClick={() => setIsEditingName(true)}
              className="text-sm font-semibold text-zinc-200 truncate cursor-pointer hover:text-white transition-colors"
              title="Click to rename"
            >
              {name || `Camera #${roomId.slice(-4)}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            {roomId}
          </span>
          <button
            onClick={() => onDelete(roomId)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Delete this camera link"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Video Stream Area */}
      <div className="relative aspect-video w-full bg-zinc-950 flex items-center justify-center overflow-hidden group">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isConnected ? "block" : "hidden"}`}
        />

        {!isConnected && (
          <div className="text-center p-6 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-400">
                {status === "connecting" ? "Establishing connection..." : "Waiting for phone..."}
              </p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Open the link below on a phone camera
              </p>
            </div>
          </div>
        )}

        {/* Live Badge */}
        {isConnected && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-red-500/40 text-[10px] font-bold text-red-400 uppercase tracking-wider">
            <Radio className="h-3 w-3 animate-pulse" />
            LIVE
          </div>
        )}

        {/* Overlay Action Buttons */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isConnected && (
            <button
              onClick={() => onExpand({ roomId, name, videoRef })}
              className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-zinc-200 transition-colors cursor-pointer"
              title="Fullscreen / Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error Message if any */}
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 border-t border-red-500/20 text-red-400 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Card Action Bar */}
      <div className="p-3 bg-zinc-950/60 border-t border-zinc-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              copied
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                : "bg-white hover:bg-zinc-200 text-zinc-900"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Link
              </>
            )}
          </button>

          <a
            href={`/c/${roomId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            title="Open camera link in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState([]);
  const [socket, setSocket] = useState(null);
  const [columns, setColumns] = useState("auto"); // auto, 2, 3, 4
  const [expandedFeed, setExpandedFeed] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Load saved sessions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Default with 1 session if empty
    const defaultSession = {
      id: "cam-" + Math.random().toString(36).substring(2, 8),
      name: "Camera 1",
      createdAt: Date.now(),
    };
    setSessions([defaultSession]);
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
      } catch {
        // ignore
      }
    }
  }, [sessions]);

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Connect persistent admin socket once
  useEffect(() => {
    const signalingUrl =
      process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

    const s = io(signalingUrl, {
      transports: ["websocket", "polling"],
    });

    s.on("connect", () => {
      // Re-join all active rooms on connect or reconnect
      if (sessionsRef.current && sessionsRef.current.length > 0) {
        sessionsRef.current.forEach((sess) => {
          s.emit("camera:join", { role: "admin", roomId: sess.id });
        });
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Create a new camera link & section
  const handleCreateLink = () => {
    const nextIndex = sessions.length + 1;
    const randomSlug = Math.random().toString(36).substring(2, 8);
    const newSessionId = `cam-${randomSlug}`;

    const newSession = {
      id: newSessionId,
      name: `Camera ${nextIndex}`,
      createdAt: Date.now(),
    };

    const updated = [...sessions, newSession];
    setSessions(updated);

    if (socket && socket.connected) {
      socket.emit("camera:join", { role: "admin", roomId: newSessionId });
    }

    // Copy to clipboard immediately
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = `${origin}/c/${newSessionId}`;
    navigator.clipboard?.writeText(fullUrl);

    showToast(`Created & copied link: ${newSession.name}`);
  };

  // Delete a session
  const handleDeleteSession = (roomId) => {
    if (socket && socket.connected) {
      socket.emit("camera:disconnect", { roomId });
    }
    const updated = sessions.filter((s) => s.id !== roomId);
    setSessions(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  // Update a session name
  const handleUpdateName = (roomId, newName) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === roomId ? { ...s, name: newName } : s))
    );
  };

  // Layout grid classes based on column choice
  const gridClasses = useMemo(() => {
    if (columns === "2") return "grid-cols-1 md:grid-cols-2";
    if (columns === "3") return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    if (columns === "4")
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    // Auto responsive
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
  }, [columns]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                Admin Monitor
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {sessions.length} {sessions.length === 1 ? "Feed" : "Feeds"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Multi-camera peer-to-peer live monitoring
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Grid Layout Toggle */}
            <div className="hidden sm:flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setColumns("auto")}
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  columns === "auto"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Auto Grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setColumns("2")}
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  columns === "2"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="2 Columns"
              >
                <Columns2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setColumns("3")}
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  columns === "3"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="3 Columns"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
            </div>

            {/* CREATE LINK PRIMARY BUTTON with Lucide-React Icon */}
            <button
              onClick={handleCreateLink}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <LinkIcon className="h-4 w-4" />
              <span>Create Link</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {sessions.length === 0 ? (
          /* Empty State */
          <div className="my-16 max-w-md mx-auto text-center p-8 rounded-3xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md space-y-4">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-zinc-400">
              <Share2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-100">
                No Camera Feeds Active
              </h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Click "Create Link" to generate a unique phone camera link and start monitoring.
              </p>
            </div>
            <button
              onClick={handleCreateLink}
              className="px-5 py-2.5 rounded-xl bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Create First Link
            </button>
          </div>
        ) : (
          <div className={`grid gap-5 ${gridClasses}`}>
            {sessions.map((session) => (
              <CameraFeedCard
                key={session.id}
                session={session}
                socket={socket}
                onDelete={handleDeleteSession}
                onUpdateName={handleUpdateName}
                onExpand={setExpandedFeed}
              />
            ))}
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-medium shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Fullscreen Feed Modal Overlay */}
      {expandedFeed && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col p-4 sm:p-8">
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <h2 className="text-lg font-bold text-white">
                {expandedFeed.name}
              </h2>
              <span className="text-xs font-mono text-zinc-400 ml-2">
                ID: {expandedFeed.roomId}
              </span>
            </div>
            <button
              onClick={() => setExpandedFeed(null)}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-zinc-800">
            <video
              ref={(node) => {
                if (node && expandedFeed.videoRef?.current?.srcObject) {
                  node.srcObject = expandedFeed.videoRef.current.srcObject;
                  node.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
