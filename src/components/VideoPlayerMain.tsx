'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Stream } from '@cloudflare/stream-react';
import { Video } from '../types';
import { formatTime } from '../utils/time';
import { formatViewCount } from '../utils/dateUtils';
import { User } from '../services/user-manager';

interface VideoPlayerMainProps {
  video: Video;
  onBack?: () => void;
  onSeekTime?: number; // Time to seek to when changed
  onVideoRefresh?: () => void;
  onTagClick?: (tag: string) => void;
  showQuickActions?: boolean; // Control visibility of quick actions
}

export function VideoPlayerMain({ video, onBack, onSeekTime, onVideoRefresh, onTagClick, showQuickActions = true }: VideoPlayerMainProps) {
  const { data: session } = useSession();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingAbstract, setIsEditingAbstract] = useState(false);
  const [editTitle, setEditTitle] = useState(video.title);
  const [editAbstract, setEditAbstract] = useState(video.abstract || '');
  const [isSaving, setIsSaving] = useState(false);

  // Check if user can edit (creator or admin) and if we're in creator interface
  const user = session?.user as User | undefined;
  const canEdit = showQuickActions && (user?.role === 'creator' || user?.role === 'admin');

  // Debug logging for onSeekTime prop changes
  useEffect(() => {
    console.log('VideoPlayerMain: onSeekTime prop changed to:', onSeekTime);
  }, [onSeekTime]);

  // Update local state when video prop changes
  useEffect(() => {
    setEditTitle(video.title);
    setEditAbstract(video.abstract || '');
  }, [video.title, video.abstract]);

  const handleSaveTitle = async () => {
    if (!editTitle.trim() || editTitle === video.title) {
      setIsEditingTitle(false);
      setEditTitle(video.title);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/videos', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: video.id,
          title: editTitle.trim(),
        }),
      });

      if (response.ok) {
        setIsEditingTitle(false);
        onVideoRefresh?.();
      } else {
        console.error('Failed to update title');
        setEditTitle(video.title);
      }
    } catch (error) {
      console.error('Error updating title:', error);
      setEditTitle(video.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAbstract = async () => {
    if (!editAbstract.trim() && !video.abstract) {
      setIsEditingAbstract(false);
      return;
    }

    if (editAbstract === (video.abstract || '')) {
      setIsEditingAbstract(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/videos', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: video.id,
          abstract: editAbstract.trim(),
        }),
      });

      if (response.ok) {
        setIsEditingAbstract(false);
        onVideoRefresh?.();
      } else {
        console.error('Failed to update abstract');
        setEditAbstract(video.abstract || '');
      }
    } catch (error) {
      console.error('Error updating abstract:', error);
      setEditAbstract(video.abstract || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = (field: 'title' | 'abstract') => {
    if (field === 'title') {
      setIsEditingTitle(false);
      setEditTitle(video.title);
    } else {
      setIsEditingAbstract(false);
      setEditAbstract(video.abstract || '');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, field: 'title' | 'abstract') => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (field === 'title') {
        handleSaveTitle();
      } else {
        handleSaveAbstract();
      }
    } else if (e.key === 'Escape') {
      handleCancelEdit(field);
    }
  };






  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    if (diffDays <= 30) return `${Math.ceil((diffDays - 1) / 7)} weeks ago`;
    return date.toLocaleDateString();
  };



  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg">
      {/* Back Button */}
      {onBack && (
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center text-sm text-black hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Library
          </button>
        </div>
      )}
      {/* Video Player */}
      <div className={`aspect-video bg-black overflow-hidden ${onBack ? 'rounded-none' : 'rounded-t-lg'}`}>
        {video.status === 'ready' ? (
          <Stream
            controls
            src={video.stream_id}
            className="w-full h-full"
            poster={video.thumbnail_url}
            preload="metadata"
            currentTime={onSeekTime && onSeekTime > 0 ? onSeekTime : undefined}
            autoplay={onSeekTime !== undefined && onSeekTime > 0}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center">
              {video.status === 'processing' ? (
                <>
                  <svg className="w-12 h-12 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-sm">Processing video...</p>
                  <p className="text-xs text-gray-300 mt-1">This may take a few minutes</p>
                </>
              ) : (
                <>
                  <svg className="w-12 h-12 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm">Video unavailable</p>
                  <p className="text-xs text-gray-300 mt-1">There was an error processing this video</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Video Info */}
      <div className="p-6">
        {/* Title */}
        <div className="mb-2">
          {isEditingTitle ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, 'title')}
                  className="flex-1 text-xl font-semibold border-2 border-blue-500 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-black bg-blue-50"
                  disabled={isSaving}
                  autoFocus
                  placeholder="Enter video title..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSaveTitle}
                    disabled={isSaving || !editTitle.trim()}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                  <button
                    onClick={() => handleCancelEdit('title')}
                    disabled={isSaving}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:ring-2 focus:ring-gray-500 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  Press Enter to save • Esc to cancel
                </div>
              </div>
            </div>
          ) : (
            <div className="group relative">
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-semibold text-gray-900">
                  {video.title}
                </h2>
                {canEdit && (
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                    title="Click to edit title"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
              {canEdit && (
                <div className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1">
                  Click the edit icon to modify title
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Abstract */}
        {isEditingAbstract ? (
          <div className="mb-4">
            <div className="space-y-2">
              <textarea
                value={editAbstract}
                onChange={(e) => setEditAbstract(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, 'abstract')}
                className="w-full leading-relaxed border-2 border-blue-500 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-black min-h-[120px] resize-vertical bg-blue-50"
                disabled={isSaving}
                autoFocus
                placeholder="Enter a brief summary or abstract of your video..."
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSaveAbstract}
                    disabled={isSaving}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                  <button
                    onClick={() => handleCancelEdit('abstract')}
                    disabled={isSaving}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:ring-2 focus:ring-gray-500 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  Shift+Enter for new line • Enter to save • Esc to cancel
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            {video.abstract ? (
              <div className="group relative bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between">
                  <p className="text-gray-700 leading-relaxed flex-1 pr-2 italic">
                    {video.abstract}
                  </p>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingAbstract(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md flex-shrink-0"
                      title="Click to edit abstract"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
                {canEdit && (
                  <div className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-2">
                    Click the edit icon to edit abstract
                  </div>
                )}
              </div>
            ) : (
              canEdit && (
                <button
                  onClick={() => setIsEditingAbstract(true)}
                  className="w-full text-left bg-gray-50 hover:bg-blue-50 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg p-4 text-gray-500 hover:text-blue-600 transition-all duration-200 group"
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="font-medium">Add abstract</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 ml-7">
                    Click to add a brief summary for this video
                  </div>
                </button>
              )
            )}
          </div>
        )}
        
        {/* Tags */}
        {video.tags && video.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {video.tags.map((tag, index) => (
                <button
                  key={index}
                  onClick={() => onTagClick?.(tag)}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  title={`Filter by tag: ${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center text-sm text-gray-900 space-x-6">
            <span>Uploaded {formatDate(video.upload_date)}</span>
            {video.duration && <span>Duration: {formatTime(video.duration)}</span>}
            {video.view_count !== undefined && (
              <span className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{formatViewCount(video.view_count)} views</span>
              </span>
            )}
            {video.created_by && (
              <span className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>by {video.created_by}</span>
              </span>
            )}
            <span className="capitalize">Status: {video.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
