import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Create a Supabase client for server-side usage
 * This uses the service role key for admin operations
 */
export function createServerClient() {
  return createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a Supabase client with the user's session
 * This respects Row Level Security (RLS) policies
 */
export async function createUserClient() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('groupio-auth');

  let accessToken: string | null = null;

  if (authCookie) {
    try {
      const authData = JSON.parse(authCookie.value);
      accessToken = authData?.state?.accessToken;
    } catch {
      // Invalid cookie
    }
  }

  return createClient(supabaseUrl || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {},
    },
  });
}

/**
 * Server-side helper to fetch offers for a building
 */
export async function getOffersForBuilding(buildingId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching offers:', error);
    return [];
  }

  return data;
}

/**
 * Server-side helper to fetch contractor by ID
 */
export async function getContractor(contractorId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', contractorId)
    .single();

  if (error) {
    console.error('Error fetching contractor:', error);
    return null;
  }

  return data;
}

/**
 * Server-side helper to fetch building by ID
 */
export async function getBuilding(buildingId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', buildingId)
    .single();

  if (error) {
    console.error('Error fetching building:', error);
    return null;
  }

  return data;
}

/**
 * Server-side helper to fetch user profile
 */
export async function getUserProfile(userId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }

  return data;
}

/**
 * Server-side helper to fetch escalations (admin)
 */
export async function getEscalations(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
}) {
  const supabase = createServerClient();

  let query = supabase
    .from('escalations')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching escalations:', error);
    return [];
  }

  return data;
}

/**
 * Server-side helper to get agent metrics
 */
export async function getAgentMetrics() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('agent_metrics')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching agent metrics:', error);
    return [];
  }

  return data;
}
