# Specialist TV

> A comprehensive video knowledge management platform built on the Cloudflare stack

Specialist TV is an open-source video knowledge management platform that enables teams to easily upload, process, and discover video content using AI-powered features. Built entirely on Cloudflare's edge computing platform for maximum performance and scalability.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

## 🚀 Features

### Content Creation

- **Drag & Drop Upload**: Intuitive video upload interface
- **Cloudflare Stream Integration**: Automatic video encoding and delivery
- **AI Processing Pipeline**: Automated transcription, tagging, and chapter generation
- **Thumbnail Management**: AI-generated or user-selected thumbnails
- **Webhook Notifications**: Real-time processing status updates

### Content Consumption

- **Full-Text Search**: Search across titles, descriptions, transcripts, and tags
- **AI-Powered Tagging**: Automatic categorization for presales searchability
- **Video Chapters**: AI-generated chapters for easy navigation
- **Related Content**: TF-IDF similarity-based recommendations
- **Responsive Design**: Optimized for desktop and mobile
- **Real-time Status**: Live processing status and progress tracking

## 🏗️ Architecture

### Cloudflare Stack

- **Workers**: Main API and business logic
- **D1 Database**: Video metadata, transcripts, tags, and search indices
- **R2 Storage**: Thumbnail storage
- **Stream**: Video encoding, storage, and delivery
- **Queues**: Async processing pipeline
- **AI Workers**: Transcription, tagging, and thumbnail generation

### Data Flow

1. **Upload**: Drag & drop → Worker → Stream API (direct upload)
2. **Processing**: Stream webhook → Queue → AI processing (transcription/tagging/chapters)
3. **Storage**: Metadata → D1, Thumbnails → R2
4. **Search**: Full-text search across D1 stored content
5. **Delivery**: Stream for videos, R2 for thumbnails

## 🛠️ Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers, D1, R2, Stream, and AI enabled
- Wrangler CLI (`npm install -g wrangler`)

### Quick Start (Recommended)

The bootstrap script handles everything automatically:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/specialist-tv.git
cd specialist-tv

# 2. Login to Cloudflare
wrangler login

# 3. Run bootstrap for local development
./scripts/bootstrap.sh --local

# 4. Start development server
npm run dev
```

### Production Deployment

```bash
# Full production setup with admin user
./scripts/bootstrap.sh --remote your-email@example.com

# Set required secrets
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Deploy
npm run deploy
```

### What the Bootstrap Script Does

The `./scripts/bootstrap.sh` script automates:

1. **Prerequisites check** - Verifies Node.js, npm, and Wrangler
2. **Dependency installation** - Runs `npm install`
3. **Environment setup** - Creates `.dev.vars` from example
4. **Cloudflare resources** (remote mode):
   - D1 database creation
   - R2 bucket creation
   - Queue creation
   - Vectorize index creation
5. **Database migrations** - Applies all schema migrations
6. **Admin user creation** (remote mode with email)
7. **Application build** - Runs `npm run build`

### Manual Setup

If you prefer manual setup:

1. **Create D1 Database**:
   ```bash
   wrangler d1 create specialist-tv-db
   # Update wrangler.jsonc with the returned database_id
   wrangler d1 migrations apply DB --remote
   ```

2. **Create R2 Bucket**:
   ```bash
   wrangler r2 bucket create specialist-tv-thumbnails
   ```

3. **Create Queue**:
   ```bash
   wrangler queues create video-processing
   ```

4. **Create Vectorize Index**:
   ```bash
   wrangler vectorize create video-embeddings --dimensions=768 --metric=cosine
   ```

5. **Set Required Secrets**:
   ```bash
   wrangler secret put CLOUDFLARE_ACCOUNT_ID
   wrangler secret put CLOUDFLARE_API_TOKEN
   wrangler secret put AUTH_SECRET
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```

6. **Create First Admin**:
   ```bash
   ./scripts/bootstrap.sh --remote admin@yourdomain.com
   # Or manually insert into user_invitations table
   ```

### Configure Stream Webhooks

```bash
# Deploy first to get webhook URL
npm run deploy

# Set up webhook (replace with your values)
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
export WEBHOOK_URL="https://your-worker.workers.dev/stream/webhook"
node scripts/setup-webhook.js
```

📚 **Detailed Guide**: See [docs/webhook-setup.md](docs/webhook-setup.md) for complete webhook configuration instructions.

## 📊 Database Schema

The POC uses a comprehensive schema designed for video knowledge management:

- **videos**: Core video metadata and status
- **transcripts**: AI-generated transcripts with confidence scores
- **tags**: Hierarchical tagging system for presales categorization
- **video_tags**: Many-to-many relationship with confidence scoring
- **chapters**: AI-generated video chapters with timestamps
- **search_index**: FTS5 full-text search index
- **webhooks**: Notification tracking and delivery status

## 🔍 API Endpoints

### Video Management
- `POST /api/videos/upload` - Upload new video
- `GET /api/videos` - List all videos (with pagination)
- `GET /api/videos/{id}` - Get specific video
- `DELETE /api/videos/{id}` - Delete video (removes from both DB and Stream)
- `GET /api/videos/search?q={query}` - Search videos
- `GET /api/videos/{id}/related` - Get related videos
- `POST /api/videos/sync` - Sync all processing videos from Stream API

### AI Features
- `POST /api/videos/{id}/thumbnail` - Generate AI thumbnail
- Automatic transcription, tagging, and chapter generation via queue

### Webhooks
- `POST /stream/webhook` - Cloudflare Stream webhook handler

## 🤖 AI Processing Pipeline

### Transcription
- Uses Cloudflare Stream's native AI captions for speech-to-text
- Supports English language processing with high accuracy
- Automatically generates and downloads VTT caption files
- Stores confidence scores and metadata

### Tagging
- AI analyzes video content for presales-relevant tags
- Categories: products, technologies, customer types, use cases, difficulty levels
- Confidence scoring for tag relevance

### Chapters
- AI-generated video chapters for navigation
- Timestamp-based segmentation
- Summary generation for each chapter

### Related Content
- TF-IDF similarity algorithm
- Cosine similarity for content matching
- Recency weighting for recommendations

## 🎨 Frontend Components

### VideoUpload
- Drag & drop interface
- File validation and preview
- Progress tracking
- Form validation

### VideoLibrary
- Grid/list view of videos
- Status indicators
- Thumbnail previews
- Metadata display

### SearchBar
- Real-time search with debouncing
- Search suggestions
- Query highlighting

### VideoPlayer
- Cloudflare Stream integration
- Chapter navigation
- Transcript display
- Related video recommendations

## 🔧 Configuration

### Environment Variables
- `STREAM_API_TOKEN`: Cloudflare Stream API token
- `STREAM_ACCOUNT_ID`: Cloudflare account ID
- `WEBHOOK_SECRET`: Optional webhook signature verification

### Wrangler Configuration
The `wrangler.jsonc` file includes all necessary bindings:
- D1 database binding
- R2 bucket binding
- Queue producer/consumer configuration
- AI binding for processing

## 📈 Monitoring & Observability

- **Webhook Tracking**: All processing events logged to database
- **Status Monitoring**: Real-time video processing status
- **Error Handling**: Comprehensive error tracking and retry logic
- **Performance Metrics**: Built-in Cloudflare Workers analytics

## 🚦 Development Workflow

1. **Local Development**:
   ```bash
   npm run dev
   ```

2. **Testing**:
   ```bash
   # Test database operations
   wrangler d1 execute specialist-tv-db --command="SELECT * FROM videos;"
   
   # Test queue processing
   wrangler queues producer video-processing '{"video_id":"test"}'
   ```

3. **Deployment**:
   ```bash
   npm run deploy
   ```

## 🔒 Security Considerations

- **API Authentication**: Currently disabled for POC (add as needed)
- **Webhook Verification**: Optional signature verification
- **CORS Configuration**: Configured for development
- **Input Validation**: File type and size restrictions

## 📝 Usage Examples

### Upload a Video
1. Drag and drop a video file onto the upload area
2. Enter title and optional description
3. Click "Upload Video"
4. Monitor processing status in real-time

### Search Content
1. Use the search bar to find videos
2. Search across titles, descriptions, transcripts, and tags
3. Click on results to view videos

### View Video Details
1. Click on any ready video in the library
2. View chapters, transcript, and related content
3. Navigate through video using chapter markers

## 🤝 Contributing

This is a POC designed for demonstration purposes. For production use:

1. Add proper authentication and authorization
2. Implement rate limiting and abuse protection
3. Add comprehensive error handling and logging
4. Optimize database queries and indexing
5. Add unit and integration tests
6. Implement proper CI/CD pipeline

## 📄 License

This project is for demonstration purposes. Please ensure compliance with Cloudflare's terms of service and any applicable licenses for the technologies used.

## 🆘 Troubleshooting

### Common Issues

1. **Database not found**: Ensure D1 database is created and ID is correct in wrangler.jsonc
2. **Stream upload fails**: Verify STREAM_API_TOKEN and STREAM_ACCOUNT_ID are set
3. **Queue not processing**: Check queue configuration and consumer setup
4. **AI processing fails**: Ensure AI binding is properly configured

### Debug Commands

```bash
# Check database status
wrangler d1 info specialist-tv-db

# View recent logs
wrangler tail

# Test queue
wrangler queues consumer video-processing
```

## 🔮 Future Enhancements

- **User Authentication**: Google OAuth integration
- **Team Management**: Multi-tenant support
- **Advanced Analytics**: Usage metrics and insights
- **Mobile App**: React Native companion app
- **Integrations**: Slack, Teams, CRM systems
- **Advanced AI**: Sentiment analysis, topic modeling
- **Collaboration**: Comments, annotations, sharing
