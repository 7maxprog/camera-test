"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket, disconnectSocket } from "@/lib/socket";

export function useSocket(role) {
  const socketRef = useRef(null);

  const connect = useCallback(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("camera:join", role);
    return socket;
  }, [role]);

  useEffect(() => {
    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, []);

  return { socketRef, connect };
}
