require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
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
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, url: req.url });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});
app.use('/api/', limiter);

// Helper: get user object from httpOnly cookie
async function getUserFromCookie(req) {
  const token = req.cookies.token;
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return null;
    return { id: user._id, name: user.name, email: user.email, profile: user.profile || {} };
  } catch {
    return null;
  }
}

// Cookie options helper
function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

// ── PAGE ROUTES ──

app.get('/', async (req, res) => {
  const user = await getUserFromCookie(req);
  res.render('index', {
    user,
    page: 'home',
    title: 'JobSift — Find Your Next Role',
  });
});

app.get('/login', async (req, res) => {
  const user = await getUserFromCookie(req);
  if (user) return res.redirect('/');
  res.render('login', {
    user: null,
    page: 'login',
    title: 'Sign in — JobSift',
    error: null,
  });
});

app.get('/register', async (req, res) => {
  const user = await getUserFromCookie(req);
  if (user) return res.redirect('/');
  res.render('register', {
    user: null,
    page: 'register',
    title: 'Join free — JobSift',
    error: null,
  });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

app.get('/network', async (req, res) => {
  const user = await getUserFromCookie(req);
  if (!user) return res.redirect('/login?redirect=/network');
  res.render('network', { user, page: 'network', title: 'My Network — JobSift' });
});

app.get('/feed', async (req, res) => {
  const user = await getUserFromCookie(req);
  if (!user) return res.redirect('/login?redirect=/feed');
  res.render('feed', {
    user,
    page: 'feed',
    title: 'Feed — JobSift',
  });
});

app.get('/profile/:id', async (req, res) => {
  const user = await getUserFromCookie(req);
  if (!user) return res.redirect('/login');
  if (!mongoose.connection.readyState) return res.redirect('/');
  try {
    const profileDoc = await User.findById(req.params.id).select('-password');
    if (!profileDoc) return res.redirect('/');
    const profileUser = {
      id: profileDoc._id,
      name: profileDoc.name,
      email: profileDoc.email,
      profile: profileDoc.profile || {},
      experience: profileDoc.experience || [],
      education: profileDoc.education || [],
    };
    res.render('profile', {
      user,
      profileUser,
      isOwnProfile: String(user.id) === req.params.id,
      page: 'profile',
      title: `${profileDoc.name} — JobSift`,
    });
  } catch (e) {
    res.redirect('/');
  }
});

// Static assets (CSS, JS, images) — index: false so EJS handles /
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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

// ── AUTH API ROUTES ──
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

    try {
      await sendWelcomeEmail(email, name);
    } catch (emailError) {
      logger.warn('Welcome email failed', { error: emailError.message });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, cookieOpts());
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
    res.cookie('token', token, cookieOpts());
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── USER API ROUTES ──
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
    if (profile) {
      req.user.profile = { ...req.user.profile, ...profile };
      req.user.markModified('profile');
    }
    await req.user.save();
    res.json({ user: req.user });
  } catch (error) {
    logger.error('Profile update error', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

app.post('/api/user/avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: 'No image provided' });
    if (!avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    if (avatar.length > 400000) return res.status(400).json({ error: 'Image too large (max ~300 KB)' });
    req.user.profile = { ...req.user.profile, avatar };
    req.user.markModified('profile');
    await req.user.save();
    res.json({ avatar });
  } catch (e) {
    logger.error('Avatar upload error', { error: e.message });
    res.status(500).json({ error: 'Failed to save avatar' });
  }
});

// ── EXPERIENCE ──
app.post('/api/user/experience', auth, async (req, res) => {
  try {
    const { title, company, location, startDate, endDate, current, description } = req.body;
    if (!title || !company) return res.status(400).json({ error: 'Title and company required' });
    req.user.experience.push({ title, company, location, startDate, endDate, current, description });
    await req.user.save();
    res.json(req.user.experience[req.user.experience.length - 1]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/user/experience/:id', auth, async (req, res) => {
  try {
    const exp = req.user.experience.id(req.params.id);
    if (!exp) return res.status(404).json({ error: 'Not found' });
    Object.assign(exp, req.body);
    await req.user.save();
    res.json(exp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/user/experience/:id', auth, async (req, res) => {
  try {
    req.user.experience.pull(req.params.id);
    await req.user.save();
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EDUCATION ──
app.post('/api/user/education', auth, async (req, res) => {
  try {
    const { school, degree, field, startYear, endYear } = req.body;
    if (!school) return res.status(400).json({ error: 'School required' });
    req.user.education.push({ school, degree, field, startYear, endYear });
    await req.user.save();
    res.json(req.user.education[req.user.education.length - 1]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/user/education/:id', auth, async (req, res) => {
  try {
    const edu = req.user.education.id(req.params.id);
    if (!edu) return res.status(404).json({ error: 'Not found' });
    Object.assign(edu, req.body);
    await req.user.save();
    res.json(edu);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/user/education/:id', auth, async (req, res) => {
  try {
    req.user.education.pull(req.params.id);
    await req.user.save();
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    res.json({ savedJobs: req.user.savedJobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch saved jobs' });
  }
});

// ── JOBS API ──
app.get('/api/jobs', validateQuery, async (req, res) => {
  try {
    const { q = 'developer', country = 'worldwide', tags, page = 1 } = req.query;
    const pageNum = parseInt(page) || 1;
    if (pageNum < 1 || pageNum > 100) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

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
      logo: job.employer_logo || null,
      companyWebsite: job.employer_website || null,
      tags: extractTags(job),
      requirements: extractRequirements(job.description),
      posted: job.created
    }));

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim().toLowerCase());
      jobs = jobs.filter(job => job.tags.some(tag => tagList.includes(tag.toLowerCase())));
      logger.info('Filtered jobs by tags', { originalCount: raw.length, filteredCount: jobs.length, tags });
    }

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
