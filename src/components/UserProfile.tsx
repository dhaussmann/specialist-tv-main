'use client';

import { useState } from 'react';
import Image from 'next/image';
import { User } from '../types/auth';
import { generateAvatarUrl, getDisplayName } from '../utils/jwt';

interface UserProfileProps {
  user: User;
  onLogout: () => void;
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const displayName = getDisplayName(user);
  const avatarUrl = user.picture || generateAvatarUrl(user.username);

  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleLogout = () => {
    setIsDropdownOpen(false);
    onLogout();
  };

  return (
    <div className="relative">
      {/* Profile Button */}
      <button
        onClick={handleDropdownToggle}
        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      >
        {/* Avatar */}
        <Image
          src={avatarUrl}
          alt={`${displayName}'s avatar`}
          width={32}
          height={32}
          className="w-8 h-8 rounded-full border-2 border-gray-200"
          onError={(e) => {
            // Fallback to generated avatar if image fails to load
            const target = e.target as HTMLImageElement;
            target.src = generateAvatarUrl(user.username);
          }}
        />
        
        {/* Name and chevron */}
        <div className="flex items-center space-x-1">
          <span className="text-sm font-medium text-gray-700 hidden sm:block">
            {displayName}
          </span>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />
          
          {/* Dropdown Content */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            {/* User Info Section */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <Image
                  src={avatarUrl}
                  alt={`${displayName}'s avatar`}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full border-2 border-gray-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {displayName}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    @{user.username}
                  </p>
                  {user.email && (
                    <p className="text-xs text-gray-400 truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Section */}
            <div className="p-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg
                  className="w-4 h-4 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
