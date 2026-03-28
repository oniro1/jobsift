const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');
let currentPostType = 'update';
let currentChatUserId = null;
let currentChatUserName = null;
let allUsers = [];
let connections = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!token || !user) { window.location.href = '/?login=1'; return; }
  initNav();
  initCompose();
  initMessages();
  loadFeed();
  loadConnections();
  loadPeople();
});

// ── NAV ──
function initNav() {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('nav-user').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:32px;height:32px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff">${escHtml(initials)}</div>
      <span style="font-size:14px;font-weight:500">${escHtml(user.name)}</span>
      <button onclick="logout()" style="background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:13px">Sign out</button>
    </div>`;

  document.getElementById('mini-avatar').textContent = initials;
  document.getElementById('compose-avatar').textContent = initials;
  document.getElementById('mini-name').textContent = user.name;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

// ── COMPOSE ──
function initCompose() {
  const input = document.getElementById('compose-input');
  const actions = document.getElementById('compose-actions');

  input.addEventListener('focus', () => { actions.style.display = 'flex'; input.rows = 3; });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPostType = btn.dataset.type;
    });
  });

  document.getElementById('post-btn').addEventListener('click', submitPost);
}

async function submitPost() {
  const content = document.getElementById('compose-input').value.trim();
  if (!content) return;

  const btn = document.getElementById('post-btn');
  btn.textContent = 'Posting...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content, type: currentPostType })
    });
    if (!res.ok) throw new Error('Failed to post');
    const post = await res.json();
    document.getElementById('compose-input').value = '';
    document.getElementById('compose-actions').style.display = 'none';
    prependPost(post);
    updatePostCount(1);
    showToast('Posted!', 'success');
  } catch (e) {
    showToast('Failed to post', 'error');
  } finally {
    btn.textContent = 'Post';
    btn.disabled = false;
  }
}

// ── FEED ──
async function loadFeed() {
  try {
    const res = await fetch('/api/posts', { headers: { 'Authorization': `Bearer ${token}` } });
    const posts = await res.json();
    const container = document.getElementById('feed-container');
    if (posts.length === 0) {
      container.innerHTML = `<div class="empty-feed"><h3>Nothing here yet</h3><p>Be the first to share an update!</p></div>`;
      return;
    }
    container.innerHTML = '';
    posts.forEach(post => container.appendChild(createPostEl(post)));
    document.getElementById('stat-posts').textContent = posts.filter(p => p.author === user.id).length;
  } catch (e) {
    showToast('Failed to load feed', 'error');
  }
}

function prependPost(post) {
  const container = document.getElementById('feed-container');
  const emptyEl = container.querySelector('.empty-feed');
  if (emptyEl) emptyEl.remove();
  container.insertBefore(createPostEl(post), container.firstChild);
}

function createPostEl(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.dataset.id = post._id;

  const initials = (post.authorName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const isOwn = post.author === user.id || post.author?._id === user.id;
  const likeCount = post.likes?.length || 0;
  const commentCount = post.comments?.length || 0;
  const liked = post.likes?.includes(user.id);
  const typeLabels = { update: '📝 Update', achievement: '🏆 Achievement', 'job-share': '💼 Job share' };

  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar">${escHtml(initials)}</div>
      <div>
        <div class="post-author-name">${escHtml(post.authorName || 'Unknown')}</div>
        <div class="post-author-headline">${escHtml(post.authorHeadline || '')}</div>
      </div>
      <div class="post-time">${timeAgo(post.createdAt)}</div>
      ${isOwn ? `<button class="post-delete" data-id="${post._id}">×</button>` : ''}
    </div>
    ${post.type !== 'update' ? `<div class="post-type-badge">${typeLabels[post.type] || ''}</div>` : ''}
    <div class="post-content">${escHtml(post.content)}</div>
    ${likeCount > 0 || commentCount > 0 ? `<div class="post-stats">
      ${likeCount > 0 ? `<span>${likeCount} like${likeCount !== 1 ? 's' : ''}</span>` : ''}
      ${commentCount > 0 ? `<span>${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>` : ''}
    </div>` : ''}
    <div class="post-actions">
      <button class="post-action-btn like-btn ${liked ? 'liked' : ''}" data-id="${post._id}">
        <svg width="16" height="16" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
        Like
      </button>
      <button class="post-action-btn comment-toggle-btn" data-id="${post._id}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Comment
      </button>
      ${!isOwn ? `<button class="post-action-btn msg-user-btn" data-id="${post.author?._id || post.author}" data-name="${escHtml(post.authorName)}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        Message
      </button>` : ''}
    </div>
    <div class="comments-section" style="display:none">
      <div class="comments-list">${(post.comments || []).map(c => commentHtml(c)).join('')}</div>
      <div class="comment-input-row">
        <input class="comment-input" placeholder="Write a comment...">
        <button class="comment-submit">Send</button>
      </div>
    </div>`;

  // Events
  const likeBtn = div.querySelector('.like-btn');
  likeBtn?.addEventListener('click', () => toggleLike(post._id, div));

  const commentToggle = div.querySelector('.comment-toggle-btn');
  const commentsSection = div.querySelector('.comments-section');
  commentToggle?.addEventListener('click', () => {
    commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
  });

  const commentSubmit = div.querySelector('.comment-submit');
  const commentInput = div.querySelector('.comment-input');
  commentSubmit?.addEventListener('click', () => submitComment(post._id, commentInput, div));
  commentInput?.addEventListener('keydown', e => { if (e.key === 'Enter') submitComment(post._id, commentInput, div); });

  const deleteBtn = div.querySelector('.post-delete');
  deleteBtn?.addEventListener('click', () => deletePost(post._id, div));

  const msgBtn = div.querySelector('.msg-user-btn');
  msgBtn?.addEventListener('click', () => openChatWith(msgBtn.dataset.id, msgBtn.dataset.name));

  return div;
}

function commentHtml(c) {
  const initials = (c.authorName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `<div class="comment-item">
    <div class="comment-avatar">${escHtml(initials)}</div>
    <div class="comment-bubble">
      <div class="comment-author">${escHtml(c.authorName || 'Unknown')}</div>
      <div class="comment-text">${escHtml(c.content)}</div>
    </div>
  </div>`;
}

async function toggleLike(postId, div) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const btn = div.querySelector('.like-btn');
    btn.classList.toggle('liked', data.liked);
    btn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
    updatePostStats(div, data.likes, null);
  } catch (e) { showToast('Failed to like', 'error'); }
}

async function submitComment(postId, input, div) {
  const content = input.value.trim();
  if (!content) return;
  try {
    const res = await fetch(`/api/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content })
    });
    const comment = await res.json();
    div.querySelector('.comments-list').insertAdjacentHTML('beforeend', commentHtml(comment));
    input.value = '';
    updatePostStats(div, null, 1);
  } catch (e) { showToast('Failed to comment', 'error'); }
}

async function deletePost(postId, div) {
  if (!confirm('Delete this post?')) return;
  try {
    await fetch(`/api/posts/${postId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    div.remove();
    showToast('Post deleted');
  } catch (e) { showToast('Failed to delete', 'error'); }
}

function updatePostStats(div, likes, commentDelta) {
  const statsEl = div.querySelector('.post-stats');
  // Simple re-render would need full post data; skip for now
}

function updatePostCount(delta) {
  const el = document.getElementById('stat-posts');
  el.textContent = parseInt(el.textContent || '0') + delta;
}

// ── CONNECTIONS ──
async function loadConnections() {
  try {
    const res = await fetch('/api/connections', { headers: { 'Authorization': `Bearer ${token}` } });
    connections = await res.json();

    const accepted = connections.filter(c => c.status === 'accepted');
    document.getElementById('stat-connections').textContent = accepted.length;

    const pending = connections.filter(c =>
      c.status === 'pending' && c.recipient?._id === user.id
    );

    if (pending.length > 0) {
      document.getElementById('pending-card').style.display = 'block';
      document.getElementById('pending-list').innerHTML = pending.map(c => `
        <div class="pending-item" data-id="${c._id}">
          <div class="pending-avatar">${(c.requester?.name || '?')[0].toUpperCase()}</div>
          <div class="pending-name">${escHtml(c.requester?.name || 'Unknown')}</div>
          <div class="pending-actions">
            <button class="accept-btn" data-id="${c._id}">Accept</button>
            <button class="reject-btn" data-id="${c._id}">Ignore</button>
          </div>
        </div>`).join('');

      document.querySelectorAll('.accept-btn').forEach(btn => {
        btn.addEventListener('click', () => respondConnection(btn.dataset.id, 'accepted'));
      });
      document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', () => respondConnection(btn.dataset.id, 'rejected'));
      });
    }
  } catch (e) {}
}

async function respondConnection(id, status) {
  try {
    await fetch(`/api/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    document.querySelector(`[data-id="${id}"]`)?.remove();
    if (status === 'accepted') {
      const el = document.getElementById('stat-connections');
      el.textContent = parseInt(el.textContent) + 1;
      showToast('Connection accepted!', 'success');
    }
    loadPeople();
  } catch (e) {}
}

// ── PEOPLE ──
async function loadPeople(q = '') {
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q || 'a')}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    allUsers = await res.json();
    renderPeople(allUsers);
  } catch (e) {}
}

function renderPeople(users) {
  const list = document.getElementById('people-list');
  if (users.length === 0) {
    list.innerHTML = `<div style="font-size:13px;color:var(--ink-3);text-align:center;padding:12px">No users found</div>`;
    return;
  }

  list.innerHTML = users.map(u => {
    const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const connStatus = getConnectionStatus(u._id);
    return `<div class="person-item">
      <div class="person-avatar">${escHtml(initials)}</div>
      <div class="person-info">
        <div class="person-name">${escHtml(u.name)}</div>
        <div class="person-headline">${escHtml(u.profile?.headline || '')}</div>
      </div>
      <button class="connect-btn ${connStatus ? 'sent' : ''}" data-uid="${u._id}" ${connStatus ? 'disabled' : ''}>
        ${connStatus === 'accepted' ? 'Connected' : connStatus === 'pending' ? 'Pending' : '+ Connect'}
      </button>
    </div>`;
  }).join('');

  list.querySelectorAll('.connect-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => sendConnection(btn.dataset.uid, btn));
  });
}

function getConnectionStatus(userId) {
  const conn = connections.find(c =>
    (c.requester?._id === userId || c.recipient?._id === userId)
  );
  return conn?.status || null;
}

async function sendConnection(recipientId, btn) {
  try {
    await fetch('/api/connections/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ recipientId })
    });
    btn.textContent = 'Pending';
    btn.classList.add('sent');
    btn.disabled = true;
    showToast('Connection request sent!', 'success');
  } catch (e) { showToast('Failed to send request', 'error'); }
}

document.getElementById('people-search').addEventListener('input', e => {
  loadPeople(e.target.value);
});

// ── MESSAGES ──
function initMessages() {
  document.getElementById('msg-fab').addEventListener('click', () => {
    document.getElementById('msg-panel').classList.toggle('open');
    if (document.getElementById('msg-panel').classList.contains('open')) loadConversations();
  });
  document.getElementById('msg-close').addEventListener('click', () => {
    document.getElementById('msg-panel').classList.remove('open');
  });
  document.getElementById('msg-back').addEventListener('click', () => {
    document.getElementById('msg-chat').classList.remove('open');
    document.getElementById('msg-conv-list').style.display = 'block';
  });
  document.getElementById('msg-send').addEventListener('click', sendMessage);
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

async function loadConversations() {
  try {
    const res = await fetch('/api/messages', { headers: { 'Authorization': `Bearer ${token}` } });
    const convs = await res.json();
    const list = document.getElementById('msg-conv-list');
    if (convs.length === 0) {
      list.innerHTML = `<div style="padding:20px;text-align:center;font-size:13px;color:var(--ink-3)">No messages yet</div>`;
      return;
    }
    list.innerHTML = convs.map(c => `
      <div class="msg-conv-item" data-uid="${c._id}">
        <div class="msg-conv-avatar">${(c.lastMessage?.content || '?')[0].toUpperCase()}</div>
        <div>
          <div class="msg-conv-name">User</div>
          <div class="msg-conv-preview">${escHtml(c.lastMessage?.content || '')}</div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.msg-conv-item').forEach(el => {
      el.addEventListener('click', () => openChatWith(el.dataset.uid, 'User'));
    });
  } catch (e) {}
}

function openChatWith(userId, userName) {
  currentChatUserId = userId;
  currentChatUserName = userName;
  document.getElementById('msg-chat-name').textContent = userName;
  document.getElementById('msg-conv-list').style.display = 'none';
  document.getElementById('msg-chat').classList.add('open');
  document.getElementById('msg-panel').classList.add('open');
  loadMessages(userId);
}

async function loadMessages(userId) {
  try {
    const res = await fetch(`/api/messages/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const messages = await res.json();
    const container = document.getElementById('msg-messages');
    container.innerHTML = messages.map(m => `
      <div class="msg-bubble ${m.sender === user.id ? 'mine' : 'theirs'}">${escHtml(m.content)}</div>`).join('');
    container.scrollTop = container.scrollHeight;
  } catch (e) {}
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;

  try {
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ recipientId: currentChatUserId, content })
    });
    input.value = '';
    const container = document.getElementById('msg-messages');
    container.insertAdjacentHTML('beforeend', `<div class="msg-bubble mine">${escHtml(content)}</div>`);
    container.scrollTop = container.scrollHeight;
  } catch (e) { showToast('Failed to send', 'error'); }
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