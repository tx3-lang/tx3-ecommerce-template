// This is a Deno Edge Function - TypeScript errors for Deno imports are expected
// The function runs in Deno runtime, not in standard TypeScript/Node.js
// Build errors related to Deno modules and Deno namespace can be ignored
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

let supabaseClient: ReturnType<typeof createClient> | null = null
let supabaseInitError: string | null = null

function getSupabaseClient(): { client?: ReturnType<typeof createClient>; error?: string } {
  if (supabaseClient) {
    return { client: supabaseClient }
  }

  if (supabaseInitError) {
    return { error: supabaseInitError }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    supabaseInitError = 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    return { error: supabaseInitError }
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
  return { client: supabaseClient }
}

interface CleanupResult {
  success: boolean
  message: string
  expiredReservations?: number
  cancelledOrders?: number
  timestamp: string
}

interface CleanupReservationsRpc {
  success?: boolean
  reservations_expired?: number
  quantity_released?: number
  timestamp?: string
  error?: string
}

interface CancelOrdersRpc {
  success?: boolean
  orders_cancelled?: number
  timestamp?: string
  error?: string
}

// Main cleanup function
async function performOrderCleanup(supabase: ReturnType<typeof createClient>): Promise<CleanupResult> {
  try {
    console.log('Starting order cleanup process...')
    
    // Step 1: Cleanup expired stock reservations
    const { data: cleanupResult, error: cleanupError } = await supabase
      .rpc<CleanupReservationsRpc>('cleanup_expired_reservations')
    
    if (cleanupError) {
      console.error('Failed to cleanup expired reservations:', cleanupError)
      return {
        success: false,
        message: 'Failed to cleanup expired reservations',
        timestamp: new Date().toISOString()
      }
    }
    
    if (cleanupResult?.success === false) {
      console.error('Failed to cleanup expired reservations:', cleanupResult)
      return {
        success: false,
        message: cleanupResult.error || 'Failed to cleanup expired reservations',
        timestamp: new Date().toISOString()
      }
    }

    console.log('Stock reservations cleanup result:', cleanupResult)
    
    // Step 2: Auto-cancel expired pending orders
    const { data: cancelResult, error: cancelError } = await supabase
      .rpc<CancelOrdersRpc>('auto_cancel_expired_orders')
    
    if (cancelError) {
      console.error('Failed to auto-cancel expired orders:', cancelError)
      return {
        success: false,
        message: 'Failed to auto-cancel expired orders',
        timestamp: new Date().toISOString()
      }
    }
    
    if (cancelResult?.success === false) {
      console.error('Failed to auto-cancel expired orders:', cancelResult)
      return {
        success: false,
        message: cancelResult.error || 'Failed to auto-cancel expired orders',
        timestamp: new Date().toISOString()
      }
    }

    console.log('Orders auto-cancel result:', cancelResult)
    
    return {
      success: true,
      message: 'Cleanup completed successfully',
      expiredReservations: cleanupResult?.reservations_expired || 0,
      cancelledOrders: cancelResult?.orders_cancelled || 0,
      timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('Unexpected error during cleanup:', error)
    return {
      success: false,
      message: 'Unexpected error during cleanup',
      timestamp: new Date().toISOString()
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// HTTP request handler
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method === 'GET') {
    const { error } = getSupabaseClient()
    if (error) {
      return jsonResponse({ status: 'error', message: error }, 500)
    }

    return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() })
  }

  // Only allow POST requests for cleanup
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // Verify API key (simple authentication)
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('CLEANUP_API_KEY')

    if (!expectedApiKey) {
      return jsonResponse({ error: 'Missing CLEANUP_API_KEY configuration' }, 500)
    }
    
    if (!authHeader || authHeader !== `Bearer ${expectedApiKey}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { client, error } = getSupabaseClient()
    if (error || !client) {
      return jsonResponse({ error: error || 'Supabase client not initialized' }, 500)
    }

    // Perform cleanup
    const result = await performOrderCleanup(client)
    
    console.log('Cleanup completed:', result)
    
    return jsonResponse(result, result.success ? 200 : 500)
    
  } catch (error) {
    console.error('Error in cleanup function:', error)
    
    return jsonResponse({ 
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    }, 500)
  }
})