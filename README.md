# JobSift - Professional Job Aggregator

A full-featured job search application with worldwide job aggregation, user accounts, and professional features.

## Features

- 🌍 Worldwide job search from multiple countries
- 🔍 Advanced filtering by tags, location, salary
- 👤 User accounts with saved jobs and search history
- 📧 Email notifications for new jobs
- 📊 Analytics and monitoring
- 🔒 Security with rate limiting and authentication
- 📱 Responsive design with accessibility support
- ⚡ Performance optimized with caching

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your API keys (optional - app works with mock data)
4. Run the application: `npm start` or `npm run dev` for development

## Environment Variables

- `ADZUNA_APP_ID` & `ADZUNA_APP_KEY`: Adzuna API credentials (optional - uses mock data if not provided)
- `MONGODB_URI`: MongoDB connection string (optional - user features disabled if not provided)
- `JWT_SECRET`: Secret for JWT tokens (required for auth)
- `SENDGRID_API_KEY`: SendGrid API key for emails (optional - emails disabled if not provided)
- `FROM_EMAIL`: Sender email address
- `FRONTEND_URL`: Frontend URL for links
- `GA_MEASUREMENT_ID`: Google Analytics tracking ID

## Development

The application includes fallback mock data for development when API keys are not configured, so you can test all features without external dependencies.

## API Endpoints

### Public
- `GET /api/jobs`: Search jobs
- `POST /api/auth/register`: Register user
- `POST /api/auth/login`: Login user
- `GET /health`: Health check

### Protected (require Bearer token)
- `GET /api/user/profile`: Get user profile
- `POST /api/user/save-job`: Save a job
- `GET /api/user/saved-jobs`: Get saved jobs

## Development

- `npm test`: Run tests
- `npm run dev`: Start with nodemon
- CI/CD: GitHub Actions workflow included

## Deployment

1. Set up MongoDB database
2. Configure environment variables
3. Deploy to server (Heroku, DigitalOcean, etc.)
4. Set up HTTPS
5. Configure monitoring

## Technologies

- Node.js, Express.js
- MongoDB with Mongoose
- JWT Authentication
- SendGrid for emails
- Winston for logging
- Helmet for security
- Jest for testing
- Google Analytics

## License

ISC