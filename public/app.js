// ── CV ANALYSIS (placeholder — replace with real API call) ──
const cvState = {
  uploaded: false,
  skills: [],
  fileName: ''
};

function initCV() {
  const btn = document.getElementById('cv-upload-btn');
  const input = document.getElementById('cv-file-input');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    analyzeCV(file);
  });
}

async function analyzeCV(file) {
  const btn = document.getElementById('cv-upload-btn');
  btn.textContent = 'Analyzing...';
  btn.disabled = true;

  // PLACEHOLDER — sostituire con vera chiamata API Anthropic
  await new Promise(r => setTimeout(r, 1800));

  // Simulated extracted skills based on filename hints
  const mockSkills = ['JavaScript', 'Node.js', 'React', 'MongoDB', 'REST APIs', 'Git', 'CSS'];

  cvState.uploaded = true;
  cvState.skills = mockSkills;
  cvState.fileName = file.name;

  // Update UI
  document.getElementById('cv-filename').textContent = '✓ ' + file.name;
  const skillsEl = document.getElementById('cv-skills');
  skillsEl.innerHTML = mockSkills.map(s => `<span class="cv-skill">${s}</span>`).join('');
  document.getElementById('cv-status').classList.add('visible');

  btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Change CV`;
  btn.disabled = false;

  showToast('CV analyzed! Job matches updated.', 'success');
  showGaps();

  if (state.jobs.length > 0) renderResults();
}

function getCompanyDomain(company, url) {
  try {
    if (url && url !== '#') {
      const u = new URL(url);
      return u.hostname.replace('www.', '');
    }
  } catch {}
  return null;
}

function companyLogoHtml(company, url) {
  const domain = getCompanyDomain(company, url);
  const initial = (company || '?')[0].toUpperCase();
  if (domain) {
    return `<div class="company-logo">
      <img src="https://logo.clearbit.com/${domain}"
           alt="${escHtml(company)}"
           onerror="this.parentElement.innerHTML='<span class=\\"company-logo-placeholder\\">${initial}</span>'">
    </div>`;
  }
  return `<div class="company-logo"><span class="company-logo-placeholder">${initial}</span></div>`;
}


  if (!cvState.uploaded) return null;

  const jobText = (job.title + ' ' + (job.tags || []).join(' ')).toLowerCase();
  const mySkills = cvState.skills.map(s => s.toLowerCase());

  let matches = 0;
  for (const skill of mySkills) {
    if (jobText.includes(skill.toLowerCase())) matches++;
  }

  const score = Math.round((matches / mySkills.length) * 100);

  if (score >= 60) return { level: 'green', label: 'Strong match', score };
  if (score >= 30) return { level: 'yellow', label: 'Partial match', score };
  return { level: 'red', label: 'Low match', score };
}

function matchBadgeHtml(job) {
  const match = getMatchScore(job);
  if (!match) return '';
  return `<span class="match-badge match-${match.level}">
    <span class="match-dot"></span>${match.label} ${match.score}%
  </span>`;
}

function showGaps() {
  const gaps = [
    { skill: 'TypeScript', tip: 'Free course on typescriptlang.org — no certification' },
    { skill: 'Docker', tip: 'Docker official docs + Play with Docker (free, no cert)' },
    { skill: 'AWS', tip: 'AWS Free Tier + Cloud Practitioner cert (~$100)' },
  ];

  const card = document.getElementById('gaps-card');
  const list = document.getElementById('gaps-list');

  list.innerHTML = gaps.map(g => `
    <div class="gap-item">
      <div class="gap-icon">⚡</div>
      <div class="gap-text">
        <strong>${g.skill}</strong>
        <span>${g.tip}</span>
      </div>
    </div>`).join('');

  card.classList.add('visible');
}


const state = {
  jobs: [],
  allJobs: [],
  page: 1,
  loading: false,
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  savedJobs: new Set(JSON.parse(localStorage.getItem('savedJobs') || '[]')),
  currentQ: 'developer',
  currentCountry: 'worldwide',
};

const JOBS_PER_PAGE = 12;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  updateNav();
  initCV();

  document.getElementById('q-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') search();
  });

  document.getElementById('search-btn').addEventListener('click', search);
  document.getElementById('sort-select').addEventListener('change', () => sortJobs());
  document.getElementById('modal-overlay').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModalDirect);

  document.getElementById('btn-login-nav').addEventListener('click', () => openModal('login'));
  document.getElementById('btn-register-nav').addEventListener('click', () => openModal('register'));

  document.getElementById('btn-login-submit').addEventListener('click', login);
  document.getElementById('btn-register-submit').addEventListener('click', register);
  document.getElementById('btn-cancel-login').addEventListener('click', closeModalDirect);
  document.getElementById('btn-cancel-register').addEventListener('click', closeModalDirect);
  document.getElementById('link-to-register').addEventListener('click', (e) => { e.preventDefault(); switchModal('register'); });
  document.getElementById('link-to-login').addEventListener('click', (e) => { e.preventDefault(); switchModal('login'); });

  document.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => quickSearch(pill.dataset.query));
  });

  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    document.getElementById('q-input').value = q;
    search();
  }
});

// ── SEARCH ──
async function search() {
  const q = document.getElementById('q-input').value.trim() || 'developer';
  const country = document.getElementById('country-select').value;
  state.currentQ = q;
  state.currentCountry = country;
  state.page = 1;
  await fetchJobs(q, country);
}

function quickSearch(q) {
  document.getElementById('q-input').value = q;
  search();
}

async function fetchJobs(q, country) {
  if (state.loading) return;
  state.loading = true;
  showLoading();

  try {
    const params = new URLSearchParams({ q, country, page: 1 });
    const res = await fetch(`/api/jobs?${params}`);
    if (!res.ok) throw new Error('Failed to fetch');
    const jobs = await res.json();
    state.allJobs = jobs;
    state.jobs = [...jobs];
    sortJobs(false);
    renderResults();
  } catch (err) {
    showError('Could not load jobs. Please try again.');
  } finally {
    state.loading = false;
  }
}

// ── SORT ──
function sortJobs(rerender = true) {
  const val = document.getElementById('sort-select').value;
  state.jobs = [...state.allJobs].sort((a, b) => {
    if (val === 'date') return new Date(b.posted) - new Date(a.posted);
    if (val === 'salary') return (parseNum(b.salary) - parseNum(a.salary));
    if (val === 'title') return a.title.localeCompare(b.title);
    return 0;
  });
  state.page = 1;
  if (rerender) renderResults();
}

function parseNum(s) {
  if (!s) return 0;
  return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}

// ── RENDER ──
function renderResults() {
  const total = state.jobs.length;
  const start = (state.page - 1) * JOBS_PER_PAGE;
  const pageJobs = state.jobs.slice(start, start + JOBS_PER_PAGE);

  document.getElementById('results-header').style.display = total > 0 ? 'flex' : 'none';
  document.getElementById('results-count').innerHTML =
    `<strong>${total}</strong> job${total !== 1 ? 's' : ''} found for "<strong>${escHtml(state.currentQ)}</strong>"`;

  const grid = document.getElementById('jobs-grid');

  if (total === 0) {
    grid.innerHTML = `
      <div class="state-message">
        <span class="icon">😕</span>
        <h3>No results found</h3>
        <p>Try a different keyword or country.</p>
      </div>`;
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  grid.innerHTML = pageJobs.map((job, i) => jobCard(job, i)).join('');

  // Attach event listeners to dynamically created elements
  grid.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSave(btn.dataset.jobId);
    });
  });

  renderPagination(total);
}

function jobCard(job, i) {
  const saved = state.savedJobs.has(job.id);
  const tags = (job.tags || []).slice(0, 5).map(t =>
    `<span class="job-tag">${escHtml(t)}</span>`
  ).join('');
  const delay = (i * 40) + 'ms';

  return `
    <a class="job-card" href="${escHtml(job.url || '#')}" target="_blank" rel="noopener"
       style="animation-delay:${delay}">
      ${companyLogoHtml(job.company, job.url)}
      <div class="job-main">
        <div class="job-company">${escHtml(job.company || 'Company')}</div>
        <div class="job-title">${escHtml(job.title)}</div>
        <div class="job-meta">
          ${job.location ? `<span>
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escHtml(job.location)}
          </span>` : ''}
          ${job.posted ? `<span>${timeAgo(job.posted)}</span>` : ''}
        </div>
        <div class="job-tags">${tags}</div>
        ${matchBadgeHtml(job) ? `<div style="margin-top:8px">${matchBadgeHtml(job)}</div>` : ''}
      </div>
      <div class="job-side">
        ${job.salary ? `<div class="job-salary">£${escHtml(job.salary)}</div>` : ''}
        <button class="save-btn ${saved ? 'saved' : ''}" data-job-id="${escHtml(job.id)}"
          title="${saved ? 'Unsave' : 'Save job'}">
          <svg width="12" height="12" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          ${saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </a>`;
}

function renderPagination(total) {
  const pages = Math.ceil(total / JOBS_PER_PAGE);
  const pg = document.getElementById('pagination');
  if (pages <= 1) { pg.style.display = 'none'; return; }
  pg.style.display = 'flex';

  let html = `<button class="page-btn" id="pg-prev" ${state.page === 1 ? 'disabled' : ''}>← Prev</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && Math.abs(p - state.page) > 2 && p !== 1 && p !== pages) {
      if (p === 2 || p === pages - 1) html += `<span style="padding:0 4px;color:var(--ink-3)">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }
  html += `<button class="page-btn" id="pg-next" ${state.page === pages ? 'disabled' : ''}>Next →</button>`;
  pg.innerHTML = html;

  pg.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goPage(parseInt(btn.dataset.page)));
  });
  const prev = pg.querySelector('#pg-prev');
  const next = pg.querySelector('#pg-next');
  if (prev) prev.addEventListener('click', () => goPage(state.page - 1));
  if (next) next.addEventListener('click', () => goPage(state.page + 1));
}

function goPage(p) {
  const pages = Math.ceil(state.jobs.length / JOBS_PER_PAGE);
  if (p < 1 || p > pages) return;
  state.page = p;
  renderResults();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── SAVE JOB ──
async function toggleSave(jobId) {
  if (!state.token) { openModal('login'); return; }

  const saved = state.savedJobs.has(jobId);
  if (saved) {
    state.savedJobs.delete(jobId);
  } else {
    state.savedJobs.add(jobId);
    try {
      await fetch('/api/user/save-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
        body: JSON.stringify({ jobId })
      });
    } catch {}
  }
  localStorage.setItem('savedJobs', JSON.stringify([...state.savedJobs]));
  renderResults();
  showToast(saved ? 'Job removed' : 'Job saved!', saved ? '' : 'success');
}

// ── AUTH ──
async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveAuth(data);
    closeModalDirect();
    showToast('Welcome back, ' + data.user.name + '!', 'success');
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
}

async function register() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  document.getElementById('reg-error').textContent = '';

  if (!name || !email || !password) {
    document.getElementById('reg-error').textContent = 'All fields required.';
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    saveAuth(data);
    closeModalDirect();
    showToast('Welcome to JobSift, ' + data.user.name + '!', 'success');
  } catch (err) {
    document.getElementById('reg-error').textContent = err.message;
  }
}

function saveAuth(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  updateNav();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateNav();
  showToast('Signed out');
}

function updateNav() {
  const nav = document.getElementById('nav-actions');
  if (state.user) {
    const initials = state.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    nav.innerHTML = `
      <div class="user-chip" id="user-chip" title="Click to sign out">
        <div class="avatar">${escHtml(initials)}</div>
        <span class="user-name">${escHtml(state.user.name)}</span>
      </div>`;
    document.getElementById('user-chip').addEventListener('click', logout);
  } else {
    nav.innerHTML = `
      <button class="btn btn-ghost" id="btn-login-nav">Sign in</button>
      <button class="btn btn-primary" id="btn-register-nav">Join free</button>`;
    document.getElementById('btn-login-nav').addEventListener('click', () => openModal('login'));
    document.getElementById('btn-register-nav').addEventListener('click', () => openModal('register'));
  }
}

// ── MODAL ──
function openModal(type) {
  document.getElementById('modal-login').style.display = type === 'login' ? '' : 'none';
  document.getElementById('modal-register').style.display = type === 'register' ? '' : 'none';
  document.getElementById('modal-overlay').classList.add('open');
}

function switchModal(type) {
  document.getElementById('modal-login').style.display = type === 'login' ? '' : 'none';
  document.getElementById('modal-register').style.display = type === 'register' ? '' : 'none';
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── TOAST ──
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── STATES ──
function showLoading() {
  document.getElementById('results-header').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
  document.getElementById('jobs-grid').innerHTML = `
    <div class="state-message">
      <div class="spinner"></div>
      <p>Finding jobs for you…</p>
    </div>`;
}

function showError(msg) {
  document.getElementById('jobs-grid').innerHTML = `
    <div class="state-message">
      <span class="icon">⚠️</span>
      <h3>Something went wrong</h3>
      <p>${escHtml(msg)}</p>
    </div>`;
}

// ── UTILS ──
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}