import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

const SERVICE_ACCOUNT_SECRET_NAME = "FIREBASE_SERVICE_ACCOUNT_JSON";
const SERVICE_ACCOUNT_ERROR =
  `Firebase service account missing/invalid. Add secret: ${SERVICE_ACCOUNT_SECRET_NAME} (full JSON from Firebase service account key).`;

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

function parseServiceAccount(): ServiceAccount {
  const rawJson = Deno.env.get(SERVICE_ACCOUNT_SECRET_NAME)?.trim();

  if (rawJson) {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error(`${SERVICE_ACCOUNT_ERROR} JSON parse failed.`);
    }

    const client_email = String(parsed?.client_email || "").trim();
    const project_id = String(parsed?.project_id || "").trim();
    const private_key = normalizePrivateKey(String(parsed?.private_key || ""));

    if (!client_email || !project_id || !private_key.includes("BEGIN PRIVATE KEY")) {
      throw new Error(`${SERVICE_ACCOUNT_ERROR} Required fields missing.`);
    }

    return { client_email, project_id, private_key };
  }

  const client_email = String(Deno.env.get("FIREBASE_CLIENT_EMAIL") || "").trim();
  const project_id = String(Deno.env.get("FIREBASE_PROJECT_ID") || "").trim();
  const private_key = normalizePrivateKey(String(Deno.env.get("FIREBASE_PRIVATE_KEY") || ""));

  if (!client_email || !project_id || !private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error(SERVICE_ACCOUNT_ERROR);
  }

  return { client_email, project_id, private_key };
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const pemKey = serviceAccount.private_key;
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const sig = base64UrlEncode(new Uint8Array(signature));
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// Fetch tokens from Firebase Realtime Database
async function fetchTokensFromRTDB(userIds: string[]): Promise<string[]> {
  const dbUrl = "https://icf-anime-site-default-rtdb.firebaseio.com";
  const tokens: string[] = [];

  for (const userId of userIds) {
    try {
      const response = await fetch(`${dbUrl}/fcmTokens/${userId}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          Object.values(data).forEach((entry: any) => {
            if (entry?.token) tokens.push(entry.token);
          });
        }
      }
    } catch (err) {
      console.error(`Failed to fetch tokens for ${userId}:`, err);
    }
  }

  return [...new Set(tokens)];
}

const BRAND_ICON_URL = "https://i.ibb.co/VpwCTQ1W/1774431400079.png";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokens, userIds, title, body, image, data } = await req.json();

    console.log("📨 Received request:", { tokens: tokens?.length, userIds: userIds?.length, title });

    const inputTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
    const inputUserIds = Array.isArray(userIds) ? userIds.filter(Boolean) : [];

    if (inputTokens.length === 0 && inputUserIds.length === 0) {
      return new Response(JSON.stringify({ error: "No tokens or userIds provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccount = parseServiceAccount();
    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    console.log("🔑 Access token obtained for project:", projectId);

    let resolvedTokens = [...new Set(inputTokens)];

    // Fetch tokens from RTDB if userIds provided
    if (resolvedTokens.length === 0 && inputUserIds.length > 0) {
      console.log("🔍 Fetching tokens from RTDB for users:", inputUserIds);
      resolvedTokens = await fetchTokensFromRTDB(inputUserIds);
      console.log(`✅ Found ${resolvedTokens.length} tokens for ${inputUserIds.length} users`);
    }

    if (resolvedTokens.length === 0) {
      return new Response(JSON.stringify({
        success: 0,
        failed: 0,
        totalTokens: 0,
        reason: "NO_TOKENS_FOUND",
        message: "No push tokens found for the specified users"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notifications
    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    for (const token of resolvedTokens) {
      try {
        const message = {
          message: {
            token,
            notification: {
              title: title || "ICF ANIME",
              body: body || "New notification",
            },
            webpush: {
              headers: {
                Urgency: "high",
                TTL: "2419200",
              },
              notification: {
                title: title || "ICF ANIME",
                body: body || "New notification",
                icon: image || BRAND_ICON_URL,
                badge: BRAND_ICON_URL,
                vibrate: [200, 100, 200],
              },
              fcm_options: {
                link: data?.url || "/",
              },
            },
            data: {
              ...data,
              title: title || "ICF ANIME",
              body: body || "New notification",
              icon: image || BRAND_ICON_URL,
              timestamp: String(Date.now()),
            },
          },
        };

        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (response.ok) {
          successCount++;
          console.log(`✅ Sent to: ${token.substring(0, 20)}...`);
        } else {
          const errorText = await response.text();
          console.error(`❌ Failed to send to ${token.substring(0, 20)}...:`, errorText);
          failCount++;
          
          // Check if token is invalid
          if (errorText.includes("UNREGISTERED") || errorText.includes("NOT_REGISTERED")) {
            invalidTokens.push(token);
          }
        }
      } catch (err) {
        console.error(`❌ Error sending to ${token.substring(0, 20)}...:`, err);
        failCount++;
      }
    }

    return new Response(JSON.stringify({
      success: successCount,
      failed: failCount,
      totalTokens: resolvedTokens.length,
      invalidTokens: invalidTokens,
      message: `Sent ${successCount} notifications, failed ${failCount}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("💥 Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
