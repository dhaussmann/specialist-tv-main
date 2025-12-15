'use client';

import { Video, VideoWithScore } from '../types';
import { formatTime } from '../utils/time';
import { formatViewCount, formatRelativeDate } from '../utils/dateUtils';
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
// Authentication handled via cookies in API endpoints

interface VideoLibraryProps {
  videos: VideoWithScore[];
  loading: boolean;
  onVideoSelect: (video: Video) => void;
  isSearching: boolean;
  onVideoUpdate?: (videoId: string, updates: { title?: string; description?: string }) => Promise<void>;
  showStatus?: boolean; // Hide status in TV mode, show in Creator mode
}

const VideoLibrary: React.FC<VideoLibraryProps> = ({ videos, loading, onVideoSelect, isSearching, onVideoUpdate, showStatus = true }) => {
  const { data: session } = useSession();
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState<string | null>(null);
  const [syncingVideoId, setSyncingVideoId] = useState<string | null>(null);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Handle starting title edit
  const handleStartEdit = (video: VideoWithScore) => {
    setEditingVideoId(video.id);
    setEditingTitle(video.title);
  };

  // Handle saving title edit
  const handleSaveEdit = async (videoId: string) => {
    if (!onVideoUpdate || !editingTitle.trim()) {
      handleCancelEdit();
      return;
    }

    setIsUpdating(videoId);
    try {
      await onVideoUpdate(videoId, { title: editingTitle.trim() });
      setEditingVideoId(null);
      setEditingTitle('');
    } catch (error) {
      console.error('Failed to update video title:', error);
      // Keep editing mode active on error
    } finally {
      setIsUpdating(null);
    }
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingVideoId(null);
    setEditingTitle('');
  };

  // Handle sync video
  const handleSyncVideo = async (videoId: string) => {
    if (!session) return;
    
    try {
      setSyncingVideoId(videoId);
      const response = await fetch(`/api/videos/${videoId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });
      
      if (response.ok) {
        console.log('Video sync completed successfully');
        // Trigger a refresh by calling onVideoUpdate with empty updates
        // This will cause the parent component to refresh the video list
        if (onVideoUpdate) {
          await onVideoUpdate(videoId, {});
        }
      } else {
        console.error('Failed to sync video');
      }
    } catch (error) {
      console.error('Error syncing video:', error);
    } finally {
      setSyncingVideoId(null);
    }
  };

  // Handle key press in edit input
  const handleKeyPress = (e: React.KeyboardEvent, videoId: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(videoId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Handle AI title generation
  const handleGenerateAITitle = async (videoId: string) => {
    setIsGeneratingTitle(videoId);
    try {
      const response = await fetch(`/api/videos/${videoId}/generate-title`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result = await response.json() as { success: boolean; title?: string; message: string };
      
      if (result.success && result.title) {
        // Enter edit mode and populate with AI-generated title for user review
        setEditingVideoId(videoId);
        setEditingTitle(result.title);
      } else {
        console.error('Failed to generate AI title:', result.message);
        // Could show a toast notification here
      }
    } catch (error) {
      console.error('Failed to generate AI title:', error);
    } finally {
      setIsGeneratingTitle(null);
    }
  };

  // Filter and sort videos
  const filteredAndSortedVideos = React.useMemo(() => {
    let filtered = videos;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(video => video.status === statusFilter);
    }

    // Filter by tag
    if (tagFilter !== 'all') {
      filtered = filtered.filter(video => 
        video.tags && video.tags.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()))
      );
    }

    // Sort videos
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime();
        case 'oldest':
          return new Date(a.upload_date).getTime() - new Date(b.upload_date).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [videos, statusFilter, tagFilter, sortBy]);

  // Get unique tags for filter dropdown
  const availableTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    videos.forEach(video => {
      if (video.tags) {
        video.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [videos]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--:--';
    return formatTime(seconds);
  };

  // Confidence score badge styling functions (same as vector page)
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-blue-600 bg-blue-50';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-orange-100 text-orange-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'processing':
        return (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };



  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Filter skeleton */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Video Library</h2>
            <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
          </div>
        </div>
        
        {/* Video list skeleton */}
        <div className="divide-y divide-gray-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-6 animate-pulse">
              <div className="flex space-x-4">
                <div className="w-32 h-18 bg-gray-200 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            {isSearching ? 'Search Results' : 'Video Library'}
          </h2>
          <span className="text-sm text-gray-900">
            {filteredAndSortedVideos.length} of {videos.length} {videos.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        
        {/* Filter Controls */}
        {!isSearching && (
          <div className="flex flex-wrap gap-4">
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-800">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm text-gray-800 bg-white border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
              >
                <option value="all">All</option>
                <option value="ready">Ready</option>
                <option value="processing">Processing</option>
                <option value="error">Error</option>
                <option value="uploaded">Uploaded</option>
              </select>
            </div>
            
            {/* Tag Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-800">Tag:</label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="text-sm text-gray-800 bg-white border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
              >
                <option value="all">All Tags</option>
                {availableTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            
            {/* Sort By */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-800">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm text-gray-800 bg-white border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title A-Z</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-200">
        {filteredAndSortedVideos.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {isSearching ? 'No videos found' : (videos.length === 0 ? 'No videos yet' : 'No videos match filters')}
            </h3>
            <p className="text-sm text-gray-900">
              {isSearching 
                ? 'Try adjusting your search terms or browse all videos.' 
                : (videos.length === 0 
                  ? 'Upload your first video to get started with the knowledge hub.'
                  : 'Try adjusting your filters to see more videos.'
                )
              }
            </p>
          </div>
        ) : (
          filteredAndSortedVideos.map((video) => (
            <div key={video.id} className="border-b border-gray-200 last:border-b-0">
              <div 
                className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onVideoSelect(video)}
              >
                <div className="flex space-x-4">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0">
                    <div className="w-32 h-18 bg-gray-200 rounded-lg overflow-hidden relative">
                      {video.status === 'processing' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-1"></div>
                          <span className="text-xs text-gray-800 font-medium">Processing</span>
                        </div>
                      ) : video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Duration overlay */}
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">
                          {formatDuration(video.duration)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="group">
                        {editingVideoId === video.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => handleKeyPress(e, video.id)}
                              onBlur={() => handleSaveEdit(video.id)}
                              className="flex-1 text-base font-medium text-black bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              autoFocus
                              disabled={isUpdating === video.id || isGeneratingTitle === video.id}
                            />
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleGenerateAITitle(video.id)}
                                disabled={isUpdating === video.id || isGeneratingTitle === video.id}
                                className="p-1 text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                title="Generate AI title from transcript"
                              >
                                {isGeneratingTitle === video.id ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() => handleSaveEdit(video.id)}
                                disabled={isUpdating === video.id || isGeneratingTitle === video.id}
                                className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                title="Save"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isUpdating === video.id || isGeneratingTitle === video.id}
                                className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                                title="Cancel"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <h3 
                              className="text-base font-medium text-gray-900 line-clamp-2 flex-1 mr-2 hover:text-blue-600 transition-colors cursor-pointer"
                              onClick={() => onVideoSelect(video)}
                            >
                              {video.title}
                            </h3>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateAITitle(video.id);
                                }}
                                disabled={isGeneratingTitle === video.id}
                                className="p-1 text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                title="Generate AI title from transcript"
                              >
                                {isGeneratingTitle === video.id ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(video);
                                }}
                                className="p-1 text-gray-600 hover:text-gray-800"
                                title="Edit title"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-2">
                        {/* Confidence Score Badge */}
                        {video.confidence_score !== undefined && (
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(video.confidence_score)}`}>
                            {(video.confidence_score * 100).toFixed(1)}% ({getScoreLabel(video.confidence_score)})
                          </div>
                        )}
                        
                        {/* Status badge - only show in Creator mode */}
                        {showStatus && (
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(video.status)}`}>
                              {getStatusIcon(video.status)}
                              <span className="ml-1 capitalize">{video.status}</span>
                            </span>
                            {/* Sync button for processing/ready videos */}
                            {session && (video.status === 'processing' || video.status === 'ready') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSyncVideo(video.id);
                                }}
                                disabled={syncingVideoId === video.id}
                                className="px-2 py-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Force sync video status"
                              >
                                {syncingVideoId === video.id ? 'Syncing...' : 'Sync'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {video.description && (
                      <p className="mt-1 text-sm text-gray-700 line-clamp-2">{video.description}</p>
                    )}

                    {/* Abstract */}
                    {video.abstract && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 italic line-clamp-3">
                          {video.abstract}
                        </p>
                      </div>
                    )}

                    {/* Tags */}
                    {video.tags && video.tags.length > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1">
                          {video.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="mt-2 flex items-center text-xs text-gray-900 space-x-4">
                      <span>{formatRelativeDate(video.upload_date)}</span>
                      {video.duration && (
                        <span>{formatDuration(video.duration)}</span>
                      )}
                      {video.view_count !== undefined && video.view_count !== null && (
                        <span className="flex items-center space-x-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>{formatViewCount(video.view_count)} views</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VideoLibrary;
