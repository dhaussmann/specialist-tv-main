'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ThumbnailPreview {
  percentage: number;
  url: string;
  label: string;
}

interface ThumbnailSelectorProps {
  videoId: string;
  currentThumbnailUrl?: string;
  onThumbnailUpdated?: (newThumbnailUrl: string) => void;
  onClose?: () => void;
}

export default function ThumbnailSelector({ 
  videoId, 
  currentThumbnailUrl, 
  onThumbnailUpdated, 
  onClose 
}: ThumbnailSelectorProps) {
  const { data: session, status } = useSession();
  const [previews, setPreviews] = useState<ThumbnailPreview[]>([]);
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load thumbnail previews
  useEffect(() => {
    const loadPreviews = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/videos/${videoId}/thumbnail`);
        
        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error || 'Failed to load thumbnail previews');
        }

        const data = await response.json() as { previews?: ThumbnailPreview[] };
        setPreviews(data.previews || []);
      } catch (err) {
        console.error('Error loading thumbnail previews:', err);
        setError(err instanceof Error ? err.message : 'Failed to load previews');
      } finally {
        setLoading(false);
      }
    };

    if (videoId) {
      loadPreviews();
    }
  }, [videoId]);

  // Update video thumbnail
  const updateThumbnail = async (percentage: number) => {
    if (status !== 'authenticated' || !session) {
      setError('Authentication required');
      return;
    }

    try {
      setUpdating(true);
      setError(null);

      const response = await fetch(`/api/videos/${videoId}/thumbnail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          thumbnailTimestampPct: percentage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to update thumbnail');
      }

      const data = await response.json() as { thumbnail_url?: string };
      
      // Call callback with new thumbnail URL
      if (onThumbnailUpdated && data.thumbnail_url) {
        onThumbnailUpdated(data.thumbnail_url);
      }

      // Close modal after successful update
      if (onClose) {
        setTimeout(onClose, 1000); // Brief delay to show success
      }
    } catch (err) {
      console.error('Error updating thumbnail:', err);
      setError(err instanceof Error ? err.message : 'Failed to update thumbnail');
    } finally {
      setUpdating(false);
    }
  };

  const handleThumbnailSelect = (percentage: number) => {
    setSelectedPercentage(percentage);
    updateThumbnail(percentage);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading thumbnail options...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Select Video Thumbnail</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100/50 rounded-full"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Current Thumbnail */}
          {currentThumbnailUrl && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Thumbnail</h3>
              <div className="inline-block border-2 border-gray-200 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentThumbnailUrl}
                  alt="Current thumbnail"
                  className="w-48 h-27 object-cover"
                />
              </div>
            </div>
          )}

          {/* Thumbnail Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              Choose a new thumbnail from these video frames:
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {previews.map((preview) => (
                <div
                  key={preview.percentage}
                  className={`relative cursor-pointer transition-all duration-200 ${
                    selectedPercentage === preview.percentage
                      ? 'ring-2 ring-blue-500 ring-offset-2'
                      : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-2'
                  } ${updating ? 'pointer-events-none opacity-50' : ''}`}
                  onClick={() => handleThumbnailSelect(preview.percentage)}
                >
                  <div className="relative overflow-hidden rounded-lg bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview.url}
                      alt={`Thumbnail at ${preview.label}`}
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                    
                    {/* Loading overlay */}
                    {updating && selectedPercentage === preview.percentage && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      </div>
                    )}
                    
                    {/* Selection indicator */}
                    {selectedPercentage === preview.percentage && !updating && (
                      <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                        <div className="bg-blue-500 rounded-full p-1">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Label */}
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium text-gray-700">{preview.label}</p>
                    <p className="text-xs text-gray-500">{Math.round(preview.percentage * 100)}% through video</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50/50 backdrop-blur-sm border border-blue-200/50 rounded-xl">
            <p className="text-sm text-blue-800">
              💡 <strong>Tip:</strong> Click on any thumbnail above to set it as your video&apos;s main thumbnail. 
              The change will be applied immediately and visible throughout the platform.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white/80 backdrop-blur-sm border border-gray-300/50 rounded-lg hover:bg-gray-50/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              disabled={updating}
            >
              {updating ? 'Updating...' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
