"use client";

import { clsx } from "clsx";
import { X, Save } from "lucide-react";
import { useCallback, useState } from "react";

import type { AgentMode } from "./AgentModeLabel";

export interface AgentConfig {
  id: string;
  name: string;
  mode: AgentMode;
  enabled: boolean;
  temperature: number;
  customPrompt: string;
}

interface AgentConfigPanelProps {
  agent: AgentConfig | null;
  open: boolean;
  onClose: () => void;
  onSave: (config: AgentConfig) => void;
}

const MODE_OPTIONS: { value: AgentMode; label: string }[] = [
  { value: "auto", label: "אוטונומי (Auto)" },
  { value: "recommend", label: "ממליץ (Recommend)" },
  { value: "gated", label: "מבוקר (Gated)" },
];

function AgentConfigForm({
  agent,
  onClose,
  onSave,
}: {
  agent: AgentConfig;
  onClose: () => void;
  onSave: (config: AgentConfig) => void;
}) {
  const [draft, setDraft] = useState<AgentConfig>(() => ({ ...agent }));

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className={clsx(
          "fixed inset-y-0 end-0 z-50 w-full max-w-md bg-white shadow-xl",
          "flex flex-col transition-transform duration-300 translate-x-0",
        )}
        role="dialog"
        aria-label={`Configure ${draft.name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">
            Configure: {draft.name}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Mode */}
          <div>
            <label htmlFor="agent-mode" className="block text-sm font-medium text-surface-700 mb-1.5">
              Autonomy Mode
            </label>
            <select
              id="agent-mode"
              className="input"
              value={draft.mode}
              onChange={(e) => setDraft({ ...draft, mode: e.target.value as AgentMode })}
            >
              {MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Enabled toggle - custom switch, label uses aria-labelledby for a11y */}
          <div className="flex items-center justify-between" role="group" aria-labelledby="agent-enabled-label">
            <span id="agent-enabled-label" className="text-sm font-medium text-surface-700">
              Enabled
            </span>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                draft.enabled ? "bg-primary-600" : "bg-surface-300",
              )}
              role="switch"
              aria-checked={draft.enabled}
              aria-labelledby="agent-enabled-label"
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                  draft.enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>

          {/* Temperature */}
          <div>
            <label htmlFor="agent-temperature" className="block text-sm font-medium text-surface-700 mb-1.5">
              Temperature: {draft.temperature.toFixed(2)}
            </label>
            <input
              id="agent-temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: parseFloat(e.target.value) })}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-[10px] text-surface-400 mt-1">
              <span>Precise (0.0)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Custom prompt */}
          <div>
            <label htmlFor="agent-prompt" className="block text-sm font-medium text-surface-700 mb-1.5">
              Custom System Prompt
            </label>
            <textarea
              id="agent-prompt"
              className="input min-h-[120px] resize-y"
              value={draft.customPrompt}
              onChange={(e) => setDraft({ ...draft, customPrompt: e.target.value })}
              placeholder="Override the default system prompt for this agent..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-200">
          <button onClick={handleSave} className="btn-primary flex-1 justify-center">
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

export function AgentConfigPanel({ agent, open, onClose, onSave }: AgentConfigPanelProps) {
  if (!open || !agent) return null;
  return <AgentConfigForm key={agent.id} agent={agent} onClose={onClose} onSave={onSave} />;
}
