'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header';

function HomeContent() {
  const router = useRouter();

  // Redirect based on URL parameters or default to creator
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const videoId = urlParams.get('video');
    const timestamp = urlParams.get('t');
    const query = urlParams.get('q');

    // Build the target URL with parameters
    let targetPath = '/tv'; // Default to TV mode
    const params = new URLSearchParams();

    // If explicitly requesting creator mode, redirect there
    if (tab === 'creator') {
      targetPath = '/creator';
    }

    // Preserve URL parameters
    if (videoId) params.set('video', videoId);
    if (timestamp) params.set('t', timestamp);
    if (query) params.set('q', query);

    const queryString = params.toString();
    const fullPath = queryString ? `${targetPath}?${queryString}` : targetPath;

    // Redirect to the appropriate route
    router.replace(fullPath);
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
