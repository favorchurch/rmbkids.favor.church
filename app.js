// Read My Bible · Kids Quest — reading rules, profiles, wardrobe, and home.
const $ = s => document.querySelector(s);
const STORE = 'matthew-quest-v1';
const MASTER_CODE = '7777';
const pad = n => String(n).padStart(2, '0');
const createExplorerId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());
function addDays(key, n) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); }
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = loadState(), currentId = state.currentId;
let quiz = null;            // {mode:'daily'|'review', chapter, chapters, questions, index, score, runId, picked, advancing}
let readingChapter = 1, passageText = '';
const narration = { active: false, token: 0, audio: null, timer: null };
const testView = { homeStage: null, streak: null };   // master-mode preview only, never saved

function loadState() { try { const x = JSON.parse(localStorage.getItem(STORE)); if (x && Array.isArray(x.profiles)) return x; } catch { } return { profiles: [], currentId: null }; }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { toast('Could not save on this device'); } }
const isMaster = () => state.master === true;

// ---------- Profiles ----------
function profile() {
  const p = state.profiles.find(x => x.id === currentId) || null;
  if (!p) return null;
  p.gender = ['girl', 'female', 'woman'].includes(p.gender) ? 'girl' : 'boy';
  p.dailyPass = p.dailyPass || {};
  p.completed = Array.isArray(p.completed) ? p.completed : [];
  p.skin = Number.isInteger(p.skin) && p.skin >= 0 && p.skin < SKINS.length ? p.skin : 2;
  p.hair = Number.isInteger(p.hair) && p.hair >= 0 && p.hair < 5 ? p.hair : 0;
  p.hairColor = Number.isInteger(p.hairColor) && p.hairColor >= 0 && p.hairColor < 3 ? p.hairColor : 0;
  p.homeStage = Math.min(3, Number(p.homeStage || 0));
  p.decor = p.decor || {};
  p.outdoorDecor = p.outdoorDecor || {};
  if (!p.v2) { // one-time clean-up of retired features (coins, eye colour, voices, suit colours, powers)
    ['coins', 'eyes', 'voiceAccent', 'suitColor', 'color', 'expression', 'expressions', 'totalPages'].forEach(k => delete p[k]);
    if (p.equipped) delete p.equipped.power;
    p.v2 = 1; save();
  }
  return p;
}
function firstName(p) { return p.name.trim().split(/\s+/)[0]; }
const completed = (p, n) => p.completed.includes(n);
const SKINS = ['#d9a983', '#ca9670', '#bb835d', '#ad7352', '#9e6446'];

// ---------- Reading rules: one chapter a day, in order, every day ----------
function nextChapter(p) {
  for (let n = 1; n <= 28; n++) if (!completed(p, n)) return n;
  return ((p.rereadCount || 0) % 28) + 1;                    // after Matthew 28: reread from the start
}
// Launch catch-up: the first chapters can be read back to back, so kids who start late aren't behind.
const CATCH_UP = 4;
const catchUpOpen = p => !rereading(p) && nextChapter(p) <= CATCH_UP;
function todayChapter(p) {
  const key = todayKey();
  if (p.today?.date === key && !(completed(p, p.today.chapter) && catchUpOpen(p))) return p.today.chapter;
  p.today = { date: key, chapter: nextChapter(p) }; save();
  return p.today.chapter;
}
const passedToday = p => p.dailyPass[todayKey()] != null;
const canPlay = p => isMaster() || passedToday(p);
const rereading = p => p.completed.length >= 28;
function streak(p) {
  let day = todayKey(), count = 0;
  if (p.dailyPass[day] == null) day = addDays(day, -1);        // today not done yet: streak is still alive from yesterday
  while (p.dailyPass[day] != null) { count++; day = addDays(day, -1); }
  return count;
}

// ---------- Wardrobe ----------
function wardrobe(p) {
  if (!p.cosmetics) {
    const hats = { 2: 'aviator-goggles', 6: 'sun-cap', 10: 'moon-helmet', 14: 'gold-crown', 18: 'star-visor', 22: 'winged-helmet', 26: 'winged-helmet' }, outfits = { 0: 'coral-scout', 4: 'sky-pilot', 8: 'forest-ranger', 12: 'royal-adventurer', 16: 'golden-guardian', 20: 'sunset-surfer', 24: 'night-explorer' }, trails = { 1: 'star-dust', 5: 'cloud-puffs', 9: 'star-dust', 13: 'sky-bolt', 17: 'heart-sparks', 21: 'page-flutter', 25: 'star-dust' };
    p.cosmetics = { accessory: hats[p.equipped?.hat] || null, trail: trails[p.equipped?.trail] || null, jetpack: completed(p, 3) ? 'classic-pack' : null, outfit: outfits[p.equipped?.outfit] || null };
    p.legacyCosmetics = Object.values(p.cosmetics).filter(Boolean); save();
  }
  const swap = { 'rainbow-band': 'sunburst-band', 'rainbow-ribbon': 'sky-bolt' };
  if (swap[p.cosmetics.accessory] || swap[p.cosmetics.trail]) {
    for (const k of ['accessory', 'trail']) if (swap[p.cosmetics[k]]) p.cosmetics[k] = swap[p.cosmetics[k]];
    p.legacyCosmetics = (p.legacyCosmetics || []).map(id => swap[id] || id); save();
  }
  return p.cosmetics;
}
const cosmeticUnlocked = (p, item) => isMaster() || completed(p, item.chapter) || !!p.legacyCosmetics?.includes(item.id);
const equippedCosmetic = (p, type) => cosmeticById(wardrobe(p)[type]);

// ---------- Character art ----------
function explorerMarkup(p, preview = null, forceBase = false) {
  // Home and previews show the explorer in their outfit with their own hairstyle (hats/jetpacks/trails show in Sky Run and the wardrobe).
  const item = forceBase ? null : preview || equippedCosmetic(p, 'outfit'), acc = forceBase ? null : equippedCosmetic(p, 'accessory');
  const src = variantPath(p.gender, item, p.hair);
  return `<div class="explorer-figure"><div class="explorer-still" data-character-sheet data-gender="${p.gender}" data-item="${item?.id || ''}" data-acc="${acc?.id || ''}" data-hair="${p.hair}" data-hair-color="${p.hairColor}" data-skin="${p.skin}" role="img" aria-label="${escapeHtml(p.name)} the explorer" style="background-image:url('${src}')"></div></div>`;
}
function turntableMarkup(item, p) {
  const src = variantPath(p.gender, item, p.hair);
  return `<div class="turntable" data-turntable="${item.id}"><div class="turntable-frame" data-character-sheet data-gender="${p.gender}" data-item="${item.id}" data-hair="${p.hair}" data-hair-color="${p.hairColor}" data-skin="${p.skin}" role="img" aria-label="${escapeHtml(item.name)}, front view" style="background-image:url('${src}')"></div><div class="turntable-controls"><button type="button" data-spin="-1" aria-label="Turn left">↶</button><span class="turntable-angle">Front</span><button type="button" data-spin="1" aria-label="Turn right">↷</button></div><small>Drag to spin · 8 angles</small></div>`;
}
function hydrateCharacterArt() {
  document.querySelectorAll('[data-character-sheet]').forEach(el => {
    const d = el.dataset, key = [d.gender, d.item, d.acc, d.hair, d.hairColor, d.skin].join('|');
    if (d.hydratedKey === key) return; d.hydratedKey = key;
    characterSheet(d.gender, cosmeticById(d.item), Number(d.hair), Number(d.skin), Number(d.hairColor), d.acc || '')
      .then(src => { if (el.isConnected && el.dataset.hydratedKey === key) el.style.backgroundImage = `url('${src}')`; }).catch(() => { });
  });
}
new MutationObserver(hydrateCharacterArt).observe(document.body, { childList: true, subtree: true });
function setupTurntable() {
  const wrap = $('#modalCard').querySelector('[data-turntable]'); if (!wrap) return;
  const frame = wrap.querySelector('.turntable-frame'), label = wrap.querySelector('.turntable-angle'), names = ['Front', 'Front right', 'Right side', 'Back right', 'Back', 'Back left', 'Left side', 'Front left'];
  let angle = 0, startX = null;
  const set = n => { angle = (n + 8) % 8; frame.style.backgroundPosition = `${angle % 4 * 100 / 3}% ${angle < 4 ? 0 : 100}%`; label.textContent = names[angle]; };
  wrap.querySelectorAll('[data-spin]').forEach(b => b.onclick = () => set(angle + Number(b.dataset.spin)));
  frame.addEventListener('pointerdown', e => { startX = e.clientX; frame.setPointerCapture(e.pointerId); });
  frame.addEventListener('pointermove', e => { if (startX == null) return; const steps = Math.trunc((e.clientX - startX) / 22); if (steps) { set(angle + steps); startX += steps * 22; } });
  ['pointerup', 'pointercancel'].forEach(t => frame.addEventListener(t, () => startX = null));
  set(0);
}

// ---------- Modal + toast ----------
function openModal(html) { if ($('#modalLayer').classList.contains('hidden')) SkyAudio.sfx('open'); $('#modalCard').innerHTML = html; $('#modalLayer').classList.remove('hidden'); $('#modalCard').scrollTop = 0; $('#modalCard').querySelector('[data-close]')?.addEventListener('click', closeModal); }
function closeModal() { $('#modalLayer').classList.add('hidden'); stopNarration(); if ($('#gameLayer').classList.contains('hidden') && profile()) SkyAudio.scene('home'); }
const header = (kicker, title) => `<div class="modal-head"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2></div><button class="icon-button" data-close aria-label="Close">×</button></div>`;
function toast(msg) { const n = document.createElement('div'); n.className = 'toast'; n.textContent = msg; document.body.append(n); setTimeout(() => n.remove(), 2800); }

// ---------- Dashboard ----------
// ?new shows the first-time landing page (what a new kid sees), even on a device that already has an explorer.
let freshLanding = /[?&]new\b/.test(location.search);
function leaveFreshLanding() { if (!freshLanding) return; freshLanding = false; history.replaceState(null, '', location.pathname); }
function render() {
  const p = freshLanding ? null : profile();
  ['#dashboard', '#homeBase', '#readRow', '#playRow', '#outfitSection'].forEach(s => $(s).classList.toggle('hidden', !p));
  $('#hero').classList.toggle('hidden', !!p);
  $('#testBadge').classList.toggle('hidden', !isMaster());
  const unseen = state.profiles.reduce((n, k) => n + Math.max(0, (k.journal || []).length - (k.journalSeen || 0)), 0); $('#parentsButton').dataset.badge = unseen ? unseen : ''; 
  $('#activeProfileLabel').textContent = p ? `${p.name} · age ${p.age}` : 'No explorer selected';
  $('#primaryButton').textContent = p ? 'Continue adventure' : 'Start my adventure';
  if (!p) return;
  const n = todayChapter(p), little = p.age <= 6, q = QUESTIONS[n - 1], done = passedToday(p) && !catchUpOpen(p);
  $('#welcomeTitle').textContent = `Ready, ${firstName(p)}?`;
  if (p.lastOpenSent !== todayKey() && p.consent?.yes) { p.lastOpenSent = todayKey(); save(); Sync.event(p, 'Opened the game'); }

  // Streak
  const s = testView.streak ?? streak(p);
  $('#streakNumber').textContent = s;
  $('#streakUnit').textContent = s === 1 ? 'day' : 'days';
  const heat = Math.min(1, s / 14); const card = $('.streak-card'); card.style.setProperty('--heat', heat.toFixed(3)); card.dataset.heat = s >= 14 ? 'blaze' : s >= 7 ? 'hot' : s >= 3 ? 'warm' : s > 0 ? 'lit' : 'out';
  const read = Math.min(28, p.completed.length); $('#bookText').textContent = `${read} / 28 chapters`; $('#bookBar').style.width = `${read / 28 * 100}%`;
  $('.streak-card').classList.toggle('lit', s > 0);
  $('#streakHeadline').textContent = s >= 14 ? 'Blazing! You’re unstoppable!' : s >= 7 ? 'You’re on fire!' : s >= 3 ? 'Your fire is getting bigger!' : s > 0 ? 'Your fire is lit!' : 'Light your fire!';
  const tk = todayKey(), dow = new Date(`${tk}T12:00:00`).getDay(), wk = Array.from({ length: 7 }, (_, i) => addDays(tk, i - dow));   // Sunday → Saturday of this week
  const testOn = d => testView.streak != null && d <= tk && d > addDays(tk, -testView.streak);
  $('#streakWeek').innerHTML = wk.map(d => { const on = (p.dailyPass || {})[d] != null || testOn(d), today = d === tk, future = d > tk; return `<span class="sw-day ${on ? 'on' : ''} ${today ? 'today' : ''} ${future ? 'future' : ''}"><i>${on ? '🔥' : ''}</i><b>${new Date(`${d}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })}</b>${today ? '<em>Today</em>' : ''}</span>`; }).join('');
  const deep = Object.keys(p.reflections || {}).length; $('#deepBadge').textContent = deep ? `⭐ Deep Thinker × ${deep}` : ''; $('#deepBadge').classList.toggle('hidden', !deep);
  $('#streakText').textContent = s >= 28 ? '28-day champion! Keep the fire going!' : s === 0 ? 'Read today to light your fire!' : done ? `Day ${s} of 28 · see you tomorrow!` : `Day ${s} of 28 · read today to keep it going!`;

  // Today
  $('#todayTitle').textContent = `Matthew ${n}${little ? `:${q.verse}` : ''}`;
  if (done) {
    const next = nextChapter(p);
    $('#todayDescription').textContent = `Great job! Come back tomorrow to read your Bible again${rereading(p) && p.completed.length === 28 && next === 1 ? '' : ` — Matthew ${next} is next`}.`;
    $('#readTodayButton').textContent = 'Come back tomorrow';
    $('#readTodayButton').disabled = !isMaster();
  } else {
    $('#todayDescription').textContent = `${little ? 'Today’s verse' : 'Today’s chapter'}: ${q.title}. ${rereading(p) ? 'You finished Matthew — reading it again helps you notice new things!' : catchUpOpen(p) ? `Catch-up time: Matthew 1–${CATCH_UP} are all open, so you can read them back to back!` : 'Read it and get 3 of 3 quiz answers right to fly.'}`;
    $('#readTodayButton').textContent = 'Read my Bible';
    $('#readTodayButton').disabled = false;
  }
  // Play
  const ready = canPlay(p);
  $('#gameStatus').textContent = ready ? 'The sky is yours!' : 'The sky is waiting';
  $('#gameDescription').textContent = ready ? 'Fly as many times as you like today!' : 'Finish today’s reading and quiz to unlock your run.';
  $('#playButton').disabled = !ready;
  $('#playButton').textContent = ready ? 'Play Sky Run' : 'Read first to play';
  // Character
  $('#characterPreview').innerHTML = explorerMarkup(p);
  renderLoadout(p);
  renderHome(p);
  drawPlayPreview(p);
  setTimeout(() => maybeWelcome(profile()), 300);
  if (p.completed.length === 28 && !p.congratsShown) { p.congratsShown = true; save(); setTimeout(showCongratulations, 400); }
}
function renderLoadout(p) {
  const box = $('#homeLoadout');
  box.innerHTML = ['outfit', 'accessory', 'jetpack', 'trail'].map(type => {
    const item = equippedCosmetic(p, type), owned = COSMETICS.filter(c => c.type === type && cosmeticUnlocked(p, c)).length, total = COSMETICS.filter(c => c.type === type).length;
    return `<button class="home-loadout-item" data-loadout="${type}"><span class="home-loadout-art">${item ? cosmeticArt(item) : ''}</span><span><small>${COSMETIC_LABELS[type]} · ${owned}/${total}</small><b>${item ? item.name : 'Choose a look'}</b></span></button>`;
  }).join('');
  box.querySelectorAll('[data-loadout]').forEach(b => b.onclick = () => showRewards(b.dataset.loadout));
}
function showCongratulations() {
  openModal(`${header('YOU DID IT', 'Matthew complete!')}<p>You read all 28 chapters of Matthew. What an adventure! Reading it again helps you notice something new every time, so tomorrow you’ll start again at Matthew 1. Keep your streak going!</p><div class="notice">Every reading reward is now unlocked for this explorer.</div><button id="congratsDone" class="button primary wide">Keep exploring</button>`);
  $('#congratsDone').onclick = closeModal;
}

// ---------- New-day welcome: Day N shakes, bursts, the fire grows, and it becomes Day N+1 (can't be skipped) ----------
let welcomeBusy = false;
function maybeWelcome(p) {
  if (p && !welcomeBusy && p.lastWelcome === todayKey()) { maybeDetails(p); return; }
  if (!p || welcomeBusy || p.lastWelcome === todayKey() || !$('#gameLayer').classList.contains('hidden')) return;
  welcomeBusy = true;
  const days = Object.keys(p.dailyPass || {}).filter(d => d !== todayKey()).length, from = days, to = days + 1;
  const heat = Math.min(1, streak(p) / 14), first = from === 0;
  const el = document.createElement('div'); el.className = 'day-welcome'; el.style.setProperty('--heat', heat);
  el.innerHTML = `<div class="dw-inner"><div class="dw-hello">${first ? `Welcome, ${escapeHtml(firstName(p))}!` : `Welcome back, ${escapeHtml(firstName(p))}!`}</div>
    <div class="dw-stage"><div class="dw-fire"><i></i><b></b></div><div class="dw-day"><small>DAY</small><span id="dwNum">${from}</span></div></div>
    <div class="dw-msg" id="dwMsg">${first ? 'Your adventure starts today!' : 'A new day to read your Bible!'}</div>
    <button class="button primary dw-go" id="dwGo">${first ? 'Light my fire! 🔥' : 'Start Day ' + to + '! 🔥'}</button></div>`;
  document.body.append(el);
  // The button is the "go" tap (phones only allow sound after a tap); after that the animation can't be skipped.
  $('#dwGo').onclick = () => {
    $('#dwGo').remove(); SkyAudio.unlock(); SkyAudio.sfx('rumble'); el.classList.add('shake');
    setTimeout(() => { el.classList.remove('shake'); el.classList.add('burst'); SkyAudio.sfx('ignite'); el.style.setProperty('--heat', Math.min(1, heat + 0.35)); $('#dwNum').textContent = to; }, 2200);
    setTimeout(() => { $('#dwMsg').innerHTML = first ? `It’s <b>Day 1</b>! Let’s read together!` : `It’s <b>Day ${to}</b>! Keep the fire burning!`; el.classList.add('glow'); }, 2600);
    setTimeout(() => { el.classList.add('out'); }, 4600);
    setTimeout(() => { el.remove(); welcomeBusy = false; p.lastWelcome = todayKey(); save(); SkyAudio.scene('home'); window.__musicStarted = true; maybeDetails(p); }, 5200);
  };
}



// ---------- Save to home screen (teaches parents how; Android can install with one tap) ----------
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function deviceKind() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|KAKAOTALK|TikTok/i.test(ua);
  if (inApp) return ios ? 'inapp-ios' : 'inapp-android';
  if (ios) return /CriOS/.test(ua) ? 'ios-chrome' : 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
const ICON_SHARE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
const ICON_PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_DOTS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
function showInstall(after) {
  try { localStorage.setItem('rmb-a2hs-seen', '1'); } catch { }
  const kind = deviceKind(), step = (n, icon, html) => `<li class="a2hs-step"><span class="a2hs-num">${n}</span><span class="a2hs-icon">${icon}</span><span>${html}</span></li>`;
  let body;
  if (kind.startsWith('inapp')) body = `<p>You opened this inside another app (like Messenger or Facebook). First open it in your phone’s browser:</p><ol class="a2hs-steps">${step(1, ICON_DOTS, `Tap the <b>⋯ menu</b> in the top corner.`)}${step(2, ICON_SHARE, `Choose <b>Open in ${kind === 'inapp-ios' ? 'Safari' : 'Chrome'}</b> (or “Open in browser”).`)}${step(3, ICON_PLUS, `These steps will pop up again there to finish.`)}</ol>`;
  else if (kind === 'ios' || kind === 'ios-chrome') body = `<ol class="a2hs-steps">${step(1, ICON_SHARE, kind === 'ios' ? `Tap the <b>Share</b> button at the bottom of Safari (a square with an arrow).` : `Tap the <b>Share</b> button at the top right, next to the web address.`)}${step(2, ICON_PLUS, `Scroll down and tap <b>Add to Home Screen</b>.`)}${step(3, '<b class="a2hs-txt">Add</b>', `Tap <b>Add</b> in the top corner. Done!`)}</ol>`;
  else if (kind === 'android') body = installEvt ? `<p>Your phone can add it in one tap.</p><button id="a2hsInstall" class="button primary wide">📲 Add to home screen</button>` : `<ol class="a2hs-steps">${step(1, ICON_DOTS, `Tap the <b>⋮ menu</b> at the top right of Chrome.`)}${step(2, ICON_PLUS, `Tap <b>Add to Home screen</b> (or <b>Install app</b>).`)}${step(3, '<b class="a2hs-txt">Add</b>', `Tap <b>Add</b> or <b>Install</b>. Done!`)}</ol>`;
  else body = `<p>Open this website on your child’s phone or tablet, then tap <b>Parents › Save to home screen</b> there for the steps.</p>${installEvt ? '<button id="a2hsInstall" class="button secondary wide">Install on this computer</button>' : ''}`;
  openModal(`${header('FOR PARENTS', 'Save it to your home screen')}<div class="a2hs-hero"><img src="icon-192.png" alt="" width="64" height="64"><div><b>Read My Bible</b><small>One tap opens it, full screen, every day.</small></div></div>${body}<button id="a2hsDone" class="button ${kind === 'android' && installEvt ? 'secondary' : 'primary'} wide" style="margin-top:12px">Got it!</button>`);
  $('#a2hsInstall')?.addEventListener('click', async () => { try { installEvt.prompt(); await installEvt.userChoice; } catch { } installEvt = null; closeModal(); after?.(); });
  $('#a2hsDone').onclick = () => { closeModal(); after?.(); };
}
function maybeInstall() {
  let seen = false; try { seen = !!localStorage.getItem('rmb-a2hs-seen'); } catch { }
  if (seen || isStandalone() || deviceKind() === 'desktop') return false;
  if (!$('#modalLayer').classList.contains('hidden') || !$('#gameLayer').classList.contains('hidden')) return false;
  showInstall(); return true;
}

// ---------- Kid details + parent consent (for the church's records) ----------
const COUNTRIES = ['Philippines', 'South Korea', 'Australia', 'Other'];
// School years are named differently in each country, so the grade list follows the country.
const GRADES_BY = {
  Philippines: ['Not in school yet', 'Nursery', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'],
  'South Korea': ['Not in school yet', 'Kindergarten (유치원)', 'Grade 1 (초1)', 'Grade 2 (초2)', 'Grade 3 (초3)', 'Grade 4 (초4)', 'Grade 5 (초5)', 'Grade 6 (초6)', 'Middle school 1 (중1)'],
  Australia: ['Not in school yet', 'Kindy / Pre-school', 'Prep / Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7'],
  Other: ['Not in school yet', 'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7']
};
const gradeOptions = (country, cur) => `<option value="">Choose…</option>${(GRADES_BY[country] || GRADES_BY.Philippines).map(g => `<option ${cur === g ? 'selected' : ''}>${g}</option>`).join('')}${cur && !(GRADES_BY[country] || []).includes(cur) ? `<option selected>${escapeHtml(cur)}</option>` : ''}<option ${cur === 'Other' ? 'selected' : ''}>Other</option>`;
const fullName = p => `${p.name || ''} ${p.lastName || ''}`.trim();
const needsDetails = p => !p.country || !p.lastName || !p.grade || !p.parentName || !p.consent;
function detailsFields(p) {
  const v = k => escapeHtml(p?.[k] || '');
  return `<div class="two-col"><label class="field">Kid’s first name<input id="dFirst" maxlength="22" value="${escapeHtml(p?.name || '')}" placeholder="First name" autocomplete="off"></label><label class="field">Kid’s last name<input id="dLast" maxlength="30" value="${v('lastName')}" placeholder="Last name" autocomplete="off"></label></div>
  <label class="field">What country do you live in?<div class="country-pick" id="dCountry">${COUNTRIES.map(c => `<label><input type="radio" name="dCountry" value="${c}" ${(p?.country || '') === c ? 'checked' : ''}><span>${{ Philippines: '🇵🇭', 'South Korea': '🇰🇷', Australia: '🇦🇺', Other: '🌏' }[c]} ${c}</span></label>`).join('')}</div></label>
  <div class="two-col"><label class="field">Age<select id="dAge">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 4}" ${(p?.age || 0) === i + 4 ? 'selected' : ''}>${i + 4} years old</option>`).join('')}</select></label><label class="field">Grade / year level<select id="dGrade">${gradeOptions(p?.country || 'Philippines', p?.grade)}</select></label></div>
  ${p ? '' : `<fieldset class="gender-choice"><legend>Boy or girl?</legend><label><input type="radio" name="newGender" value="boy" checked> Boy</label><label><input type="radio" name="newGender" value="girl"> Girl</label><small>This can’t be changed later.</small></fieldset>`}
  <div class="consent-box"><b>For a parent or guardian</b>
  <div class="two-col"><label class="field">Parent’s full name<input id="dParent" maxlength="50" value="${v('parentName')}" placeholder="Your name" autocomplete="name"></label><label class="field">Mobile number or email<input id="dContact" maxlength="60" value="${v('parentContact')}" placeholder="0917… or name@email.com"></label></div>
  <div class="privacy-box" tabindex="0" role="region" aria-label="Data Privacy Notice">
    <h4>Data Privacy Notice</h4>
    <h5>Personal Information</h5><p>We collect the personal information from you when you manually or electronically submit the following, but not limited to:</p>
    <ul><li>Full name</li><li>Gender</li><li>Email address</li><li>Birthday</li><li>Contact details (Mobile/Phone Number, Social Media Details)</li></ul>
    <h5>Use</h5><p>All information we collect shall be kept private and confidential by Favor Church PH Inc. and shall be used solely for legal purposes as mandated by the Data Privacy Act and other relevant laws. Information that are matters of public interest, however, may be disclosed to the public subject to applicable laws, rules, and regulations. Pictures and videos taken during any official activity of Favor Church (such as sunday services, connect groups, family nights, presence nights, conferences, camps) may also be used in Favor Church’s social media and other promotional or publicity materials.</p>
    <h5>Analytics</h5><p>We use Rock RMS for tracking visitors and aggregating information about the traffic to our database. You may view the <a href="https://www.rockrms.com/privacy" target="_blank" rel="noopener">Rock RMS Privacy Policy</a> for more information.</p>
    <p>When you visit our website, a record of your visit is logged and the following data is supplied by your browser:</p>
    <ul><li>The date, time and length of your visit to the website</li><li>Your IP address and/or domain name</li><li>Your operating system (type of browser and platform)</li><li>The pages you visited during your session</li><li>Click-through URLs of email messages and graphics</li></ul>
    <h5>Data storage for Read My Bible</h5><p>Reading progress, rewards and answers are saved on this device. When you tick AGREE, your child’s details (name, age, grade, country, and your name and contact), reading progress, typed answers and voice recordings are also stored in a private Favor Church Google Sheet and Google Drive folder. <b>The data will only be visible to Church staff.</b></p>
    <h5>Protection Measures</h5><p>Only authorized Favor Church personnel has access to these personal information, the exchange of which will be facilitated through email and hard copy. Storage shall be within a period as may be authorized by law. Physical records shall be disposed through shredding, while digital files shall be anonymized.</p>
    <h5>Contact us</h5><p>You have the right to ask for a copy of any personal information we hold about you, as well as ask for correction. For data privacy concerns and/or feedback regarding this privacy notice, please fill out the Data Access, Alteration, and/or Complaint Form and file with the Data Protection Officer three (3) printed copies of the form enclosed in a sealed and labeled envelope. Kindly address it to:</p>
    <p class="privacy-addr">Data Protection Officer<br>Favor Church PH Inc.<br>Level 6 East Wing, Shangri-la Plaza<br>EDSA, Mandaluyong City</p>
    <p>Or you may send in portable document format (PDF) a copy of the form to <a href="mailto:dpo@favor.church">dpo@favor.church</a>.</p>
  </div>
  <label class="consent-check"><input type="checkbox" id="dConsent" ${p?.consent?.yes ? 'checked' : ''}> <span><b>I AGREE*</b><br>By ticking AGREE, the participant acknowledges that he/she has read the Data Privacy Notice and consents that his/her personal data, including but not limited to their name, gender, telephone/mobile number and email address/es, as submitted by the participant shall be collected and processed by FAVOR CHURCH through attendance sheets, feedback forms, survey forms, photos, video/audio recordings, and other data collection and monitoring &amp; evaluation tools for documentation purposes. This is in adherence to the Philippines Data Privacy Act of 2012, and Favor Church Data Privacy Policy. The data will only be visible to Church staff.</span></label>
  <small class="consent-note">Not ready to agree? Leave the box unticked. The game still works, and everything stays on this device only.</small></div>`;
}
function wireCountry() { $('#modalCard').querySelectorAll('input[name="dCountry"]').forEach(r => r.onchange = () => { const g = $('#dGrade'); g.innerHTML = gradeOptions(r.value, ''); }); }
function readDetails(isNew) {
  const d = { country: $('#modalCard input[name="dCountry"]:checked')?.value || '', firstName: $('#dFirst').value.trim(), lastName: $('#dLast').value.trim(), age: Number($('#dAge').value), grade: $('#dGrade').value, parentName: $('#dParent').value.trim(), parentContact: $('#dContact').value.trim(), consent: $('#dConsent').checked };
  if (!d.firstName) { toast('Enter the kid’s first name'); return null; }
  if (!d.lastName) { toast('Enter the kid’s last name'); return null; }
  if (!d.country) { toast('Choose the country you live in'); return null; }
  if (!d.grade) { toast('Choose a grade'); return null; }
  if (!d.parentName) { toast('A parent or guardian needs to fill in their name'); return null; }
  if (d.consent && !d.parentContact) { toast('Add a mobile number or email so we can reach you'); return null; }
  return d;
}
function applyDetails(p, d) {
  const was = p.consent?.yes;
  p.country = d.country; p.name = d.firstName; p.lastName = d.lastName; p.age = d.age; p.grade = d.grade; p.parentName = d.parentName; p.parentContact = d.parentContact;
  p.consent = { yes: d.consent, by: d.parentName, at: new Date().toISOString() };
  if (d.consent && !was) Sync.event(p, 'Parent gave consent', { details: `By ${d.parentName}` });
  else if (!d.consent && was) Sync.event(p, 'Parent removed consent', { details: `By ${d.parentName}`, force: true });
  else if (d.consent) Sync.event(p, 'Details updated');
}
function showDetails(p, after) {
  if (!p) return;
  openModal(`${header('GROWN-UP HELP', `About ${escapeHtml(p.name)}`)}<p>Please ask a parent or guardian to fill this in. It helps our Favor Kids team know who is reading along, so we can cheer them on.</p>${detailsFields(p)}<button id="dSave" class="button primary wide">Save</button><button id="dLater" class="text-button" style="width:100%">Ask me later</button>`);
  wireCountry();
  $('#dSave').onclick = () => { const d = readDetails(false); if (!d) return; applyDetails(p, d); save(); toast('Saved. Thank you!'); closeModal(); render(); after ? after() : setTimeout(() => maybeInstall(), 600); };
  $('#dLater').onclick = () => { p.askedDetails = todayKey(); save(); closeModal(); after?.(); };
}
function maybeDetails(p) {
  if (p && !isMaster() && (!needsDetails(p) || p.askedDetails === todayKey())) { maybeInstall(); return; }
  if (!p || !needsDetails(p) || p.askedDetails === todayKey() || isMaster()) return;
  if (!$('#modalLayer').classList.contains('hidden') || !$('#gameLayer').classList.contains('hidden')) return;
  p.askedDetails = todayKey(); save();   // ask once a day, even if the box is closed
  showDetails(p);
}
function addJournal(p, entry) { p.journal = p.journal || []; p.journal.push(entry); save(); Sync.answer(p, entry); }
Sync.progress = p => ({ chapters: (p.completed || []).length, currentChapter: todayChapter(p), streak: streak(p), home: ['Tent', 'Trailer', 'House', 'Mansion'][p.homeStage || 0] });

// ---------- Profiles modal ----------
function showProfiles() {
  const rows = state.profiles.map(p => `<div class="profile-row"><span class="profile-avatar ${p.gender === 'girl' ? 'girl' : 'boy'}"></span><div style="flex:1"><b>${escapeHtml(p.name)}</b><small>Age ${p.age} · ${p.completed?.length || 0}/28 chapters</small></div><button class="button small ${p.id === currentId ? 'dark' : 'secondary'}" data-select="${p.id}">${p.id === currentId ? 'Selected' : 'Choose'}</button></div>`).join('');
  openModal(`${header('EXPLORERS', 'Choose your explorer')}<p>Each child has their own reading progress, rewards, and saved explorer on this device.</p><div class="profile-list">${rows || '<div class="notice">Create the first explorer to begin.</div>'}</div><h3 class="form-title">New explorer</h3>${detailsFields(null)}<button id="createProfile" class="button primary wide">Create explorer</button><button id="transferButton" class="text-button" style="width:100%">Move a save to another device →</button>`);
  wireCountry();
  $('#createProfile').onclick = () => {
    const d = readDetails(true); if (!d) return;
    const name = d.firstName, age = d.age, gender = $('#modalCard input[name="newGender"]:checked')?.value || 'boy';
    if (state.profiles.some(p => `${p.name} ${p.lastName || ''}`.trim().toLowerCase() === `${d.firstName} ${d.lastName}`.toLowerCase())) { toast('That explorer is already on this device'); return; }
    const p = { id: createExplorerId(), name, age, gender, startDate: todayKey(), completed: [], dailyPass: {}, homeStage: 0, skin: 2, hair: 0, hairColor: 0, decor: {}, outdoorDecor: {}, cosmetics: { accessory: null, trail: null, jetpack: null, outfit: null }, best: 0, totalStars: 0, congratsShown: false, v2: 1 };
    applyDetails(p, d); p.lastWelcome = null;
    state.profiles.push(p); currentId = state.currentId = p.id; leaveFreshLanding(); save(); Sync.event(p, 'Signed up'); closeModal(); render(); toast(`Welcome, ${name}!`); setTimeout(() => maybeInstall(), 900);
  };
  $('#transferButton').onclick = showTransfer;
  $('#modalCard').querySelectorAll('[data-select]').forEach(b => b.onclick = () => { currentId = state.currentId = b.dataset.select; leaveFreshLanding(); save(); closeModal(); render(); });
}
function showTransfer() {
  const p = profile(); let code = '';
  if (p) code = btoa(unescape(encodeURIComponent(JSON.stringify({ ...p, custodyToken: Sync.custodyFor(p.id), exportVersion: 1 }))));
  openModal(`${header('SAVE TRANSFER', 'Move between devices')}<p>Progress saves automatically on this device. To move an explorer to another phone or laptop, copy their transfer code and import it there. Later changes won’t sync automatically.</p>${p ? `<label class="field">${escapeHtml(p.name)}’s transfer code<textarea id="exportCode" rows="4" readonly>${code}</textarea></label><button id="copyCode" class="button secondary">Copy code</button>` : ''}<label class="field">Import an explorer’s transfer code<textarea id="importCode" rows="4" placeholder="Paste a transfer code here"></textarea></label><button id="importButton" class="button primary">Import explorer</button>`);
  $('#copyCode')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); } catch { $('#exportCode').select(); document.execCommand('copy'); } toast('Transfer code copied'); });
  $('#importButton').onclick = () => {
    try {
      const imp = JSON.parse(decodeURIComponent(escape(atob($('#importCode').value.trim()))));
      if (imp.exportVersion !== 1 || !imp.name || !Array.isArray(imp.completed) || imp.age < 4 || imp.age > 12) throw Error();
      delete imp.exportVersion;
      const importedCustodyToken = typeof imp.custodyToken === 'string' ? imp.custodyToken : '';
      const importedId = imp.id;
      delete imp.custodyToken;
      if (!imp.id || state.profiles.some(p => p.id === imp.id)) { imp.id = createExplorerId(); }
      imp.name = String(imp.name).slice(0, 22);
      imp.completed = [...new Set(imp.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= 28))];
      imp.dailyPass = imp.dailyPass && typeof imp.dailyPass === 'object' ? imp.dailyPass : {};   // keeps the streak when moving devices
      if (state.profiles.some(p => p.name.toLowerCase() === imp.name.toLowerCase())) imp.name += ' (imported)';
      if (importedId === imp.id && importedCustodyToken) Sync.importCustody(imp.id, importedCustodyToken);
      state.profiles.push(imp); currentId = state.currentId = imp.id; save(); closeModal(); render(); toast('Explorer imported');
    } catch { toast('That transfer code could not be read'); }
  };
}
function showHow() {
  openModal(`${header('HOW TO PLAY', 'Read • Answer • Fly')}<div class="chapter-row"><b>1. Read every day</b><small>One chapter of Matthew a day, in order. Ages 4–6 read one special verse; ages 7–12 read the whole chapter.</small></div><br><div class="chapter-row"><b>2. Answer three questions</b><small>Get all three right. You can try again as many times as you need.</small></div><br><div class="chapter-row"><b>3. Fly in Sky Run</b><small>Hold to rise, let go to fall. Dodge gears and zappers, catch stars, and grab glowing Bibles to throw pages.</small></div><br><div class="chapter-row"><b>4. Unlock and grow</b><small>Every chapter unlocks a new look. Every 3 chapters fills your home bar — pass the home quiz to move up from tent to trailer, house, and mansion.</small></div><br><div class="chapter-row"><b>5. Keep your streak</b><small>Read every day, weekends too, to keep your fire burning. Miss a day and the streak starts again.</small></div>`);
}
function showChapters() {
  const p = profile(); if (!p) { showProfiles(); return; }
  const today = todayChapter(p), master = isMaster();
  openModal(`${header('MY READING MAP', 'Matthew 1–28')}<p>One chapter a day. Finished chapters get a check mark; today’s chapter glows gold.${master ? ' <b>Test mode:</b> tap any chapter to open it.' : ''}</p><div class="chapter-grid">${QUESTIONS.map((q, i) => { const n = i + 1, done = completed(p, n), isToday = n === today; return `<button class="chapter-tile ${done ? 'done' : ''} ${isToday ? 'today' : ''} ${!done && !isToday ? 'locked' : ''}" data-chapter="${n}" ${master ? '' : 'disabled'}>MAT ${n}<small>${done ? '✓ Read' : isToday ? 'Today' : 'Coming soon'}</small></button>`; }).join('')}</div><button id="viewRewards" class="button secondary wide">See my wardrobe</button>`);
  if (master) $('#modalCard').querySelectorAll('[data-chapter]').forEach(b => b.onclick = () => showReading(Number(b.dataset.chapter)));
  $('#viewRewards').onclick = () => showRewards();
}

// ---------- Reading ----------
const netPassage = (n, p) => p.age <= 6 ? `Matthew ${n}:${QUESTIONS[n - 1].verse}` : `Matthew ${n}`;
function loadNet(reference) {
  return new Promise((resolve, reject) => {
    const cb = `netCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`, script = document.createElement('script'); let done = false, timer;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); script.remove(); delete window[cb]; err ? reject(err) : resolve(val); };
    window[cb] = data => finish(null, data);
    script.onerror = () => finish(Error('NET service unavailable'));
    script.src = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&type=json&formatting=plain&callback=${cb}`;
    timer = setTimeout(() => finish(Error('NET service timeout')), 12000);
    document.head.append(script);
  });
}
async function getPassage(n, p) {
  // Bundled text first (works offline and doesn't depend on the NET website), then the NET service.
  if (window.NET_MATTHEW?.[n]) {
    const verses = window.NET_MATTHEW[n];
    return p.age <= 6 ? verses.filter(v => v[0] === QUESTIONS[n - 1].verse) : verses;
  }
  const data = await loadNet(netPassage(n, p));
  const list = Array.isArray(data) ? data : Array.isArray(data?.verses) ? data.verses : [];
  if (!list.length) throw Error('No passage');
  return list.map(v => [Number(v.verse), String(v.text || '').replace(/<[^>]*>/g, '').trim()]);
}
function stopNarration() {
  narration.token++; narration.active = false;
  if (narration.timer) { clearTimeout(narration.timer); narration.timer = null; }
  if (narration.audio) { narration.audio.pause(); narration.audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const b = $('#listenButton'); if (b) b.textContent = '▶ Read aloud';
}
function audioFor(n, p) { const a = window.AUDIO_FILES; if (!a) return null; return p.age <= 6 ? a.verse?.[n] : a.chapter?.[n]; }
function playAudioFile(src, button) {
  const token = ++narration.token; narration.active = true; button.textContent = '■ Stop';
  const a = new Audio(src); narration.audio = a;
  a.onended = () => { if (token === narration.token) { narration.active = false; button.textContent = '▶ Read aloud'; } };
  a.onerror = () => { if (token === narration.token) { narration.active = false; button.textContent = '▶ Read aloud'; toast('The recording could not play'); } };
  a.play().catch(() => { narration.active = false; button.textContent = '▶ Read aloud'; });
}
function bestDeviceVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  const rank = v => { const n = v.name.toLowerCase(); if (/premium|enhanced|natural|neural/.test(n)) return 0; if (/samantha|ava|allison|google us|google uk|daniel|serena|karen/.test(n)) return 1; return /^en-us/i.test(v.lang) ? 2 : 3; };
  return voices.sort((a, b) => rank(a) - rank(b))[0] || null;
}
function playDeviceVoice(text, age, button) {
  if (!('speechSynthesis' in window)) { toast('Read aloud is not available in this browser'); return; }
  const token = ++narration.token; narration.active = true; button.textContent = '■ Stop';
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?;]+[.!?;]+["”’]?|[^.!?;]+$/g) || [text], voice = bestDeviceVoice(); let i = 0;
  const next = () => {
    if (token !== narration.token) return;
    if (i >= parts.length) { narration.active = false; button.textContent = '▶ Read aloud'; return; }
    const u = new SpeechSynthesisUtterance(parts[i++].trim()); u.lang = voice?.lang || 'en-US'; if (voice) u.voice = voice;
    u.rate = age <= 6 ? .86 : .93; u.pitch = 1;
    u.onend = () => { narration.timer = setTimeout(next, 120); };
    u.onerror = () => { narration.active = false; button.textContent = '▶ Read aloud'; };
    speechSynthesis.speak(u);
  };
  next();
}
async function showReading(n) {
  const p = profile(); if (!p) return;
  if (!isMaster() && (n !== todayChapter(p) || (passedToday(p) && !catchUpOpen(p)))) { toast(passedToday(p) ? 'Come back tomorrow to read your Bible again!' : 'Read today’s chapter first'); return; }
  stopNarration(); readingChapter = n; passageText = ''; SkyAudio.scene('reading'); SkyAudio.sfx('page');
  const ref = netPassage(n, p);
  openModal(`${header('READ YOUR BIBLE', escapeHtml(ref))}<p>${escapeHtml(QUESTIONS[n - 1].title)} · (<a href="https://netbible.org" target="_blank" rel="noopener">NET</a>)</p><div id="passageBox" class="passage-box">Loading…</div><div class="passage-actions"><button id="listenButton" class="button secondary" disabled>▶ Read aloud</button></div><div class="notice">Read to the end, then answer three questions. A grown-up can help younger readers.</div><button id="quizButton" class="button primary wide" disabled>Read to the end to start the quiz</button>${isMaster() ? '<button id="skipQuiz" class="button ghost wide test-button">Test mode: skip quiz and pass</button>' : ''}`);
  $('#quizButton').onclick = () => startQuiz({ mode: 'daily', chapter: n });
  $('#skipQuiz')?.addEventListener('click', () => { quiz = { mode: 'daily', chapter: n, score: 3 }; finishQuiz(); });
  try {
    const verses = await getPassage(n, p);
    if (readingChapter !== n || $('#modalLayer').classList.contains('hidden')) return;
    passageText = verses.map(v => v[1]).join(' ');
    const box = $('#passageBox');
    box.innerHTML = verses.map(v => `<p><sup>${v[0]}</sup> ${escapeHtml(v[1])}</p>`).join('');
    const enable = () => { const b = $('#quizButton'); if (b && b.disabled) { b.disabled = false; b.textContent = 'Start the 3-question quiz'; } };
    box.onscroll = () => { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 25) enable(); };
    if (box.scrollHeight <= box.clientHeight + 8) enable();
    const listen = $('#listenButton'), file = audioFor(n, p);
    listen.disabled = false;
    listen.onclick = () => { if (narration.active) { stopNarration(); return; } if (file) playAudioFile(file, listen); else playDeviceVoice(passageText, p.age, listen); };
  } catch {
    const box = $('#passageBox'); if (!box) return;
    box.innerHTML = `The passage could not load right now. <a href="https://netbible.org/bible/Matthew+${n}" target="_blank" rel="noopener">Open Matthew ${n} on the NET Bible site</a>, then come back for the quiz.`;
    const b = $('#quizButton'); b.disabled = false; b.textContent = 'I read it — start the quiz';
  }
}

// ---------- Quizzes (daily + home review) ----------
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const toQuestion = row => ({ prompt: row[0], correct: row[1], answers: shuffle(row.slice(1)) });
// The bonus reflection is question 4 of the quiz on chapters 3, 6, 9 … 27 and 28 (and in the matching home quiz).
function quizBonusCh() { if (!quiz || typeof REFLECT === 'undefined') return 0; const ch = quiz.mode === 'review' ? Math.max(...quiz.chapters) : quiz.chapter; return REFLECT[ch] ? ch : 0; }
function startQuiz(opts) {
  stopNarration();
  const p = profile(), key = p.age <= 6 ? 'little' : 'big';
  const rows = opts.mode === 'review' ? opts.chapters.map(n => REVIEW[n - 1][key]) : QUESTIONS[opts.chapter - 1][key];
  quiz = { ...opts, questions: rows.map(toQuestion), index: 0, score: 0, runId: (quiz?.runId || 0) + 1 };
  renderQuestion();
}
function renderQuestion() {
  const q = quiz.questions[quiz.index], shown = quiz.index, runId = quiz.runId;
  quiz.picked = -1; quiz.advancing = false;
  const title = quiz.mode === 'review' ? 'Home quiz' : `Matthew ${quiz.chapter}`;
  openModal(`${header(quiz.mode === 'review' ? 'HOME UPGRADE QUIZ' : 'QUICK QUIZ', title)}<div class="quiz-top"><span>QUESTION ${shown + 1} OF ${quizBonusCh() ? 4 : 3}${quiz.mode === 'review' ? ` · MATTHEW ${quiz.chapters[shown]}` : ''}</span><span>${quiz.score} correct so far</span></div><h3 class="quiz-prompt">${escapeHtml(q.prompt)}</h3><div class="quiz-options">${q.answers.map((a, i) => `<button type="button" class="quiz-option" data-answer="${i}">${escapeHtml(a)}</button>`).join('')}</div><p id="quizFeedback" role="status" class="quiz-feedback"></p><button id="nextQuestion" type="button" class="button primary wide" disabled>${shown === 2 ? 'See results' : 'Next question'}</button>`);
  const advance = () => { if (quiz.advancing || quiz.picked < 0 || quiz.index !== shown || quiz.runId !== runId) return; quiz.advancing = true; if (quiz.index < 2) { quiz.index++; renderQuestion(); } else if (quizBonusCh() && quiz.score === 3 && !quiz.bonusDone) { quiz.bonusDone = true; showBonus(profile(), quizBonusCh(), finishQuiz, true); } else finishQuiz(); };
  $('#modalCard').querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
    if (quiz.picked >= 0) return;
    quiz.picked = Number(b.dataset.answer);
    const right = q.answers[quiz.picked] === q.correct; if (right) quiz.score++; SkyAudio.sfx(right ? 'correct' : 'wrong');
    $('#modalCard').querySelectorAll('[data-answer]').forEach(x => { const i = Number(x.dataset.answer); if (q.answers[i] === q.correct) x.classList.add('correct'); else if (i === quiz.picked) x.classList.add('wrong'); x.disabled = true; });
    $('#quizFeedback').textContent = right ? 'Correct! Moving on…' : `The answer is: ${q.correct}. Moving on…`;
    $('#nextQuestion').disabled = false; setTimeout(advance, 1200);
  });
  $('#nextQuestion').onclick = advance;
}
function finishQuiz() {
  const p = profile();
  if (quiz.score !== 3) {
    openModal(`${header('TRY AGAIN', `${quiz.score} of 3 correct`)}<p>You’re learning! ${quiz.mode === 'review' ? 'Think back on those chapters and try again.' : 'Read the passage again and try the three questions again.'} You can retry as many times as you like.</p><div class="two-col">${quiz.mode === 'daily' ? '<button id="rereadButton" class="button secondary">Read again</button>' : ''}<button id="retryButton" class="button primary">Try again</button></div>`);
    $('#rereadButton')?.addEventListener('click', () => showReading(quiz.chapter));
    $('#retryButton').onclick = () => startQuiz({ mode: quiz.mode, chapter: quiz.chapter, chapters: quiz.chapters, test: quiz.test });
    return;
  }
  // Free bonus reflection question every 3rd chapter (and in the home quiz). It never blocks progress.
  if (quiz.mode === 'daily' && !quiz.test && !quiz.heartDone && heartMomentFor(quiz.chapter)) { quiz.heartDone = true; showHeartMoment(p, quiz.chapter, finishQuiz); return; }
  if (quiz.mode === 'review' && quiz.test) { openModal(`${header('TEST MODE', 'Home quiz passed')}<p>In normal play this would upgrade the home. Nothing was saved.</p><button class="button primary wide" data-close>Close</button>`); return; }
  if (quiz.mode === 'review') return finishHomeQuiz(p);
  const n = quiz.chapter, isNew = !completed(p, n);
  if (isNew) p.completed.push(n); else if (rereading(p)) p.rereadCount = (p.rereadCount || 0) + 1;
  p.dailyPass[todayKey()] = n;
  Sync.event(p, isNew ? 'Read a chapter' : 'Reread a chapter', { chapter: n });
  const reward = isNew ? COSMETICS.find(item => item.chapter === n) : null;
  const finished = p.completed.length === 28 && isNew;
  if (finished) p.congratsShown = true;
  save(); render();
  SkyAudio.jingle(); if (streak(p) > 1) setTimeout(() => SkyAudio.sfx('flame'), 900);
  const homeReady = homeQuizReady(p);
  openModal(`${header(finished ? 'MATTHEW COMPLETE' : 'CHAPTER COMPLETE', finished ? 'You finished Matthew!' : 'Great reading!')}${reward ? `<div class="reward-celebration">${cosmeticArt(reward)}</div><h3 style="text-align:center">Unlocked: ${reward.name}</h3>` : '<h3 style="text-align:center">You remembered it!</h3>'}<p style="text-align:center">${finished ? 'You read all 28 chapters! Tomorrow you’ll start again at Matthew 1 — every reread shows you something new.' : catchUpOpen(p) ? `All three answers right! Sky Run is open. Catch-up time: you can read Matthew ${nextChapter(p)} right now too!` : 'All three answers right! Sky Run is open — fly as much as you like today. Come back tomorrow to read your Bible again.'}</p>${homeReady ? '<div class="notice">Your home bar is full! Take the home quiz to upgrade your home.</div>' : ''}<div class="two-col">${reward ? '<button id="rewardNext" class="button secondary">Try it on</button>' : homeReady ? '<button id="homeQuizNext" class="button secondary">Home quiz</button>' : '<button id="closeDone" class="button secondary">Done</button>'}<button id="finishNext" class="button primary">Play Sky Run</button></div>`);
  $('#rewardNext')?.addEventListener('click', () => showRewards(reward.type, reward.id));
  $('#homeQuizNext')?.addEventListener('click', startHomeQuiz);
  if (catchUpOpen(p)) { const b = document.createElement('button'); b.className = 'button primary wide'; b.style.marginTop = '12px'; b.textContent = `Read Matthew ${nextChapter(p)} next`; b.onclick = () => showReading(todayChapter(p)); $('#modalCard').append(b); }
  $('#closeDone')?.addEventListener('click', closeModal);
  $('#finishNext').onclick = () => { closeModal(); openGame(); };
}

function showBonus(p, ch, done, inQuiz) {
  const r = REFLECT[ch], little = p.age <= 6, row = little ? r.little : r.big, answers = shuffle(row.slice(1));
  openModal(`${inQuiz ? header(quiz.mode === 'review' ? 'HOME UPGRADE QUIZ' : 'QUICK QUIZ', quiz.mode === 'review' ? 'Home quiz' : `Matthew ${quiz.chapter}`) + `<div class="quiz-top"><span>QUESTION 4 OF 4 · BONUS ⭐</span><span>${quiz.score} correct so far</span></div><p class="bonus-note">Bonus question — there’s no wrong way to try!</p>` : `${header('BONUS ⭐ THINK ABOUT IT', 'A question for your heart')}<p class="bonus-note">Free extra! Matthew ${ch <= 3 ? '1–3' : ch === 28 ? '28' : `${ch - 2}–${ch}`} · ${escapeHtml(r.title)}</p>`}<h3 class="quiz-prompt">${escapeHtml(row[0])}</h3><div class="quiz-options">${answers.map((x, i) => `<button type="button" class="quiz-option" data-b="${i}">${escapeHtml(x)}</button>`).join('')}</div><div id="bonusAfter"></div>`);
  $('#modalCard').querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
    const pick = answers[Number(b.dataset.b)], best = pick === row[1]; SkyAudio.sfx(best ? 'bonus' : 'correct');
    $('#modalCard').querySelectorAll('[data-b]').forEach(x => { x.disabled = true; if (answers[Number(x.dataset.b)] === row[1]) x.classList.add('correct'); });
    if (best) { p.reflections = p.reflections || {}; p.reflections[ch] = true; save(); }
    addJournal(p, { id: 'j' + Date.now(), date: todayKey(), ch, title: 'Bonus question', prompt: row[0], text: pick });
    const typeBox = !little && r.bigType && best;
    $('#bonusAfter').innerHTML = `<p class="quiz-feedback">${best ? '⭐ Deep Thinker! Great answer.' : `Good thinking! Here’s a great answer: <b>${escapeHtml(row[1])}</b>.`}</p>${typeBox ? `<label class="field">${escapeHtml(r.bigType)}<input id="bonusNames" maxlength="80" placeholder="e.g. my cousin Sam, my friend Ana"></label>` : ''}<button id="bonusNext" class="button primary wide">${typeBox ? 'Done' : 'Continue'}</button>`;
    $('#bonusNext').onclick = () => {
      if (typeBox) {
        const names = $('#bonusNames').value.trim(); if (names) { p.shareWith = names; addJournal(p, { id: 'j' + Date.now() + 'n', date: todayKey(), ch, title: 'Share Jesus', prompt: 'Who could you tell about Jesus? Name them!', text: names }); }
        $('#bonusAfter').innerHTML = `<div class="notice share-note">${escapeHtml(r.bigDone)}${names ? `<br><b>${escapeHtml(names)}</b>` : ''}</div><button id="bonusNext2" class="button primary wide">Continue</button>`;
        $('#bonusNext2').onclick = done; return;
      }
      done();
    };
  });
}

// ---------- Heart moments: typed answers, prayer breaks and voice messages for parents ----------
function heartMomentFor(ch) { return ch === 28 ? null : HEART_MOMENTS[(ch - 1) % HEART_MOMENTS.length]; }
function showHeartMoment(p, ch, done, forced) {
  const m = forced || heartMomentFor(ch), little = p.age <= 6; if (!m) return done();
  let mode = m.kind === 'record' || little ? 'record' : 'type', clip = null, timer = null;
  const canRec = Recorder.supported();
  if (!canRec) mode = 'type';
  const draw = () => {
    const typeUI = m.kind === 'pray'
      ? `<label class="field">${escapeHtml(m.prompt)}<input id="hmA" maxlength="60" placeholder="Their name"></label><label class="field">${escapeHtml(m.prompt2)}<textarea id="hmB" rows="2" maxlength="200" placeholder="I pray that…"></textarea></label>`
      : `<label class="field">Your answer<${m.kind === 'type' ? `input id="hmA" maxlength="80" placeholder="${escapeHtml(m.placeholder || '')}"` : 'textarea id="hmA" rows="3" maxlength="300"'}>${m.kind === 'type' ? '' : '</textarea>'}</label>`;
    const recUI = `<div class="rec-box"><button id="hmRec" class="rec-button" aria-label="Record">🎤</button><div id="hmRecText" class="rec-text">${clip ? 'Recorded! Listen, then save it.' : 'Tap the microphone and talk. Tap again to stop.'}</div>${clip ? `<audio id="hmPlay" controls src="${URL.createObjectURL(clip)}"></audio>` : ''}</div>`;
    openModal(`${header(m.title === 'PRAY BREAK!' ? '🙏 PRAY BREAK!' : '💛 HEART MOMENT', m.title === 'PRAY BREAK!' ? 'Time to pray' : escapeHtml(m.title))}<p class="hm-prompt">${escapeHtml(m.kind === 'pray' ? (mode === 'record' ? 'Who do you want to pray for? Say their name and what you want to pray for them.' : 'Think of someone who needs prayer today.') : m.prompt)}</p>
      ${mode === 'record' ? recUI : typeUI}
      ${m.kind !== 'record' || mode === 'record' ? '' : ''}
      <p class="fineprint">Your ${mode === 'record' ? 'message' : 'answer'} is saved for your parents${p.consent?.yes ? ' and the Favor Kids team' : ''} to see.</p>
      <button id="hmSave" class="button primary wide" ${mode === 'record' && !clip ? 'disabled' : ''}>Save</button>
      <div class="hm-links">${canRec ? `<button id="hmSwitch" class="text-button">${mode === 'record' ? '✏️ Type instead' : '🎤 Say it instead'}</button>` : ''}<button id="hmSkip" class="text-button">Skip for today</button></div>`);
    $('#hmSwitch')?.addEventListener('click', () => { Recorder.cancel(); clearInterval(timer); mode = mode === 'record' ? 'type' : 'record'; clip = null; draw(); });
    $('#hmSkip').onclick = () => { Recorder.cancel(); clearInterval(timer); done(); };
    if (mode === 'record') {
      const btn = $('#hmRec'), txt = $('#hmRecText');
      btn.onclick = async () => {
        if (Recorder.recording) { clearInterval(timer); clip = await Recorder.stop(); draw(); return; }
        try { await Recorder.start(); } catch { toast('Please allow the microphone to record'); return; }
        let left = 60; btn.classList.add('on'); btn.textContent = '■'; txt.textContent = `Recording… ${left}s (tap to stop)`;
        timer = setInterval(async () => { left--; txt.textContent = `Recording… ${left}s (tap to stop)`; if (left <= 0) { clearInterval(timer); clip = await Recorder.stop(); draw(); } }, 1000);
      };
    }
    $('#hmSave').onclick = async () => {
      const entry = { id: 'j' + Date.now(), date: todayKey(), ch, title: m.title, prompt: m.kind === 'pray' ? `${m.prompt} ${m.prompt2}` : m.prompt };
      if (mode === 'record') { if (!clip) return; try { await VoiceStore.put(entry.id, clip); entry.audio = true; } catch { toast('Could not save the recording on this device'); return; } }
      else { const A = $('#hmA').value.trim(), B = $('#hmB')?.value.trim() || ''; if (!A) { toast('Type your answer first'); return; } entry.text = A; if (B) entry.text2 = B; }
      addJournal(p, entry); SkyAudio.sfx('bonus');
      openModal(`${header('THANK YOU!', m.title === 'PRAY BREAK!' ? 'Let’s pray!' : 'Saved for your parents')}<p style="text-align:center;font-size:18px">${m.kind === 'pray' || m.title === 'PRAY BREAK!' ? 'Take a moment right now and pray for them. God hears you! 🙏' : m.prompt.startsWith('Who do you want to share') ? 'Great! Try to go to them this week and share with them about Jesus.' : 'Your parents will love this! 💛'}</p><button id="hmDone" class="button primary wide">Continue</button>`);
      $('#hmDone').onclick = done;
    };
  };
  draw();
}

// ---------- Home ----------
const HOME_NAMES = ['Tent', 'Trailer', 'House', 'Mansion'], HOME_CLASSES = ['tent', 'trailer', 'house', 'mansion'];
const homeStage = p => testView.homeStage ?? p.homeStage;
const homeProgress = p => Math.max(0, Math.min(3, p.completed.length - p.homeStage * 3));
const homeQuizReady = p => p.homeStage < 3 && homeProgress(p) >= 3;
function homeQuizChapters(p) { const sorted = [...p.completed].sort((a, b) => a - b); return sorted.slice(p.homeStage * 3, p.homeStage * 3 + 3); }
function startHomeQuiz() {
  const p = profile(); if (!p || !homeQuizReady(p)) return;
  const chapters = homeQuizChapters(p);
  openModal(`${header('HOME UPGRADE QUIZ', `Unlock the ${HOME_NAMES[p.homeStage + 1].toLowerCase()}!`)}<p>Three new questions about Matthew ${chapters.join(', ')}. Get all three right to move into your ${HOME_NAMES[p.homeStage + 1].toLowerCase()}${p.homeStage + 1 <= 3 ? ' and get a new car' : ''}.</p><button id="beginHomeQuiz" class="button primary wide">Start the home quiz</button>`);
  $('#beginHomeQuiz').onclick = () => startQuiz({ mode: 'review', chapters });
}
function finishHomeQuiz(p) {
  p.homeStage = Math.min(3, p.homeStage + 1); p.homeInside = false; save(); Sync.event(p, 'Home upgraded', { details: ['Tent', 'Trailer', 'House', 'Mansion'][p.homeStage] }); render(); SkyAudio.jingle();
  const name = HOME_NAMES[p.homeStage];
  openModal(`${header('NEW HOME', `Welcome to your ${name.toLowerCase()}!`)}<div class="home-reveal stage-${HOME_CLASSES[p.homeStage]}"></div><p style="text-align:center">You moved up from the ${HOME_NAMES[p.homeStage - 1].toLowerCase()}! New decorations are ready to place${CARS.length ? ', and a new car is parked outside' : ''}.</p><button id="homeDone" class="button primary wide">See my ${name.toLowerCase()}</button>`);
  $('#homeDone').onclick = () => { closeModal(); $('#homeBase').scrollIntoView({ behavior: 'smooth' }); };
}
// Furniture. Each choice unlocks with the home stage (index 0 = tent, 3 = mansion).
// Furniture: one clean cut-out image per choice (decor/<file>-<n>.webp). Each choice unlocks with the home stage.
const DECOR = {
  rug: { label: 'Carpet', files: ['rug-0', 'rug-1', 'rug-2', 'rug-3'], names: ['Woven mat', 'Braided rug', 'Pattern rug', 'Royal rug'], pos: { x: 50, y: 96 }, flat: true },
  couch: { label: 'Sofa', files: ['home-8', 'home-9', 'home-10', 'home-11'], names: ['Teal sofa', 'Coral sofa', 'Golden sofa', 'Sage sofa'], pos: { x: 24, y: 78 } },
  stand: { label: 'TV stand', files: ['stand-0', 'stand-1', 'stand-2', 'stand-3'], names: ['Wooden stand', 'Teal cabinet', 'Coral cabinet', 'Royal cabinet'], pos: { x: 77, y: 80 } },
  tv: { label: 'TV', files: ['home-12', 'home-13', 'home-14', 'home-15'], names: ['Wooden TV', 'Teal TV', 'Big screen', 'Cream TV'], pos: { x: 77, y: 72 } },
  bible: { label: 'Bible', files: ['bible-0', 'bible-1', 'bible-2', 'bible-3'], names: ['First Bible', 'Explorer Bible', 'Adventure Bible', 'Treasure Bible'], pos: { x: 56, y: 80 } },
  plate: { label: 'Plate', files: ['home-4', 'home-5', 'home-6', 'home-7'], names: ['Teal plate', 'Coral plate', 'Flower plate', 'Sage dish'], pos: { x: 42, y: 86 } },
  food: { label: 'Snack', files: ['home-0', 'home-1', 'home-2', 'home-3'], names: ['Apple', 'Grapes', 'Bread', 'Cheese'], pos: { x: 42, y: 83 } }
};
const OUTDOOR = {
  garden: { label: 'Garden', files: ['outdoor-0', 'outdoor-1', 'outdoor-2'], names: ['Flower bed', 'Leafy planter', 'Veggie garden'], pos: { x: 17, y: 78 } },
  welcome: { label: 'Porch details', files: ['outdoor-3', 'outdoor-4', 'outdoor-5'], names: ['Welcome sign', 'Garden lantern', 'Stepping stones'], pos: { x: 68, y: 74 } },
  seating: { label: 'Outdoor seating', files: ['outdoor-6', 'outdoor-7', 'outdoor-8'], names: ['Teal bench', 'Coral rocker', 'Sunny hammock'], pos: { x: 86, y: 82 } }
};
// A new car arrives with each home upgrade: trailer → pickup, house → station wagon, mansion → convertible.
const CARS = ['Pickup truck', 'Station wagon', 'Convertible'];
const art = (file, extra = '') => `<span class="decor-art ${extra}" style="background-image:url('decor/${file}.webp')" aria-hidden="true"></span>`;
const decorArt = (type, index, extra = '') => art(DECOR[type].files[index], extra);
const outdoorArt = (type, index, extra = '') => art(OUTDOOR[type].files[index], extra);
const carArt = (index, extra = '') => art('car-' + index, extra);
const decorUnlocked = (p, i) => isMaster() || i <= homeStage(p);
function renderHome(p) {
  const stage = homeStage(p), inside = !!p.homeInside, progress = homeProgress(p);
  $('#homeTitle').textContent = `${firstName(p)}’s ${HOME_NAMES[stage].toLowerCase()}`;
  $('#homeSubtitle').textContent = stage === 3 ? 'You finished the home journey! Keep reading to keep your streak.' : 'Every 3 chapters fills the bar. Pass the home quiz to move up.';
  $('#homeLevel').textContent = `${HOME_NAMES[stage].toUpperCase()} · ${stage + 1} OF 4`;
  const scene = $('#homeScene');
  scene.className = `home-scene stage-${HOME_CLASSES[stage]}${inside ? ' inside' : ''}`;
  scene.style.backgroundImage = `url('${inside ? 'home-interiors.webp' : 'home-stages.webp'}')`;
  scene.style.backgroundSize = '200% 200%';
  scene.style.backgroundPosition = ['0 0', '100% 0', '0 100%', '100% 100%'][stage];
  $('#homeViewButton').textContent = inside ? 'Step outside' : 'Step inside';
  $('#homeCharacter').innerHTML = explorerMarkup(p);
  const items = inside ? DECOR : OUTDOOR, chosen = inside ? p.decor : p.outdoorDecor, positions = (inside ? p.decorPositions : p.outdoorPositions) || {};
  let html = Object.keys(items).filter(k => chosen[k] !== 'none' && k !== 'stand').map(k => {
    const idx = Math.min(Number(chosen[k]) || 0, items[k].names.length - 1), pos = positions[k] || items[k].pos;
    return `<span class="placed-decor decor-${k} ${inside ? '' : 'outdoor-item'}" data-item="${k}" data-kind="${inside ? 'interior' : 'exterior'}" role="button" tabindex="0" aria-label="Drag to move ${items[k].names[idx]}" style="left:${pos.x}%;top:${pos.y}%;z-index:${items[k].flat ? 1 : Math.round(pos.y)}">${inside ? (k === 'tv' && chosen.stand !== 'none' ? `<span class="tv-on-stand">${decorArt('tv', idx)}${decorArt('stand', Math.min(Number(chosen.stand) || 0, 3))}</span>` : decorArt(k, idx)) : outdoorArt(k, idx)}</span>`;
  }).join('');
  if (!inside && CARS.length && stage > 0 && p.carChoice !== 'none') {
    const car = Math.min(Number.isInteger(p.carChoice) ? p.carChoice : stage - 1, stage - 1), pos = positions.car || { x: 82, y: 66 };
    html += `<span class="placed-decor decor-car outdoor-item" data-item="car" data-kind="exterior" role="button" tabindex="0" aria-label="Drag to move ${CARS[car]}" style="left:${pos.x}%;top:${pos.y}%;z-index:${Math.round(pos.y)}">${carArt(car)}</span>`;
  }
  $('#homeDecor').innerHTML = html;
  $('#homeDecorButton').textContent = inside ? 'Decorate room' : 'Decorate outside';
  $('#homeProgressTitle').textContent = stage === 3 ? 'Mansion unlocked — journey complete!' : `Next home: ${HOME_NAMES[stage + 1].toLowerCase()}`;
  $('#homeProgressText').textContent = p.homeStage === 3 ? 'Amazing! Keep reading every day.' : homeQuizReady(p) ? 'Bar full! Pass the home quiz to move up.' : `${progress} of 3 chapters read`;
  $('#homeProgressBar').style.width = `${(p.homeStage === 3 ? 3 : progress) / 3 * 100}%`;
  $('#homeQuizButton').classList.toggle('hidden', !homeQuizReady(p));
}
function showHomeDecor() {
  const p = profile(); if (!p) return;
  const inside = !!p.homeInside, items = inside ? DECOR : OUTDOOR, store = inside ? p.decor : p.outdoorDecor, stage = homeStage(p);
  const none = (attr, k, on) => `<button class="decor-choice none-choice ${on ? 'active' : ''}" ${attr}="${k}" data-value="none"><span class="decor-thumbnail none-thumb">✕</span><small>None</small></button>`;
  const rows = Object.keys(items).map(k => `<div class="decor-row"><b>${items[k].label}</b><div>${none('data-decor', k, store[k] === 'none')}${items[k].names.map((name, i) => { const ok = decorUnlocked(p, i); return `<button class="decor-choice ${store[k] !== 'none' && (store[k] || 0) === i ? 'active' : ''}" data-decor="${k}" data-value="${i}" ${ok ? '' : 'disabled'}>${inside ? decorArt(k, i, 'decor-thumbnail') : outdoorArt(k, i, 'decor-thumbnail')}<small>${ok ? name : `🔒 ${HOME_NAMES[i]}`}</small></button>`; }).join('')}</div></div>`).join('');
  const cars = !inside && CARS.length ? `<div class="decor-row"><b>Car</b><div>${none('data-car', 'car', p.carChoice === 'none')}${CARS.map((name, i) => { const ok = isMaster() || i < stage; return `<button class="decor-choice ${p.carChoice !== 'none' && Math.min(Number.isInteger(p.carChoice) ? p.carChoice : stage - 1, stage - 1) === i ? 'active' : ''}" data-car="${i}" ${ok ? '' : 'disabled'}>${carArt(i, 'decor-thumbnail')}<small>${ok ? name : `🔒 ${HOME_NAMES[i + 1]}`}</small></button>`; }).join('')}</div></div>` : '';
  openModal(`${header('DECORATE', inside ? 'Your room' : 'Outside your home')}<p>Pick “None” to leave something out. New choices unlock as your home grows. Drag things around in your ${inside ? 'room' : 'yard'} to arrange them — they stay where you put them.</p>${rows}${cars}`);
  $('#modalCard').querySelectorAll('[data-decor]').forEach(b => b.onclick = () => { store[b.dataset.decor] = b.dataset.value === 'none' ? 'none' : Number(b.dataset.value); save(); render(); showHomeDecor(); });
  $('#modalCard').querySelectorAll('[data-car]').forEach(b => b.onclick = () => { p.carChoice = b.dataset.value === 'none' ? 'none' : Number(b.dataset.car); save(); render(); showHomeDecor(); });
}

// ---------- Wardrobe modal ----------
function showRewards(type = 'outfit', previewId = null) {
  const p = profile(); if (!p) { showProfiles(); return; }
  const item = cosmeticById(previewId), entries = COSMETICS.filter(c => c.type === type), current = item?.type === type ? item : equippedCosmetic(p, type) || entries[0];
  const equipped = wardrobe(p)[type] === current.id, unlocked = cosmeticUnlocked(p, current);
  openModal(`${header('YOUR WARDROBE', 'Choose your look')}<p>Every chapter you read unlocks one new look. Tap a look to preview it and spin your explorer around.</p><div class="wardrobe-tabs">${COSMETIC_TYPES.map(t => `<button class="wardrobe-tab ${t === type ? 'active' : ''}" data-tab="${t}">${COSMETIC_LABELS[t]} <small>${COSMETICS.filter(c => c.type === t && cosmeticUnlocked(p, c)).length}/${COSMETICS.filter(c => c.type === t).length}</small></button>`).join('')}</div><div class="wardrobe-preview"><div class="wardrobe-character">${turntableMarkup(current, p)}</div><div class="wardrobe-preview-info"><span class="eyebrow">${COSMETIC_LABELS[type].toUpperCase()}</span><h3>${current.name}</h3><p>${unlocked ? 'Unlocked!' : `Unlocks when you finish Matthew ${current.chapter}.`}</p><button id="equipLook" class="button primary" ${unlocked ? '' : 'disabled'}>${!unlocked ? 'Locked' : equipped ? 'Take it off' : 'Wear this'}</button></div></div><div class="cosmetic-grid">${entries.map(c => `<button class="cosmetic-card ${current.id === c.id ? 'selected' : ''} ${cosmeticUnlocked(p, c) ? '' : 'locked'}" data-preview="${c.id}"><span class="cosmetic-art">${cosmeticArt(c)}</span><b>${c.name}</b><small>${cosmeticUnlocked(p, c) ? wardrobe(p)[type] === c.id ? '✓ Wearing' : 'Unlocked' : `🔒 Matthew ${c.chapter}`}</small></button>`).join('')}</div>`);
  $('#modalCard').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showRewards(b.dataset.tab));
  $('#modalCard').querySelectorAll('[data-preview]').forEach(b => b.onclick = () => showRewards(type, b.dataset.preview));
  $('#equipLook')?.addEventListener('click', () => {
    if (!unlocked) return;
    SkyAudio.sfx('equip'); wardrobe(p)[type] = equipped ? null : current.id;
    p.featuredCosmetic = equipped ? null : current.id; p.showHairFocus = false;
    save(); render(); showRewards(type, current.id);
  });
  setupTurntable();
}

// ---------- Customize (hair, hair colour, skin) ----------
function showCustomize() {
  const p = profile(); if (!p) { showProfiles(); return; }
  const dots = (kind, values, selected) => '<div class="builder-options">' + values.map((v, i) => `<button class="builder-choice ${i === selected ? 'active' : ''}" data-choice="${kind}" data-value="${i}" aria-label="${typeof v === 'string' ? kind + ' ' + (i + 1) : v.name}" style="--choice:${typeof v === 'string' ? v : v.color}"></button>`).join('') + '</div>';
  const styles = hairstylesFor(p.gender);
  const hair = `<div class="builder-section"><b>Hairstyle</b><div class="hairstyle-options">${styles.map((v, i) => `<button class="hairstyle-choice ${i === p.hair ? 'active' : ''}" data-choice="hair" data-value="${i}" aria-label="${v.name}"><span class="hairstyle-thumb" style="background-image:url(${hairstylePath(p.gender, i)})"></span><small>${v.name}</small></button>`).join('')}</div></div>`;
  const colors = styles[p.hair]?.bald ? '' : `<div class="builder-section"><b>Hair color</b>${dots('hairColor', HAIR_COLORS, p.hairColor)}</div>`;
  openModal(`${header('MAKE IT YOURS', `Customize your ${p.gender === 'girl' ? 'girl' : 'boy'} explorer`)}<p>Your choices show up at home and in Sky Run.</p><div class="builder-preview">${explorerMarkup(p)}</div>${hair}${colors}<div class="builder-section"><b>Skin tone</b>${dots('skin', SKINS, p.skin)}</div><div class="wardrobe-tabs">${COSMETIC_TYPES.map(t => `<button class="wardrobe-tab" data-open-wardrobe="${t}">${COSMETIC_LABELS[t]}</button>`).join('')}</div>`);
  $('#modalCard').querySelectorAll('[data-choice]').forEach(b => b.onclick = () => { p[b.dataset.choice] = Number(b.dataset.value); if (b.dataset.choice === 'hair' && styles[p.hair]?.bald) p.hairColor = 0; p.showHairFocus = true; save(); render(); showCustomize(); });
  $('#modalCard').querySelectorAll('[data-open-wardrobe]').forEach(b => b.onclick = () => { p.showHairFocus = false; save(); showRewards(b.dataset.openWardrobe); });
}

// ---------- Grown-ups / test mode ----------
// ---------- Parents ----------
const PIN_KEY = 'rmb-parent-pin';
const getPin = () => { try { return localStorage.getItem(PIN_KEY); } catch { return null; } };
function showParentsGate() {
  const pin = getPin();
  const body = pin
    ? `<p>Enter your 4-digit parent code to see your kids’ progress.</p><label class="field">Parent code<input id="pinIn" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="pin-input"></label><button id="pinGo" class="button primary wide">Open parent dashboard</button><button id="pinForgot" class="text-button" style="width:100%">Forgot the code?</button>`
    : `<p>Create a 4-digit parent code. Kids won’t be able to open this area without it. It’s saved on this device only.</p><div class=\"notice pin-warn\">🔐 <b>Don’t forget your code!</b> Write it down or save it somewhere safe. If you forget it, you’ll need to ask a Favor Kids leader to reset it.</div><label class=\"pin-ack\"><input type=\"checkbox\" id=\"pinAck\"> I’ve written down or saved my code</label><div class="two-col"><label class="field">New code<input id="pinNew" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="pin-input"></label><label class="field">Type it again<input id="pinNew2" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="pin-input"></label></div><button id="pinSet" class="button primary wide">Save code and continue</button>`;
  openModal(`${header('PARENTS', 'Parent access')}${body}`);
  if (pin) {
    const go = () => { const v = $('#pinIn').value.trim(); if (v === pin) showParentDashboard(); else if (v === MASTER_CODE) { state.master = true; save(); render(); showGrownUps(); } else { toast('That code isn’t right'); $('#pinIn').value = ''; } };
    $('#pinGo').onclick = go; $('#pinIn').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#pinIn').focus();
    $('#pinForgot').onclick = () => openModal(`${header('PARENTS', 'Reset the parent code')}<p>To keep this area safe from curious kids, resetting needs the Favor Kids team code. Ask your Favor Kids leader, or remove and re-add the site on this device.</p><label class="field">Favor Kids team code<input id="pinReset" type="password" inputmode="numeric" maxlength="8" class="pin-input"></label><button id="pinResetGo" class="button primary wide">Reset parent code</button>`) || ($('#pinResetGo').onclick = () => { if ($('#pinReset').value.trim() === MASTER_CODE) { try { localStorage.removeItem(PIN_KEY); } catch { } toast('Parent code removed — create a new one'); showParentsGate(); } else toast('That code isn’t right'); });
  } else {
    $('#pinSet').onclick = () => { const a = $('#pinNew').value.trim(), b = $('#pinNew2').value.trim(); if (!/^\d{4}$/.test(a)) { toast('Use 4 numbers'); return; } if (a !== b) { toast('The two codes don’t match'); return; } if (a === MASTER_CODE) { toast('Please choose a different code'); return; } if (!$('#pinAck').checked) { toast('Please confirm you’ve saved your code'); return; } try { localStorage.setItem(PIN_KEY, a); } catch { } toast(`Parent code saved: ${a} — don’t forget it!`); showParentDashboard(); };
  }
}
function lastReadDay(p) { const days = Object.keys(p.dailyPass || {}).sort(); return days[days.length - 1] || null; }
function niceDay(key) { if (!key) return 'Not yet'; const t = todayKey(); if (key === t) return 'Today'; if (key === addDays(t, -1)) return 'Yesterday'; return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function showParentDashboard(focusId) {
  const kids = state.profiles; if (!kids.length) { openModal(`${header('PARENTS', 'Parent dashboard')}<div class="notice">No explorers on this device yet. Create one from Profiles.</div>`); return; }
  const cards = kids.map(k => {
    k.completed = k.completed || []; k.dailyPass = k.dailyPass || {};
    const read = Math.min(28, k.completed.length), s = streak(k), last = lastReadDay(k), lastCh = last ? k.dailyPass[last] : null;
    const week = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - new Date(`${todayKey()}T12:00:00`).getDay())).map(d => `<span class="pd-day ${k.dailyPass[d] != null ? 'on' : ''} ${d > todayKey() ? 'future' : ''}" title="${d}">${new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`).join('');
    const talkCh = lastCh || (k.completed.length ? Math.max(...k.completed) : 1);
    return `<section class="pd-kid" id="pd-${k.id}">
      <div class="pd-head"><span class="profile-avatar ${k.gender === 'girl' ? 'girl' : 'boy'}"></span><div><b>${escapeHtml(fullName(k))}</b><small>Age ${k.age}${k.grade ? ' · ' + escapeHtml(k.grade) : ''} · ${k.age <= 6 ? 'reads one verse a day' : 'reads one chapter a day'}</small><button class="text-button pd-edit" data-editkid="${k.id}">Edit details & consent</button></div><span class="pd-streak">🔥 ${s} day${s === 1 ? '' : 's'} in a row</span></div>
      <div class="pd-progress"><div class="book-progress-top"><span>Book of Matthew</span><b>${read} / 28 chapters</b></div><div class="book-track"><span style="width:${read / 28 * 100}%"></span></div></div>
      <p class="pd-last">Last read: <b>${niceDay(last)}${lastCh ? ` · Matthew ${lastCh}` : ''}</b></p>
      <div class="pd-week"><small>Days read this week</small><div>${week}</div></div>
      ${k.shareWith ? `<div class="notice">💬 ${escapeHtml(k.name)} wants to tell <b>${escapeHtml(k.shareWith)}</b> about Jesus. Help them make a plan this week!</div>` : ''}
      <div class="pd-tabs" role="tablist"><button class="pd-tab active" data-pdtab="said" data-kid="${k.id}">💛 What they said${(k.journal || []).length - (k.journalSeen || 0) > 0 ? ` <span class="pd-new">${(k.journal || []).length - (k.journalSeen || 0)}</span>` : ''}</button><button class="pd-tab" data-pdtab="talk" data-kid="${k.id}">💬 Questions to reflect</button></div>
      <div class="pd-pane" data-pane="said-${k.id}">${journalHtml(k)}</div>
      <div class="pd-pane hidden" data-pane="talk-${k.id}"><div class="pd-talk"><div class="pd-talk-head"><b>Talk together</b><select data-talk="${k.id}" aria-label="Choose a chapter">${QUESTIONS.map((q, i) => `<option value="${i + 1}" ${i + 1 === talkCh ? 'selected' : ''}>Matthew ${i + 1}${k.completed.includes(i + 1) ? ' ✓' : ''}</option>`).join('')}</select></div>
        <div class="pd-q" data-q="${k.id}">${talkHtml(talkCh)}</div></div></div>
    </section>`;
  }).join('');
  openModal(`${header('PARENTS', 'Parent dashboard')}<p>See how your kids are doing, hear what they shared, and use the questions to talk together. Ask, listen, and share what God is teaching you too!</p>${cards}<button id="pdInstall" class="button secondary wide pd-install">📲 Save to home screen</button><div class="pd-foot"><button id="pdChangePin" class="text-button">Change parent code</button><a class="text-button" href="qa.html" target="_blank" rel="noopener">All questions & answers →</a></div>`);
  $('#modalCard').querySelectorAll('[data-pdtab]').forEach(b => b.onclick = () => { const kid = b.dataset.kid; $('#modalCard').querySelectorAll(`[data-kid="${kid}"]`).forEach(x => x.classList.toggle('active', x === b)); ['said', 'talk'].forEach(t => $('#modalCard').querySelector(`[data-pane="${t}-${kid}"]`).classList.toggle('hidden', t !== b.dataset.pdtab)); });
  $('#modalCard').querySelectorAll('[data-editkid]').forEach(b => b.onclick = () => showDetails(state.profiles.find(x => x.id === b.dataset.editkid), () => showParentDashboard(b.dataset.editkid)));
  $('#modalCard').querySelectorAll('[data-talk]').forEach(sel => sel.onchange = () => { $('#modalCard').querySelector(`[data-q="${sel.dataset.talk}"]`).innerHTML = talkHtml(Number(sel.value)); });
  $('#modalCard').querySelectorAll('[data-clip]').forEach(async el => { try { const b = await VoiceStore.get(el.dataset.clip); if (b) el.src = URL.createObjectURL(b); else el.replaceWith(Object.assign(document.createElement('small'), { textContent: '(recording not found on this device)' })); } catch { } });
  $('#modalCard').querySelectorAll('[data-deljournal]').forEach(b => b.onclick = () => { const [kid, id] = b.dataset.deljournal.split('|'), k = state.profiles.find(x => x.id === kid); if (!k || !confirmDelete(b)) return; k.journal = (k.journal || []).filter(e => e.id !== id); VoiceStore.del(id).catch(() => { }); save(); showParentDashboard(kid); });
  $('#modalCard').querySelectorAll('[data-morejournal]').forEach(b => b.onclick = () => { b.closest('.pd-journal').classList.add('all'); b.remove(); });
  kids.forEach(k => { k.journalSeen = (k.journal || []).length; }); save();
  $('#pdInstall').onclick = () => showInstall(() => showParentDashboard());
  $('#pdChangePin').onclick = () => { try { localStorage.removeItem(PIN_KEY); } catch { } showParentsGate(); };
  if (focusId) document.getElementById('pd-' + focusId)?.scrollIntoView();
}
function confirmDelete(b) { if (b.dataset.armed) return true; b.dataset.armed = 1; b.textContent = 'Tap again to delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000); return false; }
function journalHtml(k) {
  const j = (k.journal || []).slice().reverse(); if (!j.length) return `<div class="pd-journal empty"><b>💛 What ${escapeHtml(k.name)} shared</b><small>After reading, ${escapeHtml(k.name)} gets a question, a prayer break or a message to record for you. Their answers will show up here.</small></div>`;
  const fresh = j.length - (k.journalSeen || 0);
  return `<div class="pd-journal"><div class="pd-journal-head"><b>What ${escapeHtml(k.name)} shared after reading</b></div>${j.map((e, i) => `<div class="pd-entry ${i >= 4 ? 'more' : ''}"><small>${niceDay(e.date)} · after reading Matthew ${e.ch}</small><div class="pd-asked"><span>We asked them:</span><p>${escapeHtml(e.prompt)}</p></div><div class="pd-said"><span>They said:</span>${e.audio ? `<audio controls preload="metadata" data-clip="${e.id}"></audio>` : ''}${e.text ? `<p>“${escapeHtml(e.text)}”${e.text2 ? `<br>🙏 “${escapeHtml(e.text2)}”` : ''}</p>` : ''}</div><button class="text-button pd-del" data-deljournal="${k.id}|${e.id}">Delete</button></div>`).join('')}${j.length > 4 ? '<button class="text-button" data-morejournal>Show all</button>' : ''}</div>`;
}
function talkHtml(n) {
  const q = QUESTIONS[n - 1], t = PARENT_TALK[n] || [];
  return `<p class="pd-chapter">Matthew ${n} · ${escapeHtml(q.title)} · <span>verse for little ones: ${n}:${q.verse}</span></p><ol>${t.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>`;
}

function showGrownUps() {
  if (!isMaster()) {
    openModal(`${header('GROWN-UPS', 'Enter the test code')}<p>For parents and testers. The code turns on test mode on this device.</p><label class="field">Code<input id="masterCode" inputmode="numeric" maxlength="8" autocomplete="off"></label><button id="masterGo" class="button primary wide">Unlock test mode</button>`);
    const go = () => { if ($('#masterCode').value.trim() === MASTER_CODE) { state.master = true; save(); render(); showGrownUps(); } else toast('That code isn’t right'); };
    $('#masterGo').onclick = go; $('#masterCode').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#masterCode').focus();
    return;
  }
  const p = profile();
  openModal(`${header('TEST MODE', 'Grown-up tools')}<p>Test mode is on for this device. Every look, decoration, and Sky Run is unlocked, and quizzes can be skipped. Skipping a quiz <b>does</b> mark the chapter as read for the current explorer, so use a test explorer for that.</p>${p ? `<div class="builder-section"><b>Preview home stage (not saved)</b><div class="test-row">${HOME_NAMES.map((n, i) => `<button class="button small ${homeStage(p) === i ? 'dark' : 'secondary'}" data-stage="${i}">${n}</button>`).join('')}<button class="button small ghost" data-stage="-1">Real</button></div></div><div class="builder-section"><b>Preview streak flame (not saved)</b><div class="test-row"><input type="range" id="testFlame" min="0" max="30" step="1" value="${testView.streak ?? streak(p)}" style="flex:1"><b id="testFlameN">${testView.streak ?? streak(p)} days</b><button class="button small ghost" id="testFlameReal">Real</button></div><div class="test-row">${[0, 1, 3, 7, 14, 28].map(n => `<button class="button small secondary" data-flame="${n}">${n}</button>`).join('')}</div></div><div class="builder-section"><b>Try the kids’ pop-ups (answers are saved for the current explorer)</b><div class="test-row">${HEART_MOMENTS.map((m, i) => `<button class="button small secondary" data-tryhm="${i}">${i + 1}. ${m.kind === 'record' ? '🎤' : m.kind === 'pray' ? '🙏' : '✏️'} ${escapeHtml(m.prompt.split('?')[0].slice(0, 34))}…</button>`).join('')}</div><b style="display:block;margin-top:8px">Bonus questions (question 4 of the quiz)</b><div class="test-row">${Object.keys(REFLECT).map(c => `<button class="button small secondary" data-trybonus="${c}">Matthew ${c}</button>`).join('')}</div><div class="test-row"><button class="button small dark" id="tryWelcome">Replay new-day welcome 🔥</button><button class="button small dark" id="tryParents">See answers in parent dashboard →</button><button class="button small ghost" id="tryAge">Showing ages ${p && p.age <= 6 ? '4–6' : '7–12'} version — explorer age decides</button></div></div><div class="builder-section"><b>Reading</b><div class="test-row"><button id="testMap" class="button small secondary">Open any chapter</button><button id="testHomeQuiz" class="button small secondary">Try a home quiz</button></div></div>` : ''}<div class="builder-section"><b>Sky Run</b><p class="fineprint">Start Sky Run normally — test options (start at 2,000 for the UFO, unlimited hearts, Bible pages) appear on its start screen.</p></div><a class="button secondary wide" href="qa.html" target="_blank" rel="noopener" style="text-decoration:none;text-align:center;display:block;margin-bottom:10px">Check all quiz questions (one page) →</a><button id="masterOff" class="button secondary wide">Turn off test mode</button>`);
  $('#modalCard').querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { const v = Number(b.dataset.stage); testView.homeStage = v < 0 ? null : v; render(); showGrownUps(); });
  const setFlame = v => { testView.streak = v; $('#testFlameN').textContent = v == null ? 'real' : `${v} days`; render(); };
  $('#testFlame')?.addEventListener('input', e => setFlame(Number(e.target.value)));
  $('#modalCard').querySelectorAll('[data-flame]').forEach(b => b.onclick = () => { $('#testFlame').value = b.dataset.flame; setFlame(Number(b.dataset.flame)); });
  $('#testFlameReal')?.addEventListener('click', () => setFlame(null));
  $('#modalCard').querySelectorAll('[data-tryhm]').forEach(b => b.onclick = () => showHeartMoment(p, 1, () => { toast('Saved — see it in Parents → What they said'); showGrownUps(); }, HEART_MOMENTS[Number(b.dataset.tryhm)]));
  $('#modalCard').querySelectorAll('[data-trybonus]').forEach(b => b.onclick = () => { quiz = { mode: 'daily', chapter: Number(b.dataset.trybonus), score: 3, test: true, questions: [] }; showBonus(p, Number(b.dataset.trybonus), () => showGrownUps(), true); });
  $('#tryWelcome')?.addEventListener('click', () => { closeModal(); p.lastWelcome = null; maybeWelcome(p); });
  $('#tryParents')?.addEventListener('click', () => showParentDashboard(p?.id));
  $('#testMap')?.addEventListener('click', showChapters);
  $('#testHomeQuiz')?.addEventListener('click', () => { const sorted = [...p.completed].sort((a, b) => a - b); const ch = sorted.length >= 3 ? sorted.slice(0, 3) : [1, 2, 3]; startQuiz({ mode: 'review', chapters: ch, test: true }); });
  $('#masterOff').onclick = () => { state.master = false; testView.homeStage = null; testView.streak = null; save(); closeModal(); render(); };
}

// ---------- Sound settings ----------
function showSettings() {
  const s = SkyAudio.settings, T = SkyAudio.TRACKS;
  const sw = (id, on, label) => `<label class="setting-row"><span>${label}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''} class="switch"></label>`;
  openModal(`${header('SETTINGS', 'Sound & music')}<p>These settings are saved on this device.</p>
    ${sw('setMusic', s.music, '🎵 Music')}
    <label class="setting-row"><span>Music volume</span><input type="range" id="setMusicVol" min="0" max="1" step="0.05" value="${s.musicVol}"></label>
    ${sw('setSfx', s.sfx, '🔔 Sound effects')}
    <label class="setting-row"><span>Effects volume</span><input type="range" id="setSfxVol" min="0" max="1" step="0.05" value="${s.sfxVol}"></label>
    <label class="field">Home music<select id="setHome"><option value="rmb26">${T.rmb26.name}</option><option value="home">${T.home.name}</option><option value="off">Off</option></select></label>
    <label class="field">Sky Run music<select id="setRun"><option value="skyrun">Sky Run adventure</option><option value="retro">Retro arcade</option></select></label>
    <button id="setDone" class="button primary wide">Done</button>`);
  $('#setHome').value = s.homeTrack; $('#setRun').value = s.runTrack;
  const upd = () => { SkyAudio.update({ music: $('#setMusic').checked, sfx: $('#setSfx').checked, musicVol: Number($('#setMusicVol').value), sfxVol: Number($('#setSfxVol').value), homeTrack: $('#setHome').value, runTrack: $('#setRun').value }); window.paintMute?.(); };
  ['#setMusic', '#setSfx', '#setMusicVol', '#setSfxVol'].forEach(k => $(k).oninput = upd);
  $('#setSfx').onchange = () => { upd(); SkyAudio.sfx('tap'); };
  $('#setHome').onchange = () => { upd(); SkyAudio.scene('home'); };
  $('#setRun').onchange = upd;
  $('#setDone').onclick = closeModal;
}

// ---------- Wiring ----------
$('#settingsButton').onclick = showSettings;
document.addEventListener('pointerdown', e => {
  SkyAudio.unlock();
  if (!window.__musicStarted && profile() && $('#gameLayer').classList.contains('hidden')) { window.__musicStarted = true; if ($('#modalLayer').classList.contains('hidden')) SkyAudio.scene('home'); }
  if (e.target.closest('.button, .text-button, .wardrobe-tab, .cosmetic-card, .decor-choice, .hairstyle-choice, .builder-choice, .chapter-tile')) SkyAudio.sfx('tap');
}, true);
$('#profileButton').onclick = showProfiles;
$('#primaryButton').onclick = () => !freshLanding && profile() ? $('#dashboard').scrollIntoView({ behavior: 'smooth' }) : showProfiles();
$('#howButton').onclick = showHow;
$('#readTodayButton').onclick = () => { const p = profile(); if (p) showReading(todayChapter(p)); };
$('#mapButton').onclick = showChapters;
$('#customizeButton').onclick = showCustomize;
$('#playButton').onclick = () => openGame();
$('#grownUpsButton').onclick = () => isMaster() ? showGrownUps() : showParentsGate();
$('#parentsButton').onclick = showParentsGate;
$('#homeQuizButton').onclick = startHomeQuiz;
$('#homeViewButton').onclick = () => { const p = profile(); if (p) { p.homeInside = !p.homeInside; save(); renderHome(p); } };
$('#homeDecorButton').onclick = showHomeDecor;
$('#modalLayer .modal-backdrop').onclick = closeModal;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); if (!$('#gameLayer').classList.contains('hidden')) closeGame(); } });
(function setupHomeDragging() {
  const scene = $('#homeScene'); let drag = null;
  scene.addEventListener('pointerdown', e => { const piece = e.target.closest('[data-item]'); if (!piece) return; drag = piece; scene.setPointerCapture(e.pointerId); e.preventDefault(); });
  scene.addEventListener('pointermove', e => {
    if (!drag) return; const box = scene.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, (e.clientX - box.left) / box.width * 100)), y = Math.max(58, Math.min(drag.dataset.item === 'rug' ? 99 : 92, (e.clientY - box.top) / box.height * 100));
    drag.style.left = `${x}%`; drag.style.top = `${y}%`; if (drag.dataset.item !== 'rug') drag.style.zIndex = Math.round(y);
  });
  const end = () => {
    if (!drag) return; const p = profile(), key = drag.dataset.kind === 'exterior' ? 'outdoorPositions' : 'decorPositions';
    SkyAudio.sfx('place'); p[key] = p[key] || {}; p[key][drag.dataset.item] = { x: parseFloat(drag.style.left) || 50, y: parseFloat(drag.style.top) || 75 }; save(); drag = null;
  };
  scene.addEventListener('pointerup', end); scene.addEventListener('pointercancel', end);
})();
