'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { VideoUpload } from '../../components/VideoUpload';
import { YouTubeDownloader } from '../../components/YouTubeDownloader';
import VideoLibrary from '../../components/VideoLibrary';
import { SearchBar } from '../../components/SearchBar';
import { Header } from '../../components/Header';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useSession } from 'next-auth/react';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';

import { Video, VideoWithScore } from '../../types';

function CreatorContent() {
  const { data: session } = useSession();
  const { canAccessCreator, loading: permissionsLoading } = useAdminPermissions();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchResults, setSearchResults] = useState<VideoWithScore[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialUrlProcessed, setInitialUrlProcessed] = useState(false);
  const [activeUploadTab, setActiveUploadTab] = useState<'file' | 'youtube'>('file');

  // Update URL for search queries only
  const updateUrl = useCallback((params: { q?: string }) => {
    const url = new URL(window.location.href);
    
    // Clear search param first
    url.searchParams.delete('q');
    
    // Add search query if provided
    if (params.q) url.searchParams.set('q', params.q);
    
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Search function
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      // Update URL to remove search query
      updateUrl({});
      return;
    }

    setIsSearching(true);
    
    // Update URL with search query
    updateUrl({ q: query });

    try {
      // Use GET request with query parameters like the TV page
      const response = await fetch(`/api/vectors/search?q=${encodeURIComponent(query)}&limit=20&minScore=0.3&includeMetadata=true`);
      
      if (response.ok) {
        const vectorResults = await response.json() as Array<{
          videoId: string;
          title: string;
          description: string;
          chunkIndex: number;
          content: string;
          score: number;
          metadata: {
            videoTitle: string;
            videoDescription: string;
            chunkStart: number;
            chunkEnd: number;
            tags: string;
          };
        }>;
        
        // Extract unique video IDs and their highest confidence scores
        const videoScoreMap = new Map<string, number>();
        const videoIds: string[] = [];
        
        vectorResults.forEach((result) => {
          if (result.videoId) {
            const currentScore = videoScoreMap.get(result.videoId);
            if (!currentScore || result.score > currentScore) {
              videoScoreMap.set(result.videoId, result.score);
            }
            if (!videoIds.includes(result.videoId)) {
              videoIds.push(result.videoId);
            }
          }
        });
        
        // Fetch full video details and add confidence scores
        if (videoIds.length > 0) {
          const videoDetailsPromises = videoIds.map(async (videoId) => {
            try {
              const videoResponse = await fetch(`/api/videos/${videoId}`);
              if (videoResponse.ok) {
                const video = await videoResponse.json() as Video;
                const videoWithScore: VideoWithScore = {
                  ...video,
                  confidence_score: videoScoreMap.get(videoId) || 0
                };
                return videoWithScore;
              }
              return null;
            } catch (error) {
              console.error(`Failed to fetch video ${videoId}:`, error);
              return null;
            }
          });
          
          const videos = await Promise.all(videoDetailsPromises);
          const validVideos = videos.filter((video): video is VideoWithScore => video !== null);
          setSearchResults(validVideos);
        } else {
          setSearchResults([]);
        }
      } else {
        console.error('Vector search failed:', response.status, response.statusText);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [updateUrl]);

  // Process URL parameters once when component mounts and data is available
  const processUrlParams = useCallback(async () => {
    const query = searchParams.get('q');

    // Handle search query from URL
    if (query) {
      await handleSearch(query);
    }
  }, [searchParams, handleSearch]);

  const loadVideos = useCallback(async () => {
    try {
      const response = await fetch('/api/videos');
      if (response.ok) {
        const data: Video[] = await response.json();
        setVideos(data);
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Periodic sync for processing videos
  const performPeriodicSync = useCallback(async () => {
    if (!session?.user) return;
    
    try {
      // Check if there are any processing videos
      const processingVideos = videos.filter(video => video.status === 'processing');
      if (processingVideos.length === 0) return;
      
      console.log(`Performing periodic sync for ${processingVideos.length} processing videos`);
      
      const response = await fetch('/api/videos/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });
      
      if (response.ok) {
        console.log('Periodic sync completed successfully');
        // Reload videos to get updated status
        await loadVideos();
      }
    } catch (error) {
      console.error('Periodic sync error:', error);
    }
  }, [session, videos, loadVideos]);

  // Load videos on mount
  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Set up periodic sync every 2 minutes for processing videos
  useEffect(() => {
    if (!session?.user) return;
    
    const interval = setInterval(performPeriodicSync, 2 * 60 * 1000); // 2 minutes
    
    return () => clearInterval(interval);
  }, [performPeriodicSync, session?.user]);

  // Handle URL params when data is available and not yet processed
  useEffect(() => {
    if (!initialUrlProcessed && (videos.length > 0 || searchResults.length > 0)) {
      processUrlParams().then(() => {
        setInitialUrlProcessed(true);
      });
    }
  }, [videos, searchResults, initialUrlProcessed, processUrlParams]);

  const handleVideoSelect = useCallback((video: Video) => {
    router.push(`/creator/${video.id}`);
  }, [router]);

  // Redirect if user doesn't have creator access
  useEffect(() => {
    if (!permissionsLoading && session && !canAccessCreator) {
      router.push('/tv');
    }
  }, [session, canAccessCreator, permissionsLoading, router]);

  const handleVideoUploaded = (newVideo: Video) => {
    setVideos(prev => [newVideo, ...prev]);
  };

  const handleVideoUpdate = async (videoId: string, updates: { title?: string; description?: string }) => {
    if (!session?.user) {
      console.error('Authentication required to update video');
      return;
    }
    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const result = await response.json() as { video: Video };
        // Update videos list
        setVideos(prev => prev.map(video => 
          video.id === videoId ? { ...video, ...result.video } : video
        ));
        // Update search results if present
        setSearchResults(prev => prev.map(video => 
          video.id === videoId ? { ...video, ...result.video } : video
        ));
      } else {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to update video');
      }
    } catch (error) {
      console.error('Failed to update video:', error);
      throw error;
    }
  };

  const displayVideos = searchResults.length > 0 ? searchResults : videos;

  // Show loading while checking permissions
  if (permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect if no access (this should not render due to useEffect, but safety check)
  if (session && !canAccessCreator) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <Header 
          videoCount={videos.length}
          readyVideoCount={videos.filter(v => v.status === 'ready').length}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
            {/* Search Bar */}
            <SearchBar onSearch={handleSearch} />

            {/* Video Library */}
            <VideoLibrary 
              videos={displayVideos}
              loading={loading}
              onVideoSelect={handleVideoSelect}
              isSearching={isSearching}
              onVideoUpdate={handleVideoUpdate}
              showStatus={true}
            />
            
          {/* Upload Area with Tabs */}
          <div className="bg-white rounded-lg border border-gray-200">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6" aria-label="Upload tabs">
                <button
                  onClick={() => setActiveUploadTab('file')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeUploadTab === 'file'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    File Upload
                  </div>
                </button>
                <button
                  onClick={() => setActiveUploadTab('youtube')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeUploadTab === 'youtube'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    YouTube Download
                  </div>
                </button>
              </nav>
            </div>
            
            {/* Tab Content */}
            <div className="p-6">
              {activeUploadTab === 'file' && (
                <VideoUpload onVideoUploaded={handleVideoUploaded} />
              )}
              {activeUploadTab === 'youtube' && (
                <YouTubeDownloader onVideoUploaded={handleVideoUploaded} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreatorPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Creator...</p>
          </div>
        </div>
      }>
        <CreatorContent />
      </Suspense>
    </ProtectedRoute>
  );
}
