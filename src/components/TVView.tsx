'use client';

import { useState, useEffect } from 'react';
import { Video, VideoWithScore } from '../types';
import { SearchBar } from './SearchBar';
import { VideoPlayerMain } from './VideoPlayerMain';
import { VideoChat } from './VideoChat';
import { formatTime } from '../utils/time';
import { formatViewCount } from '../utils/dateUtils';

interface TVViewProps {
  videos: Video[];
  searchResults: VideoWithScore[];
  isSearching: boolean;
  loading: boolean;
  onSearch: (query: string) => void;
  selectedVideo: Video | null;
  onVideoSelect: (video: Video | null) => void;
  seekTime: number | undefined;
  onTimeSeek: (time: number) => void;
}

export function TVView({ 
  videos, 
  searchResults, 
  isSearching, 
  loading, 
  onSearch, 
  selectedVideo, 
  onVideoSelect, 
  seekTime, 
  onTimeSeek 
}: TVViewProps) {

  // Filter to only show ready videos in TV mode
  const readyVideos = videos.filter(video => video.status === 'ready');
  const readySearchResults = searchResults.filter(video => video.status === 'ready');
  const displayVideos = isSearching ? readySearchResults : readyVideos;

  // Handle time seeking for chapters and transcript
  const handleTimeSeek = (time: number) => {
    console.log('TV: Seeking to time:', time);
    onTimeSeek(time);
  };

  return (
    <div className="space-y-6">
      {selectedVideo ? (
        /* TV View: Video Player with Side Panel for Chapters and Transcript */
        <div className="flex flex-col lg:flex-row lg:space-x-6 space-y-6 lg:space-y-0">
          {/* Video Player - Takes 3/5 width on desktop, full width on mobile */}
          <div className="flex-1 lg:w-3/5">
            <VideoPlayerMain 
              video={selectedVideo} 
              onBack={() => onVideoSelect(null)}
              onSeekTime={seekTime}
              showQuickActions={false}
              // No video refresh or tag click functionality in TV mode
            />
          </div>
          
          {/* Side Panel for Chapters and Transcript - Takes 2/5 width on desktop */}
          <div className="lg:w-2/5 lg:min-w-0">
            <TVSidePanel 
              video={selectedVideo}
              onTimeSeek={handleTimeSeek}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Search Bar */}
          <SearchBar onSearch={onSearch} />

          {/* Video Grid - YouTube-like layout */}
          <TVVideoGrid 
            videos={displayVideos}
            loading={loading}
            onVideoSelect={onVideoSelect}
            isSearching={isSearching}
          />
        </div>
      )}
    </div>
  );
}

// Chapter interface for type safety
interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
  summary?: string;
}

// TV Side Panel Component - Read-only chapters, transcript, and AI chat
function TVSidePanel({ video, onTimeSeek }: { video: Video; onTimeSeek: (time: number) => void }) {
  const [activeTab, setActiveTab] = useState<'chapters' | 'transcript' | 'chat'>('chapters');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [transcript, setTranscript] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideoData = async () => {
      setLoading(true);
      try {
        // Load chapters and transcript in parallel
        const [chaptersResponse, transcriptResponse] = await Promise.all([
          fetch(`/api/videos/${video.id}/chapters`),
          fetch(`/api/videos/${video.id}/transcript`)
        ]);

        if (chaptersResponse.ok) {
          const chaptersData = await chaptersResponse.json() as Chapter[];
          setChapters(chaptersData || []);
        }

        if (transcriptResponse.ok) {
          const transcriptData = await transcriptResponse.json() as { content?: string };
          setTranscript(transcriptData.content || '');
        }
      } catch (error) {
        console.error('Error loading video data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVideoData();
  }, [video.id]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'chapters'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Chapters ({chapters.length})
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'transcript'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'chat'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Chat
          </button>
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
                  <p className="text-gray-500 text-center py-8">
                    📚 No chapters available for this video
                  </p>
                ) : (
                  chapters.map((chapter, index) => (
                    <div
                      key={index}
                      onClick={() => onTimeSeek(chapter.start_time)}
                      className="p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900 text-sm">{chapter.title}</h4>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTime(chapter.start_time)}
                        </span>
                      </div>
                      {chapter.summary && (
                        <p className="text-xs text-gray-600 line-clamp-2">{chapter.summary}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-1">Click to jump to this section</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className="space-y-4">
                {transcript ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-gray-900 text-sm leading-relaxed">
                      {transcript}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    📝 No transcript available for this video
                  </p>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="h-96">
                <VideoChat 
                  video={video}
                  transcript={transcript}
                />
              </div>
            )}
          </>
        )}
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📺</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isSearching ? 'No videos found' : 'No videos available'}
        </h3>
        <p className="text-gray-500">
          {isSearching ? 'Try adjusting your search terms' : 'Videos will appear here once uploaded'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {videos.map((video) => (
        <div
          key={video.id}
          onClick={() => onVideoSelect(video as Video)}
          className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
        >
          {/* Video Thumbnail */}
          <div className="aspect-video bg-gray-100 relative">
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt={video.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-4xl">📹</div>
              </div>
            )}
            
            {/* Duration Badge */}
            {video.duration && (
              <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                {formatTime(video.duration)}
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="p-4">
            <h3 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2">
              {video.title}
            </h3>
            
            {video.description && (
              <p className="text-gray-600 text-xs line-clamp-2 mb-2">
                {video.description}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex flex-col space-y-1">
                {video.created_by && (
                  <div className="flex items-center space-x-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="truncate">{video.created_by}</span>
                  </div>
                )}
                <span>{new Date(video.created_at).toLocaleDateString()}</span>
              </div>
              {video.view_count !== undefined && (
                <div className="flex items-center space-x-1 text-right">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{formatViewCount(video.view_count)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
