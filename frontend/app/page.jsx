"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Link as LinkIcon,
  Shield,
  ArrowRight,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import MobileCameraRoomPage from "./c/[id]/page";

function MainCameraComponent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") || searchParams.get("id");
  const router = useRouter();
  const [inputRoomId, setInputRoomId] = useState("");

  if (sessionId) {
    return <MobileCameraRoomPage params={Promise.resolve({ id: sessionId })} />;
  }

  const handleJoin = (e) => {
    e.preventDefault();
    const clean = inputRoomId.trim();
    if (clean) {
      router.push(`/c/${encodeURIComponent(clean)}`);
    }
  };

  const handleCreateNewSession = () => {
    const randomId = "cam-" + Math.random().toString(36).substring(2, 8);
    router.push(`/c/${randomId}`);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 items-center justify-center shadow-xl shadow-indigo-500/20 mb-2">
            <Camera className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Live Camera Stream</h1>
          <p className="text-sm text-zinc-400">
            Real-time, peer-to-peer WebRTC camera streaming.
          </p>
        </div>

        {/* Join by ID Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-xl p-5 space-y-4 shadow-xl">
          <form onSubmit={handleJoin} className="space-y-3">
            <label className="block text-xs font-medium text-zinc-400">
              Have a Camera Link or Session ID?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="e.g. cam-a1b2c3"
                className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              />
              <button
                type="submit"
                disabled={!inputRoomId.trim()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                Join
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-zinc-800 w-full" />
            <span className="bg-zinc-900 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500 shrink-0">
              or
            </span>
          </div>

          <button
            onClick={handleCreateNewSession}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Start Instant Camera Session
          </button>
        </div>

        {/* Admin Navigation link */}
        <div className="flex justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-2 px-3 rounded-lg hover:bg-zinc-900"
          >
            <LayoutDashboard className="h-4 w-4 text-zinc-500" />
            Open Admin Monitor Panel
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function MobileCameraPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
          Loading camera...
        </div>
      }
    >
      <MainCameraComponent />
    </Suspense>
  );
}
