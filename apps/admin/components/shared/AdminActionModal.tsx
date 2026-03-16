"use client";

import { clsx } from "clsx";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

export interface ModalField {
  key: string;
  type: "text" | "select" | "textarea";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

interface AdminActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
  title: string;
  description?: string;
  fields?: ModalField[];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function AdminActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  fields,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: AdminActionModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setValues({});
  }, [open]);

  const setField = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requiredMet =
    !fields?.length ||
    fields.every((f) => !f.required || values[f.key]?.trim());

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      await onConfirm(values);
      onClose();
    } catch {
      // caller handles errors
    } finally {
      setLoading(false);
    }
  }, [values, onConfirm, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-surface-100">
          <div className="flex items-center gap-3">
            {destructive && (
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-danger-50">
                <AlertTriangle className="w-5 h-5 text-danger-600" />
              </div>
            )}
            <h2 className="text-lg font-bold text-surface-900">{title}</h2>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {description && (
            <p className="text-sm text-surface-600">{description}</p>
          )}

          {fields?.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium text-surface-700">
                {field.label}
                {field.required && (
                  <span className="text-danger-500 ml-0.5">*</span>
                )}
              </label>
              {field.type === "select" && field.options ? (
                <select
                  className="input w-full"
                  value={values[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                >
                  <option value="">
                    {field.placeholder ?? "Select..."}
                  </option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  className="input w-full min-h-[80px] resize-y"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  className="input w-full"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                  /* eslint-disable-next-line jsx-a11y/no-autofocus */
                  autoFocus={fields.indexOf(field) === 0}
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <button
              className="btn-ghost flex-1"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              className={clsx(
                "flex-1 flex items-center justify-center gap-2",
                destructive ? "btn-danger" : "btn-primary"
              )}
              onClick={handleConfirm}
              disabled={loading || !requiredMet}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
