import React, { useState } from 'react';
import { Video, Chapter, Tag } from '../types';
// Authentication handled via cookies in API endpoints

interface VideoActionsProps {
  video: Video;
  onActionsComplete?: () => void;
}

interface ActionResult {
  success: boolean;
  message: string;
  chapters?: Chapter[];
  tags?: Tag[];
  embeddingCount?: number;
}

interface EmbeddingStats {
  hasEmbeddings: boolean;
  embeddingCount?: number;
}

export const VideoActions: React.FC<VideoActionsProps> = ({ video, onActionsComplete }) => {
  // Session is handled via cookies in API endpoints
  const [loading, setLoading] = useState<{
    chapters: boolean;
    tags: boolean;
    vectorize: boolean;
    abstract: boolean;
    transcript: boolean;
  }>({
    chapters: false,
    tags: false,
    vectorize: false,
    abstract: false,
    transcript: false,
  });

  const [results, setResults] = useState<{
    chapters?: ActionResult;
    tags?: ActionResult;
    vectorize?: ActionResult;
    abstract?: ActionResult;
    transcript?: ActionResult;
  }>({});

  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null);

  // Fetch embedding stats on component mount
  React.useEffect(() => {
    const fetchEmbeddingStats = async () => {
      try {
        const response = await fetch(`/api/videos/${video.id}/embedding-stats`);
        if (response.ok) {
          const stats: EmbeddingStats = await response.json();
          setEmbeddingStats(stats);
        }
      } catch (error) {
        console.error('Failed to fetch embedding stats:', error);
      }
    };

    fetchEmbeddingStats();
  }, [video.id, results.vectorize]);

  const handleGenerateChapters = async () => {
    setLoading(prev => ({ ...prev, chapters: true }));
    setResults(prev => ({ ...prev, chapters: undefined }));

    try {
      const response = await fetch(`/api/videos/${video.id}/generate-chapters`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result: ActionResult = await response.json();
      setResults(prev => ({ ...prev, chapters: result }));

      if (result.success && onActionsComplete) {
        onActionsComplete();
      }
    } catch {
      setResults(prev => ({
        ...prev,
        chapters: {
          success: false,
          message: 'Failed to generate chapters: Network error',
        },
      }));
    } finally {
      setLoading(prev => ({ ...prev, chapters: false }));
    }
  };

  const handleGenerateTags = async () => {
    setLoading(prev => ({ ...prev, tags: true }));
    setResults(prev => ({ ...prev, tags: undefined }));

    try {
      const response = await fetch(`/api/videos/${video.id}/generate-tags`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result: ActionResult = await response.json();
      setResults(prev => ({ ...prev, tags: result }));

      if (result.success && onActionsComplete) {
        onActionsComplete();
      }
    } catch {
      setResults(prev => ({
        ...prev,
        tags: {
          success: false,
          message: 'Failed to generate tags: Network error',
        },
      }));
    } finally {
      setLoading(prev => ({ ...prev, tags: false }));
    }
  };

  const handleVectorizeTranscript = async () => {
    setLoading(prev => ({ ...prev, vectorize: true }));
    setResults(prev => ({ ...prev, vectorize: undefined }));

    try {
      const response = await fetch(`/api/videos/${video.id}/vectorize`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result: ActionResult = await response.json();
      setResults(prev => ({ ...prev, vectorize: result }));

      if (result.success && onActionsComplete) {
        onActionsComplete();
      }
    } catch {
      setResults(prev => ({
        ...prev,
        vectorize: {
          success: false,
          message: 'Failed to vectorize transcript: Network error',
        },
      }));
    } finally {
      setLoading(prev => ({ ...prev, vectorize: false }));
    }
  };

  const handleGenerateAbstract = async () => {
    setLoading(prev => ({ ...prev, abstract: true }));
    setResults(prev => ({ ...prev, abstract: undefined }));

    try {
      const response = await fetch(`/api/videos/${video.id}/generate-abstract`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result: ActionResult = await response.json();
      setResults(prev => ({ ...prev, abstract: result }));

      if (result.success && onActionsComplete) {
        onActionsComplete();
      }
    } catch {
      setResults(prev => ({
        ...prev,
        abstract: {
          success: false,
          message: 'Failed to generate abstract: Network error',
        },
      }));
    } finally {
      setLoading(prev => ({ ...prev, abstract: false }));
    }
  };

  const handleGenerateTranscript = async () => {
    setLoading(prev => ({ ...prev, transcript: true }));
    setResults(prev => ({ ...prev, transcript: undefined }));

    try {
      const response = await fetch(`/api/videos/${video.id}/generate-transcript`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      const result: ActionResult = await response.json();
      setResults(prev => ({ ...prev, transcript: result }));

      if (result.success && onActionsComplete) {
        onActionsComplete();
      }
    } catch {
      setResults(prev => ({
        ...prev,
        transcript: {
          success: false,
          message: 'Failed to generate transcript: Network error',
        },
      }));
    } finally {
      setLoading(prev => ({ ...prev, transcript: false }));
    }
  };

  const ActionButton: React.FC<{
    onClick: () => void;
    loading: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
    title: string;
    description: string;
    result?: ActionResult;
  }> = ({ onClick, loading, disabled, icon, title, description, result }) => (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-1">{icon}</div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900">{title}</h4>
            <p className="text-sm text-gray-900 mt-1">{description}</p>
          </div>
        </div>
        <button
          onClick={onClick}
          disabled={loading || disabled}
          className={`ml-4 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
            loading || disabled
              ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
              : 'text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          } transition-colors duration-200`}
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            'Generate'
          )}
        </button>
      </div>
      
      {result && (
        <div className={`mt-3 p-3 rounded-md ${
          result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {result.success ? (
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Manual AI Processing</h3>
        <p className="text-sm text-gray-600">
          Generate additional AI-powered content for this video. These actions will enhance the video&apos;s searchability and navigation.
        </p>
      </div>

      <div className="space-y-4">
        <ActionButton
          onClick={handleGenerateChapters}
          loading={loading.chapters}
          icon={
            <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
          title="Generate Chapters"
          description="Create AI-generated chapters for easy video navigation based on transcript content."
          result={results.chapters}
        />

        <ActionButton
          onClick={handleGenerateTags}
          loading={loading.tags}
          icon={
            <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          }
          title="Generate Tags"
          description="Create relevant tags for improved searchability based on video content and transcript."
          result={results.tags}
        />

        <ActionButton
          onClick={handleGenerateAbstract}
          loading={loading.abstract}
          icon={
            <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="Generate Abstract"
          description="Create an AI-generated abstract summarizing the key insights and takeaways from the video."
          result={results.abstract}
        />

        <ActionButton
          onClick={handleGenerateTranscript}
          loading={loading.transcript}
          icon={
            <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="Generate Transcript"
          description="Generate or regenerate the video transcript using AI-powered speech recognition."
          result={results.transcript}
        />

        <ActionButton
          onClick={handleVectorizeTranscript}
          loading={loading.vectorize}
          disabled={embeddingStats?.hasEmbeddings}
          icon={
            <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          }
          title="Vectorize Transcript"
          description={
            embeddingStats?.hasEmbeddings 
              ? `Already vectorized (${embeddingStats.embeddingCount} embeddings)` 
              : "Generate vector embeddings for semantic search and intelligent recommendations."
          }
          result={results.vectorize}
        />
      </div>

      {embeddingStats?.hasEmbeddings && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                This video has been vectorized with {embeddingStats.embeddingCount} embeddings for semantic search.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoActions;
