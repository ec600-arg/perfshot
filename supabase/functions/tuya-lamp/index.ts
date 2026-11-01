import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function tuyaFetch(
  host: string, clientId: string, secret: string,
  method: string, path: string, body = "", token = ""
) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const bodyHash = await sha256hex(body);
  const strToSign = `${method}\n${bodyHash}\n\n${path}`;
  const signStr = clientId + token + t + nonce + strToSign;
  const sign = await hmac(secret, signStr);

  const headers: Record<string, string> = {
    "client_id": clientId,
    "sign": sign,
    "t": t,
    "nonce": nonce,
    "sign_method": "HMAC-SHA256",
    "Content-Type": "application/json",
  };
  if (token) headers["access_token"] = token;

  const res = await fetch(`https://${host}${path}`, {
    method,
    headers,
    body: body || undefined,
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { region, accessId, accessSecret, deviceId, color } = await req.json();

    if (!region || !accessId || !accessSecret || !deviceId || !color) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Get access token
    const tokenRes = await tuyaFetch(region, accessId, accessSecret, "GET", "/v1.0/token?grant_type=1");
    if (!tokenRes.success) {
      return new Response(JSON.stringify({ error: "Auth failed", detail: tokenRes }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 401,
      });
    }
    const accessToken = tokenRes.result.access_token;

    // Build commands
    type Cmd = { code: string; value: unknown };
    let commands: Cmd[] = [];

    if (color === "off") {
      commands = [{ code: "switch_led", value: false }];
    } else if (color === "green") {
      commands = [
        { code: "switch_led", value: true },
        { code: "work_mode", value: "colour" },
        { code: "colour_data_v2", value: { h: 120, s: 1000, v: 800 } },
      ];
    } else if (color === "red") {
      commands = [
        { code: "switch_led", value: true },
        { code: "work_mode", value: "colour" },
        { code: "colour_data_v2", value: { h: 0, s: 1000, v: 700 } },
      ];
    } else if (color === "white") {
      commands = [
        { code: "switch_led", value: true },
        { code: "work_mode", value: "white" },
        { code: "bright_value_v2", value: 350 },
        { code: "temp_value_v2", value: 400 },
      ];
    }

    const cmdBody = JSON.stringify({ commands });
    const result = await tuyaFetch(
      region, accessId, accessSecret,
      "POST", `/v1.0/iot-03/devices/${deviceId}/commands`,
      cmdBody, accessToken
    );

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 500,
    });
  }
});
