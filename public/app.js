let allEntries = [];
let currentFilter = 'all';
let timerModalEntryId = null;
let countdownIntervals = {};

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchEntries();
  checkStatus();
  setInterval(fetchEntries, 3000);
  setInterval(checkStatus, 6000);
});

// ── API calls ─────────────────────────────────────────────────────────────
async function fetchEntries() {
  try {
    const res = await fetch('/api/entries');
    const data = await res.json();
    allEntries = data.entries;
    renderEntries();
    updateStats();
  } catch {}
}

async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const dot = document.getElementById('statusDot');
    const title = document.getElementById('statusTitle');
    if (data.connected) {
      dot.className = 'status-dot connected';
      title.textContent = 'Ulangan ✓';
    } else {
      dot.className = 'status-dot disconnected';
      title.textContent = 'Ulanmagan';
    }
  } catch {
    document.getElementById('statusDot').className = 'status-dot disconnected';
    document.getElementById('statusTitle').textContent = 'Server offline';
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allEntries.length;
  document.getElementById('statActive').textContent = allEntries.filter(e => e.status === 'active').length;
  document.getElementById('statNotified').textContent = allEntries.filter(e => e.status === 'notified').length;
}

// ── Filter ────────────────────────────────────────────────────────────────
function filterEntries(filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab' + filter.charAt(0).toUpperCase() + filter.slice(1)).classList.add('active');
  renderEntries();
}

// ── Render ────────────────────────────────────────────────────────────────
function renderEntries() {
  const list = document.getElementById('entriesList');
  const empty = document.getElementById('emptyState');

  const filtered = currentFilter === 'all'
    ? allEntries
    : allEntries.filter(e => e.status === currentFilter);

  // Clear old countdown intervals
  Object.values(countdownIntervals).forEach(clearInterval);
  countdownIntervals = {};

  if (filtered.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = filtered.map(entry => entryHTML(entry)).join('');

  // Start countdowns for active entries
  filtered.filter(e => e.status === 'active').forEach(entry => {
    startCountdown(entry);
  });
}

function entryHTML(entry) {
  const initial = entry.gmail.charAt(0).toUpperCase();
  const statusBadge = {
    idle: '<span class="entry-badge badge-idle">Kutmoqda</span>',
    active: '<span class="entry-badge badge-active">⏳ Faol</span>',
    notified: '<span class="entry-badge badge-notified">✅ Tayyor</span>'
  }[entry.status];

  const cardClass = entry.status === 'active' ? 'entry-card active-card'
    : entry.status === 'notified' ? 'entry-card notified-card'
    : 'entry-card';

  const timeInfo = entry.status === 'active'
    ? `<span class="entry-countdown" id="cd-${entry.id}">Hisoblanmoqda...</span>`
    : entry.status === 'notified'
    ? `<span class="entry-time">${timeAgo(entry.notifiedAt)}</span>`
    : `<span class="entry-time">Timer yo'q</span>`;

  const timerBtn = entry.status === 'active'
    ? `<button class="btn-icon btn-stop" title="To'xtatish" onclick="cancelTimer('${entry.id}')">⏹</button>`
    : `<button class="btn-icon btn-timer" title="Timer o'rnatish" onclick="openTimerModal('${entry.id}', '${entry.gmail}')">▶</button>`;

  return `
    <div class="${cardClass}" id="card-${entry.id}">
      <div class="entry-avatar">${initial}</div>
      <div class="entry-info">
        <div class="entry-gmail">${entry.gmail}</div>
        <div class="entry-meta">
          ${statusBadge}
          ${timeInfo}
        </div>
      </div>
      <div class="entry-actions">
        ${timerBtn}
        <button class="btn-icon btn-delete" title="O'chirish" onclick="deleteEntry('${entry.id}')">🗑</button>
      </div>
    </div>
  `;
}

// ── Countdown (client-side visual) ────────────────────────────────────────
function startCountdown(entry) {
  function update() {
    const el = document.getElementById(`cd-${entry.id}`);
    if (!el) { clearInterval(countdownIntervals[entry.id]); return; }
    const elapsed = Date.now() - entry.startedAt;
    const remaining = Math.max(0, entry.totalMs - elapsed);
    el.textContent = formatMs(remaining);
    if (remaining <= 0) {
      clearInterval(countdownIntervals[entry.id]);
      fetchEntries(); // refresh to show notified state
    }
  }
  update();
  countdownIntervals[entry.id] = setInterval(update, 1000);
}

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  
  if (d > 0) return `${d}kun ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s oldin`;
  if (diff < 3600) return `${Math.floor(diff/60)}min oldin`;
  if (diff < 86400) return `${Math.floor(diff/3600)}soat oldin`;
  return `${Math.floor(diff/86400)}kun oldin`;
}

// ── Add entry modal ────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalGmail').value = '';
  document.getElementById('mDays').value = 0;
  document.getElementById('mHours').value = 0;
  document.getElementById('mMinutes').value = 0;
  document.getElementById('mSeconds').value = 0;
  setTimeout(() => document.getElementById('modalGmail').focus(), 100);
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function closeModalOutside(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }

async function submitEntry() {
  const gmail = document.getElementById('modalGmail').value.trim();
  const d = parseInt(document.getElementById('mDays').value) || 0;
  const h = parseInt(document.getElementById('mHours').value) || 0;
  const m = parseInt(document.getElementById('mMinutes').value) || 0;
  const s = parseInt(document.getElementById('mSeconds').value) || 0;
  const total = d * 86400 + h * 3600 + m * 60 + s;

  if (!gmail || !gmail.includes('@')) {
    document.getElementById('modalGmail').focus();
    return;
  }

  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  document.getElementById('submitText').textContent = 'Qo\'shilmoqda...';

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmail, totalSeconds: total > 0 ? total : undefined })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      fetchEntries();
    } else {
      alert(data.error || 'Xatolik yuz berdi');
    }
  } catch { alert('Server bilan ulanib bo\'lmadi'); }
  finally {
    btn.disabled = false;
    document.getElementById('submitText').textContent = 'Qo\'shish';
  }
}

// ── Timer modal ────────────────────────────────────────────────────────────
function openTimerModal(id, gmail) {
  timerModalEntryId = id;
  document.getElementById('timerModalGmail').textContent = gmail;
  document.getElementById('tDays').value = 0;
  document.getElementById('tHours').value = 0;
  document.getElementById('tMinutes').value = 5;
  document.getElementById('tSeconds').value = 0;
  document.getElementById('timerModalOverlay').classList.add('open');
}
function closeTimerModal() { document.getElementById('timerModalOverlay').classList.remove('open'); }
function closeTimerModalOutside(e) { if (e.target === document.getElementById('timerModalOverlay')) closeTimerModal(); }

async function submitTimer() {
  const d = parseInt(document.getElementById('tDays').value) || 0;
  const h = parseInt(document.getElementById('tHours').value) || 0;
  const m = parseInt(document.getElementById('tMinutes').value) || 0;
  const s = parseInt(document.getElementById('tSeconds').value) || 0;
  const total = d * 86400 + h * 3600 + m * 60 + s;
  if (total <= 0) { alert('Vaqt kiriting!'); return; }

  try {
    await fetch(`/api/entries/${timerModalEntryId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalSeconds: total })
    });
    closeTimerModal();
    fetchEntries();
  } catch { alert('Xatolik'); }
}

// ── Cancel timer ──────────────────────────────────────────────────────────
async function cancelTimer(id) {
  try {
    await fetch(`/api/entries/${id}/cancel`, { method: 'POST' });
    fetchEntries();
  } catch { alert('Xatolik'); }
}

// ── Delete entry ──────────────────────────────────────────────────────────
async function deleteEntry(id) {
  if (!confirm('Bu Gmail\'ni ro\'yxatdan o\'chirasizmi?')) return;
  try {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    fetchEntries();
  } catch { alert('Xatolik'); }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeTimerModal(); }
  if (e.key === 'Enter' && document.getElementById('modalOverlay').classList.contains('open')) submitEntry();
  if (e.key === 'Enter' && document.getElementById('timerModalOverlay').classList.contains('open')) submitTimer();
});
