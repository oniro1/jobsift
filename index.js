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
const Post = require('./models/Post');
const Connection = require('./models/Connection');
const Message = require('./models/Message');
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
app.use(helmet()); // Security headers
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

app.put('/api/user/profile', auth, async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    const { name, profile } = req.body;
    if (name) req.user.name = name;
    if (profile) req.user.profile = { ...req.user.profile, ...profile };
    await req.user.save();
    res.json({ user: req.user });
  } catch (error) {
    logger.error('Profile update error', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
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

// ── SOCIAL: POSTS ──
app.get('/api/posts', auth, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(50);
    res.json(posts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts', auth, async (req, res) => {
  try {
    const { content, type, jobRef } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
    const post = new Post({
      author: req.user._id,
      authorName: req.user.name,
      authorHeadline: req.user.profile?.headline || '',
      content: content.trim(),
      type: type || 'update',
      jobRef: jobRef || null
    });
    await post.save();
    res.json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Unauthorized' });
    await post.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const idx = post.likes.indexOf(req.user._id);
    if (idx === -1) post.likes.push(req.user._id);
    else post.likes.splice(idx, 1);
    await post.save();
    res.json({ likes: post.likes.length, liked: idx === -1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/comment', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    post.comments.push({ author: req.user._id, authorName: req.user.name, content });
    await post.save();
    res.json(post.comments[post.comments.length - 1]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SOCIAL: CONNECTIONS ──
app.get('/api/connections', auth, async (req, res) => {
  try {
    const connections = await Connection.find({
      $or: [{ requester: req.user._id }, { recipient: req.user._id }]
    }).populate('requester recipient', 'name profile.headline profile.location');
    res.json(connections);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { 'profile.headline': { $regex: q, $options: 'i' } }
      ]
    }).select('name profile.headline profile.location').limit(10);
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/connections/request', auth, async (req, res) => {
  try {
    const { recipientId } = req.body;
    const existing = await Connection.findOne({
      $or: [
        { requester: req.user._id, recipient: recipientId },
        { requester: recipientId, recipient: req.user._id }
      ]
    });
    if (existing) return res.status(400).json({ error: 'Connection already exists' });
    const conn = new Connection({ requester: req.user._id, recipient: recipientId });
    await conn.save();
    res.json(conn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/connections/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const conn = await Connection.findById(req.params.id);
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (conn.recipient.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Unauthorized' });
    conn.status = status;
    await conn.save();
    res.json(conn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SOCIAL: MESSAGES ──
app.get('/api/messages/:userId', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user._id }
      ]
    }).sort({ createdAt: 1 });
    await Message.updateMany({ sender: req.params.userId, recipient: req.user._id, read: false }, { read: true });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages', auth, async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    if (!content || !recipientId) return res.status(400).json({ error: 'Missing fields' });
    const msg = new Message({ sender: req.user._id, recipient: recipientId, content });
    await msg.save();
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages', auth, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: req.user._id }, { recipient: req.user._id }] } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { $cond: [{ $eq: ['$sender', req.user._id] }, '$recipient', '$sender'] }, lastMessage: { $first: '$$ROOT' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$recipient', req.user._id] }, { $eq: ['$read', false] }] }, 1, 0] } } } },
    ]);
    res.json(conversations);
  } catch (e) { res.status(500).json({ error: e.message }); }
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