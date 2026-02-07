import { useState, useCallback, useRef } from 'react';
import type { MessageResponse } from '@groupio/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  metadata?: MessageResponse['metadata'];
}

interface UseChatOptions {
  /** Building context for scoped answers */
  buildingId: string;
  /** User identifier */
  userId?: string;
  /** Custom API base URL */
  apiUrl?: string;
  /** Initial welcome message (set to null to skip) */
  welcomeMessage?: string | null;
  /** Callback fired when a response is fully received */
  onResponse?: (response: MessageResponse) => void;
  /** Callback fired on error */
  onError?: (error: Error) => void;
}

interface UseChatReturn {
  /** Current messages list */
  messages: ChatMessage[];
  /** Send a message (handles optimistic UI + streaming) */
  sendMessage: (text: string) => Promise<void>;
  /** Whether a response is currently being fetched */
  isLoading: boolean;
  /** The most recent error, if any */
  error: Error | null;
  /** Clear error state */
  clearError: () => void;
  /** Reset conversation (clear all messages) */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const DEFAULT_WELCOME =
  'היי! אני העוזר הדיגיטלי של גרופיו. איך אוכל לעזור?';

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat({
  buildingId,
  userId = 'anonymous',
  apiUrl,
  welcomeMessage = DEFAULT_WELCOME,
  onResponse,
  onError,
}: UseChatOptions): UseChatReturn {
  const baseUrl = apiUrl ?? DEFAULT_API_URL;
  const abortRef = useRef<AbortController | null>(null);

  // ---- State ----
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (welcomeMessage === null) return [];
    return [
      {
        id: 'welcome',
        role: 'assistant' as const,
        content: welcomeMessage,
        timestamp: new Date(),
      },
    ];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ---- Send message ----
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Optimistic user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      const assistantId = generateId();
      const placeholderMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${baseUrl}/api/v1/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            message: trimmed,
            buildingId,
            channel: 'web',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }

        const data: MessageResponse = await response.json();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: data.response.message,
                  isStreaming: false,
                  metadata: data.metadata,
                }
              : m,
          ),
        );

        onResponse?.(data);
      } catch (err) {
        // Ignore aborted requests
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const chatError =
          err instanceof Error ? err : new Error('Unknown error');
        setError(chatError);
        onError?.(chatError);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: 'מצטער, משהו השתבש. נסה שוב.',
                  isStreaming: false,
                }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [baseUrl, buildingId, isLoading, onError, onResponse, userId],
  );

  // ---- Clear error ----
  const clearError = useCallback(() => setError(null), []);

  // ---- Reset ----
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setError(null);
    setMessages(
      welcomeMessage === null
        ? []
        : [
            {
              id: 'welcome',
              role: 'assistant',
              content: welcomeMessage,
              timestamp: new Date(),
            },
          ],
    );
  }, [welcomeMessage]);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    clearError,
    reset,
  };
}
