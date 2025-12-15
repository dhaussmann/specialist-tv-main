'use client';

import { useState, useCallback } from 'react';
import { Video } from '../types';
// Authentication handled via cookies in API endpoints

interface YouTubeFormat {
  itag: number;
  quality: string;
  format: string;
  filesize?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  ext: string;
  resolution?: string;
  note?: string;
}

interface YouTubeVideoInfo {
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  formats: YouTubeFormat[];
  videoId: string;
  uploader: string;
  uploadDate: string;
}

interface YouTubeDownloaderProps {
  onVideoUploaded: (video: Video) => void;
}

export function YouTubeDownloader({ onVideoUploaded }: YouTubeDownloaderProps) {
  // Session is handled via cookies in API endpoints
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<YouTubeVideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<YouTubeFormat | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'format' | 'downloading'>('input');

  const resetState = useCallback(() => {
    setVideoInfo(null);
    setSelectedFormat(null);
    setCustomTitle('');
    setCustomDescription('');
    setError(null);
    setStep('input');
  }, []);

  const handleUrlSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json() as {
        success?: boolean;
        videoInfo?: YouTubeVideoInfo;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get video information');
      }

      if (data.videoInfo) {
        setVideoInfo(data.videoInfo);
        setCustomTitle(data.videoInfo.title);
        setCustomDescription(data.videoInfo.description);
      }
      setStep('format');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  const handleDownload = useCallback(async () => {
    if (!videoInfo || !selectedFormat) return;

    setError(null);
    setStep('downloading');

    try {
      const response = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          url,
          format: selectedFormat,
          title: customTitle || videoInfo.title,
          description: customDescription || videoInfo.description,
        }),
      });

      const data = await response.json() as {
        success?: boolean;
        video?: Video;
        error?: string;
        originalVideoInfo?: YouTubeVideoInfo;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Download failed');
      }

      // Notify parent component of successful upload
      if (data.video) {
        onVideoUploaded(data.video);
      }

      // Reset form
      setUrl('');
      resetState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setStep('format');
    } finally {
      // Download completed
    }
  }, [videoInfo, selectedFormat, customTitle, customDescription, url, onVideoUploaded, resetState]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (quality: string): string => {
    switch (quality) {
      case '720p':
        return 'text-green-600 bg-green-50 border-green-200';
      case '360p':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'audio':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">YouTube Downloader</h3>
          <p className="text-sm text-gray-500">Download YouTube videos and upload them to your library</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {step === 'input' && (
        <form onSubmit={handleUrlSubmit} className="space-y-4">
          <div>
            <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-2">
              YouTube URL
            </label>
            <input
              id="youtube-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Getting video info...
              </div>
            ) : (
              'Get Video Info'
            )}
          </button>
        </form>
      )}

      {step === 'format' && videoInfo && (
        <div className="space-y-6">
          {/* Video Preview */}
          <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={videoInfo.thumbnail}
              alt={videoInfo.title}
              className="w-32 h-24 object-cover rounded-md flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 truncate">{videoInfo.title}</h4>
              <p className="text-sm text-gray-600 mt-1">by {videoInfo.uploader}</p>
              <p className="text-sm text-gray-500 mt-1">Duration: {formatDuration(videoInfo.duration)}</p>
            </div>
          </div>

          {/* Custom Title and Description */}
          <div className="space-y-4">
            <div>
              <label htmlFor="custom-title" className="block text-sm font-medium text-gray-700 mb-2">
                Title (optional - will use original if empty)
              </label>
              <input
                id="custom-title"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={videoInfo.title}
              />
            </div>
            
            <div>
              <label htmlFor="custom-description" className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional - will use original if empty)
              </label>
              <textarea
                id="custom-description"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={videoInfo.description}
              />
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Choose Download Format
            </label>
            <div className="space-y-2">
              {videoInfo.formats.map((format) => (
                <label
                  key={format.itag}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedFormat?.itag === format.itag
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={format.itag}
                    checked={selectedFormat?.itag === format.itag}
                    onChange={() => setSelectedFormat(format)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getQualityColor(format.quality)}`}>
                        {format.quality}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{format.format.toUpperCase()}</span>
                      {format.resolution && (
                        <span className="text-sm text-gray-500">({format.resolution})</span>
                      )}
                    </div>
                    {format.note && (
                      <p className="text-sm text-gray-600 mt-1">{format.note}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={resetState}
              className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleDownload}
              disabled={!selectedFormat}
              className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Download & Upload
            </button>
          </div>
        </div>
      )}

      {step === 'downloading' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-4"></div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">Downloading Video</h4>
          <p className="text-sm text-gray-600">
            Please wait while we download the video from YouTube and upload it to your library...
          </p>
        </div>
      )}
    </div>
  );
}
