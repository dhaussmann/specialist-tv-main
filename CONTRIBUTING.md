# Contributing to Specialist TV

Thank you for your interest in contributing to Specialist TV! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers, D1, R2, Stream, and AI enabled
- Wrangler CLI installed and authenticated
- Docker (for containerized features)

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/specialist-tv.git
   cd specialist-tv
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with your actual Cloudflare credentials
   ```

4. **Set up Cloudflare resources**

   ```bash
   # Create D1 database
   wrangler d1 create specialist-tv-db
   
   # Create R2 bucket
   wrangler r2 bucket create specialist-tv-thumbnails
   
   # Run database migrations
   wrangler d1 migrations apply specialist-tv-db
   ```

5. **Start development server**

   ```bash
   npm run dev
   ```

## 🛠️ Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow the existing ESLint configuration
- Use Prettier for code formatting
- Write meaningful commit messages

### Architecture

- **Frontend**: Next.js with React 19 and Tailwind CSS
- **Backend**: Cloudflare Workers with TypeScript
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 for thumbnails, Stream for videos
- **AI**: Cloudflare AI Workers for transcription and processing

### Testing

- Write unit tests for new features
- Test API endpoints thoroughly
- Ensure responsive design works on mobile and desktop

## 📝 Submitting Changes

### Pull Request Process

1. **Fork the repository** and create a feature branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding guidelines

3. **Test your changes** thoroughly

   ```bash
   npm run lint
   npm run build
   ```

4. **Commit your changes** with descriptive messages

   ```bash
   git commit -m "feat: add video chapter navigation"
   ```

5. **Push to your fork** and create a pull request

   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

We follow conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment information
- Screenshots if applicable

### Feature Requests

For feature requests, please provide:

- Clear description of the feature
- Use case and benefits
- Possible implementation approach
- Any relevant examples or mockups

## 🔧 Development Tips

### Working with Cloudflare Services

- Use `wrangler dev` for local development
- Test with actual Cloudflare services when possible
- Monitor usage and costs in Cloudflare dashboard

### Database Migrations

- Create migrations for schema changes
- Test migrations on development database first
- Document any breaking changes

### AI Processing

- Test AI features with various video types
- Monitor processing costs and performance
- Implement proper error handling for AI failures

## 📚 Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## 🤝 Community

- Be respectful and inclusive
- Help others learn and grow
- Share knowledge and best practices
- Follow our Code of Conduct

## 📄 License

By contributing to Specialist TV, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Specialist TV! 🎉
