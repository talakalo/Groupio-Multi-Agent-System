'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ApiError, apiClient } from '@/lib/api/client';

/**
 * BM / admin modal for creating a new building.
 *
 * Closes on ESC, click-outside, and after a successful POST. The new
 * building's invite_code is surfaced via the ``onCreated`` callback so the
 * parent page can immediately open the BuildingInvitePanel for it.
 */

const REGIONS = [
  'center',
  'tel_aviv',
  'jerusalem',
  'north',
  'south',
  'sharon',
  'shfela',
] as const;
type Region = (typeof REGIONS)[number];

export interface BuildingCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (building: {
    id: string;
    name: string;
    invite_code?: string;
  }) => void;
}

export function BuildingCreateModal({
  open,
  onClose,
  onCreated,
}: BuildingCreateModalProps) {
  const t = useTranslations('buildingsManager.create');
  const tCommon = useTranslations('common');
  const tRegions = useTranslations('regions');
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    region: 'tel_aviv' as Region,
    total_units: 0,
    floors: 1,
  });

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const createMutation = useMutation({
    mutationFn: () => apiClient.createBuilding(form),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['buildings-manager', 'buildings'] });
      queryClient.invalidateQueries({ queryKey: ['buildings-manager', 'stats'] });
      const c = created as { id: string; name: string; invite_code?: string };
      onCreated?.({ id: c.id, name: c.name, invite_code: c.invite_code });
      onClose();
      setForm({
        name: '',
        address: '',
        city: '',
        region: 'tel_aviv',
        total_units: 0,
        floors: 1,
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        setError(t('errorForbidden') || 'Buildings manager / admin role required');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('errorGeneric') || 'Failed to create building');
      }
    },
  });

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.address.trim() || !form.city.trim()) {
      setError(t('errorMissingFields') || 'Name, address and city are required');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        data-testid="building-create-modal"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {t('title') || 'Create a building'}
              </h2>
              <p className="text-sm text-gray-500">
                {t('subtitle') ||
                  'Once created, you can share the invite code with residents.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('close') || 'Close'}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('nameLabel') || 'Name'}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              required
              data-testid="building-create-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('addressLabel') || 'Address'}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                required
                data-testid="building-create-address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('cityLabel') || 'City'}
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                required
                data-testid="building-create-city"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('regionLabel') || 'Region'}
            </label>
            <select
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value as Region }))}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              data-testid="building-create-region"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {tRegions(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('totalUnitsLabel') || 'Total units'}
              </label>
              <input
                type="number"
                min={0}
                value={form.total_units}
                onChange={(e) =>
                  setForm((f) => ({ ...f, total_units: Number(e.target.value) || 0 }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('floorsLabel') || 'Floors'}
              </label>
              <input
                type="number"
                min={1}
                value={form.floors}
                onChange={(e) =>
                  setForm((f) => ({ ...f, floors: Number(e.target.value) || 1 }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600" data-testid="building-create-error">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {tCommon('cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="building-create-submit"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('submit') || 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
