/**
 * Thin PostHog analytics wrapper.
 *
 * Usage:
 *   import { track } from '@/lib/analytics';
 *   track('offer_joined', { offer_id: '...', discount_pct: 20 });
 *
 * All calls are no-ops when:
 *   - PostHog key is not set (NEXT_PUBLIC_POSTHOG_KEY missing)
 *   - Running server-side (typeof window === 'undefined')
 *   - posthog-js throws for any reason (ad blockers, etc.)
 */

function getPostHog(): { capture: (e: string, p?: Record<string, unknown>) => void } | null {
  if (typeof window === "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return (require("posthog-js") as any).default ?? null;
  } catch {
    return null;
  }
}

/**
 * Track a business event with optional properties.
 * Safe to call anywhere — silently skips if analytics is unavailable.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  getPostHog()?.capture(event, props);
}

// ---------------------------------------------------------------------------
// Named event helpers — keeps event names consistent across the codebase
// ---------------------------------------------------------------------------

export const Analytics = {
  /** User completed signup */
  userSignedUp: (props: { role: string }) => track("user_signed_up", props),

  /** User logged in */
  userLoggedIn: (props: { role: string }) => track("user_logged_in", props),

  /** Resident created a new group offer */
  offerCreated: (props: { category?: string; building_id?: string }) =>
    track("offer_created", props),

  /** Resident joined an existing offer */
  offerJoined: (props: { offer_id: string; discount_pct?: number }) =>
    track("offer_joined", props),

  /** Resident left an offer */
  offerLeft: (props: { offer_id: string }) => track("offer_left", props),

  /** Payment flow initiated */
  paymentInitiated: (props: { amount?: number; provider?: string }) =>
    track("payment_initiated", props),

  /** Payment completed successfully */
  paymentCompleted: (props: { amount?: number }) =>
    track("payment_completed", props),

  /** Contractor clicked the membership subscribe CTA */
  membershipSubscribeClicked: (props: { contractor_id?: string }) =>
    track("membership_subscribe_clicked", props),

  /** Contractor completed Stripe checkout (arrived at success page) */
  membershipActivated: (props: { contractor_id?: string }) =>
    track("membership_activated", props),

  /** Admin approved a contractor */
  contractorApproved: () => track("contractor_approved"),

  /** Notification panel opened */
  notificationPanelOpened: () => track("notification_panel_opened"),
} as const;
