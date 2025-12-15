'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatTime } from '../utils/time';

interface VTTViewerProps {
  videoId: string;
  onTimeSeek?: (time: number) => void;
}

interface VTTCue {
  start: number;
  end: number;
  text: string;
}

export default function VTTViewer({ videoId, onTimeSeek }: VTTViewerProps) {
  const [vttContent, setVttContent] = useState<string>('');
  const [cues, setCues] = useState<VTTCue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const loadVTTContent = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`/api/videos/${videoId}/vtt`);
      if (!response.ok) {
        throw new Error('Failed to load VTT content');
      }
      
      const data = await response.json() as { content: string };
      const vttText = data.content;
      setVttContent(vttText);
      
      // Parse VTT content into cues
      const parsedCues = parseVTT(vttText);
      setCues(parsedCues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VTT content');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); // parseVTT is stable and doesn't need to be in deps

  useEffect(() => {
    loadVTTContent();
  }, [loadVTTContent]);

  const parseVTT = (vttText: string): VTTCue[] => {
    const lines = vttText.split('\n');
    const cues: VTTCue[] = [];
    let currentCue: Partial<VTTCue> = {};
    let textLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip WEBVTT header and empty lines
      if (line === 'WEBVTT' || line === '' || line.startsWith('NOTE')) {
        continue;
      }
      
      // Check if line contains timestamp
      const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timestampMatch) {
        // If we have a previous cue, save it
        if (currentCue.start !== undefined && textLines.length > 0) {
          cues.push({
            start: currentCue.start,
            end: currentCue.end!,
            text: textLines.join(' ').trim()
          });
        }
        
        // Start new cue
        currentCue = {
          start: parseTimestamp(timestampMatch[1]),
          end: parseTimestamp(timestampMatch[2])
        };
        textLines = [];
      } else if (currentCue.start !== undefined && line !== '') {
        // This is text content for the current cue
        textLines.push(line);
      }
    }
    
    // Don't forget the last cue
    if (currentCue.start !== undefined && textLines.length > 0) {
      cues.push({
        start: currentCue.start,
        end: currentCue.end!,
        text: textLines.join(' ').trim()
      });
    }
    
    return cues;
  };

  const parseTimestamp = (timestamp: string): number => {
    const [time, ms] = timestamp.split('.');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
  };

  const handleTimeClick = (time: number) => {
    if (onTimeSeek) {
      onTimeSeek(time);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading VTT content...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">⚠️ Error loading VTT content</div>
        <div className="text-sm text-gray-900">{error}</div>
        <button 
          onClick={loadVTTContent}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (cues.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-800 mb-2 font-medium">📝 No VTT content available</div>
        <div className="text-sm text-gray-600">VTT content will be available after video processing is complete.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-800 mb-4 font-medium">
        Click on any timestamp to jump to that moment in the video
      </div>
      
      {cues.map((cue, index) => (
        <div key={index} className="border-l-4 border-blue-200 pl-4 py-2 hover:bg-gray-50">
          <div className="flex items-start space-x-3">
            <button
              onClick={() => handleTimeClick(cue.start)}
              className="text-blue-600 hover:text-blue-800 font-mono text-sm bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
              title="Click to jump to this time"
            >
              {formatTime(cue.start)}
            </button>
            <div className="flex-1 text-sm text-gray-900 leading-relaxed">
              {cue.text}
            </div>
          </div>
        </div>
      ))}
      
      {vttContent && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-gray-700 hover:text-gray-900 font-medium">
            Show raw VTT content
          </summary>
          <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono">
            {vttContent}
          </pre>
        </details>
      )}
    </div>
  );
}
