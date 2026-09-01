const STATUS_CONFIG = {
  disconnected: { label: "Disconnected", color: "bg-zinc-500" },
  waiting: { label: "Waiting for admin", color: "bg-amber-500" },
  connecting: { label: "Connecting", color: "bg-blue-500" },
  connected: { label: "Connected", color: "bg-emerald-500" },
  stopped: { label: "Camera stopped", color: "bg-zinc-500" },
  "waiting-mobile": { label: "Waiting for mobile...", color: "bg-amber-500" },
  "mobile-connected": { label: "Mobile connected", color: "bg-emerald-500" },
  error: { label: "Error", color: "bg-red-500" },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${config.color}`}
      />
      <span className="text-sm text-zinc-400">{config.label}</span>
    </div>
  );
}
