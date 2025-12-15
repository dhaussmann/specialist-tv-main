import { Auth } from "@auth/core"
import { getAuthConfig } from "../../../../lib/auth"
import { getContext } from "../../../../lib/context";

async function handler(request: Request) {
  console.log(`--- Auth Handler Request: ${request.method} ${request.url} ---`);
  
  // Use the new centralized context helper
  const { env } = getContext();
  
  // Force HTTP for localhost development by modifying the request
  const url = new URL(request.url);
  let modifiedRequest = request;
  
  if (env.NEXTJS_ENV === 'development' && url.hostname === 'localhost') {
    // Create new URL with HTTP protocol
    const httpUrl = url.toString().replace('https://', 'http://');
    modifiedRequest = new Request(httpUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    
    // Also set environment variable
    process.env.AUTH_URL = `http://${url.host}`;
    console.log(`--- Modified request URL to HTTP: ${httpUrl} ---`);
  }

  console.log(`--- Auth Handler Environment: ${JSON.stringify(env)} ---`);
  console.log(`--- Auth Handler Request: ${modifiedRequest.method} ${modifiedRequest.url} ---`);
  
  if (!env) {
    return new Response("Environment not available", { status: 500 })
  }


  const authConfig = getAuthConfig(env)
  
  return Auth(modifiedRequest, authConfig);
}

export { handler as GET, handler as POST }
