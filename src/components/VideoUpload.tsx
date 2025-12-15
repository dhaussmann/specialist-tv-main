'use client';

import { useState, useCallback } from 'react';
import { Video } from '../types';
import { useSession } from 'next-auth/react';

interface VideoUploadProps {
  onVideoUploaded: (video: Video) => void;
}

export function VideoUpload({ onVideoUploaded }: VideoUploadProps) {
  const { data: session, status } = useSession();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadPercentage, setUploadPercentage] = useState<number>(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => file.type.startsWith('video/'));
    
    if (videoFile) {
      setSelectedFile(videoFile);
      if (!title) {
        setTitle(videoFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [title]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [title]);

  // Chunked upload with progress tracking
  const uploadFileWithProgress = (file: File, uploadUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadPercentage(percentComplete);
          setUploadProgress(`Uploading... ${percentComplete}%`);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let errorMessage = `Upload failed (${xhr.status}): ${xhr.statusText}`;
          try {
            const errorData = xhr.responseText;
            if (errorData) {
              try {
                const jsonError = JSON.parse(errorData);
                if (jsonError.error) {
                  errorMessage += ` - ${jsonError.error}`;
                } else if (jsonError.message) {
                  errorMessage += ` - ${jsonError.message}`;
                }
              } catch {
                errorMessage += ` - ${errorData}`;
              }
            }
          } catch (e) {
            console.error('Could not read error response:', e);
          }
          reject(new Error(errorMessage));
        }
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timeout'));
      });
      
      // Set a longer timeout for large files (30 minutes)
      xhr.timeout = 30 * 60 * 1000;
      
      // Create FormData and upload
      const formData = new FormData();
      formData.append('file', file);
      
      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim() || status !== 'authenticated' || !session) return;

    // Clear previous errors and reset progress
    setError(null);
    setUploadProgress(null);
    setUploadPercentage(0);
    setIsUploading(true);
    
    try {
      setUploadProgress('Preparing upload...');
      
      // Step 1: Get direct upload URL from Cloudflare Stream
      const prepareResponse = await fetch('/api/videos/prepare-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json() as { error: string };
        throw new Error(`Failed to prepare upload: ${errorData.error}`);
      }

      const uploadData = await prepareResponse.json() as {
        video_id: string;
        stream_id: string;
        upload_url: string;
        thumbnail_url: string;
      };
        
      console.log('Direct upload details:', {
        uploadUrl: uploadData.upload_url,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type
      });
        
      // Step 2: Upload directly to Cloudflare Stream with progress tracking
      await uploadFileWithProgress(selectedFile, uploadData.upload_url);
      
      setUploadProgress('Upload complete! Finalizing...');
      setUploadPercentage(100);
      
      // Step 3: Create database record after successful upload
      const finalizeResponse = await fetch('/api/videos/finalize-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          video_id: uploadData.video_id,
          stream_id: uploadData.stream_id,
          title: title.trim(),
          description: description.trim() || undefined,
          thumbnail_url: uploadData.thumbnail_url,
        }),
      });

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.json() as { error: string };
        throw new Error(`Failed to finalize upload: ${errorData.error}`);
      }

      const finalizeData = await finalizeResponse.json() as { video: Video };
      
      setUploadProgress('Video uploaded successfully!');
      onVideoUploaded(finalizeData.video);
        
      // Trigger sync to check if video is ready and start processing
      try {
        setUploadProgress('Checking video status...');
        const syncResponse = await fetch('/api/videos/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
        });
        
        if (syncResponse.ok) {
          console.log('Video sync triggered successfully');
        } else {
          console.warn('Video sync failed, but upload was successful');
        }
      } catch (syncError) {
        console.warn('Could not trigger video sync:', syncError);
      }
        
      // Reset form
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      setError(null);
      setUploadProgress(null);
      setUploadPercentage(0);
        
      // Reset file input
      const fileInput = document.getElementById('video-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
        
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
      if (!error) {
        setUploadProgress(null);
        setUploadPercentage(0);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Video</h2>
      
      {/* Drag & Drop Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-orange-400 bg-orange-50'
            : selectedFile
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <div className="space-y-2">
            <div className="w-12 h-12 mx-auto bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-12 h-12 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">
                <span className="font-medium text-orange-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">MP4, MOV, AVI - Any size supported</p>
            </div>
            <input
              id="video-file"
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label
              htmlFor="video-file"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
            >
              Select File
            </label>
          </div>
        )}
      </div>

      {/* Form Fields */}
      {selectedFile && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              placeholder="Enter video title"
              required
            />
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              placeholder="Brief description of the video content"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Progress Message */}
          {uploadProgress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm text-blue-700">{uploadProgress}</p>
                  {uploadPercentage > 0 && uploadPercentage < 100 && (
                    <div className="mt-2">
                      <div className="bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={() => {
                setSelectedFile(null);
                setTitle('');
                setDescription('');
                setError(null);
                setUploadProgress(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!title.trim() || isUploading}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isUploading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <span>{isUploading ? 'Uploading...' : 'Upload Video'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
