"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Settings,
  Bell,
  Bot,
  ShieldCheck,
  Globe,
  Mail,
  MessageSquare,
  Smartphone,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "general" | "notifications" | "agents" | "security";

interface GeneralSettings {
  platformName: string;
  supportEmail: string;
  defaultLanguage: "he" | "en";
}

interface NotificationSettings {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  templates: string[];
}

interface AgentConfig {
  key: string;
  name: string;
  enabled: boolean;
  confidenceThreshold: number;
  temperature: number;
}

interface SecuritySettings {
  rateLimitPerUser: number;
  jwtExpiryMinutes: number;
  enforce2FA: boolean;
  corsOrigins: string;
}

interface SystemSettings {
  general: GeneralSettings;
  notifications: NotificationSettings;
  agents: AgentConfig[];
  security: SecuritySettings;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  { key: "router", name: "Router", enabled: true, confidenceThreshold: 0.85, temperature: 0.3 },
  { key: "matching", name: "Matching", enabled: true, confidenceThreshold: 0.8, temperature: 0.4 },
  { key: "pricing", name: "Pricing", enabled: true, confidenceThreshold: 0.75, temperature: 0.5 },
  { key: "vetting", name: "Vetting", enabled: true, confidenceThreshold: 0.9, temperature: 0.2 },
  { key: "support", name: "Support", enabled: true, confidenceThreshold: 0.7, temperature: 0.6 },
  { key: "outreach", name: "Outreach", enabled: true, confidenceThreshold: 0.75, temperature: 0.5 },
  { key: "analytics", name: "Analytics", enabled: true, confidenceThreshold: 0.8, temperature: 0.3 },
  { key: "architecture", name: "Architecture", enabled: true, confidenceThreshold: 0.85, temperature: 0.3 },
];

const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    platformName: "Groupio",
    supportEmail: "support@groupio.co.il",
    defaultLanguage: "he",
  },
  notifications: {
    emailEnabled: true,
    whatsappEnabled: true,
    pushEnabled: false,
    templates: ["welcome", "offer_created", "match_found", "payment_confirmation"],
  },
  agents: DEFAULT_AGENTS,
  security: {
    rateLimitPerUser: 100,
    jwtExpiryMinutes: 60,
    enforce2FA: true,
    corsOrigins: "https://app.groupio.co.il\nhttps://admin.groupio.co.il",
  },
};

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "General", icon: Globe },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "security", label: "Security", icon: ShieldCheck },
];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchSettings(): Promise<SystemSettings> {
  const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

async function saveSettings(settings: SystemSettings): Promise<SystemSettings> {
  const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---- Data fetching ----
  const { data: serverSettings, isLoading, error: fetchError } = useQuery<SystemSettings>({
    queryKey: ["admin", "settings"],
    queryFn: fetchSettings,
    retry: 1,
  });

  // Sync server data into local state
  useEffect(() => {
    if (serverSettings) {
      // Use a microtask to avoid synchronous setState during render
      queueMicrotask(() => setSettings(serverSettings));
    }
  }, [serverSettings]);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate(settings);
  }, [settings, saveMutation]);

  // ---- Helpers to update nested state ----
  const updateGeneral = useCallback(
    (patch: Partial<GeneralSettings>) => {
      setSettings((s) => ({ ...s, general: { ...s.general, ...patch } }));
    },
    []
  );

  const updateNotifications = useCallback(
    (patch: Partial<NotificationSettings>) => {
      setSettings((s) => ({
        ...s,
        notifications: { ...s.notifications, ...patch },
      }));
    },
    []
  );

  const updateAgent = useCallback(
    (key: string, patch: Partial<Omit<AgentConfig, "key" | "name">>) => {
      setSettings((s) => ({
        ...s,
        agents: s.agents.map((a) =>
          a.key === key ? { ...a, ...patch } : a
        ),
      }));
    },
    []
  );

  const updateSecurity = useCallback(
    (patch: Partial<SecuritySettings>) => {
      setSettings((s) => ({ ...s, security: { ...s.security, ...patch } }));
    },
    []
  );

  // ---- Toggle helper component ----
  function Toggle({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  }) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-surface-700">{label}</span>
        <button
          onClick={() => onChange(!checked)}
          className={clsx(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
            checked ? "bg-primary-600" : "bg-surface-300"
          )}
          role="switch"
          aria-checked={checked}
          aria-label={label}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
              checked ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">
            System Settings
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Configure platform settings, notifications, agents, and security
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Saved successfully
            </span>
          )}
          <button
            className="btn-secondary"
            onClick={() => setSettings(serverSettings || DEFAULT_SETTINGS)}
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {(fetchError || saveMutation.isError) && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200">
          <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger-700">
            {saveMutation.isError
              ? "Failed to save settings. Please try again."
              : "Failed to load settings. Using defaults."}
          </p>
        </div>
      )}

      {/* ================================================================== */}
      {/* Tabs                                                               */}
      {/* ================================================================== */}
      <div className="flex items-center gap-1 border-b border-surface-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* Tab Content                                                        */}
      {/* ================================================================== */}
      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          <span className="ml-2 text-sm text-surface-500">
            Loading settings...
          </span>
        </div>
      ) : (
        <div className="card p-6">
          {/* -------------------------------------------------------------- */}
          {/* General Tab                                                     */}
          {/* -------------------------------------------------------------- */}
          {activeTab === "general" && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-sm font-semibold text-surface-900">
                General Settings
              </h2>

              <div>
                <label htmlFor="platform-name" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Platform Name
                </label>
                <input
                  id="platform-name"
                  type="text"
                  className="input"
                  value={settings.general.platformName}
                  onChange={(e) =>
                    updateGeneral({ platformName: e.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="support-email" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Support Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    id="support-email"
                    type="email"
                    className="input pl-9"
                    value={settings.general.supportEmail}
                    onChange={(e) =>
                      updateGeneral({ supportEmail: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label htmlFor="default-language" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Default Language
                </label>
                <select
                  id="default-language"
                  className="input"
                  value={settings.general.defaultLanguage}
                  onChange={(e) =>
                    updateGeneral({
                      defaultLanguage: e.target.value as "he" | "en",
                    })
                  }
                >
                  <option value="he">Hebrew (עברית)</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Notifications Tab                                               */}
          {/* -------------------------------------------------------------- */}
          {activeTab === "notifications" && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-sm font-semibold text-surface-900">
                Notification Channels
              </h2>

              <div className="space-y-4">
                <Toggle
                  checked={settings.notifications.emailEnabled}
                  onChange={(v) => updateNotifications({ emailEnabled: v })}
                  label="Email Notifications"
                />
                <Toggle
                  checked={settings.notifications.whatsappEnabled}
                  onChange={(v) => updateNotifications({ whatsappEnabled: v })}
                  label="WhatsApp Notifications"
                />
                <Toggle
                  checked={settings.notifications.pushEnabled}
                  onChange={(v) => updateNotifications({ pushEnabled: v })}
                  label="Push Notifications"
                />
              </div>

              <div className="border-t border-surface-100 pt-6">
                <h3 className="text-sm font-semibold text-surface-900 mb-3">
                  Notification Templates
                </h3>
                <div className="space-y-2">
                  {settings.notifications.templates.map((template, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-200"
                    >
                      <MessageSquare className="w-4 h-4 text-surface-400 flex-shrink-0" />
                      <span className="text-sm text-surface-700 flex-1">
                        {template
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="badge bg-success-50 text-success-700 text-[10px]">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Agents Tab                                                      */}
          {/* -------------------------------------------------------------- */}
          {activeTab === "agents" && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-surface-900">
                Agent Configuration
              </h2>
              <p className="text-xs text-surface-500">
                Configure each AI agent&apos;s operational parameters
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {settings.agents.map((agent) => (
                  <div
                    key={agent.key}
                    className={clsx(
                      "rounded-xl border p-5 space-y-4 transition-colors",
                      agent.enabled
                        ? "border-surface-200 bg-white"
                        : "border-surface-200 bg-surface-50 opacity-60"
                    )}
                  >
                    {/* Agent header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-surface-900">
                            {agent.name}
                          </span>
                          <p className="text-[10px] text-surface-400 font-mono">
                            {agent.key}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          updateAgent(agent.key, { enabled: !agent.enabled })
                        }
                        className={clsx(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                          agent.enabled ? "bg-primary-600" : "bg-surface-300"
                        )}
                        role="switch"
                        aria-checked={agent.enabled}
                        aria-label={`Toggle ${agent.name}`}
                      >
                        <span
                          className={clsx(
                            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            agent.enabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>

                    {/* Confidence threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor={`confidence-${agent.key}`} className="text-xs font-medium text-surface-600">
                          Confidence Threshold
                        </label>
                        <span className="text-xs font-semibold text-surface-900">
                          {agent.confidenceThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        id={`confidence-${agent.key}`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={agent.confidenceThreshold}
                        onChange={(e) =>
                          updateAgent(agent.key, {
                            confidenceThreshold: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                        disabled={!agent.enabled}
                      />
                      <div className="flex justify-between text-[10px] text-surface-400 mt-0.5">
                        <span>0.00</span>
                        <span>1.00</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor={`temperature-${agent.key}`} className="text-xs font-medium text-surface-600">
                          Temperature
                        </label>
                        <span className="text-xs font-semibold text-surface-900">
                          {agent.temperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        id={`temperature-${agent.key}`}
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={agent.temperature}
                        onChange={(e) =>
                          updateAgent(agent.key, {
                            temperature: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                        disabled={!agent.enabled}
                      />
                      <div className="flex justify-between text-[10px] text-surface-400 mt-0.5">
                        <span>0.0</span>
                        <span>2.0</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Security Tab                                                    */}
          {/* -------------------------------------------------------------- */}
          {activeTab === "security" && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-sm font-semibold text-surface-900">
                Security Settings
              </h2>

              <div>
                <label htmlFor="rate-limit" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Rate Limit per User (requests/minute)
                </label>
                <input
                  id="rate-limit"
                  type="number"
                  min="1"
                  max="10000"
                  className="input"
                  value={settings.security.rateLimitPerUser}
                  onChange={(e) =>
                    updateSecurity({
                      rateLimitPerUser: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
                <p className="text-xs text-surface-400 mt-1">
                  Maximum API requests per user per minute
                </p>
              </div>

              <div>
                <label htmlFor="jwt-expiry" className="block text-sm font-medium text-surface-700 mb-1.5">
                  JWT Expiry (minutes)
                </label>
                <input
                  id="jwt-expiry"
                  type="number"
                  min="5"
                  max="10080"
                  className="input"
                  value={settings.security.jwtExpiryMinutes}
                  onChange={(e) =>
                    updateSecurity({
                      jwtExpiryMinutes: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
                <p className="text-xs text-surface-400 mt-1">
                  Token validity period (5 min to 7 days)
                </p>
              </div>

              <Toggle
                checked={settings.security.enforce2FA}
                onChange={(v) => updateSecurity({ enforce2FA: v })}
                label="Enforce 2FA for all admin users"
              />

              <div>
                <label htmlFor="cors-origins" className="block text-sm font-medium text-surface-700 mb-1.5">
                  CORS Origins
                </label>
                <textarea
                  id="cors-origins"
                  className="input min-h-[120px] resize-y"
                  placeholder="https://app.groupio.co.il&#10;https://admin.groupio.co.il"
                  value={settings.security.corsOrigins}
                  onChange={(e) =>
                    updateSecurity({ corsOrigins: e.target.value })
                  }
                />
                <p className="text-xs text-surface-400 mt-1">
                  One origin per line. These domains are allowed to make
                  cross-origin requests to the API.
                </p>
              </div>
            </div>
          )}

          {/* ---- Per-tab save button ---- */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-surface-100">
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success-600 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Settings saved
              </span>
            )}
            {saveMutation.isError && (
              <span className="inline-flex items-center gap-1.5 text-sm text-danger-600 font-medium">
                <AlertCircle className="w-4 h-4" />
                Save failed
              </span>
            )}
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save {TABS.find((t) => t.id === activeTab)?.label} Settings
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
