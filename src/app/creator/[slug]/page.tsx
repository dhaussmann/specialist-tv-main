'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { VideoPlayerMain } from '../../../components/VideoPlayerMain';
import { VideoDetails } from '../../../components/VideoDetails';
import { Header } from '../../../components/Header';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { useSession } from 'next-auth/react';
import { Video } from '../../../types';
import { NotificationToast } from '@/components/NotificationToast';
import { useNotification } from '@/hooks/useNotification';

function CreatorVideoContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const slug = params.slug as string;
  
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading] = useState(false);
  const [seekTime, setSeekTime] = useState<number | undefined>(undefined);
  const { notification, showError, hideNotification } = useNotification();

  // Load video by slug on mount
  const loadVideoBySlug = useCallback(async () => {
    if (!slug) return;
    
    try {
      // First try to load the video by ID (slug is video ID)
      const response = await fetch(`/api/videos/${slug}`);
      if (response.ok) {
        const video = await response.json() as Video;
        setSelectedVideo(video);
        
        // Handle timestamp from query params
        const timestamp = searchParams.get('t');
        if (timestamp) {
          const time = parseInt(timestamp, 10);
          if (!isNaN(time)) {
            setSeekTime(time);
          }
        }
      } else {
        console.error('Video not found:', slug);
        // Redirect to Creator home if video not found
        router.push('/creator');
      }
    } catch (error) {
      console.error('Error loading video:', error);
      router.push('/creator');
    }
  }, [slug, searchParams, router]);

  // Handle time seeking from chapters/transcript
  const handleTimeSeek = useCallback((time: number) => {
    setSeekTime(time);
    
    // Update URL with timestamp
    const url = new URL(window.location.href);
    if (time > 0) {
      url.searchParams.set('t', time.toString());
    } else {
      url.searchParams.delete('t');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Handle going back to library
  const handleBackToLibrary = useCallback(() => {
    router.push('/creator');
  }, [router]);



  // Handle tag click
  const handleTagClick = useCallback((tag: string) => {
    // Navigate back to creator home and search for the tag
    router.push(`/creator?q=${encodeURIComponent(tag)}`);
  }, [router]);

  // Handle video deletion
  const handleVideoDelete = useCallback(async () => {
    if (!selectedVideo || !session?.user) return;
    
    try {
      const response = await fetch(`/api/videos/${selectedVideo.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      
      if (response.ok) {
        // Redirect back to creator home after successful deletion
        router.push('/creator');
      } else {
        console.error('Failed to delete video');
        showError('Failed to delete video. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      showError('Error deleting video. Please try again.');
    }
  }, [selectedVideo, router, session, showError]);

  useEffect(() => {
    loadVideoBySlug();
  }, [loadVideoBySlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Loading video...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedVideo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Video not found</p>
            <button
              onClick={() => router.push('/creator')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Creator View: Video Player with Full Details Panel */}
        <div className="flex flex-col lg:flex-row lg:space-x-6 space-y-6 lg:space-y-0">
          {/* Video Player - Takes 3/5 width on desktop, full width on mobile */}
          <div className="flex-1 lg:w-3/5">
            <VideoPlayerMain 
              video={selectedVideo} 
              onBack={handleBackToLibrary}
              onSeekTime={seekTime}
              onVideoRefresh={loadVideoBySlug}
              onTagClick={handleTagClick}
            />
          </div>
          
          {/* Video Details Panel - Takes 2/5 width on desktop, full width on mobile */}
          <div className="lg:w-2/5 lg:min-w-0">
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
              <VideoDetails
                video={selectedVideo}
                onTimeSeek={handleTimeSeek}
                onVideoRefresh={loadVideoBySlug}
                onVideoDelete={handleVideoDelete}
                onClose={() => router.push('/creator')}
              />
            </div>
          </div>
        </div>


      </div>
      {/* Notification Toast */}
      <NotificationToast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
}

function CreatorVideoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50">
          <Header />
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      }>
        <CreatorVideoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

export default CreatorVideoPage;
