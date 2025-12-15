'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthErrorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string>('An authentication error occurred')

  useEffect(() => {
    const errorParam = searchParams.get('error')
    
    if (errorParam) {
      switch (errorParam) {
        case 'Configuration':
          setError('Authentication service is not properly configured.')
          break
        case 'AccessDenied':
          setError('Access denied. You do not have permission to access this resource.')
          break
        case 'Verification':
          setError('Token verification failed. Please try signing in again.')
          break
        case 'OAuthSignin':
          setError('Error occurred during OAuth sign-in process.')
          break
        case 'OAuthCallback':
          setError('Error occurred during OAuth callback.')
          break
        case 'OAuthCreateAccount':
          setError('Could not create OAuth account.')
          break
        case 'EmailCreateAccount':
          setError('Could not create email account.')
          break
        case 'Callback':
          setError('Error occurred during callback.')
          break
        case 'OAuthAccountNotLinked':
          setError('OAuth account is not linked to an existing account.')
          break
        case 'EmailSignin':
          setError('Error occurred during email sign-in.')
          break
        case 'CredentialsSignin':
          setError('Invalid credentials provided.')
          break
        case 'SessionRequired':
          setError('Session required. Please sign in.')
          break
        default:
          setError(`Authentication error: ${errorParam}`)
      }
    }
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            There was a problem with your authentication
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {error}
                </h3>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            <button
              onClick={() => router.push('/auth/signin')}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Try Again
            </button>
            
            <button
              onClick={() => router.push('/tv')}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to TV Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}
