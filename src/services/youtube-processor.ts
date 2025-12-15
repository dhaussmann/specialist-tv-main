
export interface YouTubeVideoInfo {
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  formats: YouTubeFormat[];
  videoId: string;
  uploader: string;
  uploadDate: string;
}

export interface YouTubeFormat {
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
  url?: string;
}

export interface YouTubeDownloadResult {
  success: boolean;
  videoBuffer?: ArrayBuffer;
  filename?: string;
  error?: string;
}

interface StreamingData {
  adaptiveFormats?: Array<Record<string, unknown>>;
  formats?: Array<Record<string, unknown>>;
}

export class YouTubeProcessor {
  constructor(private env: CloudflareEnv) {}

  /**
   * Check if URL is a valid YouTube URL
   */
  isValidYouTubeUrl(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }

  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get video information including available formats
   */
  async getVideoInfo(videoId: string): Promise<YouTubeVideoInfo> {
    try {
      // Get basic video metadata from YouTube Data API
      const apiKey = this.env.YOUTUBE_API_KEY;
      if (!apiKey) {
        throw new Error('YouTube API key not configured');
      }

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails,statistics`
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        items: Array<{
          snippet: {
            title: string;
            description: string;
            channelTitle: string;
            publishedAt: string;
            thumbnails: {
              maxres?: { url: string };
              high?: { url: string };
              medium?: { url: string };
              default: { url: string };
            };
          };
          contentDetails: {
            duration: string;
          };
        }>;
      };

      if (!data.items || data.items.length === 0) {
        throw new Error('Video not found');
      }

      const video = data.items[0];
      const snippet = video.snippet;

      // Get available formats
      const formats = await this.getAvailableFormats(videoId);

      return {
        videoId,
        title: snippet.title,
        description: snippet.description,
        duration: this.parseDuration(video.contentDetails.duration),
        thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default.url,
        formats,
        uploader: snippet.channelTitle,
        uploadDate: snippet.publishedAt
      };
    } catch (error) {
      throw new Error(`Failed to get video info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available download formats for a video
   */
  private async getAvailableFormats(videoId: string): Promise<YouTubeFormat[]> {
    try {
      // Extract formats directly from YouTube's player response
      const formats = await this.extractVideoFormats(videoId);
      
      if (formats.length > 0) {
        return formats;
      }
      
      // Fallback to default formats if extraction fails
      return this.getDefaultFormats();
    } catch (error) {
      console.error('Format extraction failed:', error);
      return this.getDefaultFormats();
    }
  }

  /**
   * Extract video formats from YouTube
   */
  private async extractVideoFormats(videoId: string): Promise<YouTubeFormat[]> {
    try {
      // Try multiple methods to get video data
      let playerResponse: Record<string, unknown> | null = null;
      
      // Feature flag to enable browser rendering with Puppeteer
      // Updated to follow official Cloudflare Browser Rendering documentation
      const ENABLE_BROWSER_RENDERING = true; // Enabled following official Cloudflare docs pattern
      
      // Method 1: Try browser rendering first (most reliable) - ENABLED
      if (ENABLE_BROWSER_RENDERING && this.env.BROWSER) {
        try {
          const result = await this.getPlayerResponseFromBrowser(videoId);
          playerResponse = result.playerResponse;
          if (playerResponse?.streamingData) {
            console.log('Successfully got data from browser rendering');
          }
        } catch (error) {
          console.error('Browser rendering failed:', error);
        }
      }
      
      // Method 2: Try embed page if browser rendering failed
      if (!playerResponse) {
        try {
          console.log('Embed method failed, trying watch page');
          playerResponse = await this.getPlayerResponseFromEmbed(videoId);
          if (playerResponse?.streamingData) {
            console.log('Successfully got data from embed page');
          }
        } catch {
          console.error('Embed method failed');
        }
      }
      
      // Method 3: Try watch page as last resort
      if (!playerResponse) {
        try {
          playerResponse = await this.getPlayerResponseFromWatchPage(videoId);
          if (playerResponse?.streamingData) {
            console.log('Successfully got data from watch page');
          }
        } catch {
          console.error('Watch page method failed');
        }
      }
      
      if (!playerResponse) {
        throw new Error('Could not extract player response from any source');
      }
      
      return this.parsePlayerResponse(playerResponse);
      
    } catch (error) {
      console.error('Video format extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract player response using browser rendering with Puppeteer
   * Following official Cloudflare Browser Rendering documentation
   */
  private async getPlayerResponseFromBrowser(videoId: string): Promise<{playerResponse: Record<string, unknown>, playerJs: string | null}> {
    if (!this.env.BROWSER) {
      throw new Error('Browser rendering not available - BROWSER binding not found');
    }

    try {
      // Import Puppeteer following official Cloudflare docs
      const puppeteer = (await import('@cloudflare/puppeteer')).default;
      
      console.log('Launching browser with Puppeteer following official Cloudflare pattern...');
      
      // Launch browser using the BROWSER binding - official Cloudflare pattern
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log(`Navigating to YouTube watch page: ${videoId}`);
      
      // Navigate to YouTube watch page
      await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      console.log('Extracting player response from page...');
      
      // Extract player response and player JS URL
      const result = await page.evaluate(() => {
        try {
          // Try to get ytInitialPlayerResponse from window object
          let playerResponse = (window as Window & { ytInitialPlayerResponse?: Record<string, unknown> }).ytInitialPlayerResponse;
          
          // If not available, try to extract from script tags
          if (!playerResponse) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || '';
              const match = content.match(/var ytInitialPlayerResponse = ({.+?});/);
              if (match) {
                try {
                  playerResponse = JSON.parse(match[1]);
                  break;
                } catch {
                  continue;
                }
              }
            }
          }
          
          // Extract player JS URL
          let playerJs = null;
          const scripts = document.querySelectorAll('script[src*="player"]');
          for (const script of scripts) {
            const src = (script as HTMLScriptElement).src;
            if (src && src.includes('/player/')) {
              playerJs = src.startsWith('//') ? 'https:' + src : src;
              break;
            }
          }
          
          return {
            playerResponse,
            playerJs,
            success: !!playerResponse
          };
          
        } catch (error) {
          return {
            error: (error as Error).message || 'Script execution failed',
            success: false
          };
        }
      });
      
      // Close the browser
      await browser.close();
      
      if (!result.success || !result.playerResponse) {
        throw new Error(`Player response extraction failed: ${result.error || 'No player response found'}`);
      }
      
      console.log('Puppeteer extraction successful');
      
      return {
        playerResponse: result.playerResponse,
        playerJs: result.playerJs || null
      };
      
    } catch (error) {
      console.error('Puppeteer browser rendering failed:', error);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error('Browser rendering timeout - YouTube page took too long to load');
        }
        if (error.message.includes('navigation')) {
          throw new Error('Browser rendering navigation failed - unable to load YouTube page');
        }
      }
      
      throw new Error(`Puppeteer browser rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get player response from embed page (often less restricted)
   */
  private async getPlayerResponseFromEmbed(videoId: string): Promise<Record<string, unknown>> {
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`Embed page request failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract ytInitialPlayerResponse from the HTML
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (!match) {
      throw new Error('Could not find ytInitialPlayerResponse in embed page');
    }

    try {
      return JSON.parse(match[1]);
    } catch {
      throw new Error('Failed to parse ytInitialPlayerResponse from embed page');
    }
  }

  /**
   * Get player response from watch page
   */
  private async getPlayerResponseFromWatchPage(videoId: string): Promise<Record<string, unknown>> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`Watch page request failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract ytInitialPlayerResponse from the HTML
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (!match) {
      throw new Error('Could not find ytInitialPlayerResponse in watch page');
    }

    try {
      return JSON.parse(match[1]);
    } catch {
      throw new Error('Failed to parse ytInitialPlayerResponse from watch page');
    }
  }

  /**
   * Parse player response to extract video formats
   */
  private parsePlayerResponse(playerResponse: Record<string, unknown>): YouTubeFormat[] {
    const formats: YouTubeFormat[] = [];
    const streamingData = playerResponse.streamingData as StreamingData;

    if (!streamingData) {
      console.warn('No streaming data found in player response');
      return formats;
    }

    // Process adaptive formats (video and audio separate)
    if (streamingData.adaptiveFormats) {
      // Parse each format and filter valid ones
      const validFormats = streamingData.adaptiveFormats
        .map(format => this.parseFormat(format, true))
        .filter((format): format is YouTubeFormat => format !== null && !!format.url); // Only include formats with direct URLs
      formats.push(...validFormats);
    }

    // Process combined formats (video and audio together)
    if (streamingData.formats) {
      const validFormats = streamingData.formats
        .map(format => this.parseFormat(format, false))
        .filter((format): format is YouTubeFormat => format !== null && !!format.url); // Only include formats with direct URLs
      formats.push(...validFormats);
    }

    return formats;
  }

  /**
   * Parse individual format from streaming data
   */
  private parseFormat(format: Record<string, unknown>, isAdaptive: boolean): YouTubeFormat | null {
    try {
      const itag = format.itag as number;
      const mimeType = format.mimeType as string;
      const qualityLabel = format.qualityLabel as string;
      const contentLength = format.contentLength as string;
      const fps = format.fps as number;
      
      // Extract codec information
      const codecMatch = mimeType?.match(/codecs="([^"]+)"/);
      const codecs = codecMatch ? codecMatch[1].split(', ') : [];
      
      // Determine format type and extension
      let ext = 'mp4';
      let vcodec = '';
      let acodec = '';
      
      if (mimeType?.includes('video/mp4')) {
        ext = 'mp4';
        vcodec = codecs.find(c => c.includes('avc1') || c.includes('vp9') || c.includes('av01')) || '';
        acodec = codecs.find(c => c.includes('mp4a')) || '';
      } else if (mimeType?.includes('video/webm')) {
        ext = 'webm';
        vcodec = codecs.find(c => c.includes('vp9') || c.includes('vp8')) || '';
        acodec = codecs.find(c => c.includes('opus') || c.includes('vorbis')) || '';
      } else if (mimeType?.includes('audio/')) {
        ext = mimeType.includes('audio/mp4') ? 'm4a' : 'webm';
        acodec = codecs[0] || '';
      }

      // Get download URL
      let url = format.url as string;
      
      // Debug: Log format data to understand what we're getting
      console.log('Format data:', {
        itag,
        qualityLabel,
        hasUrl: !!url,
        hasSignatureCipher: !!format.signatureCipher,
        formatKeys: Object.keys(format)
      });
      
      if (!url && format.signatureCipher) {
        // Handle signature cipher (would need signature decoding)
        console.warn('Video format requires signature decoding, skipping for now');
        return null;
      }
      
      if (!url) {
        console.warn('No URL found for format:', { itag, qualityLabel });
        return null;
      }

      // Add ratebypass parameter to help with throttling
      if (url && !url.includes('ratebypass')) {
        url += url.includes('?') ? '&ratebypass=yes' : '?ratebypass=yes';
      }

      return {
        itag,
        quality: qualityLabel || (isAdaptive ? 'adaptive' : 'combined'),
        format: mimeType || 'unknown',
        filesize: contentLength ? parseInt(contentLength) : undefined,
        fps,
        vcodec: vcodec || undefined,
        acodec: acodec || undefined,
        ext,
        resolution: qualityLabel,
        note: isAdaptive ? 'adaptive' : 'combined',
        url
      };
    } catch (error) {
      console.error('Error parsing format:', error);
      return null;
    }
  }

  /**
   * Download video with specified format
   */
  async downloadVideo(url: string, format: YouTubeFormat): Promise<YouTubeDownloadResult> {
    try {
      console.log('Download request for format:', {
        itag: format.itag,
        quality: format.quality,
        hasUrl: !!format.url,
        url: format.url ? format.url.substring(0, 100) + '...' : 'NO URL'
      });
      
      if (!format.url) {
        throw new Error('Format URL not available');
      }

      // Process the URL to handle any signatures or throttling parameters
      const processedUrl = await this.processDownloadUrl(format.url);
      
      // Download with retry strategies
      const result = await this.downloadWithRetry(processedUrl, url);
      
      if (!result.success) {
        throw new Error(result.error || 'Download failed');
      }

      const filename = this.generateFilename(format, url);

      return {
        success: true,
        videoBuffer: result.videoBuffer,
        filename
      };
    } catch (error) {
      console.error('Download error:', error);
      return {
        success: false,
        error: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Download with multiple retry strategies, including browser rendering
   */
  private async downloadWithRetry(url: string, videoId: string): Promise<{success: boolean, videoBuffer?: ArrayBuffer, error?: string}> {
    // Feature flag to enable browser rendering with Puppeteer
    const ENABLE_BROWSER_RENDERING = true; // Disabled for local dev - traditional methods with better headers
    
    // Strategy 1: Try browser rendering download if available and enabled
    if (ENABLE_BROWSER_RENDERING && this.env.BROWSER) {
      try {
        console.log('Trying browser rendering download');
        const result = await this.downloadWithBrowserRendering(url);
        if (result.success) {
          console.log('Browser rendering download successful');
          return result;
        }
      } catch (error) {
        console.log('Browser rendering download failed, falling back to traditional methods:', error);
      }
    } else if (this.env.BROWSER) {
      console.log('Browser rendering disabled by feature flag, using traditional download methods');
    }
    
    // Strategy 2-4: Traditional fetch strategies
    const strategies: Array<{name: string, headers: Record<string, string>}> = [
      // Strategy 2: Standard browser headers
      {
        name: 'Standard Browser',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          'Origin': 'https://www.youtube.com',
          'Sec-Fetch-Dest': 'video',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'DNT': '1',
          'Connection': 'keep-alive'
        }
      },
      // Strategy 3: Mobile browser
      {
        name: 'Mobile Browser',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`
        }
      },
      // Strategy 4: Minimal headers
      {
        name: 'Minimal',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-'
        }
      }
    ];
    
    for (const strategy of strategies) {
      try {
        console.log(`Trying download strategy: ${strategy.name}`);
        
        const response = await fetch(url, {
          headers: strategy.headers,
          method: 'GET'
        });
        
        if (response.ok) {
          console.log(`Success with strategy: ${strategy.name}`);
          const videoBuffer = await response.arrayBuffer();
          return { success: true, videoBuffer };
        } else {
          console.log(`Strategy ${strategy.name} failed: ${response.status} ${response.statusText}`);
        }
        
      } catch (error) {
        console.log(`Strategy ${strategy.name} error:`, error);
        continue;
      }
    }
    
    return { 
      success: false, 
      error: 'All download strategies failed. Video may be protected or region-locked.' 
    };
  }
  
  /**
   * Download video using browser rendering to handle complex scenarios
   * Following official Cloudflare Browser Rendering documentation
   */
  private async downloadWithBrowserRendering(url: string): Promise<{success: boolean, videoBuffer?: ArrayBuffer, error?: string}> {
    if (!this.env.BROWSER) {
      throw new Error('Browser rendering not available');
    }

    try {
      // Import Puppeteer following official Cloudflare docs
      const puppeteer = (await import('@cloudflare/puppeteer')).default;
      
      console.log('Launching browser for download following official Cloudflare pattern...');
      
      // Launch browser using the BROWSER binding - official Cloudflare pattern
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log('Downloading video through browser...');
      
      // Use the browser to download the video
      const result = await page.evaluate(async (videoUrl) => {
        try {
          const response = await fetch(videoUrl, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://www.youtube.com/',
              'User-Agent': navigator.userAgent
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          return {
            success: true,
            size: arrayBuffer.byteLength,
            data: Array.from(new Uint8Array(arrayBuffer))
          };
          
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message || 'Download failed'
          };
        }
      }, url);
      
      // Close the browser
      await browser.close();
      
      if (!result.success || !result.data) {
        throw new Error(`Download error: ${result.error || 'No data received'}`);
      }
      
      // Convert the data array back to ArrayBuffer
      const videoBuffer = new Uint8Array(result.data).buffer;
      
      console.log(`Browser rendering download successful: ${result.size} bytes`);
      
      return {
        success: true,
        videoBuffer
      };
      
    } catch (error) {
      console.error('Browser rendering download failed:', error);
      throw new Error(`Browser rendering download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Process download URL to handle signatures and throttling
   */
  private async processDownloadUrl(url: string): Promise<string> {
    try {
      const urlObj = new URL(url);
      const sig = urlObj.searchParams.get('s');
      
      if (sig) {
        // TODO: Implement signature decoding
        console.warn('Video requires signature decoding - this is not yet implemented');
        // For now, return the URL as-is and hope it works
        return urlObj.toString();
      }
      
      return url;
    } catch {
      return url;
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration: string): number {
    if (!duration) return 0;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Generate filename for downloaded video
   */
  private generateFilename(format: YouTubeFormat, videoId: string): string {
    const cleanTitle = this.cleanFilename(videoId);
    const quality = format.quality || 'unknown';
    const ext = format.ext || 'mp4';
    
    return `${cleanTitle}_${quality}.${ext}`;
  }

  /**
   * Clean filename by removing invalid characters
   */
  private cleanFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  }

  /**
   * Get default formats when extraction fails
   */
  private getDefaultFormats(): YouTubeFormat[] {
    return [
      {
        itag: 18,
        quality: '360p',
        format: 'video/mp4',
        ext: 'mp4',
        resolution: '360p',
        note: 'Default format'
      },
      {
        itag: 22,
        quality: '720p',
        format: 'video/mp4',
        ext: 'mp4',
        resolution: '720p',
        note: 'Default format'
      }
    ];
  }
}
