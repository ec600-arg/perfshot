import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return Response.json({ active: false, error: 'Email required' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data } = await supabase
      .from('subscribers')
      .select('status, current_period_end')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!data) {
      return Response.json({ active: false }, { headers: CORS })
    }

    // Active = status is active, OR cancelled but not yet expired
    const active =
      data.status === 'active' ||
      (data.status === 'cancelled' &&
        data.current_period_end &&
        new Date(data.current_period_end) > new Date())

    return Response.json(
      { active, status: data.status, expires: data.current_period_end },
      { headers: CORS },
    )
  } catch (e) {
    return Response.json({ active: false, error: 'Server error' }, { status: 500, headers: CORS })
  }
})
