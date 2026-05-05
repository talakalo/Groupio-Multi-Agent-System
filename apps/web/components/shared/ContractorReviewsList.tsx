'use client';

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { apiClient } from '@/lib/api/client';

import { Skeleton } from '../ui/Skeleton';

/**
 * Read-only list of reviews left on a contractor.
 *
 * Resident-facing surface for the existing `GET /contractors/{id}/reviews`
 * backend endpoint. Until this component shipped, the only way reviews
 * were exposed in the UI was via the `POST` mutation on the offer detail
 * page — readers had no way to see them.
 */

export interface ContractorReviewsListProps {
  contractorId: string;
  /** Maximum number of reviews to load. Default 10. */
  limit?: number;
}

export function ContractorReviewsList({ contractorId, limit = 10 }: ContractorReviewsListProps) {
  const t = useTranslations('contractors');

  const reviewsQuery = useQuery({
    queryKey: ['contractor', contractorId, 'reviews', limit],
    queryFn: () => apiClient.getContractorReviews(contractorId, { limit }),
    enabled: !!contractorId,
  });

  if (reviewsQuery.isLoading) {
    return (
      <div className="space-y-3" data-testid="contractor-reviews-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (reviewsQuery.isError) {
    return (
      <p className="text-sm text-red-600" data-testid="contractor-reviews-error">
        {t('reviewsError') || 'לא ניתן לטעון ביקורות'}
      </p>
    );
  }

  const reviews = reviewsQuery.data?.items ?? [];
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-gray-500" data-testid="contractor-reviews-empty">
        {t('reviewsEmpty') || 'אין עדיין ביקורות לקבלן זה'}
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="contractor-reviews-list">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
        >
          <div className="flex items-center gap-1 text-yellow-500" aria-label={`Rating ${review.rating} of 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={
                  i < Math.round(review.rating) ? 'h-4 w-4 fill-yellow-500' : 'h-4 w-4 text-gray-300'
                }
                aria-hidden
              />
            ))}
            <span className="ms-2 text-xs text-gray-500">
              {new Date(review.created_at).toLocaleDateString('he-IL')}
            </span>
          </div>
          {review.comment ? (
            <p className="mt-2 leading-relaxed text-gray-800">{review.comment}</p>
          ) : (
            <p className="mt-2 text-xs italic text-gray-400">
              {t('reviewNoComment') || 'דירוג ללא תגובה'}
            </p>
          )}
        </li>
      ))}
      {reviewsQuery.data && reviewsQuery.data.total > reviews.length ? (
        <li className="text-center text-xs text-gray-500">
          {t('reviewsShowingPartial', {
            shown: reviews.length,
            total: reviewsQuery.data.total,
          }) || `מציג ${reviews.length} מתוך ${reviewsQuery.data.total} ביקורות`}
        </li>
      ) : null}
    </ul>
  );
}
