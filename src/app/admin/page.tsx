'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { UserManagement } from '@/components/UserManagement';
import { useRouter } from 'next/navigation';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { Header } from '@/components/Header';

export default function AdminPage() {
  const { data: session } = useSession();
  const { canAccessAdmin, loading } = useAdminPermissions();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session && !canAccessAdmin) {
      router.push('/');
    }
  }, [session, canAccessAdmin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    router.push('/auth/signin');
    return null;
  }

  if (!canAccessAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don&apos;t have permission to access the admin interface.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
        <Header />
      <UserManagement />
    </div>
  );
}
