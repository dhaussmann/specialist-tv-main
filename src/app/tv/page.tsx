'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '../../components/Header';
import { Video, VideoWithScore } from '../../types';
import { SearchBar } from '../../components/SearchBar';
import { formatTime } from '../../utils/time';
import { formatViewCount, formatRelativeDate } from '../../utils/dateUtils';

function TVContent() {
  const searchParams = useSearchParams();

  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchResults, setSearchResults] = useState<VideoWithScore[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const [initialUrlProcessed, setInitialUrlProcessed] = useState(false);

  // Debounced search to prevent flickering
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Handle video selection by redirecting to slug-based URL
  const handleVideoSelect = useCallback((video: Video) => {
    router.push(`/tv/${video.id}`);
  }, [router]);

  // Optimized search function to prevent flickering
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      // Use the vector search endpoint directly with appropriate parameters
      const response = await fetch(`/api/vectors/search?q=${encodeURIComponent(query)}&limit=20&minScore=0.6&includeMetadata=true`);
      
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
                const confidence_score = videoScoreMap.get(videoId) || 0;
                return { ...video, confidence_score } as VideoWithScore;
              }
            } catch (error) {
              console.error(`Failed to fetch video ${videoId}:`, error);
            }
            return null;
          });
          
          const videoDetails = await Promise.all(videoDetailsPromises);
          const validVideos = videoDetails.filter((video): video is VideoWithScore => video !== null);
          
          // In TV mode, only show ready videos
          const readyVideos = validVideos.filter(video => video.status === 'ready');
          
          // Sort by confidence score (highest first)
          readyVideos.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
          
          setSearchResults(readyVideos);
        } else {
          setSearchResults([]);
        }
      } else {
        console.error('Search failed:', response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle URL parameters on mount
  const handleUrlParams = useCallback(async () => {
    if (initialUrlProcessed) return;
    
    const videoId = searchParams.get('video');
    const timestamp = searchParams.get('t');
    const query = searchParams.get('q');

    console.log('Processing TV URL params:', { videoId, timestamp, query });

    // Handle direct video links by redirecting to slug-based URL
    if (videoId) {
      const timestampParam = timestamp ? `?t=${timestamp}` : '';
      router.push(`/tv/${videoId}${timestampParam}`);
      return;
    }

    // Handle search query from URL
    if (query) {
      await performSearch(query);
    }
    
    setInitialUrlProcessed(true);
  }, [searchParams, initialUrlProcessed, performSearch, router]);

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

  // Load videos from API
  const loadVideos = async () => {
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
  };

  // Handle search with debouncing
  const handleSearch = useCallback((query: string) => {
    // Update URL with search query
    updateUrl({ q: query });
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      performSearch(query);
    }, 300);
    
    setSearchTimeout(timeout);
  }, [performSearch, searchTimeout, updateUrl]);

  // Videos to display (search results or all videos)
  // In TV mode, only show ready videos
  const readyVideos = videos.filter(video => video.status === 'ready');
  const displayVideos = searchResults.length > 0 ? searchResults : readyVideos;

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    handleUrlParams();
  }, [handleUrlParams]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <Header />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TV Library: YouTube-like video grid */}
        <SearchBar onSearch={handleSearch} />
        <TVVideoGrid 
          videos={displayVideos} 
          loading={loading}
          onVideoSelect={handleVideoSelect}
          isSearching={isSearching}
        />
      </div>
    </div>
  );
}

// TV Video Grid Component - YouTube-like video grid
function TVVideoGrid({ 
  videos, 
  loading, 
  onVideoSelect, 
  isSearching 
}: { 
  videos: (Video | VideoWithScore)[];
  loading: boolean;
  onVideoSelect: (video: Video) => void;
  isSearching: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading videos...</p>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📺</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isSearching ? 'No search results' : 'No videos available'}
        </h3>
        <p className="text-gray-600">
          {isSearching ? 'Try a different search term' : 'Videos will appear here once they are uploaded and processed'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {videos.map((video) => (
        <div
          key={video.id}
          onClick={() => onVideoSelect(video)}
          className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
        >
          {/* Thumbnail */}
          <div className="aspect-video bg-gray-100 relative">
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="w-full h-full object-cover"
            />
            {/* Duration Badge */}
            {video.duration && (
              <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                {formatTime(video.duration)}
              </div>
            )}
            {/* Confidence Score for Search Results */}
            {'confidence_score' in video && video.confidence_score && (
              <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                {Math.round(video.confidence_score * 100)}% match
              </div>
            )}
          </div>
          
          {/* Video Info */}
          <div className="p-4">
            <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{video.title}</h3>
            {video.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{video.description}</p>
            )}
            
            {/* Metadata - Hide status in TV mode */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              {video.view_count !== undefined && video.view_count !== null && (
                <span className="flex items-center space-x-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{formatViewCount(video.view_count)} views</span>
                </span>
              )}
              <span>{formatRelativeDate(video.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TVPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading TV...</p>
        </div>
      </div>
    }>
      <TVContent />
    </Suspense>
  );
}
