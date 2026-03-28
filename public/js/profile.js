const currentUser   = window.CURRENT_USER;
const profileUser   = window.PROFILE_USER;
const isOwnProfile  = window.IS_OWN_PROFILE;

document.addEventListener('DOMContentLoaded', () => {
  loadProfileStats();
  loadProfilePosts();
  initAvatarLightbox();

  if (isOwnProfile) {
    initEditProfile();
    initAvatarUpload();
    initExperienceForm();
    initEducationForm();
    initSkillsForm();
  } else {
    initConnectButton();
    initMessageButton();
  }
});

// ── STATS ──
async function loadProfileStats() {
  try {
    const res = await fetch('/api/connections');
    const connections = await res.json();
    const el = document.getElementById('stat-connections');
    if (el) el.textContent = connections.filter(c => c.status === 'accepted').length;
  } catch (e) {}
}

// ── POSTS ──
async function loadProfilePosts() {
  const container = document.getElementById('profile-posts');
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    const userPosts = posts.filter(p => String(p.author?._id || p.author) === String(profileUser.id));
    const statEl = document.getElementById('stat-posts');
    if (statEl) statEl.textContent = userPosts.length;
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

// ── EDIT ABOUT ──
function initEditProfile() {
  const editBtn    = document.getElementById('edit-profile-btn');
  const editBtn2   = document.getElementById('edit-profile-btn-2');
  const editForm   = document.getElementById('edit-form');
  const cancelBtn  = document.getElementById('edit-cancel-btn');
  const saveBtn    = document.getElementById('edit-save-btn');

  const open = () => { editForm.classList.add('open'); };
  editBtn?.addEventListener('click', open);
  editBtn2?.addEventListener('click', open);
  cancelBtn?.addEventListener('click', () => {
    editForm.classList.remove('open');
    document.getElementById('edit-error').textContent = '';
  });
  saveBtn?.addEventListener('click', saveProfile);
}

async function saveProfile() {
  const headline = document.getElementById('edit-headline').value.trim();
  const location = document.getElementById('edit-location').value.trim();
  const bio      = document.getElementById('edit-bio').value.trim();
  const errorEl  = document.getElementById('edit-error');
  const saveBtn  = document.getElementById('edit-save-btn');
  errorEl.textContent = '';
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { headline, location, bio } })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const headlineEl = document.getElementById('prof-headline');
    if (headlineEl) headlineEl.textContent = headline;
    const locationEl = document.getElementById('prof-location');
    if (locationEl) locationEl.textContent = location;
    const bioEl = document.getElementById('prof-bio');
    if (bioEl) bioEl.textContent = bio || 'Add a short bio to let people know more about you.';
    document.getElementById('edit-form').classList.remove('open');
    showToast('Profile updated!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
  }
}

// ── EXPERIENCE ──
function initExperienceForm() {
  document.getElementById('add-exp-btn')?.addEventListener('click', () => openExpForm());
  document.getElementById('exp-cancel')?.addEventListener('click', closeExpForm);
  document.getElementById('exp-current')?.addEventListener('change', function() {
    document.getElementById('exp-end').disabled = this.checked;
    if (this.checked) document.getElementById('exp-end').value = '';
  });
  document.getElementById('exp-save')?.addEventListener('click', saveExperience);
}

function openExpForm(data = null) {
  const form = document.getElementById('exp-form');
  document.getElementById('exp-editing-id').value = data ? data._id : '';
  document.getElementById('exp-title').value       = data?.title || '';
  document.getElementById('exp-company').value     = data?.company || '';
  document.getElementById('exp-location').value    = data?.location || '';
  document.getElementById('exp-start').value       = data?.startDate || '';
  document.getElementById('exp-end').value         = data?.endDate || '';
  document.getElementById('exp-current').checked   = data?.current || false;
  document.getElementById('exp-description').value = data?.description || '';
  document.getElementById('exp-error').textContent = '';
  form.classList.add('open');
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeExpForm() {
  document.getElementById('exp-form').classList.remove('open');
}

async function saveExperience() {
  const id      = document.getElementById('exp-editing-id').value;
  const title   = document.getElementById('exp-title').value.trim();
  const company = document.getElementById('exp-company').value.trim();
  const errorEl = document.getElementById('exp-error');
  const saveBtn = document.getElementById('exp-save');
  if (!title || !company) { errorEl.textContent = 'Title and company are required.'; return; }
  errorEl.textContent = '';
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

  const body = {
    title, company,
    location:    document.getElementById('exp-location').value.trim(),
    startDate:   document.getElementById('exp-start').value,
    endDate:     document.getElementById('exp-end').value,
    current:     document.getElementById('exp-current').checked,
    description: document.getElementById('exp-description').value.trim(),
  };

  try {
    const res = await fetch(id ? `/api/user/experience/${id}` : '/api/user/experience', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    closeExpForm();
    showToast(id ? 'Experience updated!' : 'Experience added!', 'success');
    const item = await res.json();
    if (id) {
      updateTimelineItem('experience', id, item);
    } else {
      prependTimelineItem('experience-list', 'exp-empty', renderExpItem(item));
    }
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
  }
}

// Called from inline onclick in EJS
function editExperience(id) {
  const exp = profileUser.experience?.find(e => String(e._id) === id);
  if (exp) openExpForm(exp);
}

// ── EDUCATION ──
function initEducationForm() {
  document.getElementById('add-edu-btn')?.addEventListener('click', () => openEduForm());
  document.getElementById('edu-cancel')?.addEventListener('click', closeEduForm);
  document.getElementById('edu-save')?.addEventListener('click', saveEducation);
}

function openEduForm(data = null) {
  const form = document.getElementById('edu-form');
  document.getElementById('edu-editing-id').value = data ? data._id : '';
  document.getElementById('edu-school').value  = data?.school  || '';
  document.getElementById('edu-degree').value  = data?.degree  || '';
  document.getElementById('edu-field').value   = data?.field   || '';
  document.getElementById('edu-start').value   = data?.startYear || '';
  document.getElementById('edu-end').value     = data?.endYear   || '';
  document.getElementById('edu-error').textContent = '';
  form.classList.add('open');
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeEduForm() {
  document.getElementById('edu-form').classList.remove('open');
}

async function saveEducation() {
  const id     = document.getElementById('edu-editing-id').value;
  const school = document.getElementById('edu-school').value.trim();
  const errorEl = document.getElementById('edu-error');
  const saveBtn = document.getElementById('edu-save');
  if (!school) { errorEl.textContent = 'School is required.'; return; }
  errorEl.textContent = '';
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

  const body = {
    school,
    degree:    document.getElementById('edu-degree').value.trim(),
    field:     document.getElementById('edu-field').value.trim(),
    startYear: parseInt(document.getElementById('edu-start').value) || null,
    endYear:   parseInt(document.getElementById('edu-end').value)   || null,
  };

  try {
    const res = await fetch(id ? `/api/user/education/${id}` : '/api/user/education', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    closeEduForm();
    showToast(id ? 'Education updated!' : 'Education added!', 'success');
    const item = await res.json();
    if (id) {
      updateTimelineItem('education', id, item);
    } else {
      prependTimelineItem('education-list', 'edu-empty', renderEduItem(item));
    }
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
  }
}

function editEducation(id) {
  const edu = profileUser.education?.find(e => String(e._id) === id);
  if (edu) openEduForm(edu);
}

// ── SKILLS ──
function initSkillsForm() {
  document.getElementById('edit-skills-btn')?.addEventListener('click', () => {
    document.getElementById('skills-form').classList.add('open');
  });
  document.getElementById('skills-cancel')?.addEventListener('click', () => {
    document.getElementById('skills-form').classList.remove('open');
    document.getElementById('skills-error').textContent = '';
  });
  document.getElementById('skills-save')?.addEventListener('click', saveSkills);
}

async function saveSkills() {
  const val     = document.getElementById('skills-input').value;
  const skills  = val.split(',').map(s => s.trim()).filter(Boolean);
  const errorEl = document.getElementById('skills-error');
  const saveBtn = document.getElementById('skills-save');
  errorEl.textContent = '';
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { skills } })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    document.getElementById('skills-form').classList.remove('open');
    document.getElementById('skills-list').innerHTML = skills.length
      ? `<div class="skills-grid">${skills.map(s => `<span class="skill-tag">${escHtml(s)}</span>`).join('')}</div>`
      : `<div class="section-empty">Add your top skills</div>`;
    showToast('Skills updated!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
  }
}

// ── DELETE (shared) ──
async function deleteItem(type, id, el) {
  if (!confirm('Delete this entry?')) return;
  try {
    await fetch(`/api/user/${type}/${id}`, { method: 'DELETE' });
    el.remove();
    showToast('Deleted');
    // Remove from local cache
    if (type === 'experience' && profileUser.experience)
      profileUser.experience = profileUser.experience.filter(e => String(e._id) !== id);
    if (type === 'education' && profileUser.education)
      profileUser.education = profileUser.education.filter(e => String(e._id) !== id);
  } catch (e) { showToast('Delete failed', 'error'); }
}

// ── DOM HELPERS ──
function prependTimelineItem(listId, emptyId, html) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (empty) empty.remove();
  list.insertAdjacentHTML('afterbegin', html);
}

function updateTimelineItem(type, id, item) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  const html = type === 'experience' ? renderExpItem(item) : renderEduItem(item);
  el.outerHTML = html;
  // Update local cache
  if (type === 'experience' && profileUser.experience) {
    const i = profileUser.experience.findIndex(e => String(e._id) === id);
    if (i !== -1) profileUser.experience[i] = item;
  }
  if (type === 'education' && profileUser.education) {
    const i = profileUser.education.findIndex(e => String(e._id) === id);
    if (i !== -1) profileUser.education[i] = item;
  }
}

function renderExpItem(exp) {
  const id = exp._id;
  return `<div class="timeline-item" data-id="${id}">
    <div class="timeline-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></div>
    <div class="timeline-body">
      <div class="timeline-title">${escHtml(exp.title)}</div>
      <div class="timeline-sub">${escHtml(exp.company)}${exp.location ? ' · ' + escHtml(exp.location) : ''}</div>
      ${exp.startDate || exp.endDate || exp.current ? `<div class="timeline-date">${escHtml(exp.startDate || '')} – ${exp.current ? 'Present' : escHtml(exp.endDate || '')}</div>` : ''}
      ${exp.description ? `<div class="timeline-desc">${escHtml(exp.description)}</div>` : ''}
      ${isOwnProfile ? `<div class="item-actions">
        <button class="item-btn" data-id="${id}" onclick="editExperience(this.dataset.id)">Edit</button>
        <button class="item-btn item-btn-del" data-id="${id}" onclick="deleteItem('experience',this.dataset.id,this.closest('.timeline-item'))">Delete</button>
      </div>` : ''}
    </div>
  </div>`;
}

function renderEduItem(edu) {
  const id = edu._id;
  return `<div class="timeline-item" data-id="${id}">
    <div class="timeline-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div>
    <div class="timeline-body">
      <div class="timeline-title">${escHtml(edu.school)}</div>
      <div class="timeline-sub">${escHtml(edu.degree || '')}${edu.degree && edu.field ? ', ' : ''}${escHtml(edu.field || '')}</div>
      ${edu.startYear || edu.endYear ? `<div class="timeline-date">${edu.startYear || ''} – ${edu.endYear || 'Present'}</div>` : ''}
      ${isOwnProfile ? `<div class="item-actions">
        <button class="item-btn" data-id="${id}" onclick="editEducation(this.dataset.id)">Edit</button>
        <button class="item-btn item-btn-del" data-id="${id}" onclick="deleteItem('education',this.dataset.id,this.closest('.timeline-item'))">Delete</button>
      </div>` : ''}
    </div>
  </div>`;
}

// ── CONNECT / MESSAGE ──
function initConnectButton() {
  document.getElementById('connect-btn')?.addEventListener('click', async function() {
    try {
      await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: profileUser.id })
      });
      this.textContent = 'Pending'; this.disabled = true;
      showToast('Connection request sent!', 'success');
    } catch (e) { showToast('Failed', 'error'); }
  });
}

function initMessageButton() {
  document.getElementById('message-btn')?.addEventListener('click', () => {
    window.location.href = '/feed';
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
      showToast(err.message || 'Upload failed', 'error');
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
  const lbImg = document.querySelector('#avatar-lightbox-inner img');
  if (lbImg) lbImg.src = dataUrl;
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
  const inner    = document.getElementById('avatar-lightbox-inner');
  const img      = avatarEl.querySelector('img');
  inner.innerHTML = img ? `<img src="${img.src}" alt="Profile photo">` : '';
  if (!img) inner.textContent = avatarEl.textContent.trim();
  document.getElementById('avatar-lightbox').classList.add('open');
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
  el.className = `toast ${type}`; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const d = new Date(dateStr), diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
