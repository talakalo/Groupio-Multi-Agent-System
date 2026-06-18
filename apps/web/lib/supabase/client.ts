import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set');
}

/**
 * Supabase client for browser usage
 * This client uses the anon key and is safe to use in the browser
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Helper to get typed table access
 */
export function getTable<T extends keyof Database['public']['Tables']>(
  table: T
) {
  return supabase.from(table);
}

/**
 * Subscribe to real-time changes on a table
 */
export function subscribeToTable<T extends keyof Database['public']['Tables']>(
  table: T,
  callback: (payload: RealtimePayload<T>) => void,
  filter?: string
) {
  let channel = supabase.channel(`${table}-changes`);

  const config: {
    event: '*';
    schema: 'public';
    table: T;
    filter?: string;
  } = {
    event: '*',
    schema: 'public',
    table,
  };

  if (filter) {
    config.filter = filter;
  }

  channel = channel.on(
    'postgres_changes',
    config,
    (payload) => callback(payload as unknown as RealtimePayload<T>)
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to offer updates for a specific building
 */
export function subscribeToOffers(
  buildingId: string,
  callback: (offer: OfferUpdate) => void
) {
  return subscribeToTable(
    'offers',
    (payload) => {
      if (payload.new) {
        callback({
          type: payload.eventType,
          offer: payload.new as OfferRow,
        });
      }
    },
    `building_id=eq.${buildingId}`
  );
}

/**
 * Subscribe to chat messages for a conversation
 */
export function subscribeToChatMessages(
  conversationId: string,
  callback: (message: ChatMessageRow) => void
) {
  return subscribeToTable(
    'chat_messages',
    (payload) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        callback(payload.new as ChatMessageRow);
      }
    },
    `conversation_id=eq.${conversationId}`
  );
}

/**
 * Subscribe to escalation updates (admin)
 */
export function subscribeToEscalations(
  callback: (escalation: EscalationUpdate) => void
) {
  return subscribeToTable('escalations', (payload) => {
    if (payload.new) {
      callback({
        type: payload.eventType,
        escalation: payload.new as EscalationRow,
      });
    }
  });
}

// Type definitions
interface Database {
  public: {
    Tables: {
      offers: {
        Row: OfferRow;
      };
      chat_messages: {
        Row: ChatMessageRow;
      };
      escalations: {
        Row: EscalationRow;
      };
      contractors: {
        Row: ContractorRow;
      };
      buildings: {
        Row: BuildingRow;
      };
      users: {
        Row: UserRow;
      };
    };
  };
}

interface RealtimePayload<T extends keyof Database['public']['Tables']> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Database['public']['Tables'][T]['Row'] | null;
  old: Database['public']['Tables'][T]['Row'] | null;
}

interface OfferRow {
  id: string;
  title: string;
  description: string;
  category: string;
  base_price: number;
  status: string;
  building_id: string;
  created_by: string;
  current_participants: number;
  created_at: string;
  updated_at: string;
}

interface OfferUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  offer: OfferRow;
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'agent';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface EscalationRow {
  id: string;
  user_id: string;
  conversation_id: string;
  source_agent: string;
  reason: string;
  priority: string;
  status: string;
  summary: string;
  created_at: string;
}

interface EscalationUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  escalation: EscalationRow;
}

interface ContractorRow {
  id: string;
  business_name: string;
  trust_score: number;
  verification_status: string;
}

interface BuildingRow {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
}
