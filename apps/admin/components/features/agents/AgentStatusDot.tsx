import { clsx } from "clsx";

export type AgentHealthStatus = "healthy" | "degraded" | "error" | "disabled";

interface AgentStatusDotProps {
  status: AgentHealthStatus;
  className?: string;
}

const STATUS_STYLES: Record<AgentHealthStatus, string> = {
  healthy: "bg-success-500",
  degraded: "bg-warning-500 animate-pulse",
  error: "bg-danger-500 animate-pulse",
  disabled: "bg-surface-300",
};

const STATUS_LABELS: Record<AgentHealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  error: "Error",
  disabled: "Disabled",
};

export function AgentStatusDot({ status, className }: AgentStatusDotProps) {
  return (
    <span
      className={clsx("inline-block h-2.5 w-2.5 rounded-full", STATUS_STYLES[status], className)}
      role="status"
      aria-label={STATUS_LABELS[status]}
    />
  );
}
