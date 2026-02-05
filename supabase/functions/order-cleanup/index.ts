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

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface CleanupResult {
  success: boolean
  message: string
  expiredReservations?: number
  cancelledOrders?: number
  timestamp: string
}

// Main cleanup function
async function performOrderCleanup(): Promise<CleanupResult> {
  try {
    console.log('Starting order cleanup process...')
    
    // Step 1: Cleanup expired stock reservations
    const { data: cleanupResult, error: cleanupError } = await supabase
      .rpc('cleanup_expired_reservations')
    
    if (cleanupError) {
      console.error('Failed to cleanup expired reservations:', cleanupError)
      return {
        success: false,
        message: 'Failed to cleanup expired reservations',
        timestamp: new Date().toISOString()
      }
    }
    
    console.log('Stock reservations cleanup result:', cleanupResult)
    
    // Step 2: Auto-cancel expired pending orders
    const { data: cancelResult, error: cancelError } = await supabase
      .rpc('auto_cancel_expired_orders')
    
    if (cancelError) {
      console.error('Failed to auto-cancel expired orders:', cancelError)
      return {
        success: false,
        message: 'Failed to auto-cancel expired orders',
        timestamp: new Date().toISOString()
      }
    }
    
    console.log('Orders auto-cancel result:', cancelResult)
    
    return {
      success: true,
      message: 'Cleanup completed successfully',
      expiredReservations: cleanupResult?.[0]?.quantity_released || 0,
      cancelledOrders: cancelResult || 0,
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

// HTTP request handler
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests for cleanup
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }

  try {
    // Verify API key (simple authentication)
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('CLEANUP_API_KEY') || 'cleanup-key-123'
    
    if (!authHeader || authHeader !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Perform cleanup
    const result = await performOrderCleanup()
    
    console.log('Cleanup completed:', result)
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Error in cleanup function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})