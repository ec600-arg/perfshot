import { createClient } from 'jsr:@supabase/supabase-js@2'

// Validate LemonSqueezy webhook signature (HMAC-SHA256)
async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === signature
}

// Map LemonSqueezy event + status to our subscriber status
function resolveStatus(eventName: string, lsStatus: string): string {
  if (['subscription_expired', 'subscription_paused'].includes(eventName)) return 'expired'
  if (eventName === 'subscription_cancelled') return 'cancelled'
  if (['subscription_created', 'subscription_updated', 'subscription_resumed', 'subscription_unpaused'].includes(eventName)) {
    return lsStatus === 'active' ? 'active' : lsStatus ?? 'active'
  }
  return lsStatus ?? 'active'
}

Deno.serve(async (req) => {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature') ?? ''
  const secret = Deno.env.get('LEMON_WEBHOOK_SECRET')

  if (secret) {
    const valid = await verifySignature(secret, rawBody, signature)
    if (!valid) return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) } catch { return Response.json({ ok: false }, { status: 400 }) }

  const eventName = (payload.meta as Record<string, unknown>)?.event_name as string
  const attrs     = (payload.data as Record<string, unknown>)?.attributes as Record<string, unknown>

  if (!attrs || !eventName) return Response.json({ ok: true })

  const email = (attrs.user_email as string)?.toLowerCase().trim()
  if (!email) return Response.json({ ok: true })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  await supabase.from('subscribers').upsert({
    email,
    status:              resolveStatus(eventName, attrs.status as string),
    ls_subscription_id:  String((payload.data as Record<string, unknown>)?.id ?? ''),
    ls_customer_id:      String(attrs.customer_id ?? ''),
    current_period_end:  (attrs.renews_at ?? attrs.ends_at ?? null) as string | null,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'email' })

  console.log(`[lemon-webhook] ${eventName} → ${email}`)
  return Response.json({ ok: true })
})
