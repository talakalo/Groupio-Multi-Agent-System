'use client';

import type { Offer, PricingTier, Contractor } from '@groupio/types';
import { formatPrice, formatDate } from '@groupio/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Users,
  Clock,
  Star,
  Shield,
  Share2,
  Check,
  Loader2,
  Phone,
  Mail,
  Calendar,
  TrendingDown,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { useNotificationStore } from '@/lib/stores/notificationStore';
import { cn } from '@/lib/utils/cn';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { TrustBadgeCluster } from '@/components/shared/TrustBadgeCluster';
import { EscrowBadge } from '@/components/features/payments/EscrowBadge';

// ---------------------------------------------------------------------------
// Join Confirmation Modal with cancellation policy disclosure
// ---------------------------------------------------------------------------

function JoinConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
  offerTitle,
  isLoading,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  offerTitle: string;
  isLoading: boolean;
}) {
  const [policyAccepted, setPolicyAccepted] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" dir="rtl">
        <h2 className="text-xl font-bold text-gray-900 mb-2">אישור הצטרפות להצעה</h2>
        <p className="text-gray-600 text-sm mb-4">
          הצעה: <strong>{offerTitle}</strong>
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <h3 className="font-semibold text-amber-900 mb-2 text-sm flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            מדיניות ביטול
          </h3>
          <ul className="text-sm text-amber-800 space-y-1.5 list-disc list-inside">
            <li>ניתן לעזוב את ההצעה חופשית <strong>עד לשלב התאמת הקבלן</strong> — ללא חיוב.</li>
            <li>לאחר שנמצא קבלן — ביטול דרך תמיכת לקוחות בלבד.</li>
            <li>לאחר ביצוע תשלום — כפוף למדיניות ההחזרים.</li>
          </ul>
          <Link href="/terms" className="text-xs text-amber-700 underline mt-2 inline-block" target="_blank">
            תנאי שימוש מלאים ←
          </Link>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={policyAccepted}
            onChange={(e) => setPolicyAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600"
          />
          <span>קראתי את מדיניות הביטול ואני מסכים/ה לתנאים</span>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!policyAccepted || isLoading}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            אישור הצטרפות
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn-secondary flex-1"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Tier Card
// ---------------------------------------------------------------------------

function TierCard({
  tier,
  index,
  isCurrentTier,
  participants,
}: {
  tier: PricingTier;
  index: number;
  isCurrentTier: boolean;
  participants: number;
}) {
  const t = useTranslations('offers');

  const isReached = participants >= tier.min;
  const discountPercent = Math.round(tier.discount * 100);

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 p-4 transition-all',
        isCurrentTier
          ? 'border-primary-500 bg-primary-50 shadow-sm'
          : isReached
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-gray-200 bg-white'
      )}
    >
      {isCurrentTier && (
        <span className="absolute -top-3 start-4 badge-primary text-xs">
          {t('currentTier')}
        </span>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">
          {t('tierLevel', { level: index + 1 })}
        </span>
        {isReached && <Check className="h-4 w-4 text-emerald-500" />}
      </div>

      <p className="text-xl font-bold text-gray-900 mb-1">{formatPrice(tier.price)}</p>

      <div className="flex items-center justify-between text-sm">
        <span className="text-emerald-600 font-medium">
          {t('discount', { percent: discountPercent })}
        </span>
        <span className="text-gray-400">
          {tier.min}
          {tier.max ? `-${tier.max}` : '+'} {t('residents')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline step
// ---------------------------------------------------------------------------

function TimelineStep({
  label,
  date,
  isComplete,
  isCurrent,
}: {
  label: string;
  date?: string;
  isComplete: boolean;
  isCurrent: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            isComplete
              ? 'bg-primary-500'
              : isCurrent
                ? 'bg-primary-100 border-2 border-primary-500'
                : 'bg-gray-200'
          )}
        >
          {isComplete ? (
            <Check className="h-4 w-4 text-white" />
          ) : (
            <div className={cn('w-2 h-2 rounded-full', isCurrent ? 'bg-primary-500' : 'bg-gray-400')} />
          )}
        </div>
        <div className="w-0.5 h-8 bg-gray-200 last:hidden" />
      </div>
      <div className="pb-6">
        <p className={cn('text-sm font-medium', isComplete || isCurrent ? 'text-gray-900' : 'text-gray-400')}>
          {label}
        </p>
        {date && <p className="text-xs text-gray-400 mt-0.5">{date}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticky CTA — visible when main join button scrolls out of view (desktop)
// ---------------------------------------------------------------------------

function StickyJoinCTA({
  offerTitle,
  price,
  onJoin,
  disabled,
  targetRef,
}: {
  offerTitle: string;
  price: string;
  onJoin: () => void;
  disabled: boolean;
  targetRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 hidden lg:block bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
        <div>
          <p className="font-bold text-gray-900 text-sm">{offerTitle}</p>
          <p className="text-primary-600 font-semibold">{price}</p>
        </div>
        <button
          type="button"
          onClick={onJoin}
          disabled={disabled}
          className="btn-primary px-8 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          הצטרפו עכשיו
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OfferDetailPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');
  const tContractors = useTranslations('contractors');
  const user = useAuthStore((s) => s.user);
  const addSuccess = useNotificationStore((s) => s.success);

  const offerId = params.offerId;
  const [showJoinModal, setShowJoinModal] = useState(false);
  const joinButtonRef = useRef<HTMLButtonElement>(null);

  const offerQuery = useQuery<Offer>({
    queryKey: ['offer', offerId],
    queryFn: () => apiClient.getOffer(offerId),
    enabled: Boolean(offerId),
    // Pricing-sensitive: reflect real-time participant count + tier changes.
    staleTime: 10_000,           // 10s — shorter than global 60s default
    refetchOnWindowFocus: true,  // re-fetch when tab regains focus
    refetchInterval: 30_000,     // poll every 30s while the page is open
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      return apiClient.joinOffer(offerId);
    },
    onSuccess: () => {
      setShowJoinModal(false);
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
    },
  });

  const offer = offerQuery.data;

  const handleShare = useCallback(async () => {
    const shareData = {
      title: offer ? `Groupio — ${tCat(offer.category)}` : 'Groupio',
      text: offer ? t('shareText', { category: tCat(offer.category) }) : '',
      url: window.location.href,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        addSuccess('הקישור הועתק!', 'הקישור הועתק ללוח — שתפו עם שכנים');
      }
    } catch {
      // User cancelled share dialog — ignore
    }
  }, [offer, t, tCat]);

  if (offerQuery.isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="card">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4" />
            <div className="h-10 bg-gray-200 rounded w-48 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (offerQuery.isError || !offer) {
    return (
      <div className="max-w-4xl mx-auto card text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-700 font-medium mb-2">{t('offerNotFound')}</p>
        <Link href="/offers" className="btn-primary inline-flex items-center gap-2 mt-4">
          <ArrowRight className="h-4 w-4 rtl-flip" />
          <span>{t('backToOffers')}</span>
        </Link>
      </div>
    );
  }

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;

  // P3-7: Savings calculator derived values
  const currentSavings = currentTier ? offer.basePrice - currentTier.price : 0;
  const nextTierIdx = (offer.currentTier ?? 0) + 1;
  const nextTier = offer.tiers[nextTierIdx] ?? null;
  const toNextTier = nextTier ? Math.max(0, nextTier.min - offer.participants) : 0;
  const nextTierSavings = nextTier ? offer.basePrice - nextTier.price : 0;
  const progressToNextPct = nextTier
    ? Math.min(100, Math.round((offer.participants / nextTier.min) * 100))
    : 100;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const contractor = offer.contractor;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'ראשי', href: '/' },
          { label: t('title'), href: '/offers' },
          { label: `${tCat(offer.category)} - ${t('groupOffer')}` },
        ]}
      />

      {/* Main info card */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="badge-primary text-sm">{tCat(offer.category)}</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">
              {tCat(offer.category)} - {t('groupOffer')}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
            aria-label={t('shareWithNeighbors')}
            title={t('shareWithNeighbors')}
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        {/* Pricing highlight */}
        <div className="bg-gradient-to-l from-primary-50 to-white rounded-xl p-6 mb-6">
          <div className="flex items-end gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">{t('currentPrice')}</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatPrice(currentTier?.price ?? offer.basePrice)}
              </p>
            </div>
            {discountPercent > 0 && (
              <div className="pb-1">
                <p className="text-sm text-gray-400 line-through mb-0.5">
                  {t('basePrice')}: {formatPrice(offer.basePrice)}
                </p>
                <span className="badge-success">
                  <TrendingDown className="h-3 w-3 me-1" />
                  {t('discount', { percent: discountPercent })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* P3-7: Real-time savings calculator */}
        {currentTier && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-6">
            <h3 className="text-sm font-semibold text-emerald-800 mb-3">
              החיסכון שלך
            </h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-emerald-700">חיסכון נוכחי לדירה</span>
              <span className="text-lg font-bold text-emerald-700">
                {formatPrice(currentSavings)}
              </span>
            </div>
            {nextTier && toNextTier > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-emerald-600 mb-1">
                  <span>
                    עוד {toNextTier} שכנים = חיסכון של {formatPrice(nextTierSavings)}
                  </span>
                  <span>{progressToNextPct}%</span>
                </div>
                <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${progressToNextPct}%` }}
                  />
                </div>
              </>
            )}
            {(!nextTier || toNextTier === 0) && (
              <p className="text-xs text-emerald-600">
                הגעתם לרמת ההנחה הגבוהה ביותר!
              </p>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <Users className="h-5 w-5 text-primary-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{offer.participants}</p>
            <p className="text-xs text-gray-500">{t('participantsLabel')}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{daysLeft}</p>
            <p className="text-xs text-gray-500">{t('daysRemaining')}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <TrendingDown className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{discountPercent}%</p>
            <p className="text-xs text-gray-500">{t('currentDiscount')}</p>
          </div>
        </div>

        {/* Escrow protection badge */}
        <EscrowBadge variant="block" className="mb-5" />

        {/* Join button — opens confirmation modal with policy disclosure */}
        <button
          ref={joinButtonRef}
          type="button"
          onClick={() => setShowJoinModal(true)}
          disabled={joinMutation.isPending || joinMutation.isSuccess || offer.status !== 'active' || !user?.id}
          className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-3"
          data-testid="join-offer-button"
        >
          {joinMutation.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t('joining')}</span>
            </>
          ) : joinMutation.isSuccess ? (
            <>
              <Check className="h-5 w-5" />
              <span>{t('joined')}</span>
            </>
          ) : (
            <span>{t('joinOffer')}</span>
          )}
        </button>

        {joinMutation.isError && (
          <p className="text-red-500 text-sm mt-2 text-center">{t('joinError')}</p>
        )}

        {/* After joining: prompt resident to proceed to payment */}
        {joinMutation.isSuccess && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">הצטרפתם בהצלחה!</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                כדי להבטיח את מקומכם, יש להשלים את התשלום.
              </p>
            </div>
            <Link
              href={`/checkout?offerId=${offerId}`}
              className="btn-primary text-sm whitespace-nowrap flex-shrink-0"
              data-testid="proceed-to-payment-button"
            >
              לתשלום →
            </Link>
          </div>
        )}

        {/* Cancellation policy summary — always visible */}
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900 text-sm mb-1.5">מדיניות ביטול</h3>
          <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
            <li>ניתן לעזוב את ההצעה בחינם עד לשלב התאמת הקבלן</li>
            <li>לאחר אישור קבלן — ביטול דרך תמיכת לקוחות בלבד</li>
            <li>לאחר תשלום — כפוף למדיניות ההחזרים</li>
          </ul>
          <Link href="/terms" className="text-xs text-amber-700 underline mt-1.5 inline-block">
            תנאי שימוש מלאים ←
          </Link>
        </div>

        {/* Share with neighbors CTA */}
        <button
          type="button"
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 mt-4 py-3 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 text-primary-700 font-semibold text-sm hover:bg-primary-50 transition-colors"
        >
          <Share2 className="h-4 w-4" />
          שתפו עם השכנים — ככל שמצטרפים יותר, המחיר יורד!
        </button>
      </div>

      {/* Join confirmation modal */}
      <JoinConfirmationModal
        isOpen={showJoinModal}
        onConfirm={() => joinMutation.mutate()}
        onCancel={() => setShowJoinModal(false)}
        offerTitle={offer.contractor?.businessName
          ? `${offer.contractor.businessName} — ${tCat(offer.category)}`
          : tCat(offer.category)}
        isLoading={joinMutation.isPending}
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pricing tiers - takes 2 cols */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('pricingTiers')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {offer.tiers.map((tier, idx) => (
              <TierCard
                key={idx}
                tier={tier}
                index={idx}
                isCurrentTier={idx === offer.currentTier}
                participants={offer.participants}
              />
            ))}
          </div>

          {/* Pricing rationale (Task 3.4) */}
          <details className="mt-4 text-sm text-gray-500">
            <summary className="cursor-pointer font-medium text-primary-600 hover:text-primary-700">
              כיצד חושב המחיר?
            </summary>
            <p className="mt-2 leading-relaxed">
              {(offer as { pricingRationale?: string }).pricingRationale ||
                'המחיר חושב על ידי AI על בסיס מספר משתתפים, קטגוריה, ומחירי שוק.'}
            </p>
          </details>

          {/* Timeline */}
          <h2 className="text-lg font-bold text-gray-900 mt-8 mb-4">{t('timeline')}</h2>
          <div className="card">
            <TimelineStep
              label={t('offerCreated')}
              date={formatDate(offer.createdAt)}
              isComplete={true}
              isCurrent={false}
            />
            <TimelineStep
              label={t('collectingParticipants')}
              isComplete={offer.status !== 'draft'}
              isCurrent={offer.status === 'active'}
            />
            <TimelineStep
              label={t('contractorConfirmation')}
              isComplete={offer.status === 'completed'}
              isCurrent={offer.status === 'pending'}
            />
            <TimelineStep
              label={t('workBegins')}
              isComplete={false}
              isCurrent={offer.status === 'completed'}
            />
          </div>
        </div>

        {/* Contractor card - takes 1 col */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">{tContractors('title')}</h2>
          {contractor && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center text-xl font-bold text-primary-600">
                  {contractor.businessName?.charAt(0) ?? '?'}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{contractor.businessName}</p>
                  {contractor.verified && (
                    <span className="flex items-center gap-1 text-sm text-emerald-600">
                      <Shield className="h-3.5 w-3.5" />
                      {tContractors('verified')}
                    </span>
                  )}
                </div>
              </div>

              <TrustBadgeCluster
                badges={[
                  ...(contractor.verified ? ['verified' as const] : []),
                  'escrow' as const,
                  ...(contractor.licenseNumber ? ['licensed' as const] : []),
                  ...(contractor.insured ? ['insured' as const] : []),
                ]}
                size="sm"
                className="mb-4"
              />

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{tContractors('rating')}</span>
                  <span className="flex items-center gap-1 font-medium text-gray-900">
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                    {contractor.rating?.toFixed(1)}
                  </span>
                </div>
                {contractor.trustScore != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">ציון אמינות</span>
                    <span
                      className={cn(
                        'font-semibold px-2 py-0.5 rounded-full text-xs',
                        contractor.trustScore >= 80
                          ? 'bg-emerald-100 text-emerald-700'
                          : contractor.trustScore >= 60
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {contractor.trustScore}/100
                    </span>
                  </div>
                )}
                {contractor.yearsInBusiness && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{tContractors('experience', { years: '' })}</span>
                    <span className="font-medium text-gray-900">
                      {tContractors('experience', { years: contractor.yearsInBusiness })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{t('category')}</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {contractor.categories?.slice(0, 3).map((cat) => (
                      <span key={cat} className="badge-primary text-xs">
                        {tCat(cat)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {contractor.description && (
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">{contractor.description}</p>
              )}

              <div className="space-y-2">
                {contractor.phone && (
                  <a
                    href={`tel:${contractor.phone}`}
                    className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{tContractors('contactContractor')}</span>
                  </a>
                )}
                <Link
                  href={`/contractors?id=${contractor.id}`}
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <span>{tContractors('viewProfile')}</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky desktop CTA */}
      <StickyJoinCTA
        offerTitle={`${tCat(offer.category)} - ${t('groupOffer')}`}
        price={formatPrice(currentTier?.price ?? offer.basePrice)}
        onJoin={() => setShowJoinModal(true)}
        disabled={joinMutation.isPending || joinMutation.isSuccess || offer.status !== 'active' || !user?.id}
        targetRef={joinButtonRef}
      />
    </div>
  );
}
