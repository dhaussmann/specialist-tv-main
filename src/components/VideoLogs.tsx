'use client';

import { useState, useEffect } from 'react';

interface VideoLogEntry {
  id: string;
  video_id: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  event_type: string;
  message: string;
  details?: Record<string, unknown>;
  duration_ms?: number | null;
  created_at: string;
}

interface VideoLogsProps {
  videoId?: string;
  limit?: number;
}

export default function VideoLogs({ videoId, limit = 50 }: VideoLogsProps) {
  const [logs, setLogs] = useState<VideoLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, selectedLevel, limit]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      let url: string;
      if (videoId) {
        // Get logs for specific video
        url = `/api/videos/${videoId}/logs?limit=${limit}`;
      } else if (selectedLevel !== 'all') {
        // Get logs by level
        url = `/api/logs/level?level=${selectedLevel}&limit=${limit}`;
      } else {
        // Get recent logs
        url = `/api/logs?limit=${limit}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      const logsData = await response.json() as VideoLogEntry[];
      setLogs(logsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'info':
        return 'text-blue-600 bg-blue-50';
      case 'debug':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading logs</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
            <div className="mt-4">
              <button
                onClick={fetchLogs}
                className="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and filters */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          {videoId ? 'Video Logs' : 'System Logs'}
        </h3>
        
        {!videoId && (
          <div className="flex items-center space-x-3">
            <label htmlFor="level-filter" className="text-sm text-gray-800 font-medium">
              Filter by level:
            </label>
            <select
              id="level-filter"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[100px]"
            >
              <option value="all">All</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
            <button
              onClick={fetchLogs}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Logs list */}
      {logs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No logs found
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLevelColor(log.level)}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-800 bg-gray-200 px-2 py-1 rounded font-medium">
                      {log.event_type}
                    </span>
                    {log.duration_ms && (
                      <span className="text-xs text-gray-700 font-medium">
                        {formatDuration(log.duration_ms)}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-gray-900 mb-2">{log.message}</p>
                  
                  {log.details && (
                    <details className="mt-2">
                      <summary className="text-sm text-gray-700 cursor-pointer hover:text-gray-900 font-medium">
                        Show details
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-50 text-gray-800 p-3 rounded border overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                
                <div className="text-right text-sm text-gray-700">
                  <div className="font-medium">{formatTimestamp(log.created_at)}</div>
                  {videoId && (
                    <div className="text-xs text-gray-600 mt-1 font-mono">
                      ID: {log.id.slice(0, 8)}...
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
