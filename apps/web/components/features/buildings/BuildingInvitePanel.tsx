'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, RefreshCw, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiClient } from '@/lib/api/client';

/**
 * Read + rotate building invite code.
 *
 * The "regenerate" action calls ``POST /buildings/{id}/regenerate-invite``
 * (BM/admin only) and updates the card in place. WhatsApp / web-share are
 * provided so a BM can hand the code off in one tap.
 */

export interface BuildingInvitePanelProps {
  buildingId: string;
  buildingName: string;
  inviteCode: string;
  /** Allow rotation? Pass true for BM/admin viewers. */
  canRotate?: boolean;
  /** Called after a successful rotation with the new code. */
  onRotated?: (code: string) => void;
}

export function BuildingInvitePanel({
  buildingId,
  buildingName,
  inviteCode,
  canRotate = false,
  onRotated,
}: BuildingInvitePanelProps) {
  const t = useTranslations('buildingsManager.invite');
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(inviteCode);
  const shareLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/building/join?code=${encodeURIComponent(code)}`
      : `https://groupio.co.il/join/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silently no-op
    }
  };

  const handleShare = async () => {
    const text = t('shareMessage', { buildingName, code }) ||
      `Join "${buildingName}" on Groupio: ${code}\n${shareLink}`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: buildingName,
          text,
          url: shareLink,
        });
        return;
      } catch {
        // user cancelled — fall through to clipboard fallback
      }
    }
    await handleCopy();
  };

  const rotateMutation = useMutation({
    mutationFn: () => apiClient.regenerateBuildingInviteCode(buildingId),
    onSuccess: (data) => {
      setCode(data.invite_code);
      onRotated?.(data.invite_code);
      queryClient.invalidateQueries({ queryKey: ['buildings-manager', 'buildings'] });
      queryClient.invalidateQueries({ queryKey: ['building', 'profile'] });
    },
  });

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5" data-testid="building-invite-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {t('label') || 'Invite code'}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-emerald-900">
            {code}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="building-invite-copy"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('copied') || 'Copied' : t('copy') || 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            data-testid="building-invite-share"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            {t('share') || 'Share'}
          </button>
        </div>
      </div>

      {canRotate ? (
        <div className="mt-4 flex items-center justify-between border-t border-emerald-100 pt-3">
          <p className="text-xs text-emerald-800">
            {t('rotateHint') ||
              'Rotating the code will immediately invalidate the previous one.'}
          </p>
          <button
            type="button"
            onClick={() => rotateMutation.mutate()}
            disabled={rotateMutation.isPending}
            data-testid="building-invite-rotate"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-gray-300"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${rotateMutation.isPending ? 'animate-spin' : ''}`}
            />
            {t('rotate') || 'Rotate code'}
          </button>
        </div>
      ) : null}

      {rotateMutation.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-600" data-testid="building-invite-error">
          {(rotateMutation.error as Error)?.message ||
            t('rotateError') ||
            'Failed to rotate code'}
        </p>
      ) : null}
    </div>
  );
}
