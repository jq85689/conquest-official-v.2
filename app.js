const state = {
  xp: 0,
  level: 1,
  streak: 0,
  badges: [],
  currentTask: null,
  lastTaskDate: null,
  lastCompletedDate: null,
  completedTasks: {}, // map level -> [ids]
  visited: false, // onboarding seen
  lastOnboardingShownDate: null,
  shared: false
};

// ensure we remember which level-ups were already shown
if (!state.shownLevelUps) state.shownLevelUps = [];

// default UI prefs (persisted in state.ui)
if (!state.ui) state.ui = { showQuotes: true };

function saveState() {
  localStorage.setItem("focusQuestState", JSON.stringify(state));
}
function loadState() {
  const saved = localStorage.getItem("focusQuestState");
  if (saved) Object.assign(state, JSON.parse(saved));
}

// normalize state from older versions and enforce defaults
function normalizeState() {
  if (!state.completedTasks) state.completedTasks = {};
  if (typeof state.visited === 'undefined') state.visited = false;
  if (!state.lastCompletedDate) state.lastCompletedDate = null;
  if (!state.ui) state.ui = { showQuotes: true };
  if (!state.shownLevelUps) state.shownLevelUps = [];

  if (typeof state.lastOnboardingShownDate === 'undefined') state.lastOnboardingShownDate = null;
  if (typeof state.shared === 'undefined') state.shared = false;

  // Strict midnight streak reset: if lastCompletedDate is older than yesterday, reset streak
  if (state.lastCompletedDate) {
    const last = new Date(state.lastCompletedDate);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const lastDateOnly = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const yOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const tOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // if lastCompletedDate is before yesterday, reset streak to 0
    if (lastDateOnly < yOnly) {
      state.streak = 0;
    }
  } else {
    state.streak = 0;
  }
}

const dom = {
  xpValue: document.getElementById("xpValue"),
  xpNeeded: document.getElementById("xpNeeded"),
  progressPercent: document.getElementById("progressPercent"),
  levelTitle: document.getElementById("levelTitle"),
  levelDesc: document.getElementById("levelDesc"),
  levelBadge: document.getElementById("levelBadge"),
  avatar: document.getElementById("avatar"),
  progressCircle: document.getElementById("progressCircle"),
  streakValue: document.getElementById("streakValue"),
  taskCard: document.getElementById("taskCard"),
  getTaskBtn: document.getElementById("getTaskBtn"),
  completeBtn: document.getElementById("completeBtn"),
  skipBtn: document.getElementById("skipBtn"),
  ratingPanel: document.getElementById("ratingPanel"),
  quoteArea: document.getElementById("quoteArea"),
  microCopy: document.getElementById("microCopy"),
  onboarding: document.getElementById("onboarding"),
  startBtn: document.getElementById("startBtn"),
  skipOnboard: document.getElementById("skipOnboard"),
  badgesGrid: document.getElementById("badgesGrid"),
  badgeCount: document.getElementById("badgeCount"),
  message: document.getElementById("message")
};

// Attach critical UI handlers right away so they work even if tasks.json fails to load
function handleOnboardingClose() {
  state.visited = true;
  saveState();
  if (dom.onboarding) {
    dom.onboarding.classList.add('hidden');
    try { dom.onboarding.style.display = 'none'; dom.onboarding.setAttribute('aria-hidden', 'true'); } catch (e) {}
    try { releaseFocus(dom.onboarding); } catch (e) {}
  }
  if (state._queuedLevelUp) {
    showLevelUpModal(state._queuedLevelUp.levelNum, state._queuedLevelUp.title);
    delete state._queuedLevelUp;
  }
}
if (dom.startBtn) dom.startBtn.addEventListener('click', handleOnboardingClose);
if (dom.skipOnboard) dom.skipOnboard.addEventListener('click', handleOnboardingClose);

function closeLevelUpModal() {
  const modal = document.getElementById('levelUpModal');
  if (!modal) return;
  console.log('[debug] closeLevelUpModal called');
  modal.classList.add('hidden');
  // ensure it's truly hidden even if CSS is overridden
  try { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); } catch (e) { }
  console.log('[debug] levelUpModal classes after hide:', modal.className, 'style.display=', modal.style.display);
  // ensure main app view is visible
  const home = document.getElementById('homePage');
  const history = document.getElementById('historyPage');
  if (home) home.classList.remove('hidden');
  if (history) history.classList.add('hidden');
  // release focus trap and restore focus
  try { const lm = document.getElementById('levelUpModal'); releaseFocus(lm); } catch (e) {}
  try { document.getElementById('getTaskBtn') && document.getElementById('getTaskBtn').focus(); } catch (e) {}
}

// Accessibility: focus trapping and Escape-to-close
function getFocusable(el) {
  if (!el) return [];
  return Array.from(el.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'))
    .filter(n => n.offsetParent !== null);
}

function trapFocus(modalEl) {
  if (!modalEl) return;
  const focusable = getFocusable(modalEl);
  if (!focusable.length) return;
  let idx = 0;
  focusable[0].focus();
  function onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) idx = (idx - 1 + focusable.length) % focusable.length;
      else idx = (idx + 1) % focusable.length;
      focusable[idx].focus();
    } else if (e.key === 'Escape') {
      // close whichever modal is open
      if (modalEl.id === 'onboarding') handleOnboardingClose();
      else closeLevelUpModal();
    }
  }
  modalEl.__focusHandler = onKey;
  document.addEventListener('keydown', onKey);
}

function releaseFocus(modalEl) {
  if (!modalEl) return;
  if (modalEl.__focusHandler) {
    document.removeEventListener('keydown', modalEl.__focusHandler);
    delete modalEl.__focusHandler;
  }
}

// delegate clicks so handler works even if button isn't available at the exact time
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t) return;
  // direct close button
  if (t.id === 'levelUpClose') {
    console.log('[debug] levelUpClose clicked target:', t);
    closeLevelUpModal();
    return;
  }
  // click on overlay (modal background)
  if (t.id === 'levelUpModal') {
    console.log('[debug] levelUpModal overlay clicked');
    closeLevelUpModal();
    return;
  }

  // If levelUpModal is visible and click is outside the modal-card, close it
  try {
    const levelModal = document.getElementById('levelUpModal');
    if (levelModal && !levelModal.classList.contains('hidden')) {
      const card = levelModal.querySelector('.modal-card');
      if (card && !card.contains(t)) {
        console.log('[debug] click outside levelUpModal content - closing');
        closeLevelUpModal();
        return;
      }
    }
  } catch (err) {
    console.log('[debug] error checking levelUpModal outside click', err);
  }

  // If onboarding is visible and click is outside its modal-card, close onboarding
  try {
    const onboardingEl = document.getElementById('onboarding');
    if (onboardingEl && !onboardingEl.classList.contains('hidden')) {
      const card = onboardingEl.querySelector('.modal-card');
      if (card && !card.contains(t)) {
        console.log('[debug] click outside onboarding content - closing onboard');
        handleOnboardingClose();
        return;
      }
    }
  } catch (err) {
    console.log('[debug] error checking onboarding outside click', err);
  }
  // if click inside modal content but not button, ignore
});

// immediate nav handlers
const navHomeImmediate = document.getElementById('navHome');
const navHistoryImmediate = document.getElementById('navHistory');
if (navHomeImmediate) navHomeImmediate.addEventListener('click', () => {
  document.getElementById('homePage').classList.remove('hidden');
  document.getElementById('historyPage').classList.add('hidden');
});
if (navHistoryImmediate) navHistoryImmediate.addEventListener('click', () => {
  document.getElementById('homePage').classList.add('hidden');
  document.getElementById('historyPage').classList.remove('hidden');
  renderHistory && renderHistory();
});

const levels = [
  { title: "Beginner", desc: "Stay focused and level up!", avatar: "🌱", color: "#6a5acd" },
  { title: "Apprentice", desc: "You're getting better!", avatar: "🔥", color: "#ff8c00" },
  { title: "Expert", desc: "Your focus is unmatched!", avatar: "💎", color: "#28c76f" }
];

const badges = [
  { id: "firstTask", name: "First Task", icon: "🌱", req: "tasks", value: 1 },
  { id: "streak3", name: "3-Day Streak", icon: "🔥", req: "streak", value: 3 },
  { id: "level2", name: "Level 2", icon: "⭐", req: "level", value: 2 },
  { id: "shareApp", name: "Share the app", icon: "🤝", req: "share", value: 1 },
  { id: "streak7", name: "7-Day Streak", icon: "🌟", req: "streak", value: 7 },
  { id: "level5", name: "Level 5", icon: "🏆", req: "level", value: 5 }
];

function getXpNeeded(level) {
  return 100 + level * 50;
}

function animateValue(el, start, end, duration) {
  const range = end - start;
  const startTime = performance.now();
  function step(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    el.textContent = Math.floor(start + range * progress);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showMessage(text) {
  dom.message.textContent = text;
  dom.message.classList.add("show");
  setTimeout(() => dom.message.classList.remove("show"), 3000);
}

function showConfetti() {
  for (let i = 0; i < 40; i++) {
    const confetti = document.createElement("div");
    confetti.classList.add("confetti");
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.background = `hsl(${Math.random() * 360}, 100%, 60%)`;
    confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}

// Placeholder analytics loader: run only when cookie consent is granted
function enableAnalytics() {
  if (window._plausibleLoaded) return;
  // Mark that we've started loading to avoid duplicate insertion
  window._plausibleLoaded = false;
  window._plausibleQueue = window._plausibleQueue || [];
  try {
    const s = document.createElement('script');
    s.async = true;
    // site-specific script path (keeps your existing provided snippet)
    s.src = 'https://plausible.io/js/pa-iwkgLWAKszlZHlnC3HYRv.js';
    s.onload = () => {
      try {
        window._plausibleLoaded = true;
        window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments); };
        window.plausible.init = window.plausible.init || function (i) { plausible.o = i || {}; };
        try { window.plausible.init(); } catch (e) { /* ignore */ }
        console.log('[analytics] Plausible loaded');
        // flush queued events
        try {
          while (window._plausibleQueue && window._plausibleQueue.length) {
            const ev = window._plausibleQueue.shift();
            try { window.plausible(ev.name, ev.props || {}); } catch (e) { /* ignore per-event */ }
          }
        } catch (e) { console.warn('[analytics] queue flush error', e); }
      } catch (err) {
        console.warn('[analytics] onload handling failed', err);
      }
    };
    s.onerror = (e) => { console.warn('[analytics] Plausible script failed to load', e); };
    document.head.appendChild(s);
    console.log('[analytics] Plausible script element appended');
  } catch (err) {
    console.warn('[analytics] failed to insert Plausible script', err);
  }
}

// helper to send custom events to Plausible safely
function plausibleEvent(name, props) {
  try {
    // if Plausible hasn't finished loading, queue the event
    if (!window._plausibleLoaded) {
      window._plausibleQueue = window._plausibleQueue || [];
      window._plausibleQueue.push({ name, props });
      console.log('[analytics] queued event', name, props);
      return;
    }
    if (window.plausible) window.plausible(name, props || {});
  } catch (e) { console.warn('[analytics] plausibleEvent failed', e); }
}

// Update analytics status UI in the footer
function updateAnalyticsStatus() {
  try {
    const s = localStorage.getItem('conquest_cookie_consent');
    const el = document.getElementById('analyticsState');
    const btn = document.getElementById('analyticsToggleBtn');
    if (el) {
      if (s === 'granted') el.textContent = 'On';
      else if (s === 'denied') el.textContent = 'Off';
      else el.textContent = 'Ask';
    }
    if (btn) {
      btn.addEventListener('click', () => {
        const banner = document.getElementById('cookieBanner');
        if (banner) banner.classList.remove('hidden');
        try { banner.style.display = ''; } catch (e) {}
      });
    }
  } catch (e) { /* ignore */ }
}

function updateUI() {
  const lvl = levels[state.level - 1] || levels[levels.length - 1];
  document.documentElement.style.setProperty("--level-color", lvl.color);
  dom.avatar.textContent = lvl.avatar;
  dom.levelBadge.textContent = state.level;
  dom.levelTitle.textContent = lvl.title;
  dom.levelDesc.textContent = lvl.desc;
  dom.xpNeeded.textContent = getXpNeeded(state.level);
  dom.badgeCount.textContent = state.badges.length;

  animateValue(dom.xpValue, parseInt(dom.xpValue.textContent), state.xp, 500);
  animateValue(dom.streakValue, parseInt(dom.streakValue.textContent), state.streak, 500);

  const percent = Math.min(state.xp / getXpNeeded(state.level), 1);
  dom.progressPercent.textContent = `${Math.round(percent * 100)}%`;
  const offset = 565.48 * (1 - percent);
  dom.progressCircle.style.strokeDashoffset = offset;
}

function getDifficultyStars(d) {
  return "★".repeat(d) + "☆".repeat(5 - d);
}

async function loadTasks() {
  try {
    const res = await fetch("tasks.json");
    if (!res.ok) throw new Error("Tasks couldn't be loaded");
    const raw = await res.json();
    // tasks.json in this workspace is a flat array of task objects. Return as-is.
    return raw;
  } catch (err) {
    showMessage("⚠️ Error loading tasks");
    return [];
  }
}

function renderTask(task) {
  if (!task) {
    dom.taskCard.textContent = 'No task available.';
    return;
  }
  const xpLine = (typeof task.xp === 'number' && task.xp > 0) ? `<div style="color:var(--accent);">+${task.xp} XP</div>` : '';
  dom.taskCard.innerHTML = `
    <div class="task-header">
      <div><strong>${task.category || ''}</strong> • ${task.time || ''}</div>
      <div class="task-difficulty">${getDifficultyStars(task.difficulty || 1)}</div>
    </div>
    <div class="task-body">${task.task}</div>
    ${xpLine}
  `;
}

function getRandomTask(tasks) {
  // Prefer tasks matching current level and avoid repeats within the same level
  const atLevel = tasks.filter(t => t.level === state.level);
  const completed = state.completedTasks[state.level] || [];
  const remaining = atLevel.filter(t => !completed.includes(t.id));
  let pool = remaining.length ? remaining : atLevel.length ? atLevel : tasks.filter(t => t.level <= state.level);
  if (!pool.length) pool = tasks; // final fallback
  return pool[Math.floor(Math.random() * pool.length)];
}

function checkLevelUp() {
  const needed = getXpNeeded(state.level);
  if (state.xp >= needed) {
    state.xp -= needed;
    state.level++;
    const lvl = levels[state.level - 1] || levels[levels.length - 1];
    // show modal and pulse the progress ring
    showLevelUpModal(state.level, lvl.title);
    showConfetti();
    if (!state.completedTasks[state.level]) state.completedTasks[state.level] = [];
  }
}

function showLevelUpModal(levelNum, title) {
  const modal = document.getElementById('levelUpModal');
  const titleEl = document.getElementById('levelUpTitle');
  const textEl = document.getElementById('levelUpText');
  if (!modal) return;
  // don't show this level-up again if we've already shown it
  if (state.shownLevelUps && state.shownLevelUps.includes(levelNum)) return;
  titleEl.textContent = `Level ${levelNum} — ${title}`;
  textEl.textContent = `You achieved Level ${levelNum}. Stronger missions unlocked.`;
  // if user hasn't completed onboarding yet, queue the level up until onboarding is dismissed
  if (state.visited === false) {
    state._queuedLevelUp = { levelNum, title };
    return;
  }
  modal.classList.remove('hidden');
  try { modal.style.display = ''; modal.removeAttribute('aria-hidden'); } catch (e) { }
  try { setTimeout(() => trapFocus(modal), 40); } catch (e) {}
  console.log('[debug] showLevelUpModal displayed, classes:', modal.className, 'style.display=', modal.style.display);
  // mark as shown and persist so the modal won't appear again next login
  if (!state.shownLevelUps) state.shownLevelUps = [];
  state.shownLevelUps.push(levelNum);
  saveState();
  // pulse progress ring
  const ring = document.querySelector('.progress-ring');
  ring && ring.classList.add('pulse');
  setTimeout(() => ring && ring.classList.remove('pulse'), 1200);
}

// (levelUpClose handler attached after DOM ready in loadTasks resolution)

const completionPhrases = {
  meh: ["Small step. Keep going."],
  good: ["Nice work. That moved the needle."],
  powerful: ["Power move — you owned it."]
};

const rotatingQuotes = [
  "Confidence is built one decision at a time.",
  "You’re rewriting your self-belief.",
  "One small act of courage today = one big leap tomorrow."
];

function startRotatingQuotes() {
  if (!dom.quoteArea) return;
  if (!state.ui || !state.ui.showQuotes) return;
  let i = 0;
  dom.quoteArea.textContent = rotatingQuotes[0];
  setInterval(() => {
    i = (i + 1) % rotatingQuotes.length;
    dom.quoteArea.textContent = rotatingQuotes[i];
  }, 6000);
}

function showMicroCopyIfReturning() {
  if (!dom.microCopy) return;
  const last = state.lastCompletedDate;
  if (last) {
    const msgs = [
      "Welcome back, conqueror.",
      "Your streak is alive. Keep the fire burning.",
      "Short brave acts — big results."
    ];
    dom.microCopy.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    dom.microCopy.classList.remove('hidden');
    setTimeout(() => dom.microCopy.classList.add('hidden'), 3500);
  }
}

function checkBadges() {
  badges.forEach(b => {
    if (state.badges.includes(b.id)) return;
    if ((b.req === "streak" && state.streak >= b.value) || (b.req === "level" && state.level >= b.value)) {
      state.badges.push(b.id);
      showMessage(`🏅 New badge: ${b.name}!`);
      showConfetti();
    }
  });
  renderBadges();
}

function renderBadges() {
  dom.badgesGrid.innerHTML = "";
  badges.forEach(b => {
    const unlocked = state.badges.includes(b.id);
    const div = document.createElement("div");
    div.className = `badge-item ${unlocked ? "" : "locked"}`;
    div.innerHTML = `<div>${b.icon}</div><div>${b.name}</div>`;
    if (!unlocked) {
      div.title = `Reach ${b.req} ${b.value} to unlock`;
    }
    dom.badgesGrid.appendChild(div);
  });
}

function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function startCountdown() {
  const msLeft = getMidnightCountdown();
  if (msLeft > 0) {
    dom.getTaskBtn.disabled = true;
    const hrs = Math.floor(msLeft / 3600000);
    const mins = Math.floor((msLeft % 3600000) / 60000);
    dom.getTaskBtn.textContent = `⏳ ${hrs}h ${mins}m until next task`;

    const countdown = setInterval(() => {
      const left = getMidnightCountdown();
      if (left <= 0) {
        clearInterval(countdown);
        dom.getTaskBtn.disabled = false;
        dom.getTaskBtn.textContent = "🎯 Get Task";
        state.lastTaskDate = null;
        saveState();
      } else {
        const hrs = Math.floor(left / 3600000);
        const mins = Math.floor((left % 3600000) / 60000);
        dom.getTaskBtn.textContent = `⏳ ${hrs}h ${mins}m until next task`;
      }
    }, 60000);
  }
}

loadState();
normalizeState && normalizeState();
loadTasks().then(tasks => {
  const today = new Date().toDateString();
  if (state.lastTaskDate === today) {
    startCountdown();
  }

  // onboarding: show only if not visited
  // show onboarding on every load (per request)
  if (dom.onboarding) {
    dom.onboarding.classList.remove('hidden');
    try { dom.onboarding.style.display = ''; dom.onboarding.removeAttribute('aria-hidden'); } catch (e) {}
    try { setTimeout(() => trapFocus(dom.onboarding), 40); } catch (e) {}
  } else {
    showMicroCopyIfReturning();
  }

  // onboarding display handled earlier; handlers attached at top-level to ensure they work

  // attach level-up modal close handler
  const levelUpClose = document.getElementById('levelUpClose');
  if (levelUpClose) levelUpClose.addEventListener('click', () => {
    console.log('[debug] levelUpClose (attached later) clicked');
    closeLevelUpModal();
  });

  // direct overlay click listeners (more reliable than delegated document handlers)
  const levelModal = document.getElementById('levelUpModal');
  if (levelModal) levelModal.addEventListener('click', (e) => {
    if (e.target === levelModal) {
      console.log('[debug] levelUpModal overlay direct listener');
      closeLevelUpModal();
    }
  });

  const onboardingEl = document.getElementById('onboarding');
  if (onboardingEl) onboardingEl.addEventListener('click', (e) => {
    if (e.target === onboardingEl) {
      console.log('[debug] onboarding overlay direct listener');
      handleOnboardingClose();
    }
  });

  // quotes toggle wiring
  const toggle = document.getElementById('toggleQuotes');
  if (toggle) {
    toggle.checked = !!(state.ui && state.ui.showQuotes);
    toggle.addEventListener('change', (e) => {
      state.ui.showQuotes = !!e.target.checked;
      saveState();
      if (state.ui.showQuotes) startRotatingQuotes(); else if (dom.quoteArea) dom.quoteArea.textContent = '';
    });
  }

  if (state.ui && state.ui.showQuotes) startRotatingQuotes();

  // render available badges scroller (easy -> hard)
  function renderAvailableBadges() {
    const cont = document.getElementById('availableBadges');
    if (!cont) return;
    cont.innerHTML = '';
    const list = [
      { id: 'firstTask', emoji: '🌱', title: 'First Task', hint: 'Complete your first mission' },
      { id: 'streak3', emoji: '🔥', title: '3-Day Streak', hint: 'Complete tasks 3 days in a row' },
      { id: 'level2', emoji: '⭐', title: 'Level 2', hint: 'Reach level 2' },
  { id: 'shareApp', emoji: '🤝', title: 'Share the app', hint: 'Share the app with a friend' },
      { id: 'streak7', emoji: '🌟', title: '7-Day Streak', hint: 'Keep the streak for a week' },
      { id: 'level5', emoji: '🏆', title: 'Level 5', hint: 'Reach level 5' }
    ];
    list.forEach(b => {
      const unlocked = state.badges && state.badges.includes(b.id);
      const el = document.createElement('div');
      el.className = 'goal-badge' + (unlocked ? ' unlocked' : '');
      const progress = getBadgeProgress(b.id);
      el.innerHTML = `<div class="goal-emoji">${b.emoji}</div><div class="goal-info"><div class="title">${b.title}${unlocked? ' ✅' : ''}</div><div class="hint">${b.hint}</div>${progress? `<div class="hint">Progress: ${progress}</div>`: ''}</div>`;
      // clicking a badge attempts to claim it if eligible
      el.addEventListener('click', () => {
        if (!unlocked) tryClaimBadge(b.id);
      });
      cont.appendChild(el);
    });
  }
  
  // compute simple progress strings for badges
  function getBadgeProgress(id) {
    if (id === 'firstTask') return state.history && state.history.length ? '1/1' : '0/1';
    if (id === 'streak3') return `${Math.min(state.streak,3)}/3`;
    if (id === 'streak7') return `${Math.min(state.streak,7)}/7`;
    if (id === 'level2') return `${Math.min(state.level,2)}/2`;
    if (id === 'level5') return `${Math.min(state.level,5)}/5`;
  if (id === 'shareApp') return state.shared ? '1/1' : '0/1';
    return '';
  }

  function tryClaimBadge(id) {
    if (state.badges.includes(id)) return;
    // check eligibility
    let ok = false;
    if (id === 'firstTask') ok = (state.history && state.history.length > 0);
    if (id === 'streak3') ok = (state.streak >= 3);
    if (id === 'streak7') ok = (state.streak >= 7);
    if (id === 'level2') ok = (state.level >= 2);
    if (id === 'level5') ok = (state.level >= 5);
  if (id === 'shareApp') ok = state.shared === true;
    if (ok) {
      state.badges.push(id);
      saveState();
      renderBadges();
      renderAvailableBadges();
      showToast('🏅 Badge unlocked!');
      showConfetti();
    } else {
      showToast('Keep going — progress needed');
    }
  }

  // small toast helper
  function showToast(text, ms = 2200) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), ms);
  }

  // auto-scroll available badges slowly; pause on hover/focus
  function startBadgeAutoScroll() {
    const cont = document.getElementById('availableBadges');
    if (!cont) return;
    let speed = 0.3; // pixels per frame approx
    let rafId = null;
    let direction = 1;
    function step() {
      cont.scrollLeft += speed * direction;
      // bounce left/right when reaching ends
      if (cont.scrollLeft + cont.clientWidth >= cont.scrollWidth - 1) direction = -1;
      if (cont.scrollLeft <= 0) direction = 1;
      rafId = requestAnimationFrame(step);
    }
    cont.addEventListener('mouseover', () => { if (rafId) cancelAnimationFrame(rafId); rafId = null; });
    cont.addEventListener('mouseout', () => { if (!rafId) rafId = requestAnimationFrame(step); });
    cont.addEventListener('touchstart', () => { if (rafId) cancelAnimationFrame(rafId); rafId = null; }, { passive: true });
    cont.addEventListener('touchend', () => { if (!rafId) rafId = requestAnimationFrame(step); }, { passive: true });
    // start
    rafId = requestAnimationFrame(step);
  }
  renderAvailableBadges();

  dom.getTaskBtn.addEventListener("click", () => {
    const task = getRandomTask(tasks);
    state.currentTask = task;
    state.lastTaskDate = new Date().toDateString();
    renderTask(task);
    dom.getTaskBtn.classList.add("hidden");
    dom.completeBtn.classList.remove("hidden");
    dom.skipBtn.classList.remove("hidden");
    saveState();
    startCountdown();
  });

  dom.completeBtn.addEventListener("click", () => {
    if (!state.currentTask) return;
    // award xp and mark completed
    state.xp += state.currentTask.xp || 0;
    // streak handling: if lastCompletedDate is yesterday or today increase, else reset
    const todayStr = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    if (state.lastCompletedDate === yStr || state.lastCompletedDate === todayStr) {
      state.streak = (state.streak || 0) + 1;
    } else {
      state.streak = 1;
    }
    state.lastCompletedDate = todayStr;

    // save completed id for current level
    if (!state.completedTasks[state.level]) state.completedTasks[state.level] = [];
    if (state.currentTask.id && !state.completedTasks[state.level].includes(state.currentTask.id)) {
      state.completedTasks[state.level].push(state.currentTask.id);
    }

    // show rating panel to capture subjective feedback
    dom.ratingPanel && dom.ratingPanel.classList.remove('hidden');
    // hide task action buttons until rating
    dom.completeBtn.classList.add("hidden");
    dom.skipBtn.classList.add("hidden");
    saveState();
  });

  // rating buttons inside ratingPanel
  if (dom.ratingPanel) {
    dom.ratingPanel.querySelectorAll('button[data-rating]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const r = btn.getAttribute('data-rating');
        // show brief motivational message
        const phrases = completionPhrases[r] || completionPhrases.good;
        const msg = phrases[Math.floor(Math.random() * phrases.length)];
        renderTask({ task: msg, category: state.currentTask.category || '', difficulty: state.currentTask.difficulty || 1, time: '', xp: 0 });
        dom.ratingPanel.classList.add('hidden');
        // level up check after rating
        checkLevelUp();
        checkBadges();
  // attempt to auto-claim simple badges (firstTask, streaks, level)
  tryClaimBadge('firstTask');
  tryClaimBadge('streak3');
  tryClaimBadge('streak7');
  tryClaimBadge('level2');
  tryClaimBadge('level5');
        updateUI();
        showConfetti();
        // reset current task
        // record history entry (no date required)
        if (!state.history) state.history = [];
        state.history.unshift({ id: state.currentTask.id || null, task: state.currentTask.task || '', category: state.currentTask.category || '', xp: state.currentTask.xp || 0, rating: r });
        // keep history length reasonable
        if (state.history.length > 100) state.history.length = 100;
        state.currentTask = null;
        dom.getTaskBtn.classList.remove('hidden');
        saveState();
        renderHistory();
        renderAvailableBadges();
      });
    });
  }

  dom.skipBtn.addEventListener("click", () => {
    renderTask({ task: "⏭ Skipped! Ready for a new one?", category: "", difficulty: 1, time: "", xp: 0 });
    dom.completeBtn.classList.add("hidden");
    dom.skipBtn.classList.add("hidden");
    dom.getTaskBtn.classList.remove("hidden");
    saveState();
  });

  // share button: simulate a share and mark shared flag
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    // open preview modal before sharing
    const preview = document.getElementById('sharePreviewModal');
    if (preview) {
      preview.classList.remove('hidden');
      try { preview.style.display = ''; preview.removeAttribute('aria-hidden'); } catch (e) {}
      // focus textarea
      setTimeout(() => { const ta = document.getElementById('sharePreviewText'); ta && ta.focus(); }, 40);
      return;
    }
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Conquest — Self-Confidence Coach',
          text: 'Try this quick daily confidence coach — one small mission a day!',
          url
        });
        state.shared = true;
        saveState();
        tryClaimBadge('shareApp');
        renderAvailableBadges();
  plausibleEvent && plausibleEvent('share');
  showToast('Thanks for sharing!');
        return;
      }
      // fallback: copy to clipboard if available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
  state.shared = true;
  saveState();
  tryClaimBadge('shareApp');
  renderAvailableBadges();
  plausibleEvent && plausibleEvent('share', { method: 'clipboard' });
  showToast('Link copied to clipboard — share it with a friend!');
        return;
      }
      // last resort: prompt with the link so user can copy
      prompt('Copy and share this link', url);
  state.shared = true;
  saveState();
  tryClaimBadge('shareApp');
  renderAvailableBadges();
  plausibleEvent && plausibleEvent('share', { method: 'prompt' });
  showToast('Link ready to share');
    } catch (err) {
      console.error('Share failed', err);
      // try clipboard on error
      try {
  await navigator.clipboard.writeText(url);
  showToast('Couldn\'t open share — link copied to clipboard');
  state.shared = true;
  saveState();
  tryClaimBadge('shareApp');
  renderAvailableBadges();
  plausibleEvent && plausibleEvent('share', { method: 'fallback-clipboard' });
      } catch (e) {
        showToast('Could not share — please copy the link manually');
      }
    }
  });

  // share preview modal actions
  const sharePreviewConfirm = document.getElementById('sharePreviewConfirm');
  const sharePreviewCancel = document.getElementById('sharePreviewCancel');
  if (sharePreviewConfirm) sharePreviewConfirm.addEventListener('click', async () => {
    const text = document.getElementById('sharePreviewText').value || '';
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Conquest', text, url });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text + ' ' + url);
      } else {
        prompt('Copy and share this', text + ' ' + url);
      }
      state.shared = true; saveState(); tryClaimBadge('shareApp'); renderAvailableBadges(); showToast('Thanks for sharing!');
    } catch (err) { console.error(err); showToast('Sharing failed'); }
    // close preview
    const preview = document.getElementById('sharePreviewModal'); if (preview) { preview.classList.add('hidden'); preview.style.display = 'none'; }
  });
  if (sharePreviewCancel) sharePreviewCancel.addEventListener('click', () => {
    const preview = document.getElementById('sharePreviewModal'); if (preview) { preview.classList.add('hidden'); preview.style.display = 'none'; }
  });

  // finalize badge rendering and start auto scroll
  renderAvailableBadges();
  renderBadges();
  startBadgeAutoScroll(); // re-enabled: subtle auto-scroll for goals strip
  
  // cookie consent and visitor counter behavior
  // Respect user choice: do NOT increment visit counts or load analytics when the user declines.
  const consent = localStorage.getItem('conquest_cookie_consent');
  const cookieBanner = document.getElementById('cookieBanner');

  // show banner if user hasn't decided yet
  if (!consent && cookieBanner) { cookieBanner.classList.remove('hidden'); }
  const cookieAccept = document.getElementById('cookieAccept');
  const cookieDecline = document.getElementById('cookieDecline');

  if (cookieAccept) cookieAccept.addEventListener('click', () => {
    localStorage.setItem('conquest_cookie_consent', 'granted');
    cookieBanner && (cookieBanner.classList.add('hidden'));
    // analytics only (admin private counter handled by admin panel settings)
    enableAnalytics();
    updateAnalyticsStatus();
  });

  if (cookieDecline) cookieDecline.addEventListener('click', () => {
    localStorage.setItem('conquest_cookie_consent', 'denied');
    cookieBanner && (cookieBanner.classList.add('hidden'));
    // don't increment visits or load analytics when denied
    try { showToast && showToast('Analytics disabled — thanks for choosing privacy.'); } catch (e) {}
    updateAnalyticsStatus();
  });

  // enable analytics if previously granted
  if (localStorage.getItem('conquest_cookie_consent') === 'granted') enableAnalytics();
  // ensure analytics status shows current state
  try { updateAnalyticsStatus(); } catch (e) {}
});

updateUI();
renderBadges();

// history rendering
function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '';
  const items = (state.history || []).slice(0, 100);
  if (!items.length) {
    list.innerHTML = '<div class="muted">No tasks yet. Complete missions to populate history.</div>';
    return;
  }
  items.forEach(it => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const xpDisplay = (typeof it.xp === 'number' && it.xp > 0) ? `${it.xp} XP` : '';
    div.innerHTML = `<div>
      <div><strong>${it.task}</strong></div>
      <div class="meta">${it.category}${xpDisplay ? ' · ' + xpDisplay : ''}</div>
    </div>
    <div class="meta">${it.rating}</div>`;
    list.appendChild(div);
  });
}

// nav handlers
const navHome = document.getElementById('navHome');
const navHistory = document.getElementById('navHistory');
if (navHome) navHome.addEventListener('click', () => {
  document.getElementById('homePage').classList.remove('hidden');
  document.getElementById('historyPage').classList.add('hidden');
});
if (navHistory) navHistory.addEventListener('click', () => {
  document.getElementById('homePage').classList.add('hidden');
  document.getElementById('historyPage').classList.remove('hidden');
  renderHistory();
});

function createParticles() {
  const bg = document.querySelector(".animated-bg");
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("div");
    p.classList.add("particle");
    p.style.top = `${Math.random() * 100}%`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${10 + Math.random() * 20}s`;
    bg.appendChild(p);
  }
}
createParticles();

// --- Admin: local PIN-protected private visits panel ---
(function(){
  const ADMIN_PIN_KEY = 'conquest_admin_pin';
  const ADMIN_VISITS_KEY = 'conquest_admin_visits';
  const ADMIN_AUTOTRACK_KEY = 'conquest_admin_autotrack';

  const adminToggle = null; // removed visible admin link; use hidden hotspot
  const adminPanel = document.getElementById('adminPanel');
  const setPinInput = document.getElementById('setPinInput');
  const setPinBtn = document.getElementById('setPinBtn');
  const unlockPinInput = document.getElementById('unlockPinInput');
  const unlockPinBtn = document.getElementById('unlockPinBtn');
  const adminLocked = document.getElementById('adminLocked');
  const adminUnlocked = document.getElementById('adminUnlocked');
  const adminVisitsInput = document.getElementById('adminVisitsInput');
  const adminSaveBtn = document.getElementById('adminSaveBtn');
  const adminIncrementBtn = document.getElementById('adminIncrementBtn');
  const adminDecrementBtn = document.getElementById('adminDecrementBtn');
  const adminClose = document.getElementById('adminClose');
  const adminLockBtn = document.getElementById('adminLockBtn');
  const adminExportBtn = document.getElementById('adminExportBtn');
  const adminImportBtn = document.getElementById('adminImportBtn');
  const adminImportFile = document.getElementById('adminImportFile');
  const adminClearBtn = document.getElementById('adminClearBtn');
  const adminAutoTrack = document.getElementById('adminAutoTrack');

  function sha256Hex(str) {
    // simple SHA-256 utility returning hex string (uses SubtleCrypto)
    const enc = new TextEncoder();
    return crypto.subtle.digest('SHA-256', enc.encode(str)).then(buf => {
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    });
  }

  function adminPanelShow() {
    if (!adminPanel) return;
    adminPanel.classList.remove('hidden'); adminPanel.style.display = '';
    try { trapFocus(adminPanel); } catch (e) {}
  }
  function adminPanelHide() {
    if (!adminPanel) return;
    adminPanel.classList.add('hidden'); adminPanel.style.display = 'none';
    try { releaseFocus(adminPanel); } catch (e) {}
  }

  // failed attempts and lockout
  const ADMIN_FAIL_KEY = 'conquest_admin_failures';
  const ADMIN_LOCKUNTIL_KEY = 'conquest_admin_lockuntil';
  function getFailures() { return parseInt(localStorage.getItem(ADMIN_FAIL_KEY) || '0', 10); }
  function setFailures(n) { localStorage.setItem(ADMIN_FAIL_KEY, String(n)); }
  function getLockUntil() { return parseInt(localStorage.getItem(ADMIN_LOCKUNTIL_KEY) || '0', 10); }
  function setLockUntil(ts) { localStorage.setItem(ADMIN_LOCKUNTIL_KEY, String(ts)); }

  async function setPin() {
    const v = (setPinInput && setPinInput.value || '').trim();
    if (!v) return showToast('Enter a PIN to set');
    if (v.length < 4) return showToast('PIN must be at least 4 characters');
    const h = await sha256Hex(v);
    // if a PIN already exists, disallow blind overwrite; require Change PIN flow
    if (localStorage.getItem(ADMIN_PIN_KEY)) {
      return showToast('A PIN already exists. Use Change PIN to update it');
    }
    localStorage.setItem(ADMIN_PIN_KEY, h);
    showToast('PIN set — keep it safe');
    // hide set row and show change row now that a PIN exists
    try { if (setPinInput) setPinInput.value = ''; } catch (e) {}
    refreshAdminPinUI();
  }

  // Change PIN requires current PIN verification
  async function changePin() {
    const cur = (document.getElementById('currentPinInput') && document.getElementById('currentPinInput').value || '').trim();
    const neu = (document.getElementById('newPinInput') && document.getElementById('newPinInput').value || '').trim();
    if (!cur) return showToast('Enter current PIN');
    if (!neu || neu.length < 4) return showToast('New PIN must be at least 4 characters');
    const curH = await sha256Hex(cur);
    const stored = localStorage.getItem(ADMIN_PIN_KEY);
    if (!stored) return showToast('No existing PIN found');
    if (curH !== stored) {
      const fails = getFailures() + 1; setFailures(fails);
      if (fails >= 5) { setLockUntil(Date.now() + 5*60*1000); return showToast('Too many failed attempts — locked for 5 minutes'); }
      return showToast('Current PIN incorrect');
    }
    const newH = await sha256Hex(neu);
    localStorage.setItem(ADMIN_PIN_KEY, newH);
    // clear inputs
    try { document.getElementById('currentPinInput').value = ''; document.getElementById('newPinInput').value = ''; } catch (e) {}
    showToast('PIN changed');
    refreshAdminPinUI();
  }

  function refreshAdminPinUI() {
    const has = !!localStorage.getItem(ADMIN_PIN_KEY);
    const setRow = document.getElementById('setPinRow');
    const changeRow = document.getElementById('changePinRow');
    if (has) {
      if (setRow) setRow.style.display = 'none';
      if (changeRow) changeRow.style.display = '';
    } else {
      if (setRow) setRow.style.display = '';
      if (changeRow) changeRow.style.display = 'none';
    }
  }

  async function unlockWithPin() {
    const now = Date.now();
    const lockUntil = getLockUntil();
    if (lockUntil && now < lockUntil) {
      const remaining = Math.ceil((lockUntil - now) / 60000);
      return showToast(`Too many attempts. Try again in ${remaining} minute(s)`);
    }
    const v = (unlockPinInput && unlockPinInput.value || '').trim();
    if (!v) return showToast('Enter PIN to unlock');
    const h = await sha256Hex(v);
    const stored = localStorage.getItem(ADMIN_PIN_KEY);
    if (stored && stored === h) {
      // unlocked
      setFailures(0);
      setLockUntil(0);
      adminLocked && adminLocked.classList.add('hidden');
      adminUnlocked && adminUnlocked.classList.remove('hidden');
      unlockPinInput.value = '';
      loadAdminVisitsToUI();
      // load autotrack setting
      const at = localStorage.getItem(ADMIN_AUTOTRACK_KEY) === '1';
      if (adminAutoTrack) adminAutoTrack.checked = at;
      showToast('Admin unlocked');
      // start auto-lock timer
      startAdminAutoLock();
    } else {
      const fails = getFailures() + 1; setFailures(fails);
      if (fails >= 5) {
        const until = Date.now() + 5 * 60 * 1000; // 5 min
        setLockUntil(until);
        showToast('Too many failed attempts — locked for 5 minutes');
      } else {
        showToast('Incorrect PIN');
      }
    }
  }

  function lockAdmin() {
    adminUnlocked && adminUnlocked.classList.add('hidden');
    adminLocked && adminLocked.classList.remove('hidden');
    adminPanelHide();
    showToast('Admin locked');
  }

  // Auto-lock after inactivity (5 minutes)
  let _adminAutoLockTimer = null;
  function startAdminAutoLock() {
    clearTimeout(_adminAutoLockTimer);
    _adminAutoLockTimer = setTimeout(() => { lockAdmin(); showToast('Admin auto-locked after inactivity'); }, 5 * 60 * 1000);
  }
  function resetAdminAutoLock() { if (_adminAutoLockTimer) { clearTimeout(_adminAutoLockTimer); startAdminAutoLock(); } }

  function readAdminVisits() {
    try { return parseInt(localStorage.getItem(ADMIN_VISITS_KEY) || '0', 10); } catch (e) { return 0; }
  }
  function writeAdminVisits(n) { localStorage.setItem(ADMIN_VISITS_KEY, String(Math.max(0, Math.floor(n || 0)))); }

  function loadAdminVisitsToUI() {
    if (!adminVisitsInput) return;
    adminVisitsInput.value = readAdminVisits();
  }

  function adminSave() {
    const v = parseInt(adminVisitsInput.value || '0', 10) || 0;
    writeAdminVisits(v);
    showToast('Saved private visits');
  }

  function adminInc() { const v = readAdminVisits(); writeAdminVisits(v + 1); loadAdminVisitsToUI(); }
  function adminDec() { const v = readAdminVisits(); writeAdminVisits(Math.max(0, v - 1)); loadAdminVisitsToUI(); }

  function adminExport() {
    const obj = { visits: readAdminVisits() };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'conquest_admin_visits.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Exported');
  }

  function adminImport() {
    if (!adminImportFile) return;
    adminImportFile.click();
  }
  adminImportFile && adminImportFile.addEventListener('change', (e) => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (typeof parsed.visits === 'number') { writeAdminVisits(parsed.visits); loadAdminVisitsToUI(); showToast('Imported'); }
        else showToast('Invalid file');
      } catch (err) { showToast('Import failed'); }
    };
    reader.readAsText(f);
  });

  function adminClear() { writeAdminVisits(0); loadAdminVisitsToUI(); showToast('Cleared'); }

  // Auto-track on cookie Accept
  function adminMaybeAutoTrackOnAccept() {
    const at = localStorage.getItem(ADMIN_AUTOTRACK_KEY) === '1';
    if (!at) return;
    // increment private visits when consent is granted
    const v = readAdminVisits(); writeAdminVisits(v + 1);
  }

  // Wire UI
  // adminToggle removed; use hidden hotspot instead (triple-click or long-press)
  const adminHotspot = document.getElementById('adminHotspot');
  if (adminHotspot) {
    let clickCount = 0; let clickTimer = null; let pressTimer = null;
    adminHotspot.addEventListener('click', (e) => {
      clickCount++;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickCount = 0; }, 800);
      if (clickCount >= 3) { adminPanelShow(); clickCount = 0; }
    });
    // long-press (800ms) to open
    adminHotspot.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => adminPanelShow(), 800); });
    adminHotspot.addEventListener('pointerup', () => { if (pressTimer) clearTimeout(pressTimer); });
    adminHotspot.addEventListener('pointerleave', () => { if (pressTimer) clearTimeout(pressTimer); });
  }
    // close admin panel when clicking outside the modal-card
    if (adminPanel) {
      adminPanel.addEventListener('click', (e) => {
        try {
          const card = adminPanel.querySelector('.modal-card');
          if (!card) return;
          if (!card.contains(e.target)) {
            adminPanelHide();
          }
        } catch (err) { /* ignore */ }
      });
    }
  setPinBtn && setPinBtn.addEventListener('click', setPin);
  const changePinBtn = document.getElementById('changePinBtn');
  changePinBtn && changePinBtn.addEventListener('click', changePin);
  unlockPinBtn && unlockPinBtn.addEventListener('click', unlockWithPin);
  adminSaveBtn && adminSaveBtn.addEventListener('click', adminSave);
  adminIncrementBtn && adminIncrementBtn.addEventListener('click', () => { adminInc(); loadAdminVisitsToUI(); });
  adminDecrementBtn && adminDecrementBtn.addEventListener('click', () => { adminDec(); loadAdminVisitsToUI(); });
  adminClose && adminClose.addEventListener('click', adminPanelHide);
  adminLockBtn && adminLockBtn.addEventListener('click', lockAdmin);
  adminExportBtn && adminExportBtn.addEventListener('click', adminExport);
  adminImportBtn && adminImportBtn.addEventListener('click', adminImport);
  adminClearBtn && adminClearBtn.addEventListener('click', adminClear);
  adminAutoTrack && adminAutoTrack.addEventListener('change', (e) => { localStorage.setItem(ADMIN_AUTOTRACK_KEY, e.target.checked ? '1' : '0'); });

  // Hook cookie accept to auto-track for admin if enabled
  const cookieAcceptBtn = document.getElementById('cookieAccept');
  if (cookieAcceptBtn) cookieAcceptBtn.addEventListener('click', () => { adminMaybeAutoTrackOnAccept(); });

  // initialize UI state: hide unlocked area by default
  if (adminUnlocked) adminUnlocked.classList.add('hidden');
  // Show appropriate set/change rows depending on whether PIN exists
  try { refreshAdminPinUI(); } catch (e) {}
  // reset auto-lock when interacting
  document.addEventListener('mousemove', resetAdminAutoLock);
  document.addEventListener('keydown', resetAdminAutoLock);
})();
