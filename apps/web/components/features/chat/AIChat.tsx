'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import type { MessageResponse, ServiceCategory } from '@groupio/types';
import { cn } from '@/lib/utils/cn';
import { useAccessToken } from '@/lib/stores/authStore';

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'היי! אני העוזר הדיגיטלי של גרופיו. איך אוכל לעזור?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 30000);

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
        timeoutId = undefined;

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
      }
    },
    [accessToken, baseUrl, buildingId, isLoading, userId],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  // ---- Render ----
  return (
    <div
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                <TypingIndicator />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
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

      {/* ---- Input ---- */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-gray-100 px-4 py-3"
      >
        <input
          ref={inputRef}
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="חושב...">
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
    </div>
  );
}
