'use client';

import React from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getProxiedAvatarUrl } from '@/utils/avatar';

interface HeaderProps {
  videoCount?: number;
  readyVideoCount?: number;
}

function CreatorNavigationLink({ isActive }: { isActive: (path: string) => boolean }) {
  const { canAccessCreator } = useAdminPermissions();
  
  if (!canAccessCreator) {
    return null;
  }
  
  return (
    <Link 
      href="/creator" 
      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
        isActive('/creator') 
          ? 'border-blue-500 text-blue-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      Creator
    </Link>
  );
}

function AdminNavigationLink({ isActive }: { isActive: (path: string) => boolean }) {
  const { canAccessAdmin } = useAdminPermissions();
  
  if (!canAccessAdmin) {
    return null;
  }
  
  return (
    <Link 
      href="/admin" 
      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
        isActive('/admin') 
          ? 'border-blue-500 text-blue-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      Admin
    </Link>
  );
}

export function Header({ videoCount = 0, readyVideoCount = 0 }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  const { data: session, status } = useSession();

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  const handleSignIn = () => {
    router.push('/auth/signin');
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <Link href="/tv" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Specialist TV</h1>
            </Link>
            
            {/* Navigation Menu */}
            <nav className="flex items-center space-x-8">
              <Link 
                href="/tv" 
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive('/tv') 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                TV
              </Link>
              <CreatorNavigationLink isActive={isActive} />
              <AdminNavigationLink isActive={isActive} />
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Video Stats - show only on creator page */}
            {pathname === '/creator' && videoCount > 0 && (
              <div className="text-sm text-gray-600">
                {videoCount} videos{readyVideoCount !== undefined ? ` • ${readyVideoCount} ready` : ''}
              </div>
            )}
            
            {/* User Profile Section */}
            {status === 'authenticated' && session?.user ? (
              <div className="flex items-center space-x-3">
                {/* User Profile Picture and Info */}
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {session.user.image ? (
                      <Image
                        src={getProxiedAvatarUrl(session.user.image) || session.user.image}
                        alt={session.user.name || 'User'}
                        width={32}
                        height={32}
                        className="rounded-full border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {(session.user.name || session.user.email || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">
                        {session.user.name || 'User'}
                      </span>
                      {session.user.email && (
                        <span className="text-xs text-gray-500">
                          {session.user.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  title="Sign out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 2H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m0 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3v1" />
                </svg>
                Login
              </button>
            )}
          </div>
        </div>
      </div>

    </header>
  );
}
