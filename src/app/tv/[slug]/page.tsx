'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Header } from '../../../components/Header';
import { Video, VideoWithScore } from '../../../types';
import { VideoPlayerMain } from '../../../components/VideoPlayerMain';
import { VideoChat } from '../../../components/VideoChat';
import { VideoComments } from '../../../components/VideoComments';
import { formatTime } from '../../../utils/time';

function TVVideoContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [seekTime, setSeekTime] = useState<number | undefined>(undefined);

  // Load video by slug on mount
  useEffect(() => {
    const loadVideoBySlug = async () => {
      if (!slug) return;
      
      try {
        // Load the video by ID (slug is video ID)
        const response = await fetch(`/api/videos/${slug}`);
        if (response.ok) {
          const video = await response.json() as Video;
          
          // In TV mode, only allow access to ready videos
          if (video.status !== 'ready') {
            console.log('Video not ready for TV mode, redirecting to TV library');
            router.push('/tv');
            return;
          }
          
          setSelectedVideo(video);
          
          // Handle timestamp from URL
          const timestamp = searchParams.get('t');
          if (timestamp) {
            setSeekTime(parseInt(timestamp, 10));
          }
        } else {
          console.error('Video not found');
          // Redirect to TV library if video not found
          router.push('/tv');
        }
      } catch (error) {
        console.error('Failed to load video:', error);
        router.push('/tv');
      }
    };

    loadVideoBySlug();
  }, [slug, searchParams, router]);

  // Handle time seeking from chapters/transcript
  const handleTimeSeek = useCallback((time: number) => {
    setSeekTime(time);
  }, []);

  // Handle back to library
  const handleBackToLibrary = useCallback(() => {
    router.push('/tv');
  }, [router]);

  if (!selectedVideo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header videoCount={0} readyVideoCount={0} />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <Header videoCount={0} readyVideoCount={0} />
      </div>

      {/* Video Player Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row lg:space-x-6 space-y-6 lg:space-y-0">
          {/* Video Player - Takes 3/5 width on desktop, full width on mobile */}
          <div className="flex-1 lg:w-3/5 space-y-6">
            <VideoPlayerMain 
              video={selectedVideo} 
              onBack={handleBackToLibrary}
              onSeekTime={seekTime}
              showQuickActions={false}
              // No video refresh or tag click functionality in TV mode
            />
            
            {/* Comments Section */}
            <VideoComments video={selectedVideo} />
          </div>

          {/* Side Panel - Takes 2/5 width on desktop, full width on mobile */}
          <div className="lg:w-2/5 lg:min-w-0">
            <TVSidePanel 
              video={selectedVideo}
              onTimeSeek={handleTimeSeek}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// TV Side Panel Component - Read-only chapters, transcript, AI chat, and related videos
function TVSidePanel({ video, onTimeSeek }: { video: Video; onTimeSeek: (time: number) => void }) {
  const [activeTab, setActiveTab] = useState<'chapters' | 'transcript' | 'chat' | 'related'>('chapters');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [transcript, setTranscript] = useState<string>('');
  const [relatedVideos, setRelatedVideos] = useState<VideoWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Helper functions for similarity score badges
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.7) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.6) return 'Fair';
    return 'Poor';
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load chapters, transcript, and related videos in parallel
        const [chaptersResponse, transcriptResponse, relatedResponse] = await Promise.all([
          fetch(`/api/videos/${video.id}/chapters`),
          fetch(`/api/videos/${video.id}/transcript`),
          fetch(`/api/videos/${video.id}/related`)
        ]);

        // Handle chapters - API returns Chapter[] directly
        if (chaptersResponse.ok) {
          const chaptersData = await chaptersResponse.json() as Chapter[];
          setChapters(chaptersData || []);
        }

        // Handle transcript - API returns transcript object directly
        if (transcriptResponse.ok) {
          const transcriptData = await transcriptResponse.json() as { content?: string };
          setTranscript(transcriptData.content || '');
        }

        // Handle related videos - API returns VideoWithScore[] directly
        if (relatedResponse.ok) {
          const relatedData = await relatedResponse.json() as VideoWithScore[];
          // In TV mode, only show ready related videos
          const readyRelatedVideos = (relatedData || []).filter(video => video.status === 'ready');
          setRelatedVideos(readyRelatedVideos);
        }
      } catch (error) {
        console.error('Error loading video data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [video.id]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { key: 'chapters', label: 'Chapters' },
            { key: 'transcript', label: 'Transcript' },
            { key: 'related', label: 'Related Videos' },
            { key: 'chat', label: 'Chat' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'chapters' | 'transcript' | 'chat' | 'related')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'chapters' && (
              <div className="space-y-3">
                {chapters.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📚</div>
                    <p>No chapters available</p>
                  </div>
                ) : (
                  chapters.map((chapter, index) => (
                    <div
                      key={index}
                      onClick={() => onTimeSeek(chapter.start_time)}
                      className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 mb-1">{chapter.title}</h3>
                          <p className="text-sm text-gray-600 mb-2">{chapter.summary}</p>
                          <div className="flex items-center text-xs text-gray-500">
                            <span>{formatTime(chapter.start_time)}</span>
                            <span className="mx-1">-</span>
                            <span>{formatTime(chapter.end_time)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className="prose prose-sm max-w-none">
                {transcript ? (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{transcript}</p>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📝</div>
                    <p>No transcript available</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'related' && (
              <div className="space-y-4">
                {relatedVideos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🔗</div>
                    <p>No related videos found</p>
                  </div>
                ) : (
                  relatedVideos.map((relatedVideo, index) => (
                    <div
                      key={index}
                      onClick={() => router.push(`/tv/${relatedVideo.id}`)}
                      className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
                        <img
                          src={relatedVideo.thumbnail_url || '/placeholder-video.jpg'}
                          alt={relatedVideo.title}
                          className="w-20 h-12 object-cover rounded"
                        />
                      </div>
                      
                      {/* Video Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm line-clamp-2 mb-1">
                          {relatedVideo.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {formatTime(relatedVideo.duration || 0)}
                          </span>
                          <div className="flex items-center space-x-1">
                            {relatedVideo.confidence_score !== undefined ? (
                              <div className="flex items-center space-x-1">
                                <span className={`text-xs border px-1.5 py-0.5 rounded-full font-medium ${getScoreColor(relatedVideo.confidence_score)}`}>
                                  {(relatedVideo.confidence_score * 100).toFixed(0)}%
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getScoreColor(relatedVideo.confidence_score)}`}>
                                  {getScoreLabel(relatedVideo.confidence_score)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-blue-600">
                                Related
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div>
                <VideoChat video={video} transcript={transcript} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
  summary?: string;
}

function TVVideoPage() {
  return (
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
      <TVVideoContent />
    </Suspense>
  );
}

export default TVVideoPage;
