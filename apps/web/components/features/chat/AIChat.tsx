'use client';

import type { MessageResponse, ServiceCategory } from '@groupio/types';
import { useQuery } from '@tanstack/react-query';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';

import { cn } from '@/lib/utils/cn';
import { useAccessToken } from '@/lib/stores/authStore';

const AI_THINKING_MESSAGES = [
  'מחפש קבלנים...',
  'בודק מחירים...',
  'מנתח היסטוריה...',
  'מכין המלצות...',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIChatProps {
  /** Building context for scoped AI answers */
  buildingId?: string;
  /** Context type - determines the assistant's behavior */
  context?: 'resident' | 'contractor' | 'admin';
  /** Quick-suggestion chips displayed above the input */
  suggestions?: string[];
  /** Optional active service category for contextual hints */
  category?: ServiceCategory;
  /** User ID forwarded with each request */
  userId?: string;
  /** Custom API base URL override */
  apiUrl?: string;
  /** Custom placeholder text for input */
  placeholder?: string;
  /** Additional CSS class names */
  className?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIChat({
  buildingId,
  context = 'resident',
  suggestions = [],
  category: _category,
  userId = 'anonymous',
  apiUrl,
  placeholder,
  className,
}: AIChatProps) {
  const baseUrl = apiUrl ?? API_BASE;
  const accessToken = useAccessToken();

  // ---- State ----
  // Welcome message: passed as a prop so callers can provide a translated string.
  // Defaults to an English string; Hebrew callers should pass the translated version.
  const welcomeContent = placeholder ?? "Hello! I'm the Groupio assistant. How can I help?";
  const [thinkingMsgIdx, setThinkingMsgIdx] = useState(0);
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: welcomeContent,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ---- Chat history: load from backend on mount, with pagination ----
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const { data: historyData } = useQuery<
    { messages: { id: string; role: 'user' | 'assistant'; content: string; created_at: string }[]; next_cursor: string | null }
  >({
    queryKey: ['chat-history', userId],
    queryFn: async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${baseUrl}/api/v1/conversations/${userId}/messages?limit=50`, { headers });
      if (!res.ok) throw new Error('Failed to load chat history');
      return res.json();
    },
    enabled: Boolean(userId) && userId !== 'anonymous' && !historyLoaded,
    staleTime: Infinity,
  });

  // Hydrate messages from backend history on first load
  useEffect(() => {
    if (historyData === undefined) return;
    const historical: ChatMessage[] = (historyData.messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.created_at),
    }));
    setMessages((prev) => [...historical, ...prev]);
    setNextCursor(historyData?.next_cursor ?? null);
    setHistoryLoaded(true);
  }, [historyData]);

  const loadOlderMessages = useCallback(async () => {
    if (!nextCursor || isLoadingHistory || !userId || userId === 'anonymous') return;
    setIsLoadingHistory(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${baseUrl}/api/v1/conversations/${userId}/messages?limit=50&before=${encodeURIComponent(nextCursor)}`,
        { headers }
      );
      if (!res.ok) throw new Error('Failed to load older messages');
      const data = await res.json();
      const older: ChatMessage[] = (data.messages || []).map((m: { id: string; role: 'user' | 'assistant'; content: string; created_at: string }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
      }));
      setMessages((prev) => [...older, ...prev]);
      setNextCursor(data.next_cursor ?? null);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [nextCursor, isLoadingHistory, userId, accessToken, baseUrl]);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Rotate thinking status messages while loading
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(
      () => setThinkingMsgIdx((i) => (i + 1) % AI_THINKING_MESSAGES.length),
      2000,
    );
    return () => clearInterval(interval);
  }, [isLoading]);

  // Show slow-response notice after 30 seconds
  useEffect(() => {
    if (!isLoading) {
      setIsSlowResponse(false);
      return;
    }
    const timer = setTimeout(() => setIsSlowResponse(true), 30_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // ---- Send handler ----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setIsSlowResponse(false);
      setThinkingMsgIdx(0);

      // Placeholder assistant message for streaming
      const assistantId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        },
      ]);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        // Use AbortController to enforce a 30-second timeout
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 30_000);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const response = await fetch(`${baseUrl}/api/v1/message`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userId,
            message: text.trim(),
            ...(buildingId ? { building_id: buildingId } : {}),
            channel: 'web',
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data: MessageResponse = await response.json();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: data.response.message, isStreaming: false }
              : m,
          ),
        );
      } catch {
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
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        setIsLoading(false);
        setIsSlowResponse(false);
      }
    },
    [accessToken, baseUrl, buildingId, isLoading, userId],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // sendMessage is async; attach a no-op catch so the returned Promise
    // never becomes an unhandled rejection (shown as "[object Event]" in
    // Next.js dev overlay when the rejection value is a DOM Event).
    sendMessage(input).catch(() => {});
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion).catch(() => {});
  };

  // ---- Render ----
  return (
    <div
      data-testid="chat-widget"
      className={cn(
        'flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm',
        'h-[600px] max-h-[80vh]',
        className,
      )}
    >
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100">
          <Bot className="h-5 w-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            העוזר של גרופיו
          </h3>
          <p className="text-xs text-gray-500">
            {isLoading ? 'חושב...' : 'מוכן לעזור'}
          </p>
        </div>
      </div>

      {/* ---- Messages ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 flex flex-col">
        {nextCursor && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={isLoadingHistory}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
            >
              {isLoadingHistory ? 'טוען...' : 'טוען הודעות ישנות יותר'}
            </button>
          </div>
        )}
        <div className="space-y-4 flex-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2.5',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                msg.role === 'user'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600',
              )}
            >
              {msg.role === 'user' ? (
                <User className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-ee-md'
                  : 'bg-gray-100 text-gray-800 rounded-es-md',
              )}
            >
              {msg.isStreaming && !msg.content ? (
                <TypingIndicator thinkingMsg={AI_THINKING_MESSAGES[thinkingMsgIdx]} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* ---- Suggestions ---- */}
      {suggestions.length > 0 && messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestionClick(s)}
              className={cn(
                'rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5',
                'text-sm font-medium text-primary-700',
                'transition-colors hover:bg-primary-100 hover:border-primary-300',
                'disabled:opacity-50',
              )}
              disabled={isLoading}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ---- AI disclosure banner ---- */}
      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">
        תוצאות מחיפוש זה מופקות על ידי בינה מלאכותית ועשויות לדרוש בדיקה אנושית.
      </div>

      {/* ---- Slow-response notice ---- */}
      {isSlowResponse && (
        <div className="px-4 py-1.5 text-xs text-center text-gray-400">
          This is taking longer than expected...
        </div>
      )}

      {/* ---- Input ---- */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-gray-100 px-4 py-3"
      >
        <input
          ref={inputRef}
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? "הקלד הודעה..."}
          disabled={isLoading}
          className={cn(
            'flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5',
            'text-sm placeholder:text-gray-400',
            'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'transition-all duration-200',
          )}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="שלח"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            'bg-primary-500 text-white',
            'transition-all duration-200',
            'hover:bg-primary-600 active:scale-95',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4 rtl-flip" />
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator sub-component
// ---------------------------------------------------------------------------

function TypingIndicator({ thinkingMsg }: { thinkingMsg?: string }) {
  return (
    <div
      data-testid="typing-indicator"
      className="flex items-center gap-2 py-1"
      aria-label="חושב..."
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-primary-400"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {thinkingMsg && (
        <span className="text-xs text-gray-400">{thinkingMsg}</span>
      )}
    </div>
  );
}
