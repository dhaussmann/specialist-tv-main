'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, getProviders } from 'next-auth/react'

type Providers = Awaited<ReturnType<typeof getProviders>>

function SignInContent() {
  const [providers, setProviders] = useState<Providers>(null);
  useEffect(() => {
    (async () => {
      const providersRes = await getProviders();
      setProviders(providersRes);
    })();
  }, []);
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState<string | null>(null) // Store provider id being loaded
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = searchParams.get('callbackUrl') || '/creator'
  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (errorParam) {
      switch (errorParam) {
        case 'OAuthSignin':
        case 'OAuthCallback':
        case 'OAuthCreateAccount':
        case 'EmailCreateAccount':
        case 'Callback':
        case 'OAuthAccountNotLinked':
          setError('Authentication failed. Please try again or use a different method.')
          break
        case 'CredentialsSignin':
          setError('Invalid credentials. Please check your details and try again.')
          break
        default:
          setError('An unknown authentication error occurred. Please try again.')
      }
    }
  }, [errorParam])

  const handleSignIn = async (providerId: string) => {
    setIsLoading(providerId)
    setError(null)

    try {
      const result = await signIn(providerId, { 
        redirect: false, // Handle redirect manually for better error handling
        callbackUrl 
      });
      
      if (result?.error) {
        setError(`Authentication failed: ${result.error}`);
        setIsLoading(null);
      } else if (result?.url) {
        // Successful sign-in, redirect to callback URL
        window.location.href = result.url;
      } else {
        // Fallback redirect
        router.push(callbackUrl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError('Failed to initiate sign-in. Please try again: ' + errorMessage)
      setIsLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to Specialist TV
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Access the creator dashboard and video management tools
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <div className="space-y-4">
            {providers && Object.values(providers).map((provider) => {
              const isGoogleProvider = provider.id === 'google';
              
              return (
                <div key={provider.name}>
                  <button
                    onClick={() => handleSignIn(provider.id)}
                    disabled={!!isLoading}
                    className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isGoogleProvider 
                        ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm'
                        : 'text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                    }`}
                  >
                    {isLoading === provider.id ? (
                      <div className="flex items-center">
                        <div className="animate-spin -ml-1 mr-3 h-5 w-5">
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                        Signing in...
                      </div>
                    ) : (
                      <div className="flex items-center">
                        {isGoogleProvider && (
                          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        )}
                        Sign in with {provider.name}
                      </div>
                    )}
                  </button>
                  {isGoogleProvider && (
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      Secure OAuth 2.0 authentication with automatic token refresh
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">or</span>
              </div>
            </div>
            
            <button
              onClick={() => router.push('/tv')}
              className="inline-flex items-center text-blue-600 hover:text-blue-500 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Continue to TV Mode (No Sign-in Required)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading authentication options...</p>
          </div>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
