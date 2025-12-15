// Webhook signature verification utilities for Cloudflare Stream

// Verify webhook signature according to Cloudflare Stream documentation
export async function verifyWebhookSignature(
  requestBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Parse signature header: "time=1230811200,sig1=60493ec9388b44585a29543bcf0de62e377d4da393246a8b1c901d0e3e672404"
    const parts = signature.split(',');
    let timestamp = '';
    let sig = '';
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 'time') {
        timestamp = value;
      } else if (key === 'sig1') {
        sig = value;
      }
    }
    
    if (!timestamp || !sig) {
      console.error('Invalid signature format');
      return false;
    }
    
    // Check timestamp (reject requests older than 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    if (now - requestTime > 300) {
      console.error('Webhook timestamp too old');
      return false;
    }
    
    // Create signature source string: timestamp + "." + request body
    const sourceString = timestamp + '.' + requestBody;
    
    // Create expected signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const sourceData = encoder.encode(sourceString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, sourceData);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Compare signatures using constant-time comparison
    return constantTimeEqual(sig, expectedSignature);
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// Constant-time string comparison to prevent timing attacks
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
