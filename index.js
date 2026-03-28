require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const NodeCache = require('node-cache');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { fetchJobs } = require('./fetcher');
const { extractTags } = require('./tagger');
const { extractRequirements } = require('./requirements');
const User = require('./models/User');
const auth = require('./middleware/auth');
const { sendWelcomeEmail } = require('./services/email');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Cache setup (TTL: 10 minutes)
const cache = new NodeCache({ stdTTL: 600 });

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
  }
}));
app.use(cors());
app.use(express.json()); // Parse JSON bodies

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, url: req.url });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});
app.use('/api/', limiter);

app.use(express.static('public'));

// Input validation middleware
function validateQuery(req, res, next) {
  const { q, country, tags, page } = req.query;
  if (q && (typeof q !== 'string' || q.length > 100)) {
    return res.status(400).json({ error: 'Invalid query parameter' });
  }
  if (country && (typeof country !== 'string' || !/^[a-z]{2,}$/.test(country))) {
    return res.status(400).json({ error: 'Invalid country parameter' });
  }
  if (tags && (typeof tags !== 'string' || tags.length > 200)) {
    return res.status(400).json({ error: 'Invalid tags parameter' });
  }
  if (page && (isNaN(page) || parseInt(page) < 1)) {
    return res.status(400).json({ error: 'Invalid page parameter' });
  }
  next();
}

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({ email, password, name });
    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(email, name);
    } catch (emailError) {
      logger.warn('Welcome email failed', { error: emailError.message });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Protected routes
app.get('/api/user/profile', auth, async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  res.json({ user: req.user });
});

app.post('/api/user/save-job', auth, async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    const { jobId } = req.body;
    if (!req.user.savedJobs.includes(jobId)) {
      req.user.savedJobs.push(jobId);
      await req.user.save();
    }
    res.json({ message: 'Job saved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save job' });
  }
});

app.get('/api/user/saved-jobs', auth, async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    // In a real app, you'd fetch the actual job details
    res.json({ savedJobs: req.user.savedJobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch saved jobs' });
  }
});

app.get('/api/jobs', validateQuery, async (req, res) => {
  try {
    const { q = 'developer', country = 'worldwide', tags, page = 1 } = req.query;
    const pageNum = parseInt(page) || 1;
    if (pageNum < 1 || pageNum > 100) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    // Create cache key
    const cacheKey = `${q}-${country}-${tags || ''}-${pageNum}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      logger.info('Cache hit', { cacheKey, ip: req.ip });
      return res.json(cachedResult);
    }

    logger.info('Searching jobs', { q, country, tags, page: pageNum, ip: req.ip });

    const raw = await fetchJobs(q, country, pageNum);
    logger.info('Fetched jobs', { count: raw.length, q, country });

    let jobs = raw.map(job => ({
      id: job.id,
      title: job.title,
      company: job.company && job.company.display_name,
      location: job.location && job.location.display_name,
      salary: job.salary_min ? job.salary_min.toLocaleString() : null,
      url: job.redirect_url,
      tags: extractTags(job),
      requirements: extractRequirements(job.description),
      posted: job.created
    }));

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim().toLowerCase());
      jobs = jobs.filter(job => job.tags.some(tag => tagList.includes(tag.toLowerCase())));
      logger.info('Filtered jobs by tags', { originalCount: raw.length, filteredCount: jobs.length, tags });
    }

    // Cache the result
    cache.set(cacheKey, jobs);
    logger.info('Cached result', { cacheKey });

    res.json(jobs);
  } catch (err) {
    logger.error('API Error', { error: err.message, stack: err.stack, ip: req.ip });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB if configured
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch((error) => {
    logger.error('MongoDB connection error', { error: error.message });
    console.error('MongoDB connection failed. User features will be disabled.');
  });
} else {
  console.log('MongoDB not configured. User features will be disabled.');
}

// Start server
app.listen(3000, () => {
  logger.info('Server running on :3000');
  console.log('Running on :3000');
});
