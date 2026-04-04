import type { Offer } from '@groupio/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef } from 'react';

import { useAuthStore } from '@/lib/stores/authStore';
import { offerKeys } from './useOffers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RealtimeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Offer;
  old_record?: Partial<Offer>;
}

interface UseRealtimeOffersOptions {
  /** Building ID to scope realtime subscription */
  buildingId: string;
  /** Whether the subscription is enabled (defaults to true) */
  enabled?: boolean;
  /** Custom WebSocket URL override */
  wsUrl?: string;
}

interface UseRealtimeOffersReturn {
  /** Current WebSocket connection status */
  status: ConnectionStatus;
  /** Latest realtime event received */
  lastEvent: RealtimeEvent | null;
  /** Manually reconnect */
  reconnect: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws/offers';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRealtimeOffers({
  buildingId,
  enabled = true,
  wsUrl,
}: UseRealtimeOffersOptions): UseRealtimeOffersReturn {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<(() => void) | undefined>(undefined);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Update query cache based on realtime events ----
  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      setLastEvent(event);

      switch (event.type) {
        case 'INSERT':
        case 'UPDATE': {
          // Update the single-offer cache
          queryClient.setQueryData(
            offerKeys.detail(event.record.id),
            event.record,
          );

          // Invalidate the list so it refetches with the new data
          queryClient.invalidateQueries({
            queryKey: offerKeys.lists(),
          });
          break;
        }
        case 'DELETE': {
          queryClient.removeQueries({
            queryKey: offerKeys.detail(event.record.id),
          });
          queryClient.invalidateQueries({
            queryKey: offerKeys.lists(),
          });
          break;
        }
      }
    },
    [queryClient],
  );

  // ---- Connect / reconnect logic ----
  const connect = useCallback(() => {
    if (!enabled || !buildingId || !accessToken) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const base = wsUrl ?? DEFAULT_WS_URL;
    const url = `${base}?buildingId=${encodeURIComponent(buildingId)}&token=${encodeURIComponent(accessToken)}`;

    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          handleEvent(data);
        } catch {
          // Silently ignore malformed messages
        }
      };

      ws.onerror = (_event) => {
        // The WebSocket onerror fires a plain DOM Event (not ErrorEvent).
        // We intentionally discard the event object here — never throwing
        // or rejecting with it — to prevent "[object Event]" unhandled
        // rejections in the Next.js dev overlay.
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;

        // Auto-reconnect with exponential backoff capped at MAX_RECONNECT_ATTEMPTS
        if (
          enabled &&
          reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const delay =
            RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts.current);
          reconnectAttempts.current += 1;

          reconnectTimeout.current = setTimeout(() => {
            connectRef.current?.();
          }, delay);
        }
      };
    } catch {
      setStatus('error');
    }
  }, [accessToken, buildingId, enabled, handleEvent, wsUrl]);

  // ---- Lifecycle ----
  useEffect(() => {
    // Store connect in ref for recursive reconnection
    connectRef.current = connect;
    // Use setTimeout to avoid synchronous setState during effect
    const timeoutId = setTimeout(() => {
      connect();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // ---- Manual reconnect ----
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return { status, lastEvent, reconnect };
}
