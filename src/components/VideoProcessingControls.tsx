'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface VideoProcessingControlsProps {
  videoId: string;
  onProcessingTriggered?: () => void;
}

interface ProcessingPhase {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const PROCESSING_PHASES: ProcessingPhase[] = [
  {
    id: 'transcription',
    name: 'Transcription',
    description: 'Generate video transcript using AI',
    icon: '📝'
  },
  {
    id: 'tagging',
    name: 'Tagging',
    description: 'Generate relevant tags for the video',
    icon: '🏷️'
  },
  {
    id: 'abstract',
    name: 'Abstract',
    description: 'Generate video summary/abstract',
    icon: '📄'
  },
  {
    id: 'title_generation',
    name: 'Title Generation',
    description: 'Generate optimized video title',
    icon: '✨'
  },
  {
    id: 'chapters',
    name: 'Chapters',
    description: 'Generate video chapters with timestamps',
    icon: '📚'
  },
  {
    id: 'thumbnail',
    name: 'Thumbnail',
    description: 'Generate video thumbnail',
    icon: '🖼️'
  }
];

export default function VideoProcessingControls({ videoId, onProcessingTriggered }: VideoProcessingControlsProps) {
  const { data: session } = useSession();
  const [processing, setProcessing] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const triggerProcessing = async (phase: string, force: boolean = false) => {
    if (!session) return;

    setProcessing(phase);
    
    try {
      const response = await fetch(`/api/videos/${videoId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phase, force }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to trigger processing');
      }

      const result = await response.json();
      console.log(`✅ Successfully triggered ${phase} processing:`, result);
      
      // Show success notification
      setNotification({ type: 'success', message: `Successfully triggered ${phase} processing` });
      setTimeout(() => setNotification(null), 3000);
      
      // Notify parent component
      onProcessingTriggered?.();
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      console.error(`Failed to trigger ${phase} processing:`, error);
      setNotification({ type: 'error', message: `Failed to trigger ${phase} processing: ${error.message}` });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setProcessing(null);
    }
  };

  const triggerAllProcessing = async (force: boolean = false) => {
    await triggerProcessing('all', force);
  };

  if (!session) {
    return null; // Only show for authenticated users
  }

  return (
    <div className="space-y-4">
      {/* Notification */}
      {notification && (
        <div className={`p-3 rounded-lg border ${
          notification.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center space-x-2">
            <span className="text-lg">
              {notification.type === 'success' ? '✅' : '❌'}
            </span>
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center space-x-2 mb-4">
        <span className="text-xl">⚙️</span>
        <h3 className="text-lg font-semibold text-gray-900">Processing Controls</h3>
      </div>

      <div className="space-y-4">
        {/* Quick Actions */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center space-x-2">
            <span>⚡</span>
            <span>Quick Actions</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => triggerProcessing('title_generation', false)}
              disabled={processing !== null}
              className="group relative px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-lg">✨</span>
                <span className="text-sm">
                  {processing === 'title_generation' ? 'Generating...' : 'Generate Title'}
                </span>
              </div>
              {processing === 'title_generation' && (
                <div className="absolute inset-0 bg-white bg-opacity-20 rounded-xl animate-pulse"></div>
              )}
            </button>
            
            <button
              onClick={() => triggerAllProcessing(false)}
              disabled={processing !== null}
              className="group relative px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-lg">🔄</span>
                <span className="text-sm">
                  {processing === 'all' ? 'Processing...' : 'Reprocess All'}
                </span>
              </div>
              {processing === 'all' && (
                <div className="absolute inset-0 bg-white bg-opacity-20 rounded-xl animate-pulse"></div>
              )}
            </button>
            
            <button
              onClick={() => triggerAllProcessing(true)}
              disabled={processing !== null}
              className="group relative px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-lg">🗑️</span>
                <span className="text-sm">
                  {processing === 'all' ? 'Processing...' : 'Force Reprocess'}
                </span>
              </div>
              {processing === 'all' && (
                <div className="absolute inset-0 bg-white bg-opacity-20 rounded-xl animate-pulse"></div>
              )}
            </button>
          </div>
        </div>

        {/* Individual Phase Controls */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center space-x-2">
            <span>🎯</span>
            <span>Individual Processing Phases</span>
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {PROCESSING_PHASES.map((phase) => (
              <div key={phase.id} className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                      <span className="text-lg">{phase.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 text-sm">{phase.name}</h5>
                      <p className="text-xs text-gray-600 mt-0.5">{phase.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => triggerProcessing(phase.id, false)}
                      disabled={processing !== null}
                      className="relative px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {processing === phase.id ? (
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Processing...</span>
                        </div>
                      ) : (
                        'Retrigger'
                      )}
                    </button>
                    <button
                      onClick={() => triggerProcessing(phase.id, true)}
                      disabled={processing !== null}
                      className="relative px-3 py-2 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      title="Clear existing data and reprocess"
                    >
                      {processing === phase.id ? (
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Processing...</span>
                        </div>
                      ) : (
                        'Force'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Help Text */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600">ℹ️</span>
            </div>
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2 text-blue-900">How Processing Works:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-white bg-opacity-50 rounded-lg p-2">
                  <span className="font-medium text-blue-800">Retrigger:</span>
                  <span className="text-blue-700 ml-1">Re-run processing (keeps existing data)</span>
                </div>
                <div className="bg-white bg-opacity-50 rounded-lg p-2">
                  <span className="font-medium text-red-800">Force:</span>
                  <span className="text-red-700 ml-1">Clear data and reprocess from scratch</span>
                </div>
                <div className="bg-white bg-opacity-50 rounded-lg p-2">
                  <span className="font-medium text-blue-800">Reprocess All:</span>
                  <span className="text-blue-700 ml-1">Trigger all phases in order</span>
                </div>
                <div className="bg-white bg-opacity-50 rounded-lg p-2">
                  <span className="font-medium text-red-800">Force Reprocess All:</span>
                  <span className="text-red-700 ml-1">Clear everything and start fresh</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
