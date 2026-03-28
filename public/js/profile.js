// Data injected server-side via profile.ejs
const currentUser = window.CURRENT_USER;
const profileUser = window.PROFILE_USER;
const isOwnProfile = window.IS_OWN_PROFILE;

document.addEventListener('DOMContentLoaded', () => {
  loadProfileStats();
  loadProfilePosts();
  initAvatarLightbox();

  if (isOwnProfile) {
    initEditProfile();
    initAvatarUpload();
  } else {
    initConnectButton();
    initMessageButton();
  }
});

async function loadProfileStats() {
  try {
    const res = await fetch('/api/connections');
    const connections = await res.json();
    const accepted = connections.filter(c => c.status === 'accepted');
    const el = document.getElementById('stat-connections');
    if (el) el.textContent = accepted.length;
  } catch (e) {}
}

async function loadProfilePosts() {
  const container = document.getElementById('profile-posts');
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    const userPosts = posts.filter(p => {
      const authorId = p.author?._id || p.author;
      return String(authorId) === String(profileUser.id);
    });

    const el = document.getElementById('stat-posts');
    if (el) el.textContent = userPosts.length;

    if (userPosts.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:14px">No posts yet.</div>`;
      return;
    }

    container.innerHTML = userPosts.map(post => `
      <div style="padding:14px 0;border-bottom:1px solid var(--paper-2)">
        <div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">${timeAgo(post.createdAt)}</div>
        <div style="font-size:14px;line-height:1.6;color:var(--ink);white-space:pre-wrap">${escHtml(post.content)}</div>
        <div style="font-size:12px;color:var(--ink-3);margin-top:6px">${post.likes?.length || 0} likes · ${post.comments?.length || 0} comments</div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:14px">Could not load posts.</div>`;
  }
}

// ── EDIT PROFILE ──
function initEditProfile() {
  const editBtn = document.getElementById('edit-profile-btn');
  const editForm = document.getElementById('edit-form');
  const cancelBtn = document.getElementById('edit-cancel-btn');
  const saveBtn = document.getElementById('edit-save-btn');

  editBtn?.addEventListener('click', () => {
    editForm.classList.add('open');
    editBtn.style.display = 'none';
  });

  cancelBtn?.addEventListener('click', () => {
    editForm.classList.remove('open');
    editBtn.style.display = '';
    document.getElementById('edit-error').textContent = '';
  });

  saveBtn?.addEventListener('click', saveProfile);
}

async function saveProfile() {
  const headline = document.getElementById('edit-headline').value.trim();
  const location = document.getElementById('edit-location').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const errorEl = document.getElementById('edit-error');
  const saveBtn = document.getElementById('edit-save-btn');

  errorEl.textContent = '';
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { headline, location, bio } })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save');
    }

    // Update visible fields
    const headlineEl = document.getElementById('prof-headline');
    if (headlineEl) headlineEl.textContent = headline;
    const locationEl = document.getElementById('prof-location');
    if (locationEl) locationEl.textContent = location;
    const bioEl = document.getElementById('prof-bio');
    if (bioEl) bioEl.textContent = bio || 'Add a short bio to let people know more about you.';

    document.getElementById('edit-form').classList.remove('open');
    document.getElementById('edit-profile-btn').style.display = '';
    showToast('Profile updated!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.textContent = 'Save changes';
    saveBtn.disabled = false;
  }
}

// ── CONNECT / MESSAGE ──
function initConnectButton() {
  const btn = document.getElementById('connect-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: profileUser.id })
      });
      btn.textContent = 'Pending';
      btn.disabled = true;
      showToast('Connection request sent!', 'success');
    } catch (e) {
      showToast('Failed to send request', 'error');
    }
  });
}

function initMessageButton() {
  const btn = document.getElementById('message-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    window.location.href = `/feed`;
  });
}

// ── AVATAR UPLOAD ──
function initAvatarUpload() {
  const input = document.getElementById('avatar-file-input');
  if (!input) return;
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    input.value = '';
    const btn = document.querySelector('.avatar-change-btn');
    if (btn) btn.style.opacity = '.5';
    try {
      const dataUrl = await compressImage(file, 300, 300, 0.85);
      await uploadAvatar(dataUrl);
    } catch (err) {
      showToast(err.message || 'Failed to upload photo', 'error');
    } finally {
      if (btn) btn.style.opacity = '';
    }
  });
}

function compressImage(file, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; } }
      else        { if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

async function uploadAvatar(dataUrl) {
  const res = await fetch('/api/user/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: dataUrl })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');

  // Update avatar in the DOM (profile card + lightbox if open)
  const avatarEl = document.getElementById('profile-avatar');
  let img = avatarEl.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = 'Profile photo';
    avatarEl.textContent = '';
    avatarEl.appendChild(img);
    avatarEl.classList.add('has-image');
  }
  img.src = dataUrl;

  // Update lightbox inner too if it's showing this avatar
  const lbInner = document.getElementById('avatar-lightbox-inner');
  if (lbInner) {
    let lbImg = lbInner.querySelector('img');
    if (lbImg) lbImg.src = dataUrl;
  }

  showToast('Photo updated!', 'success');
}

// ── AVATAR LIGHTBOX ──
function initAvatarLightbox() {
  const wrap = document.getElementById('profile-avatar-wrap');
  if (!wrap) return;

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.avatar-change-btn') || e.target.tagName === 'INPUT') return;
    openLightbox();
  });

  document.getElementById('avatar-lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('avatar-lightbox-backdrop')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}

function openLightbox() {
  const avatarEl = document.getElementById('profile-avatar');
  const inner = document.getElementById('avatar-lightbox-inner');
  const img = avatarEl.querySelector('img');
  if (img) {
    inner.innerHTML = `<img src="${img.src}" alt="Profile photo">`;
  } else {
    inner.textContent = avatarEl.textContent.trim();
  }
  const lb = document.getElementById('avatar-lightbox');
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('avatar-lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

// ── UTILS ──
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

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
