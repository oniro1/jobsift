const user = window.CURRENT_USER;
let connections = [];

document.addEventListener('DOMContentLoaded', () => {
  loadConnections();
  loadPeople();
  document.getElementById('people-search').addEventListener('input', e => loadPeople(e.target.value));
});

async function loadConnections() {
  try {
    const res = await fetch('/api/connections');
    connections = await res.json();

    const pending  = connections.filter(c => c.status === 'pending' && String(c.recipient?._id || c.recipient) === String(user.id));
    const accepted = connections.filter(c => c.status === 'accepted');

    // Pending invitations
    const invEl = document.getElementById('pending-invitations');
    if (pending.length === 0) {
      invEl.innerHTML = `<div style="color:var(--ink-3);font-size:14px;padding:8px 0">No pending invitations</div>`;
    } else {
      invEl.innerHTML = pending.map(c => `
        <div class="connection-item" data-id="${c._id}">
          <div class="conn-avatar">${(c.requester?.name || '?')[0].toUpperCase()}</div>
          <div class="conn-info">
            <div class="conn-name">${escHtml(c.requester?.name || 'Unknown')}</div>
            <div class="conn-sub">${escHtml(c.requester?.profile?.headline || '')}</div>
          </div>
          <div class="conn-actions">
            <button class="btn btn-primary btn-sm" onclick="respond('${c._id}','accepted',this)">Accept</button>
            <button class="btn btn-ghost btn-sm" onclick="respond('${c._id}','rejected',this)">Ignore</button>
          </div>
        </div>`).join('');
    }

    // Accepted connections
    const accEl = document.getElementById('accepted-connections');
    if (accepted.length === 0) {
      accEl.innerHTML = `<div style="color:var(--ink-3);font-size:14px;padding:8px 0">No connections yet</div>`;
    } else {
      accEl.innerHTML = accepted.map(c => {
        const other = String(c.requester?._id || c.requester) === String(user.id) ? c.recipient : c.requester;
        const name = other?.name || 'Unknown';
        const id   = other?._id || other;
        return `<div class="connection-item">
          <a href="/profile/${id}" class="conn-avatar" style="text-decoration:none;color:#fff">${name[0].toUpperCase()}</a>
          <div class="conn-info">
            <a href="/profile/${id}" class="conn-name" style="text-decoration:none;color:var(--ink)">${escHtml(name)}</a>
            <div class="conn-sub">${escHtml(other?.profile?.headline || '')}</div>
          </div>
          <a href="/profile/${id}" class="btn btn-outline-accent btn-sm">View</a>
        </div>`;
      }).join('');
    }
  } catch (e) {}
}

async function respond(id, status, btn) {
  try {
    await fetch(`/api/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    btn.closest('.connection-item').remove();
    showToast(status === 'accepted' ? 'Connection accepted!' : 'Invitation ignored', status === 'accepted' ? 'success' : '');
    if (status === 'accepted') loadConnections();
  } catch (e) { showToast('Failed', 'error'); }
}

async function loadPeople(q = '') {
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q || 'a')}`);
    const users = await res.json();
    const grid = document.getElementById('people-grid');
    if (!users.length) {
      grid.innerHTML = `<div style="color:var(--ink-3);font-size:14px;padding:16px 0">No users found</div>`;
      return;
    }
    grid.innerHTML = users.map(u => {
      const initials   = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const connStatus = getStatus(u._id);
      return `<div class="people-card-item">
        <a href="/profile/${u._id}" class="people-card-avatar">${escHtml(initials)}</a>
        <div class="people-card-info">
          <a href="/profile/${u._id}" class="people-card-name">${escHtml(u.name)}</a>
          <div class="people-card-sub">${escHtml(u.profile?.headline || '')}</div>
        </div>
        <button class="btn btn-outline-accent btn-sm connect-btn ${connStatus ? 'disabled-btn' : ''}"
          data-uid="${u._id}" ${connStatus ? 'disabled' : ''}>
          ${connStatus === 'accepted' ? 'Connected' : connStatus === 'pending' ? 'Pending' : '+ Connect'}
        </button>
      </div>`;
    }).join('');
    grid.querySelectorAll('.connect-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => sendRequest(btn.dataset.uid, btn));
    });
  } catch (e) {}
}

function getStatus(uid) {
  const c = connections.find(c =>
    String(c.requester?._id || c.requester) === String(uid) ||
    String(c.recipient?._id  || c.recipient)  === String(uid)
  );
  return c?.status || null;
}

async function sendRequest(recipientId, btn) {
  try {
    await fetch('/api/connections/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId })
    });
    btn.textContent = 'Pending'; btn.disabled = true; btn.classList.add('disabled-btn');
    showToast('Request sent!', 'success');
  } catch (e) { showToast('Failed', 'error'); }
}

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
