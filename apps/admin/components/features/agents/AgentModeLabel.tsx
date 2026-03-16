import { clsx } from "clsx";

export type AgentMode = "auto" | "recommend" | "gated";

interface AgentModeLabelProps {
  mode: AgentMode;
}

const MODE_CONFIG: Record<AgentMode, { label: string; className: string }> = {
  auto: { label: "אוטונומי", className: "bg-success-50 text-success-700" },
  recommend: { label: "ממליץ", className: "bg-warning-50 text-warning-700" },
  gated: { label: "מבוקר", className: "bg-danger-50 text-danger-700" },
};

export function AgentModeLabel({ mode }: AgentModeLabelProps) {
  const config = MODE_CONFIG[mode];
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
