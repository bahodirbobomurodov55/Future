/* Static tracker: local backup + local encrypted file sync. Entries can only be created for today. */
const STORE = 'daily_activity_data_v1';
const STORE_ENCRYPTED = 'daily_activity_data_v1_encrypted';
localStorage.removeItem('encryption_password'); // 3.1 clear old
const PREFS = 'daily_activity_preferences_v1';
const MONTHS = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
const WEEKDAYS = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
const PALETTE = ['#43c987','#55b5e9','#a782e3','#e7bd5c','#ea7f93','#70cbbb','#ef9663'];
const $ = (selector) => document.querySelector(selector);

// XAVFSIZLIK: qaytariladigan qiymat style="background:${...}" ichiga escape
// qilinmasdan tushadi. Shuning uchun faqat qat'iy #rrggbb formatiga ruxsat —
// fayldan yuklangan buzuq tagColors atribut breakout/XSS qila olmaydi.
function normalizeState(value) {
  const state = {
    activities: Object.create(null),
    roadmap: Object.create(null),
    timeEntries: Object.create(null),
    appUsage: Object.create(null),
    achievements: [],
    tagColors: Object.create(null)
  };
  
  if (!value || typeof value !== 'object') return state;
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  function isValidDateStr(d) { 
    if (!dateRegex.test(d)) return false; 
    const date = new Date(d); 
    return !isNaN(date.getTime()) && d === date.toISOString().slice(0, 10); 
  }
  
  const idRegex = /^[\w-]+$/;
  function validId(id) { return typeof id === 'string' && id.length <= 64 && idRegex.test(id); }
  function trimTo(str, len) { return typeof str === 'string' ? str.trim().slice(0, len) : ''; }
  function repairTime(t) {
    if (typeof t !== 'string') return "12:00";
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return t;
    const match = t.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      let h = parseInt(match[1]), m = parseInt(match[2]);
      if (t.toLowerCase().includes('pm') && h < 12) h += 12;
      if (t.toLowerCase().includes('am') && h === 12) h = 0;
      return `${String(Math.min(23, Math.max(0, h))).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    return "12:00";
  }
  
  if (value.tagColors && typeof value.tagColors === 'object') {
    for (const [tag, color] of Object.entries(value.tagColors)) {
      if (typeof tag === 'string' && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
        state.tagColors[trimTo(tag, 30)] = color;
      }
    }
  }
  
  const acts = value.activities || value;
  if (acts && typeof acts === 'object') {
    for (const [dKey, entries] of Object.entries(acts)) {
      if (isValidDateStr(dKey) && Array.isArray(entries)) {
        const validEntries = entries.map(e => {
          if (!e || typeof e !== 'object' || !validId(e.id)) return null;
          return {
            id: e.id,
            time: repairTime(e.time),
            title: trimTo(e.title, 120),
            description: trimTo(e.description, 600),
            tag: trimTo(e.tag, 30)
          };
        }).filter(Boolean);
        if (validEntries.length) state.activities[dKey] = validEntries;
      }
    }
  }

  if (value.roadmap && typeof value.roadmap === 'object') {
    for (const [dKey, tasks] of Object.entries(value.roadmap)) {
      if (isValidDateStr(dKey) && Array.isArray(tasks)) {
        const validTasks = tasks.map(t => {
          if (!t || typeof t !== 'object' || !validId(t.id)) return null;
          return {
            id: t.id,
            title: trimTo(t.title, 120),
            tag: trimTo(t.tag, 30),
            done: !!t.done,
            migrated: !!t.migrated,
            completedEntryId: validId(t.completedEntryId) ? t.completedEntryId : null
          };
        }).filter(Boolean);
        if (validTasks.length) state.roadmap[dKey] = validTasks;
      }
    }
  }

  if (value.timeEntries && typeof value.timeEntries === 'object') {
    for (const [dKey, entries] of Object.entries(value.timeEntries)) {
      if (isValidDateStr(dKey) && Array.isArray(entries)) {
        const validEntries = entries.map(e => {
          if (!e || typeof e !== 'object' || !validId(e.id)) return null;
          const dur = Number(e.duration);
          return {
            id: e.id,
            tag: trimTo(e.tag, 30),
            description: trimTo(e.description, 600),
            startTime: typeof e.startTime === 'string' ? e.startTime : null,
            endTime: typeof e.endTime === 'string' ? e.endTime : null,
            duration: (Number.isFinite(dur) && dur >= 0 && dur <= 86400) ? dur : 0
          };
        }).filter(Boolean);
        if (validEntries.length) state.timeEntries[dKey] = validEntries;
      }
    }
  }

  if (value.appUsage && typeof value.appUsage === 'object') {
    for (const [dKey, apps] of Object.entries(value.appUsage)) {
      if (isValidDateStr(dKey) && Array.isArray(apps)) {
        const validApps = apps.map(a => {
          if (!a || typeof a !== 'object') return null;
          const dur = Number(a.duration);
          return {
            app: trimTo(a.app, 120),
            category: trimTo(a.category, 30),
            icon: trimTo(a.icon, 4),
            duration: (Number.isFinite(dur) && dur >= 0 && dur <= 86400) ? dur : 0
          };
        }).filter(Boolean);
        if (validApps.length) state.appUsage[dKey] = validApps;
      }
    }
  }

  if (Array.isArray(value.achievements)) {
    state.achievements = value.achievements.map(a => {
      if (a && typeof a === 'object' && typeof a.id === 'string') {
        return { id: a.id, unlockedAt: typeof a.unlockedAt === 'string' ? a.unlockedAt : '' };
      }
      return null;
    }).filter(Boolean);
  }

  return state;
}

let state = normalizeState(safeParse(localStorage.getItem(STORE)) || {});
let data = state.activities;
let shownYear = new Date().getFullYear();
let selectedTag = '';
let searchRange = 'all';
let lastAddedKey = '';
const toastQueue = [];
let toastShowing = false;

// Flags for safe file sync
let currentFileHandle = null;
let pendingFileHandle = null;
let pendingEncryptedData = null;
let pendingUnencryptedData = null;
let isNewFileMode = false;
let isFileLoadedFromFile = false;
let isFileAuthenticated = false;
let filePermissionNeeded = false;

function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
const todayKey = () => dateKey(new Date());
function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
function preferences() { return { goal:Number(localStorage.getItem('monthly_goal') || 0), reduceMotion:localStorage.getItem('reduce_motion')==='true', sound:localStorage.getItem('sound_enabled')==='true', summaries:localStorage.getItem('summaries_enabled')!=='false' }; }
function saveLocal() {
  state.activities = data;
  const password = getSavedPassword();
  if (password && isFileAuthenticated) {
    localStorage.removeItem(STORE);
    return;
  }
  localStorage.setItem(STORE, JSON.stringify(state));
}
function localDate(key) { return new Date(`${key}T12:00:00`); }
function formatDate(key) { return new Intl.DateTimeFormat('uz-UZ', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(localDate(key)); }
function escapeHtml(value='') { const d=document.createElement('div'); d.textContent=value; return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function tagColor(tag) { if(state.tagColors[tag])return state.tagColors[tag]; let n=0; for (const char of tag) n=char.charCodeAt(0)+((n<<5)-n); return PALETTE[Math.abs(n)%PALETTE.length]; }
function eventLevel(entries) { return entries.length >= 3 ? 3 : entries.length; }
function setSync(syncState, text) { const el=$('#syncStatus'); if(el){ el.className=`sync-status ${syncState}`; el.textContent=({saved:'🟢',syncing:'🟡',error:'🔴'})[syncState]+' '+text; } }
function notify(text) { queueToast('Bildirishnoma', text); }
function queueToast(title, detail='') { toastQueue.push({title,detail}); showNextToast(); }
function showNextToast() { if(toastShowing||!toastQueue.length)return;toastShowing=true;const {title,detail}=toastQueue.shift(),toast=document.createElement('div');toast.className='toast';toast.innerHTML=`<strong>${escapeHtml(title)}</strong>${detail?`<span>${escapeHtml(detail)}</span>`:''}`;$('#toastStack').append(toast);setTimeout(()=>{toast.remove();toastShowing=false;showNextToast();},3800); }
function currentStreak() { let run=0; let d=new Date(); if(!(data[dateKey(d)]||[]).length)d.setDate(d.getDate()-1); while((data[dateKey(d)]||[]).length){run++;d.setDate(d.getDate()-1);} return run; }
function playDing() { if (!preferences().sound) return; try { const audio=new (window.AudioContext||window.webkitAudioContext)(), oscillator=audio.createOscillator(), gain=audio.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(660,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(880,audio.currentTime+.18);gain.gain.setValueAtTime(.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.06,audio.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.25);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.26); } catch {} }
function confetti() { if(preferences().reduceMotion)return;const layer=$('#confettiLayer'), colors=['#08df93','#e7cc64','#76d18b','#55b5e9','#f17e91'];for(let i=0;i<36;i++){const bit=document.createElement('i');bit.className='confetti';bit.style.background=colors[i%colors.length];bit.style.left=`${45+Math.random()*10}%`;bit.style.top='38%';bit.style.setProperty('--dx',`${(Math.random()-.5)*480}px`);bit.style.setProperty('--dy',`${180+Math.random()*300}px`);bit.style.animationDelay=`${Math.random()*.16}s`;layer.append(bit);setTimeout(()=>bit.remove(),1800);}}

// === IndexedDB — FileSystemFileHandle saqlash ===
const HANDLE_DB = 'activity_file_handles';
const HANDLE_STORE_NAME = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle) {
  if (!handle) return;
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    tx.objectStore(HANDLE_STORE_NAME).put(handle, 'fileHandle');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = tx.objectStore(HANDLE_STORE_NAME).get('fileHandle');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// === File System Access API ===
function isFileApiSupported() { return 'showOpenFilePicker' in window || 'showSaveFilePicker' in window; }

async function pickFile(mode = 'open') {
  try {
    let handle;
    if (mode === 'save') {
      handle = await window.showSaveFilePicker({ types: [{ description: 'JSON fayl (*.json)', accept: { 'application/json': ['.json'] } }], excludeAcceptAllOption: true });
    } else {
      [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON fayl (*.json)', accept: { 'application/json': ['.json'] } }], excludeAcceptAllOption: true });
    }
    await saveHandle(handle);
    return handle;
  } catch (error) {
    return null; // 3.7 Cancel must not fall through
  }
}

async function ensurePermission(handle) {
  if (!handle) return false;
  try {
    if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
    return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
  } catch { return false; }
}

async function writeEncryptedFile(handle, encryptedObj) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(encryptedObj));
  await writable.close();
}

async function readEncryptedFile(handle) {
  if (!handle) return { status: 'EMPTY' };
  try {
    const hasPerm = await ensurePermission(handle);
    if (!hasPerm) return { status: 'PERMISSION_DENIED' };

    const file = await handle.getFile();
    const text = await file.text();
    if (!text || !text.trim()) return { status: 'EMPTY' };

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.salt) && Array.isArray(parsed.iv) && Array.isArray(parsed.data)) {
      return { status: 'ENCRYPTED', data: parsed };
    }
    if (parsed && (parsed.activities || typeof parsed === 'object')) {
      return { status: 'UNENCRYPTED', data: parsed };
    }
    return { status: 'INVALID' };
  } catch (err) {
    return { status: 'ERROR', error: err };
  }
}

// === Web Crypto API — AES-GCM 256-bit shifrlash ===
async function deriveKey(password, salt, iterations = 600000) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 600000);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    version: 1,
    iterations: 600000,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext))
  };
}

async function decryptData(encryptedObj, password) {
  const salt = new Uint8Array(encryptedObj.salt);
  const iv = new Uint8Array(encryptedObj.iv);
  const ciphertext = new Uint8Array(encryptedObj.data);
  const iterations = encryptedObj.iterations || 100000;
  const key = await deriveKey(password, salt, iterations);
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('DECRYPT_FAILED');
  }
}

// Parolni localStorage'da saqlash
let sessionPassword = null;
function saveEncryptionPassword(password) { sessionPassword = password; localStorage.setItem('saved_password', password); }
function getSavedPassword() { return sessionPassword || localStorage.getItem('saved_password'); }
function clearEncryptionPassword() { sessionPassword = null; localStorage.removeItem('saved_password'); }

// Mahalliy shifrlangan ma'lumotlarni o'qish (agar mavjud bo'lsa)
async function tryLoadFromLocalEncrypted() {
  const encStr = localStorage.getItem(STORE_ENCRYPTED);
  if (!encStr) return false;
  const password = getSavedPassword();
  if (!password) return false;
  try {
    const encObj = safeParse(encStr);
    if (!encObj) return false;
    const plaintext = await decryptData(encObj, password);
    const parsed = safeParse(plaintext);
    if (parsed) {
      state = normalizeState(parsed);
      data = state.activities;
      localStorage.removeItem(STORE);
      return true;
    }
  } catch (e) {
    console.warn('Mahalliy shifrlangan ma\'lumotlarni ochib bo\'lmadi:', e);
  }
  return false;
}

// === Saqlash va yuklash orchestratsiyasi ===

// Fayl tanlanganda darhol ishga tushadigan orchestratsiya
async function onFileSelected(handle) {
  if (!handle) return;
  pendingFileHandle = handle;
  pendingEncryptedData = null;
  pendingUnencryptedData = null;
  // isFileAuthenticated = false; preserved previous state

  const result = await readEncryptedFile(handle);
  closeModal('settingsModal');

  const fileInfo = await handle.getFile().catch(() => null);
  const filename = fileInfo ? fileInfo.name : 'activity-data.json';

  const errorBox = $('#filePasswordModalError');
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  if (result.status === 'INVALID' || result.status === 'PERMISSION_DENIED' || result.status === 'ERROR') {
    notify("Faylni o'qib bo'lmadi yoki fayl formati noto'g'ri.");
    queueToast("❌ Fayl formati noto'g'ri", "Faylni o'qib bo'lmadi");
    pendingFileHandle = null;
    return;
  }

  if (result.status === 'EMPTY') {
    // === CASE A: Truly Empty File ===
    isNewFileMode = true;
    pendingEncryptedData = null;
    pendingUnencryptedData = null;
    $('#filePasswordModalTitle').textContent = "🆕 Bu fayl bo'sh — shifrlash uchun yangi parol o'rnating";
    $('#filePasswordModalSubtext').textContent = `"${filename}" fayli bo'sh. Uni himoyalash uchun yangi shifrlash paroli o'rnating.`;
    $('#newFilePasswordFields').classList.remove('hidden');
    $('#existingFilePasswordFields').classList.add('hidden');
    $('#filePasswordSubmitBtn').textContent = "🔒 Yangi parolni saqlash";
    $('#newPasswordInput').value = '';
    $('#confirmPasswordInput').value = '';
    openModal('filePasswordModal');
    setTimeout(() => $('#newPasswordInput').focus(), 150);
  } else if (result.status === 'ENCRYPTED') {
    // === CASE B: Existing Encrypted File ===
    isNewFileMode = false;
    pendingEncryptedData = result.data;
    pendingUnencryptedData = null;
    $('#filePasswordModalTitle').textContent = "🔒 Bu faylda ma'lumot bor — deshifrlash uchun parolni kiriting";
    $('#filePasswordModalSubtext').textContent = `"${filename}" faylida ma'lumotlar mavjud. Ochish uchun shifrlash parolini kiriting.`;
    $('#existingFilePasswordFields').classList.remove('hidden');
    $('#newFilePasswordFields').classList.add('hidden');
    $('#filePasswordSubmitBtn').textContent = "🔓 Ochish va tiklash";
    $('#existingPasswordInput').value = '';
    openModal('filePasswordModal');
    setTimeout(() => $('#existingPasswordInput').focus(), 150);
  } else if (result.status === 'UNENCRYPTED') {
    if (getSavedPassword() || localStorage.getItem(STORE_ENCRYPTED)) {
      $('#filePasswordModalTitle').textContent = "⚠️ Shifrlanmagan fayl - import qilasizmi?";
      $('#filePasswordModalSubtext').textContent = `"${filename}" fayli shifrlanmagan. Davom etsangiz, u joriy parolingiz bilan shifrlanadi.`;
      $('#existingFilePasswordFields').classList.add('hidden');
      $('#newFilePasswordFields').classList.add('hidden');
      $('#filePasswordSubmitBtn').textContent = "Import qilish va shifrlash";
      
      // Override submit temporarily to just accept
      pendingUnencryptedData = result.data;
      isNewFileMode = false;
      openModal('filePasswordModal');
      
      const form = $('#filePasswordForm');
      form.onsubmit = async (e) => {
        e.preventDefault();
        state = normalizeState(pendingUnencryptedData);
        data = state.activities;
        isFileAuthenticated = true;
        isFileLoadedFromFile = true;
        await saveToFile();
        render();
        closeModal('filePasswordModal');
        setSync('saved', 'Import qılındi');
        queueToast("✅ Ma'lumotlar import qilindi va shifrlandi");
        
        // Restore normal onsubmit logic for filePasswordForm
        location.reload(); // simple way to restore handlers
      };
      return;
    }
    // === CASE C: Legacy Unencrypted Data File ===
    isNewFileMode = false;
    pendingEncryptedData = null;
    pendingUnencryptedData = result.data;
    $('#filePasswordModalTitle').textContent = "🔒 Bu faylda ma'lumotlar bor — shifrlash uchun parolni kiriting";
    $('#filePasswordModalSubtext').textContent = `"${filename}" faylida shifrlanmagan ma'lumotlar bor. Ularni himoyalash uchun parol o'rnating.`;
    $('#existingFilePasswordFields').classList.remove('hidden');
    $('#newFilePasswordFields').classList.add('hidden');
    $('#filePasswordSubmitBtn').textContent = "🔒 Shifrlash va saqlash";
    $('#existingPasswordInput').value = '';
    openModal('filePasswordModal');
    setTimeout(() => $('#existingPasswordInput').focus(), 150);
  }
}

// Faylga shifrlangan ma'lumotlarni yozish
let _savePending = false;
let _saveQueued = false;

async function saveToFile() {
  if (_savePending) { _saveQueued = true; return; }
  _savePending = true;
  const password = getSavedPassword();
  if (!password || !isFileAuthenticated) {
    saveLocal();
    setSync('saved', 'Mahalliy saqlangan');
    _savePending = false;
    return;
  }

  try {
    setSync('syncing', 'Saqlanmoqda...');
    const plaintext = JSON.stringify(state, null, 2);
    const encrypted = await encryptData(plaintext, password);
    localStorage.setItem(STORE_ENCRYPTED, JSON.stringify(encrypted));
    localStorage.removeItem(STORE);

    if (!isFileApiSupported() || !currentFileHandle) {
      setSync('saved', 'Mahalliy saqlangan');
      return;
    }

    const hasPermission = await ensurePermission(currentFileHandle);
    if (!hasPermission) {
      filePermissionNeeded = true;
      setSync('error', 'Ruxsat berilmadi');
      return;
    }
    filePermissionNeeded = false;

    await writeEncryptedFile(currentFileHandle, encrypted);
    setSync('saved', 'Saqlangan');
  } catch (error) {
    setSync('error', 'Xatolik');
    notify('Faylga yozishda xatolik: ' + error.message);
  } finally {
    _savePending = false;
    if (_saveQueued) { _saveQueued = false; saveToFile(); }
  }
}

// Fayldan ma'lumotlarni o'qish va tiklash (dastlabki yuklanishda)
async function loadFromFile(handle) {
  if (!isFileApiSupported()) { setSync('saved', 'Mahalliy saqlangan'); return; }
  try {
    if (!handle) {
      handle = await loadHandle();
    }
    if (!handle) {
      isFileAuthenticated = false;
      setSync('saved', 'Fayl tanlanmagan');
      renderBanners();
      return;
    }
    currentFileHandle = handle;
    const password = getSavedPassword();
    if (!password) {
      isFileAuthenticated = false;
      setSync('saved', 'Parol kerak');
      renderBanners();
      return;
    }

    const hasPermission = await ensurePermission(handle);
    if (!hasPermission) {
      filePermissionNeeded = true;
      isFileAuthenticated = false;
      setSync('saved', 'Mahalliy saqlangan');
      renderBanners();
      return;
    }
    filePermissionNeeded = false;

    setSync('syncing', 'Yuklanmoqda...');
    const result = await readEncryptedFile(handle);
    if (result.status === 'EMPTY') {
      isFileAuthenticated = true;
      isFileLoadedFromFile = true;
      await saveToFile();
      setSync('saved', 'Saqlangan');
      renderBanners();
      return;
    }

    if (result.status !== 'ENCRYPTED' && result.status !== 'UNENCRYPTED') {
      isFileAuthenticated = false;
      setSync('saved', 'Fayl formati noto\'g\'ri');
      renderBanners();
      return;
    }

    // Direct silent load on page refresh (no animation delay, no toasts)
    let loaded = null;
    if (result.status === 'ENCRYPTED') {
      const plaintext = await decryptData(result.data, password);
      loaded = safeParse(plaintext);
    } else {
      loaded = safeParse(JSON.stringify(result.data));
    }

    if (loaded) {
      state = normalizeState(loaded);
      data = state.activities;
      isFileAuthenticated = true;
      isFileLoadedFromFile = true;
      if (password && result.status === 'ENCRYPTED') {
        localStorage.setItem(STORE_ENCRYPTED, JSON.stringify(result.data));
        localStorage.removeItem(STORE);
      } else {
        saveLocal();
      }
      render();
      setSync('saved', 'Saqlangan');
    } else {
      isFileAuthenticated = false;
      setSync('error', 'Format xatosi');
    }
    renderBanners();
    restoreTimerState();
  } catch (error) {
    if (error.message === 'DECRYPT_FAILED') {
      // clearEncryptionPassword(); // 3.5 Do not clear
      isFileAuthenticated = false;
      setSync('error', 'Parol xato');
      notify('Parol noto\'g\'ri yoki fayl buzilgan. Iltimos, parolni qayta kiriting.');
      queueToast('❌ Noto\'g\'ri parol', 'Saqlangan parol faylga mos kelmadi');
      await onFileSelected(currentFileHandle);
    } else {
      isFileAuthenticated = false;
      setSync('saved', 'Mahalliy saqlangan');
    }
  }
}

function render() {
  renderDashboard(); renderTracker(); renderAnalytics(); renderBanners(); renderAchievements();
}
function renderTracker() {
  $('#yearLabel').textContent=shownYear;
  const start=new Date(shownYear,0,1); start.setDate(start.getDate()-start.getDay());
  const end=new Date(shownYear,11,31); end.setDate(end.getDate()+(6-end.getDay()));
  const graph=$('#graph'); graph.innerHTML='';
  for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
    const key=dateKey(d), entries=data[key]||[], cell=document.createElement('button');
    cell.className=`cell level-${eventLevel(entries)}`; cell.type='button';
    cell.title=`${formatDate(key)} — ${entries.length} ta ish`; cell.setAttribute('aria-label',cell.title);
    if (selectedTag && !entries.some(entry=>entry.tag===selectedTag)) cell.classList.add('dim');
    if (key===lastAddedKey) { cell.classList.add('just-added'); setTimeout(()=>cell.classList.remove('just-added'),500); }
    cell.onclick=()=>openDay(key); graph.append(cell);
  }
  renderMonths(start); renderStats(); renderFilters();
}
function renderMonths(start) {
  const labels=$('#monthLabels'); labels.innerHTML='';
  MONTHS.forEach((month,index)=>{ const first=new Date(shownYear,index,1); const week=Math.floor((first-start)/(7*864e5)); const label=document.createElement('span'); label.className='month-label'; label.style.left=`${week*19}px`; label.textContent=month; labels.append(label); });
}
function entriesOfYear() { return Object.entries(data).filter(([key])=>Number(key.slice(0,4))===shownYear); }
function yearTotal() { return entriesOfYear().reduce((total,[,entries])=>total+entries.length,0); }
function monthlyTotals(year=shownYear) { const totals=Array(12).fill(0); Object.entries(data).forEach(([key,entries])=>{if(Number(key.slice(0,4))===year)totals[Number(key.slice(5,7))-1]+=entries.length;}); return totals; }
function longestStreak() { let longest=0, run=0; for(let d=new Date(shownYear,0,1);d<=new Date(shownYear,11,31);d.setDate(d.getDate()+1)){ if((data[dateKey(d)]||[]).length){run++;longest=Math.max(longest,run);}else run=0;} return longest; }
function renderStats() {
  const total=yearTotal(), now=new Date(), currentMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('#totalEvents').textContent=total; $('#currentStreakMetric').textContent=`${currentStreak()} kun`; $('#streakMetric').textContent=`${longestStreak()} kun`;
  $('#monthMetric').textContent=Object.entries(data).filter(([key])=>key.startsWith(currentMonth)).reduce((sum,[,entries])=>sum+entries.length,0)+' ish';
  const totals=monthlyTotals(), max=Math.max(...totals); $('#activeMonthMetric').textContent=max?`${MONTHS[totals.indexOf(max)]} (${max})`:'—';
  document.title=`🔥${longestStreak()} | Activity Tracker`;
  renderGoal();
}
function renderGoal() { const goal=preferences().goal, card=$('#goalCard'); if(!goal){card.classList.add('hidden');return;}const now=new Date(), count=monthlyTotals(now.getFullYear())[now.getMonth()], percent=Math.min(100,Math.round(count/goal*100));card.classList.remove('hidden');$('#goalText').textContent=`${count} / ${goal} ish`;$('#goalProgress').style.width=`${percent}%`;$('#goalPercent').textContent=`${percent}%`; }
function renderFilters() {
  const tags=[...new Set(Object.values(data).flat().map(entry=>entry.tag).filter(Boolean))], box=$('#tagFilters'); box.innerHTML='';
  const addFilter=(name,active,onClick)=>{const button=document.createElement('button');button.className=`tag-filter ${active?'active':''}`;button.textContent=name;button.onclick=onClick;box.append(button);};
  addFilter('Barchasi',!selectedTag,()=>{selectedTag='';renderTracker();});
  tags.forEach(tag=>addFilter(tag,selectedTag===tag,()=>{selectedTag=selectedTag===tag?'':tag;renderTracker();}));
}
function renderSearchResults() {
  const query=$('#searchInput').value.trim().toLowerCase(), box=$('#searchResults');
  if(!query&&searchRange==='all'){box.classList.add('hidden');return;}
  const now=new Date(); now.setHours(0,0,0,0);
  const earliest=new Date(now);
  if(searchRange!=='all'){
    if(searchRange==='year')earliest.setMonth(0,1);
    else earliest.setDate(now.getDate()-Number(searchRange));
  }
  const matches=Object.entries(data).flatMap(([date,entries])=>entries.map(entry=>({date,entry}))).filter(({date,entry})=>localDate(date)>=earliest&&(!query||`${entry.title} ${entry.description}`.toLowerCase().includes(query))).sort((a,b)=>b.date.localeCompare(a.date));
  box.classList.remove('hidden');
  box.innerHTML=matches.length?`<h3>${matches.length} ta natija</h3>${matches.map(({date,entry})=>`<button class="search-result" data-date="${escapeHtml(date)}"><span>${formatDate(date)} · ${escapeHtml(entry.time)}</span><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.description||'Tavsif yo\'q')}</small>${entry.tag?`<i style="background:${tagColor(entry.tag)}">${escapeHtml(entry.tag)}</i>`:''}</button>`).join('')}`:'<p class="empty">Hech narsa topilmadi, boshqa so\'z bilan qidirib ko\'ring.</p>';
  box.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>openDay(button.dataset.date));
}
function setRange(range){searchRange=range;document.querySelectorAll('[data-range]').forEach(button=>button.classList.toggle('active',button.dataset.range===range));renderSearchResults();}
function renderBanners() {
  $('#todayReminder').classList.toggle('hidden',(data[todayKey()]||[]).length>0);
  const banner=$('#offlineBanner');
  if (!isFileApiSupported()) {
    banner.innerHTML='⚠️ Bu brauzer local faylga saqlashni qo\'llamaydi. Ma\'lumot faqat shu qurilmada localStorage\'da saqlanadi.';
    banner.classList.remove('hidden');
  } else if (!currentFileHandle) {
    banner.innerHTML='📁 Fayl tanlanmagan — Sozlamalarda faylni tanlang va parol o\'rnating.';
    banner.classList.remove('hidden');
  } else if (typeof filePermissionNeeded !== 'undefined' && filePermissionNeeded) {
    banner.innerHTML='🔒 Faylga ulanish to\'xtatilgan (brauzer ruxsati kerak). <button id="restoreFileBtn" class="primary" style="padding:4px 12px;font-size:12px;margin-left:10px;">Ruxsat berish</button>';
    banner.classList.remove('hidden');
    if ($('#restoreFileBtn')) $('#restoreFileBtn').onclick = () => onFileSelected(currentFileHandle);
  } else if (!getSavedPassword() || !isFileAuthenticated) {
    banner.innerHTML='🔒 Shifrlash paroli tasdiqlanmagan yoki ulanish uzilgan. <button id="restoreFileBtn" class="primary" style="padding:4px 12px;font-size:12px;margin-left:10px;">Ulanishni tiklash</button>';
    banner.classList.remove('hidden');
    if ($('#restoreFileBtn')) $('#restoreFileBtn').onclick = () => onFileSelected(currentFileHandle);
  } else {
    banner.classList.add('hidden');
  }
}

function periodKey(type) { const now=new Date();if(type==='month')return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;const monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));return dateKey(monday); }
function showSummary(type) { const now=new Date(), end=type==='month'?new Date(now.getFullYear(),now.getMonth(),1):new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));const start=new Date(end);if(type==='month')start.setMonth(start.getMonth()-1);else start.setDate(start.getDate()-7);const items=Object.entries(data).flatMap(([date,entries])=>entries.map(entry=>({date,entry}))).filter(({date})=>localDate(date)>=start&&localDate(date)<end);if(!items.length)return;const weekday=Array(7).fill(0),tags={};items.forEach(({date,entry})=>{weekday[localDate(date).getDay()]++;if(entry.tag)tags[entry.tag]=(tags[entry.tag]||0)+1;});const bestDay=WEEKDAYS[weekday.indexOf(Math.max(...weekday))],bestTag=Object.keys(tags).sort((a,b)=>tags[b]-tags[a])[0]||'Tegsiz';$('#summaryText').textContent=`📊 O'tgan ${type==='month'?'oy':'hafta'} xulosasi: ${items.length} ta ish, eng faol kun — ${bestDay}, eng ko'p ishlatilgan kategoriya — ${bestTag}.`;$('#summaryBanner').classList.remove('hidden');localStorage.setItem(type==='month'?'lastMonthlySummaryShown':'lastWeeklySummaryShown',periodKey(type));setTimeout(()=>$('#summaryBanner').classList.add('hidden'),9000);}
function checkSummaries(){if(!preferences().summaries)return;['week','month'].forEach(type=>{const key=type==='month'?'lastMonthlySummaryShown':'lastWeeklySummaryShown';if(localStorage.getItem(key)!==periodKey(type))showSummary(type);});}


function categoryStats() {
  const stats={};
  Object.entries(data).forEach(([date,entries])=>entries.forEach(entry=>{const tag=entry.tag||'Tegsiz'; if(!stats[tag])stats[tag]={tag,count:0,last:date};stats[tag].count++;if(date>stats[tag].last)stats[tag].last=date;}));
  return Object.values(stats).sort((a,b)=>b.count-a.count);
}
function renderAnalytics() {
  const total=yearTotal(), dailyCount=entriesOfYear().filter(([,entries])=>entries.length).length;
  $('#analyticsTotal').textContent=total; $('#analyticsAverage').textContent=dailyCount?(total/dailyCount).toFixed(1):'0';
  const weekCounts=Array(7).fill(0); entriesOfYear().forEach(([key,entries])=>weekCounts[localDate(key).getDay()]+=entries.length); const weekMax=Math.max(...weekCounts); $('#analyticsWeekday').textContent=weekMax?WEEKDAYS[weekCounts.indexOf(weekMax)]:'—';
  const now=new Date(), thisMonth=monthlyTotals(now.getFullYear())[now.getMonth()], previous=now.getMonth()===0?monthlyTotals(now.getFullYear()-1)[11]:monthlyTotals(now.getFullYear())[now.getMonth()-1];
  $('#analyticsGrowth').textContent=previous?`${thisMonth>=previous?'+':''}${Math.round((thisMonth-previous)/previous*100)}%`:thisMonth?'Yangi':'—';
  const categories=categoryStats(); drawDonut(categories); drawBars(monthlyTotals()); renderCategoryTable(categories);
  renderComparisons(); renderAchievements();
}
function comparisonText(current, previous) { if(!previous)return current?'Yangi odat':'—';const percent=Math.round((current-previous)/previous*100);return `${percent>=0?'+':''}${percent}% ${percent>=0?'▲':'▼'}`; }
function renderComparisons() { const now=new Date(), startOfWeek=new Date(now);startOfWeek.setHours(0,0,0,0);startOfWeek.setDate(now.getDate()-((now.getDay()+6)%7));const countRange=(start,end)=>Object.entries(data).filter(([key])=>{const day=localDate(key);return day>=start&&day<end;}).reduce((sum,[,entries])=>sum+entries.length,0);const lastWeek=new Date(startOfWeek);lastWeek.setDate(lastWeek.getDate()-7);const weeklyCurrent=countRange(startOfWeek,new Date(startOfWeek.getTime()+7*864e5)),weeklyPrevious=countRange(lastWeek,startOfWeek);const monthlyCurrent=monthlyTotals(now.getFullYear())[now.getMonth()],monthlyPrevious=now.getMonth()?monthlyTotals(now.getFullYear())[now.getMonth()-1]:monthlyTotals(now.getFullYear()-1)[11];[['#weeklyComparison',weeklyCurrent,weeklyPrevious],['#monthlyComparison',monthlyCurrent,monthlyPrevious]].forEach(([selector,current,previous])=>{const item=$(selector);item.textContent=comparisonText(current,previous);item.classList.toggle('neutral',current<previous);}); }
const ACHIEVEMENTS=[
  {id:'streak_1',icon:'☀️',name:'1 kunlik odat',description:'Birinchi kuningiz',check:()=>longestStreakAll()>=1},
  {id:'first_step',icon:'🌱',name:'Birinchi qadam',description:'Birinchi yozuvingizni qo\'shing',check:()=>totalAll()>=1},
  {id:'events_10',icon:'✦',name:'10 ta ish',description:'10 ta yozuv yarating',check:()=>totalAll()>=10},
  {id:'events_50',icon:'🚀',name:'50 ta ish',description:'50 ta yozuv yarating',check:()=>totalAll()>=50},
  {id:'events_100',icon:'💯',name:'100 ta ish',description:'100 ta yozuv yarating',check:()=>totalAll()>=100},
  {id:'streak_7',icon:'🔥',name:'7 kunlik olov',description:'7 kunlik streakga erishing',check:()=>longestStreakAll()>=7},
  {id:'streak_30',icon:'🌋',name:'30 kunlik olov',description:'30 kunlik streakga erishing',check:()=>longestStreakAll()>=30},
  {id:'streak_100',icon:'🐉',name:'Yengilmas',description:'100 kunlik streakga erishing',check:()=>longestStreakAll()>=100},
  {id:'streak_365',icon:'🏆',name:'1 yillik afsona',description:'365 kunlik streakga erishing',check:()=>longestStreakAll()>=365},
  {id:'specialist',icon:'🧠',name:'Mutaxassis',description:'Bir kategoriyada 20 ish qiling',check:()=>categoryStats().some(item=>item.count>=20)},
  {id:'master',icon:'👑',name:'Master',description:'Bitta kategoriyada 100 ish',check:()=>categoryStats().some(item=>item.count>=100)},
  {id:'full_month',icon:'🗓️',name:'To\'liq oy',description:'Bir oyning har kunida faol bo\'ling',check:()=>hasFullMonth()},
  {id:'early_bird',icon:'🌅',name:'Erta qush',description:'Ertalab soat 08:00 gacha ish qo\'shing',check:()=>Object.values(data).flat().some(e=>parseInt(e.time.split(':')[0])<8)},
  {id:'woke_5',icon:'🌌',name:'Sahar qushi',description:'Soat 05:XX da ish qo\'shing',check:()=>Object.values(data).flat().some(e=>parseInt(e.time.split(':')[0])===5)},
  {id:'woke_6',icon:'🐓',name:'Zo\'r boshlanish',description:'Soat 06:XX da ish qo\'shing',check:()=>Object.values(data).flat().some(e=>parseInt(e.time.split(':')[0])===6)},
  {id:'night_owl',icon:'🦉',name:'Tungi boyqush',description:'Kechasi 22:00 dan keyin ish qo\'shing',check:()=>Object.values(data).flat().some(e=>parseInt(e.time.split(':')[0])>=22)}
];
function totalAll(){return Object.values(data).reduce((sum,entries)=>sum+entries.length,0)}
function longestStreakAll(){const days=Object.keys(data).filter(key=>data[key].length).sort();let best=0,run=0,previous='';days.forEach(key=>{if(previous&&localDate(key)-localDate(previous)===864e5)run++;else run=1;best=Math.max(best,run);previous=key;});return best;}
function hasFullMonth(){const months={};Object.keys(data).filter(key=>data[key].length).forEach(key=>{const month=key.slice(0,7);(months[month]??=new Set()).add(key);});return Object.entries(months).some(([month,days])=>days.size===new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate());}
function renderAchievements(){const unlocked=new Map(state.achievements.map(item=>[item.id,item]));$('#achievementCount').textContent=`${unlocked.size} / ${ACHIEVEMENTS.length}`;$('#achievementGrid').innerHTML=ACHIEVEMENTS.map(item=>`<article class="achievement ${unlocked.has(item.id)?'':'locked'}"><span class="achievement-icon">${item.icon}</span><strong>${item.name}</strong><small>${item.description}</small></article>`).join('');}
function checkAchievements(){let changed=false;ACHIEVEMENTS.forEach(item=>{if(item.check()&&!state.achievements.some(found=>found.id===item.id)){state.achievements.push({id:item.id,unlockedAt:todayKey()});queueToast(`🏆 Yangi yutuq: ${item.name}`,item.description);changed=true;}});if(changed){saveLocal();if(getSavedPassword()&&isFileAuthenticated)saveToFile();}return changed;}
function canvasContext(id) { const canvas=$(id), rect=canvas.getBoundingClientRect(), scale=window.devicePixelRatio||1; canvas.width=Math.max(1,Math.floor(rect.width*scale)); canvas.height=Math.max(1,Math.floor(rect.height*scale)); const ctx=canvas.getContext('2d'); ctx.scale(scale,scale); return {ctx,width:rect.width,height:rect.height}; }
function drawDonut(categories) {
  const {ctx,width,height}=canvasContext('#donutChart'); ctx.clearRect(0,0,width,height); const total=categories.reduce((sum,item)=>sum+item.count,0), cx=width/2, cy=height/2-2, radius=Math.min(width,height)*.29;
  if(!total){ctx.fillStyle='#93a1b8';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('Hali kategoriya yo\'q',cx,cy);$('#donutLegend').innerHTML='';return;}
  let start=-Math.PI/2; categories.forEach(item=>{const angle=item.count/total*Math.PI*2;ctx.beginPath();ctx.strokeStyle=tagColor(item.tag);ctx.lineWidth=28;ctx.arc(cx,cy,radius,start,start+angle);ctx.stroke();start+=angle;});
  ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--text');ctx.textAlign='center';ctx.font='700 25px system-ui';ctx.fillText(total,cx,cy+4);ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--muted');ctx.font='11px system-ui';ctx.fillText('jami ish',cx,cy+22);
  $('#donutLegend').innerHTML=categories.map(item=>`<div class="legend-item"><i class="legend-dot" style="background:${tagColor(item.tag)}"></i><span>${escapeHtml(item.tag)} <b>${Math.round(item.count/total*100)}%</b></span></div>`).join('');
}
function drawBars(totals) {
  const {ctx,width,height}=canvasContext('#barChart');ctx.clearRect(0,0,width,height);const max=Math.max(...totals,1), left=20,right=10,top=14,bottom=31, chartWidth=width-left-right,chartHeight=height-top-bottom, step=chartWidth/12;
  ctx.strokeStyle=getComputedStyle(document.body).getPropertyValue('--line');ctx.lineWidth=1;for(let i=0;i<4;i++){const y=top+(chartHeight/3)*i;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();}
  totals.forEach((value,index)=>{const barWidth=Math.min(28,step*.58), x=left+index*step+(step-barWidth)/2, barHeight=value/max*chartHeight,y=top+chartHeight-barHeight;ctx.fillStyle='#43c987';ctx.beginPath();ctx.roundRect(x,y,barWidth,Math.max(barHeight,2),[5,5,0,0]);ctx.fill();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--muted');ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(MONTHS[index],x+barWidth/2,height-10);if(value){ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--text');ctx.fillText(value,x+barWidth/2,y-6);}});
}
function renderCategoryTable(categories) { $('#categoryTable').innerHTML=categories.length?categories.map(item=>`<tr><td><span class="category-name"><i class="legend-dot" style="background:${tagColor(item.tag)}"></i>${escapeHtml(item.tag)}</span></td><td>${item.count}</td><td>${formatDate(item.last)}</td></tr>`).join(''):'<tr><td colspan="3" class="empty">Hali kategoriyali yozuv yo\'q.</td></tr>'; }



function openDay(key) {
  $('#dayModalTitle').textContent=formatDate(key);
  const entries=data[key]||[];
  $('#dayEntries').innerHTML=entries.length?entries.map(entry=>`
    <article class="entry" data-entry-id="${escapeHtml(entry.id)}">
      <div class="entry-head">
        <div class="entry-left">
          <time>${escapeHtml(entry.time)}</time>
          <h3>${escapeHtml(entry.title)}</h3>
          ${entry.tag?`<span class="badge" style="background:${tagColor(entry.tag)}">${escapeHtml(entry.tag)}</span>`:''}
        </div>
        ${key === todayKey() ? `<button class="entry-delete-btn" data-delete-key="${escapeHtml(key)}" data-delete-id="${escapeHtml(entry.id)}" aria-label="O'chirish" title="O'chirish">✕</button>` : ''}
      </div>
      ${entry.description?`<p>${escapeHtml(entry.description)}</p>`:''}
    </article>
  `).join(''):'<p class="empty">Bu kunda faoliyat qayd etilmagan.</p>';

  $('#dayEntries').querySelectorAll('.entry-delete-btn').forEach(btn => {
    btn.onclick = async () => await deleteEntry(btn.dataset.deleteKey, btn.dataset.deleteId);
  });

  openModal('dayModal');
}

function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

async function deleteEntry(key, id) {
  if (key !== todayKey()) {
    alert("Faqat bugungi ishlarni o'chirish mumkin!");
    return;
  }
  if (!confirm("Rostdan ham bu ishni o'chirasizmi?")) return;
  if (data[key]) {
    data[key] = data[key].filter(e => e.id !== id);
    if (!data[key].length) delete data[key];
    if (state.timeEntries[key]) {
      state.timeEntries[key] = state.timeEntries[key].filter(te => te.id !== id);
      if (!state.timeEntries[key].length) delete state.timeEntries[key];
    }
    
    Object.values(state.roadmap).forEach(tasks => {
      tasks.forEach(task => {
        if (task.completedEntryId === id) {
          task.done = false;
          task.completedEntryId = null;
          delete task.migrated;
        }
      });
    });

    saveLocal();
    render();
    openDay(key); // Re-render modal
    queueToast("🗑️ Ish o'chirildi");
    if(getSavedPassword()&&isFileAuthenticated) await saveToFile();
  }
}

function resetPendingFile() {
  if (pendingFileHandle && !currentFileHandle) {
    pendingFileHandle = null;
    pendingEncryptedData = null;
    pendingUnencryptedData = null;
  }
}

async function addEntry(values) {
  const title = values.title ? values.title.trim() : '';
  if (!title) { notify('Sarlavha kiritilishi shart!'); return; }
  const key=todayKey();
  const wasFirstToday=!(data[key]||[]).length, oldRecord=longestStreakAll(), entry={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,time:`${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`,title:title,description:values.description?values.description.trim():'',tag:values.tag?values.tag.trim():''};
  const todaysRoadmap = state.roadmap[key] || [];
  const normalizedTitle = title.toLowerCase();
  const normalizedTag = entry.tag.toLowerCase();
  const uncompletedTasks = todaysRoadmap.filter(t => !t.done);
  for (let i = 0; i < uncompletedTasks.length; i++) {
    const task = uncompletedTasks[i];
    const taskTitle = task.title.toLowerCase();
    const taskTag = (task.tag || '').toLowerCase();
    const matches = (normalizedTitle && normalizedTitle === taskTitle);
    if (matches) {
      task.done = true;
      task.completedEntryId = entry.id;
      setTimeout(() => queueToast(`🗺️ Roadmap vazifasi bajarildi: "${task.title}"`), 1500);
      break;
    }
  }
  (data[key]??=[]).push(entry);
  lastAddedKey=key;
  checkAchievements();
  saveLocal();
  render();
  playDing();
  if(wasFirstToday){
    confetti();
    const current=currentStreak(),record=longestStreakAll();
    if(record>oldRecord)queueToast('🎉 Yangi rekord!',`Endi eng uzun streak: ${record} kun`);
    else queueToast(`🔥 ${current} kunlik streak davom etmoqda`);
  }
  const goal=preferences().goal,monthly=monthlyTotals(new Date().getFullYear())[new Date().getMonth()];
  if(goal&&monthly>=goal)queueToast('🎯 Oylik maqsadga yetdingiz!','Ajoyib ritmni saqlab qoling.');
  await saveToFile();
}

function renderTagColorSettings(){const tags=[...new Set(Object.values(data).flat().map(entry=>entry.tag).filter(Boolean))], box=$('#tagColorSettings');box.innerHTML=tags.length?tags.map(tag=>`<label class="tag-color-row"><span>${escapeHtml(tag)}</span><input type="color" data-tag-color="${escapeHtml(tag)}" value="${tagColor(tag)}" /></label>`).join(''):'<p class="help">Rang tanlash uchun avval tegli yozuv qo\'shing.</p>';}
function openSettings() {
  const prefs=preferences();
  $('#goalInput').value=prefs.goal||'';
  $('#reduceMotionInput').checked=prefs.reduceMotion;
  $('#soundInput').checked=prefs.sound;
  $('#summariesInput').checked=prefs.summaries;
  const fileStatus=$('#fileApiStatus');
  if (!isFileApiSupported()) {
    fileStatus.textContent='⚠️ Bu brauzer File System Access API ni qo\'llamaydi. Ma\'lumot faqat localStorage da saqlanadi.';
    if ($('#filePickerButton')) $('#filePickerButton').disabled=true;
  } else if (currentFileHandle) {
    currentFileHandle.getFile().then(f=>fileStatus.textContent='✅ Tanlangan fayl: '+f.name).catch(()=>fileStatus.textContent='📁 Fayl biriktirilgan');
  } else {
    fileStatus.textContent='📁 Hali fayl tanlanmagan. Faylni biriktirish uchun quyidagi tugmani bosing.';
  }
  const encStatus=$('#encryptionStatus');
  const changeBtn=$('#changePasswordBtn');
  if (getSavedPassword() && isFileAuthenticated) {
    encStatus.textContent='✅ Shifrlash paroli tasdiqlangan va ulangan.';
    if (changeBtn) changeBtn.classList.remove('hidden');
  } else {
    encStatus.textContent='⚠️ Parol kiritilmagan yoki tasdiqlanmagan.';
    if (changeBtn) changeBtn.classList.add('hidden');
  }
  renderTagColorSettings();
  openModal('settingsModal');
}
function switchView(view) { 
  document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item.id===`${view}View`));
  document.querySelectorAll('[data-view]').forEach(item=>item.classList.toggle('active',item.dataset.view===view));
  const titles = {dashboard:'Dashboard',tracker:'Faoliyatlar',analytics:'Tahlil',roadmap:'Rejalashtirish',timer:'Vaqt Kuzatuvi',appusage:'Ilova Kuzatuvi',achievements:'Yutuqlar'};
  $('#pageTitle').textContent = titles[view] || 'Dashboard';
  if(view==='dashboard')requestAnimationFrame(renderDashboard);
  if(view==='analytics')requestAnimationFrame(renderAnalytics); 
  if(view==='roadmap')requestAnimationFrame(renderRoadmap);
  if(view==='timer')requestAnimationFrame(renderTimerView);
  if(view==='appusage')requestAnimationFrame(renderAppUsage);
  if(view==='achievements')requestAnimationFrame(renderAchievements);
}

$('#addButton').onclick=()=>openModal('entryModal'); if($('#dashAddButton'))$('#dashAddButton').onclick=()=>openModal('entryModal'); if($('#fabAdd'))$('#fabAdd').onclick=()=>openModal('entryModal'); $('#settingsButton').onclick=openSettings; $('#mobileSettings').onclick=openSettings;
if ($('#sidebarToggle')) {
  const layout = document.querySelector('.app-layout');
  layout.classList.toggle('sidebar-collapsed', localStorage.getItem('sidebar_collapsed') === 'true');
  $('#sidebarToggle').onclick = () => {
    const collapsed = layout.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  };
}
if ($('#globalSearchInput')) $('#globalSearchInput').oninput = event => {
  const query = event.target.value;
  if (query.trim()) {
    switchView('tracker');
  }
  if ($('#searchInput')) {
    $('#searchInput').value = query;
    renderSearchResults();
  }
};
$('#prevYear').onclick=()=>{shownYear--;render();};$('#nextYear').onclick=()=>{shownYear++;render();};
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>switchView(button.dataset.view));
$('#searchInput').oninput=renderSearchResults;document.querySelectorAll('[data-range]').forEach(button=>button.onclick=()=>setRange(button.dataset.range));document.querySelectorAll('[data-close-notice]').forEach(button=>button.onclick=()=>{const id=button.dataset.closeNotice;$(`#${id}`).classList.add('hidden');if(id==='backupBanner')localStorage.setItem('backup_reminder_dismissed',String(Date.now()));});
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{
  const modalId = button.dataset.close || button.closest('.modal')?.id;
  if (modalId === 'filePasswordModal') resetPendingFile();
  if (modalId) closeModal(modalId);
});
document.querySelectorAll('.modal').forEach(modal=>modal.onclick=event=>{
  if(event.target===modal) {
    if (modal.id === 'filePasswordModal') resetPendingFile();
    closeModal(modal.id);
  }
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#filePasswordModal').classList.contains('hidden')) resetPendingFile();
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
  }
});

// Password visibility toggles
if ($('#toggleNewPassword')) {
  $('#toggleNewPassword').onclick = () => {
    const input = $('#newPasswordInput');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleNewPassword').textContent = input.type === 'password' ? '👁️' : '🙈';
  };
}
if ($('#toggleConfirmPassword')) {
  $('#toggleConfirmPassword').onclick = () => {
    const input = $('#confirmPasswordInput');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleConfirmPassword').textContent = input.type === 'password' ? '👁️' : '🙈';
  };
}
if ($('#toggleExistingPassword')) {
  $('#toggleExistingPassword').onclick = () => {
    const input = $('#existingPasswordInput');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleExistingPassword').textContent = input.type === 'password' ? '👁️' : '🙈';
  };
}
if ($('#toggleChangePassword')) {
  $('#toggleChangePassword').onclick = () => {
    const input = $('#changePasswordInput');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleChangePassword').textContent = input.type === 'password' ? '👁️' : '🙈';
  };
}
if ($('#toggleCurrentPassword')) {
  $('#toggleCurrentPassword').onclick = () => {
    const input = $('#currentPasswordInput');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggleCurrentPassword').textContent = input.type === 'password' ? '👁️' : '🙈';
  };
}

// File Password Modal Form submission (Case A & Case B)
if ($('#filePasswordForm')) {
  $('#filePasswordForm').onsubmit = async (event) => {
    event.preventDefault();
    const errorBox = $('#filePasswordModalError');
    const showError = (msg) => {
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.classList.remove('hidden');
      } else {
        notify(msg);
      }
    };
    if (errorBox) errorBox.classList.add('hidden');

    if (isNewFileMode) {
      // === Case A: New / Empty File ===
      const pass = $('#newPasswordInput').value.trim();
      const confirmPass = $('#confirmPasswordInput').value.trim();
      if (!pass) {
        showError("Parol kiritilishi shart!");
        return;
      }
      if (pass !== confirmPass) {
        showError("Parollar mos kelmadi!");
        return;
      }

      const hasPerm = await ensurePermission(pendingFileHandle);
      if (!hasPerm) {
        showError("Faylga yozish uchun ruxsat berilmadi!");
        return;
      }

      saveEncryptionPassword(pass);
      currentFileHandle = pendingFileHandle;
      await saveHandle(currentFileHandle);
      pendingFileHandle = null;
      isFileAuthenticated = true;
      closeModal('filePasswordModal');

      // Save initial empty state envelope
      const plaintext = JSON.stringify(state, null, 2);
      const encrypted = await encryptData(plaintext, pass);
      localStorage.setItem(STORE_ENCRYPTED, JSON.stringify(encrypted));
      localStorage.removeItem(STORE);
      await writeEncryptedFile(currentFileHandle, encrypted);
      isFileLoadedFromFile = true;

      if ($('#fileApiStatus')) {
        currentFileHandle.getFile().then(f => $('#fileApiStatus').textContent = '✅ Tanlangan fayl: ' + f.name).catch(() => {});
      }

      queueToast('🔄 Fayl tayyorlanmoqda...', 'Yangi shifrlangan fayl biriktirildi');
      await new Promise(r => setTimeout(r, 1000));
      setSync('saved', 'Saqlangan');
      render();
    } else {
      // === Case B: Existing Encrypted or Unencrypted File ===
      const pass = $('#existingPasswordInput').value.trim();
      if (!pass) {
        showError("Parol kiritilishi shart!");
        return;
      }

      const hasPerm = await ensurePermission(pendingFileHandle);
      if (!hasPerm) {
        showError("Faylga kirish uchun ruxsat berilmadi!");
        return;
      }

      if (pendingEncryptedData) {
        // ENCRYPTED FILE: STRICT AES-GCM DECRYPTION CHECK!
        try {
          const plaintext = await decryptData(pendingEncryptedData, pass);
          const loaded = safeParse(plaintext);
          if (loaded) {
            saveEncryptionPassword(pass);
            currentFileHandle = pendingFileHandle;
            await saveHandle(currentFileHandle);
            pendingFileHandle = null;
            isFileAuthenticated = true;
            closeModal('filePasswordModal');

            state = normalizeState(loaded);
            data = state.activities;
            localStorage.setItem(STORE_ENCRYPTED, JSON.stringify(pendingEncryptedData));
            localStorage.removeItem(STORE);
            pendingEncryptedData = null;
            isFileLoadedFromFile = true;

            if ($('#fileApiStatus')) {
              currentFileHandle.getFile().then(f => $('#fileApiStatus').textContent = '✅ Tanlangan fayl: ' + f.name).catch(() => {});
            }

            // 1-second loading animation toast ONLY when unlocking with correct password
            queueToast('🔄 Ma\'lumotlar yuklanmoqda...', 'Fayl shifrsizlantirilmoqda');
            await new Promise(r => setTimeout(r, 1000));
            setSync('saved', 'Saqlangan');
            render();
            const count = Object.values(data).flat().length;
            queueToast('🔓 Ma\'lumotlar tiklandi', `${count} ta ish yuklandi`);
          } else {
            throw new Error('DECRYPT_FAILED');
          }
        } catch (err) {
          // clearEncryptionPassword(); // 3.5 Do not clear
      isFileAuthenticated = false;
          setSync('error', 'Parol xato');
          showError("❌ Noto'g'ri parol, qaytadan urinib ko'ring");
          queueToast('❌ Noto\'g\'ri parol', 'Kiritilgan parol faylga mos kelmadi');
          const input = $('#existingPasswordInput');
          if (input) {
            input.focus();
            input.select();
          }
          return; // STOP EXECUTION COMPLETELY ON DECRYPTION FAILURE!
        }
      } else if (pendingUnencryptedData) {
        // UNENCRYPTED FILE CASE: SECURE IT WITH NEW PASSWORD
        const unencryptedObj = pendingUnencryptedData;
        saveEncryptionPassword(pass);
        currentFileHandle = pendingFileHandle;
        await saveHandle(currentFileHandle);
        pendingFileHandle = null;
        pendingUnencryptedData = null;
        isFileAuthenticated = true;
        closeModal('filePasswordModal');

        state = normalizeState(unencryptedObj);
        data = state.activities;
        isFileLoadedFromFile = true;
        await saveToFile();

        if ($('#fileApiStatus')) {
          currentFileHandle.getFile().then(f => $('#fileApiStatus').textContent = '✅ Tanlangan fayl: ' + f.name).catch(() => {});
        }

        queueToast('🔄 Ma\'lumotlar yuklanmoqda...', 'Fayl shifrlab saqlanmoqda');
        await new Promise(r => setTimeout(r, 1000));
        setSync('saved', 'Saqlangan');
        render();
        const count = Object.values(data).flat().length;
        queueToast('🔓 Ma\'lumotlar tiklandi', `${count} ta ish yuklandi`);
      }
    }
  };
}

// Change Password Modal & Button handlers
if ($('#changePasswordBtn')) {
  $('#changePasswordBtn').onclick = () => {
    if (!isFileAuthenticated) {
      notify('Avval faylni to\'g\'ri parol bilan oching!');
      return;
    }
    openModal('changePasswordModal');
    setTimeout(() => $('#changePasswordInput').focus(), 150);
  };
}
if ($('#changePasswordForm')) {
  $('#changePasswordForm').onsubmit = async event => {
    event.preventDefault();
    const oldPass = $('#currentPasswordInput').value.trim();
    const newPass = $('#changePasswordInput').value.trim();
    const confirmNewPass = $('#confirmChangePasswordInput').value.trim();
    if (!oldPass) {
      notify('Joriy parolni kiriting!');
      return;
    }
    if (newPass.length < 8) { notify('Yangi parol kamida 8 ta belgi bo\'lishi kerak!'); return; }
    if (newPass !== confirmNewPass) { notify('Yangi parollar mos kelmadi!'); return; }
    if (!isFileAuthenticated) {
      notify('Avval faylni to\'g\'ri parol bilan oching!');
      return;
    }
    if (oldPass !== getSavedPassword()) {
      notify('Joriy parol noto\'g\'ri!');
      return;
    }
    saveEncryptionPassword(newPass);
    closeModal('changePasswordModal');
    queueToast('🔒 Yangi parol saqlandi');
    await saveToFile();
    openSettings();
  };
}

$('#entryForm').onsubmit=async event=>{
  event.preventDefault();
  const btn = event.submitter || event.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await addEntry({title:$('#entryTitle').value,description:$('#entryDescription').value,tag:$('#entryTag').value});
    event.target.reset();
    closeModal('entryModal');
  } finally {
    if (btn) btn.disabled = false;
  }
};
$('#settingsForm').onsubmit=async event=>{
  event.preventDefault();
  const goal=Number($('#goalInput').value);
  if(goal>0)localStorage.setItem('monthly_goal',String(goal));else localStorage.removeItem('monthly_goal');
  localStorage.setItem('reduce_motion',$('#reduceMotionInput').checked);
  localStorage.setItem('sound_enabled',$('#soundInput').checked);
  localStorage.setItem('summaries_enabled',$('#summariesInput').checked);
  document.querySelectorAll('[data-tag-color]').forEach(input=>{
    if (/^#[0-9a-fA-F]{6}$/.test(input.value)) state.tagColors[input.dataset.tagColor]=input.value;
  });
  state.tagColors = sanitizeTagColors(state.tagColors);
  saveLocal();
  closeModal('settingsModal');
  render();
  if(getSavedPassword()&&isFileAuthenticated){
    await saveToFile();
  }
};
if ($('#filePickerButton')) {
  
  if ($('#newFilePickerButton')) {
    $('#newFilePickerButton').onclick = async () => {
      const handle = await pickFile('save');
      if (handle) {
        isFileAuthenticated = false;
        $('#fileApiStatus').textContent = '✅ Tanlangan fayl: ' + handle.name;
        await onFileSelected(handle);
      }
    };
  }
  $('#filePickerButton').onclick = async () => {
    if (!isFileApiSupported()) return;
    const handle = await pickFile();
    if (!handle) return;
    await onFileSelected(handle);
  };
}

window.addEventListener('resize',()=>{if($('#analyticsView').classList.contains('active'))renderAnalytics();if($('#dashboardView').classList.contains('active'))renderDashboard();});
$('#soundYes').onclick=()=>{localStorage.setItem('sound_enabled','true');closeModal('soundModal');playDing();};
$('#soundNo').onclick=()=>{localStorage.setItem('sound_enabled','false');closeModal('soundModal');};
function showGentleStreakMessage(){const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const noticeKey=`streak_break_seen_${todayKey()}`;if(!localStorage.getItem(noticeKey)&&Object.keys(data).some(key=>key<dateKey(yesterday))&&!(data[dateKey(yesterday)]||[]).length){localStorage.setItem(noticeKey,'true');setTimeout(()=>queueToast('Streak uzildi, lekin bugundan yangisini boshlash mumkin 💪'),700);}}
if(!localStorage.getItem('tracker_first_seen'))localStorage.setItem('tracker_first_seen',String(Date.now()));

(async function init() {
  try {
  if (localStorage.getItem(STORE_ENCRYPTED) && getSavedPassword()) {
    await tryLoadFromLocalEncrypted();
  }
  restoreTimerState();
  render();
  await loadFromFile();
  showGentleStreakMessage();
  checkSummaries();
  } catch (err) {
    document.body.innerHTML = `<div style="padding:30px;font-family:system-ui;text-align:center"><h2>Xatolik yuz berdi</h2><p>Ma'lumotlaringiz buzilgan bo'lishi mumkin.</p><button onclick="const a=document.createElement('a');a.href='data:text/json;charset=utf-8,'+encodeURIComponent(localStorage.getItem('${STORE}')||localStorage.getItem('${STORE_ENCRYPTED}')||'{}');a.download='backup_corrupted.json';a.click();">Eksport</button> <button onclick="localStorage.clear();location.reload();">Tozalash va qayta yuklash</button><pre style="margin-top:20px;text-align:left;background:#f0f0f0;color:#333;padding:10px;">${err.stack}</pre></div>`;
  }
})();

if('serviceWorker' in navigator) { navigator.serviceWorker.register('./service-worker.js'); }
if(localStorage.getItem('sound_enabled')===null)setTimeout(()=>openModal('soundModal'),900);

// --- ROADMAP FEATURE ---
function isLocked(dKey, task) { return dKey < todayKey() || task.done; }
let currentRoadmapDate = new Date();
let roadmapViewType = 'week';

function getMonday(d) {
  const nd = new Date(d);
  const day = nd.getDay(), diff = nd.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(nd.setDate(diff));
}

function renderRoadmap() {
  const isWeek = roadmapViewType === 'week';
  $('#roadmapWeekBtn').classList.toggle('active', isWeek);
  $('#roadmapMonthBtn').classList.toggle('active', !isWeek);
  $('#roadmapWeek').classList.toggle('hidden', !isWeek);
  $('#roadmapMonth').classList.toggle('hidden', isWeek);

  const start = isWeek ? getMonday(currentRoadmapDate) : new Date(currentRoadmapDate.getFullYear(), currentRoadmapDate.getMonth(), 1);
  const end = isWeek ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) : new Date(currentRoadmapDate.getFullYear(), currentRoadmapDate.getMonth() + 1, 0);

  const opts = { month: 'long', year: 'numeric' };
  $('#roadmapPeriodLabel').textContent = isWeek ? `${start.getDate()}-${new Intl.DateTimeFormat('uz-UZ', {month:'long'}).format(start)} — ${end.getDate()}-${new Intl.DateTimeFormat('uz-UZ', opts).format(end)}` : new Intl.DateTimeFormat('uz-UZ', opts).format(start);

  let totalTasks = 0, doneTasks = 0;
  
  if (isWeek) {
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dKey = dateKey(d);
      const isToday = dKey === todayKey();
      const tasks = state.roadmap[dKey] || [];
      totalTasks += tasks.length;
      doneTasks += tasks.filter(t => t.done).length;
      
      const dayTotal = tasks.length;
      const dayDoneCount = tasks.filter(t => t.done).length;
      const dayPercent = dayTotal ? Math.round(dayDoneCount / dayTotal * 100) : 0;
      const isFull = dayTotal > 0 && dayDoneCount === dayTotal;
      
      const tasksHtml = tasks.map(t => `
        <div class="roadmap-task ${t.done ? 'completed' : ''} ${t.migrated ? 'migrated' : ''}">
          <button type="button" class="roadmap-task-icon ${dKey > todayKey() && !t.done ? 'future' : ''}" data-toggle-date="${escapeHtml(dKey)}" data-toggle-id="${escapeHtml(t.id)}" aria-label="Bajarilgan qilish" ${dKey > todayKey() && !t.done ? 'title="Kelajakdagi vazifani oldindan bajarib bo\'lmaydi"' : ''}>${t.done ? '✓' : '○'}</button>
          <div class="roadmap-task-info" data-edit-date="${escapeHtml(dKey)}" data-edit-id="${escapeHtml(t.id)}" style="cursor:pointer;flex:1;">
            <strong>${escapeHtml(t.title)}</strong>
            ${t.tag ? `<span class="badge" style="background:${tagColor(t.tag)}">${escapeHtml(t.tag)}</span>` : ''}
          </div>
        </div>
      `).join('');

      html += `
        <div class="roadmap-day ${isToday ? 'today' : ''} ${dayTotal ? 'has-tasks' : ''} ${isFull ? 'all-done' : ''}" style="--day-progress: ${dayPercent}%">
          <div class="roadmap-day-dot"></div>
          <div class="roadmap-day-line"></div>
          <div class="roadmap-day-content">
            <div class="roadmap-day-header">
              <div>
                <strong>${d.getDate()}</strong> <small>${new Intl.DateTimeFormat('uz-UZ', {month:'short'}).format(d)}, ${WEEKDAYS[d.getDay()]}</small>
              </div>
              ${dayTotal ? `<span class="day-percent ${isFull ? 'full' : ''}">${dayPercent}%</span>` : ''}
            </div>
            ${tasksHtml ? `<div class="roadmap-tasks">${tasksHtml}</div>` : `<div class="roadmap-tasks empty"><p class="empty-text">Bu kunga reja qo'shilmagan</p></div>`}
          </div>
        </div>
      `;
    }
    $('#roadmapWeek').innerHTML = html;

    // XSS-safe event delegation
    $('#roadmapWeek').querySelectorAll('[data-toggle-date]').forEach(btn => {
      btn.onclick = () => toggleRoadmapTask(btn.dataset.toggleDate, btn.dataset.toggleId);
    });
    $('#roadmapWeek').querySelectorAll('[data-edit-date]').forEach(el => {
      el.onclick = () => openRoadmapEdit(el.dataset.editDate, el.dataset.editId);
    });

    requestAnimationFrame(() => {
      const days = $('#roadmapWeek').querySelectorAll('.roadmap-day');
      for (let i = 0; i < days.length - 1; i++) {
        const d1 = days[i].querySelector('.roadmap-day-dot');
        const d2 = days[i+1].querySelector('.roadmap-day-dot');
        const line = days[i].querySelector('.roadmap-day-line');
        if (d1 && d2 && line) {
          line.style.height = `${d2.getBoundingClientRect().top - d1.getBoundingClientRect().top}px`;
        }
      }
      if (days.length > 0) {
        const lastLine = days[days.length - 1].querySelector('.roadmap-day-line');
        if (lastLine) lastLine.style.height = '0px';
      }
    });
  } else {
    let html = '';
    const firstDay = (start.getDay() + 6) % 7; 
    const daysInMonth = end.getDate();
    // Headers for month view
    const reorderedWeekdays = [...WEEKDAYS.slice(1), WEEKDAYS[0]];
    const monthHeader = reorderedWeekdays.map(w => `<div class="roadmap-month-header">${w}</div>`).join('');
    html += monthHeader;

    for (let i = 0; i < firstDay; i++) {
      html += `<div class="roadmap-month-cell empty"></div>`;
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentRoadmapDate.getFullYear(), currentRoadmapDate.getMonth(), i);
      const dKey = dateKey(d);
      const tasks = state.roadmap[dKey] || [];
      const isToday = dKey === todayKey();
      
      totalTasks += tasks.length;
      const dayDone = tasks.filter(t => t.done).length;
      doneTasks += dayDone;
      
      const isFull = tasks.length > 0 && dayDone === tasks.length;
      html += `<div class="roadmap-month-cell ${isToday ? 'today' : ''} ${isFull ? 'all-done' : ''}" data-month-date="${escapeHtml(dKey)}">
        <span class="day-num">${i}</span>
        ${tasks.length ? `<span class="roadmap-badge">${dayDone}/${tasks.length}</span>` : ''}
      </div>`;
    }
    $('#roadmapMonth').innerHTML = html;
    $('#roadmapMonth').querySelectorAll('[data-month-date]').forEach(cell => {
      cell.onclick = () => { currentRoadmapDate = localDate(cell.dataset.monthDate); roadmapViewType = 'week'; renderRoadmap(); };
    });
  }
  
}

if ($('#addRoadmapBtn')) {
  $('#addRoadmapBtn').onclick = () => {
    $('#roadmapAddDate').value = todayKey();
    $('#roadmapAddDate').min = todayKey();
    $('#roadmapAddTitle').value = '';
    $('#roadmapAddTag').value = '';
    openModal('roadmapAddModal');
  };
  
  $('#roadmapAddForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const dKey = $('#roadmapAddDate').value;
      const title = $('#roadmapAddTitle').value.trim();
      const tag = $('#roadmapAddTag').value.trim();
      if (!title || !dKey) { queueToast("Xato", "Sarlavha va sana kiritilishi shart"); return; }
      if (dKey < todayKey()) { queueToast("Xato", "O'tgan kunga reja qo'shib bo'lmaydi"); return; }
      (state.roadmap[dKey] ??= []).push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, title, tag, done: false, completedEntryId: null });
      saveLocal();
      await saveToFile();
      closeModal('roadmapAddModal');
      renderRoadmap();
      queueToast('🗺️ Yangi reja saqlandi');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

async function toggleRoadmapTask(dateKey, taskId) {
  if (dateKey > todayKey()) {
    queueToast("⏳ Hali vaqti kelmadi", "Kelajakdagi vazifalarni oldindan bajarib bo'lmaydi");
    return;
  }
  const task = state.roadmap[dateKey]?.find(t => t.id === taskId);
  if (task && !task.done) {
    task.done = true;
    if (todayKey() > dateKey) {
      task.migrated = true;
    }
    saveLocal();
    await saveToFile();
    renderRoadmap();
  }
}

function openRoadmapEdit(dateKey, taskId) {
  const task = state.roadmap[dateKey]?.find(t => t.id === taskId);
  if (task) {
    $('#roadmapEditDate').value = dateKey;
    $('#roadmapEditId').value = taskId;
    $('#roadmapEditTitle').value = task.title;
    $('#roadmapEditTag').value = task.tag || '';
    openModal('roadmapEditModal');
  }
}

if ($('#roadmapEditForm')) {
  $('#roadmapEditForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const dKey = $('#roadmapEditDate').value;
      const taskId = $('#roadmapEditId').value;
      const task = state.roadmap[dKey]?.find(t => t.id === taskId);
      if (task) {
        if (isLocked(dKey, task)) { queueToast("Xato", "Bu vazifa qulflangan"); return; }
        const title = $('#roadmapEditTitle').value.trim();
        if (!title) { queueToast("Xato", "Sarlavha bo'sh bo'lishi mumkin emas"); return; }
        task.title = title;
        task.tag = $('#roadmapEditTag').value.trim();
        saveLocal();
        await saveToFile();
        closeModal('roadmapEditModal');
        renderRoadmap();
        queueToast('✏️ Reja o‘zgartirildi');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

if ($('#roadmapDeleteBtn')) {
  let _deleteConfirm = false;
  $('#roadmapDeleteBtn').onclick = async (e) => {
    if (!_deleteConfirm) {
      _deleteConfirm = true;
      $('#roadmapDeleteBtn').textContent = "Rostdan o'chirish?";
      $('#roadmapDeleteBtn').style.background = 'rgba(255,94,94,0.15)';
      setTimeout(() => { _deleteConfirm = false; if ($('#roadmapDeleteBtn')) { $('#roadmapDeleteBtn').textContent = "O'chirish"; $('#roadmapDeleteBtn').style.background = ''; } }, 3000);
      return;
    }
    _deleteConfirm = false;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const dKey = $('#roadmapEditDate').value;
      const taskId = $('#roadmapEditId').value;
      const task = state.roadmap[dKey]?.find(t => t.id === taskId);
      if (task && isLocked(dKey, task)) { queueToast("Xato", "Bu vazifa qulflangan"); return; }
      if (state.roadmap[dKey]) {
        state.roadmap[dKey] = state.roadmap[dKey].filter(t => t.id !== taskId);
        if (!state.roadmap[dKey].length) delete state.roadmap[dKey];
        saveLocal();
        await saveToFile();
        closeModal('roadmapEditModal');
        renderRoadmap();
        queueToast('🗑️ Reja o‘chirildi');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "O'chirish";
      btn.style.background = '';
    }
  };
}



if ($('#prevRoadmapPeriod')) {
  $('#prevRoadmapPeriod').onclick = () => { 
    if (roadmapViewType === 'week') {
      currentRoadmapDate.setDate(currentRoadmapDate.getDate() - 7); 
    } else {
      currentRoadmapDate.setDate(1);
      currentRoadmapDate.setMonth(currentRoadmapDate.getMonth() - 1); 
    }
    renderRoadmap(); 
  };
  $('#nextRoadmapPeriod').onclick = () => { 
    if (roadmapViewType === 'week') {
      currentRoadmapDate.setDate(currentRoadmapDate.getDate() + 7); 
    } else {
      currentRoadmapDate.setDate(1);
      currentRoadmapDate.setMonth(currentRoadmapDate.getMonth() + 1); 
    }
    renderRoadmap(); 
  };
  $('#roadmapWeekBtn').onclick = () => { roadmapViewType = 'week'; renderRoadmap(); };
  $('#roadmapMonthBtn').onclick = () => { roadmapViewType = 'month'; renderRoadmap(); };
}

// ═══════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}
function updateThemeIcon(theme) {
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
  setTimeout(render, 50); // Small delay ensures computed styles are updated before drawing canvas
}
if ($('#themeToggle')) $('#themeToggle').onclick = toggleTheme;
initTheme();

// ═══════════════════════════════════════════════
// HELPER: format seconds to "Xs Yd"
// ═══════════════════════════════════════════════
function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '0s 0d';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}s ${minutes}d`;
}

// ═══════════════════════════════════════════════
// DASHBOARD RENDERING
// ═══════════════════════════════════════════════
function renderDashboard() {
  if (!$('#dashboardView') || !$('#dashboardView').classList.contains('active')) return;

  // — Metric cards —
  const totalAll_ = totalAll();
  const streak = currentStreak();
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const thisMonthCount = Object.entries(data).filter(([k])=>k.startsWith(thisMonthKey)).reduce((s,[,e])=>s+e.length,0);
  const prevMonthKey = now.getMonth() === 0 ? `${now.getFullYear()-1}-12` : `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;
  const prevMonthCount = Object.entries(data).filter(([k])=>k.startsWith(prevMonthKey)).reduce((s,[,e])=>s+e.length,0);

  $('#dashTotal').textContent = totalAll_;
  $('#dashStreak').textContent = `${streak} kun`;
  $('#dashMonth').textContent = `${thisMonthCount} ish`;

  // Time tracking total
  const totalTimeSec = Object.values(state.timeEntries).flat().reduce((s,e)=>s+(e.duration||0),0);
  $('#dashTime').textContent = formatDuration(totalTimeSec);

  // Change percentages
  const monthChange = prevMonthCount ? Math.round((thisMonthCount-prevMonthCount)/prevMonthCount*100) : (thisMonthCount > 0 ? 100 : 0);
  const changeEl = $('#dashTotalChange');
  if (changeEl) {
    if (totalAll_ > 0) {
      changeEl.textContent = `${monthChange >= 0 ? '+' : ''}${monthChange}% oyga nisbatan`;
      changeEl.className = `metric-change ${monthChange >= 0 ? 'up' : 'down'}`;
    } else {
      changeEl.textContent = '';
    }
  }

  // — Bar chart (this year vs last year) —
  drawDashBars();

  // — Top Categories —
  renderDashCategories();

  // — Recent Tasks —
  renderDashRecentTasks();

  // — Hours chart —
  renderDashHours();

  // — Donut —
  drawDashDonut();
}

function drawDashBars() {
  const canvas = $('#dashBarChart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const width = rect.width, height = rect.height;

  ctx.clearRect(0, 0, width, height);
  const now = new Date();
  const thisYear = monthlyTotals(now.getFullYear());
  const lastYear = monthlyTotals(now.getFullYear() - 1);
  const hasData = [...thisYear, ...lastYear].some(Boolean);
  const max = Math.max(...thisYear, ...lastYear, 1);
  const left = 38, right = 12, top = 16, bottom = 32;
  const chartW = width - left - right, chartH = height - top - bottom;
  const step = chartW / 12;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4E7CFF';
  const warn = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#F59E0B';
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#E6E8EC';
  const textC = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6F767E';
  const mutedC = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#9A9FA5';

  // Subtle horizontal guide lines keep the compact chart readable.
  ctx.strokeStyle = border; ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (let i = 0; i <= 4; i++) {
    const y = top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
    ctx.fillStyle = mutedC; ctx.font = '10px Inter, system-ui'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(max - (max / 4) * i), left - 6, y + 4);
  }
  ctx.setLineDash([]);

  if (!hasData) {
    ctx.fillStyle = mutedC; ctx.font = '12px Inter, system-ui'; ctx.textAlign = 'center';
    ctx.fillText("Faollikni ko'rish uchun bugungi ishni qo'shing", left + chartW / 2, top + chartH / 2);
  }

  // Previous year is a restrained amber area, making the current blue bars
  // immediately scannable while still providing a meaningful comparison.
  const points = lastYear.map((value, index) => ({
    x: left + index * step + step / 2,
    y: top + chartH - (value / max * chartH)
  }));
  if (hasData && points.some((_, index) => lastYear[index])) {
    const gradient = ctx.createLinearGradient(0, top, 0, top + chartH);
    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, top + chartH);
    ctx.lineTo(points[0].x, top + chartH);
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = warn; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
  }

  // Current year uses one confident rounded bar per month.
  const barW = Math.min(16, step * 0.32);
  thisYear.forEach((v, i) => {
    const x = left + i * step + (step - barW) / 2;
    const barH = v / max * chartH;
    const y = top + chartH - barH;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, Math.max(barH, 2), [4, 4, 0, 0]);
    ctx.fill();
    if (v) { ctx.fillStyle = accent; ctx.font = '600 10px Inter'; ctx.textAlign = 'center'; ctx.fillText(v, x + barW / 2, y - 6); }
  });

  // Month labels
  MONTHS.forEach((m, i) => {
    const x = left + i * step + step / 2;
    ctx.fillStyle = mutedC; ctx.font = '10px Inter, system-ui'; ctx.textAlign = 'center';
    ctx.fillText(m, x, height - 10);
  });
}

function renderDashCategories() {
  const el = $('#dashCategories');
  if (!el) return;
  const cats = categoryStats().slice(0, 5);
  const total = cats.reduce((s, c) => s + c.count, 0) || 1;
  if (!cats.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Hali kategoriya yo\'q.</p>'; return; }
  el.innerHTML = cats.map(c => {
    const pct = Math.round(c.count / total * 100);
    const color = tagColor(c.tag);
    const initial = c.tag.charAt(0).toUpperCase();
    return `<div class="category-row">
      <div class="category-avatar" style="background:${color}">${escapeHtml(initial)}</div>
      <div class="category-info"><strong>${escapeHtml(c.tag)}</strong><small>${c.count} ta ish</small></div>
      <div class="category-time"><strong>${pct}%</strong><div class="category-progress"><i style="width:${pct}%;background:${color}"></i></div></div>
    </div>`;
  }).join('');
}

function renderDashRecentTasks() {
  const el = $('#dashRecentTasks');
  if (!el) return;
  const recent = Object.entries(data).flatMap(([d, e]) => e.map(entry => ({date: d, ...entry}))).sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.time || '').localeCompare(a.time || '');
  }).slice(0, 6);
  if (!recent.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Hali ish qo\'shilmagan.</p>'; return; }
  el.innerHTML = recent.map(r => {
    const color = tagColor(r.tag || 'Tegsiz');
    return `<div class="recent-task-row">
      <span class="task-color-dot" style="background:${color}"></span>
      <div class="recent-task-info"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.tag || 'Tegsiz')} · ${formatDate(r.date)}</small></div>
      <span class="task-time">${escapeHtml(r.time || '')}</span>
      <span class="task-status done">Bajarildi</span>
    </div>`;
  }).join('');
}

function renderDashHours() {
  const el = $('#dashHoursChart');
  if (!el) return;
  const hours = Array(24).fill(null).map(() => ({}));
  // Parse from entries today
  const key = todayKey();
  (data[key] || []).forEach(entry => {
    if (!entry.time) return;
    const h = parseInt(entry.time.split(':')[0]);
    if (isNaN(h)) return;
    const tag = entry.tag || 'Tegsiz';
    hours[h][tag] = (hours[h][tag] || 0) + 1;
  });
  // Find active hours range
  let minH = 24, maxH = 0, hasData = false;
  hours.forEach((h, i) => { if (Object.keys(h).length) { minH = Math.min(minH, i); maxH = Math.max(maxH, i); hasData = true; } });
  if (!hasData) { minH = 8; maxH = 22; }
  else { minH = Math.max(0, minH - 1); maxH = Math.min(23, maxH + 1); }

  const allTags = new Set();
  hours.forEach(h => Object.keys(h).forEach(t => allTags.add(t)));

  let html = '';
  for (let i = minH; i <= maxH; i++) {
    const h = hours[i];
    const total = Object.values(h).reduce((s, v) => s + v, 0);
    const maxTotal = Math.max(...hours.map(hh => Object.values(hh).reduce((s, v) => s + v, 0)), 1);
    const segments = Object.entries(h).map(([tag, count]) => {
      const pct = (count / maxTotal * 100);
      return `<div class="hour-bar-segment" style="width:${pct}%;background:${tagColor(tag)};" title="${escapeHtml(tag)}: ${count}"></div>`;
    }).join('');
    html += `<div class="hour-bar-row"><span class="hour-label">${String(i).padStart(2,'0')}:00</span><div class="hour-bar-track">${segments}</div></div>`;
  }
  el.innerHTML = html || '<p style="color:var(--muted);font-size:13px;">Bugun hali ish yo\'q.</p>';
}

function drawDashDonut() {
  const canvas = $('#dashDonutChart');
  if (!canvas) return;
  const cats = categoryStats();
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const width = rect.width, height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const total = cats.reduce((s, c) => s + c.count, 0);
  const cx = width / 2, cy = height / 2 - 4;
  const radius = Math.min(width, height) * 0.32;
  const lineW = 28;
  const textC = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const mutedC = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();

  if (!total) {
    ctx.fillStyle = mutedC; ctx.font = '13px Inter, system-ui'; ctx.textAlign = 'center';
    ctx.fillText("Hali kategoriya yo'q", cx, cy);
    $('#dashDonutLegend').innerHTML = '';
    return;
  }

  let start = -Math.PI / 2;
  const gap = 0.04;
  cats.forEach(item => {
    const angle = item.count / total * Math.PI * 2;
    if (angle > gap * 2) {
      ctx.beginPath();
      ctx.strokeStyle = tagColor(item.tag);
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.arc(cx, cy, radius, start + gap / 2, start + angle - gap / 2);
      ctx.stroke();
    }
    start += angle;
  });

  // Center text
  ctx.fillStyle = textC; ctx.textAlign = 'center';
  ctx.font = '800 24px Inter, system-ui'; ctx.fillText(total, cx, cy + 4);
  ctx.fillStyle = mutedC; ctx.font = '11px Inter, system-ui'; ctx.fillText('jami ish', cx, cy + 22);

  // Legend
  $('#dashDonutLegend').innerHTML = cats.slice(0, 6).map(item =>
    `<div class="legend-item"><i class="legend-dot" style="background:${tagColor(item.tag)}"></i><span>${escapeHtml(item.tag)} <b>${Math.round(item.count/total*100)}%</b></span></div>`
  ).join('');
}

// ═══════════════════════════════════════════════
// TIMER FEATURE
// ═══════════════════════════════════════════════

let timerInterval = null;
let timerStartTime = null;
let timerRunning = false;
let timerTask = { title: '', tag: '' };

function saveTimerState() {
  if (timerRunning) {
    localStorage.setItem('timer_state', JSON.stringify({ timerTask, timerStartTime }));
  } else {
    localStorage.removeItem('timer_state');
  }
}

function restoreTimerState() {
  const saved = safeParse(localStorage.getItem('timer_state'));
  if (saved && saved.timerStartTime) {
    timerTask = saved.timerTask;
    timerStartTime = saved.timerStartTime;
    timerRunning = true;
    saveTimerState();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    // UI update will happen when renderTimerView runs if active, but we should also update buttons if they exist
    setTimeout(() => {
      if ($('#timerStatusLabel')) $('#timerStatusLabel').textContent = `${escapeHtml(timerTask.title)} — davom etmoqda...`;
      if ($('#timerStartBtn')) $('#timerStartBtn').classList.add('hidden');
      if ($('#timerStopBtn')) { $('#timerStopBtn').classList.remove('hidden'); $('#timerStopBtn').disabled = false; }
      if ($('#timerCancelBtn')) { $('#timerCancelBtn').classList.remove('hidden'); $('#timerCancelBtn').disabled = false; }
    }, 100);
  }
}


function renderTimerView() {
  if (!$('#timerView') || !$('#timerView').classList.contains('active')) return;
  const now = new Date();
  const key = todayKey();
  const todayEntries = state.timeEntries[key] || [];
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0,0,0,0);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const todaySec = todayEntries.reduce((s, e) => s + (e.duration || 0), 0);
  const weekSec = Object.entries(state.timeEntries).filter(([k]) => localDate(k) >= weekStart).flatMap(([, e]) => e).reduce((s, e) => s + (e.duration || 0), 0);
  const monthSec = Object.entries(state.timeEntries).filter(([k]) => k.startsWith(monthKey)).flatMap(([, e]) => e).reduce((s, e) => s + (e.duration || 0), 0);

  $('#timerToday').textContent = formatDuration(todaySec);
  $('#timerWeek').textContent = formatDuration(weekSec);
  $('#timerMonth').textContent = formatDuration(monthSec);

  // Table
  const tbody = $('#timeEntriesTable');
  if (tbody) {
    tbody.innerHTML = todayEntries.length ? todayEntries.map(e => `<tr>
      <td><span class="category-name"><i class="legend-dot" style="background:${tagColor(e.tag||'Tegsiz')}"></i>${escapeHtml(e.tag || 'Tegsiz')}</span></td>
      <td>${escapeHtml(e.description || e.tag || '')}</td>
      <td><strong>${formatDuration(e.duration)}</strong></td>
      <td>${e.startTime ? new Date(e.startTime).toLocaleTimeString('uz-UZ', {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="empty">Bugun taymer yozuvlari yo\'q.</td></tr>';
  }

  // Category bars
  renderTimerCategoryBars();
}

function renderTimerCategoryBars() {
  const el = $('#timerCategoryBars');
  if (!el) return;
  const allEntries = Object.values(state.timeEntries).flat();
  const byTag = {};
  allEntries.forEach(e => {
    const tag = e.tag || 'Tegsiz';
    byTag[tag] = (byTag[tag] || 0) + (e.duration || 0);
  });
  const sorted = Object.entries(byTag).sort((a, b) => b[1] - a[1]);
  const totalSec = sorted.reduce((s, [, d]) => s + d, 0) || 1;
  if (!sorted.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Hali taymer yozuvi yo\'q.</p>'; return; }
  el.innerHTML = sorted.map(([tag, sec]) => {
    const pct = Math.round(sec / totalSec * 100);
    const color = tagColor(tag);
    return `<div class="category-row" style="border-bottom:1px solid var(--border-light);padding:10px 0;">
      <div class="category-avatar" style="background:${color};width:36px;height:36px;border-radius:8px;">${tag.charAt(0).toUpperCase()}</div>
      <div class="category-info"><strong>${escapeHtml(tag)}</strong><small>${formatDuration(sec)}</small></div>
      <div class="category-time"><strong>${pct}%</strong><div class="category-progress"><i style="width:${pct}%;background:${color}"></i></div></div>
    </div>`;
  }).join('');
}

function updateTimerDisplay() {
  if (!timerRunning || !timerStartTime) return;
  const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  if ($('#timerDisplay')) $('#timerDisplay').textContent = `${h}:${m}:${s}`;
}

if ($('#timerStartBtn')) {
  $('#timerStartBtn').onclick = () => {
    if (timerRunning) return;
    openModal('timerStartModal');
  };
}

if ($('#timerStartForm')) {
  $('#timerStartForm').onsubmit = (e) => {
    e.preventDefault();
    const title = $('#timerTitle').value.trim();
    const tag = $('#timerTag').value.trim();
    if (!title) return;
    timerTask = { title, tag };
    timerStartTime = Date.now();
    timerRunning = true;
    saveTimerState();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    closeModal('timerStartModal');
    if ($('#timerStatusLabel')) $('#timerStatusLabel').textContent = `${title} — davom etmoqda...`;
    if ($('#timerStartBtn')) $('#timerStartBtn').classList.add('hidden');
    if ($('#timerStopBtn')) { $('#timerStopBtn').classList.remove('hidden'); $('#timerStopBtn').disabled = false; }
    if ($('#timerCancelBtn')) { $('#timerCancelBtn').classList.remove('hidden'); $('#timerCancelBtn').disabled = false; }
    e.target.reset();
  };
}

if ($('#timerStopBtn')) {
  $('#timerStopBtn').onclick = async (e) => {
    if (!timerRunning) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      clearInterval(timerInterval);
      const elapsed = Math.max(0, Math.floor((Date.now() - timerStartTime) / 1000));
      if (elapsed < 5) {
        queueToast('Juda qisqa', '5 soniyadan kam taymer saqlanmadi');
        timerRunning = false;
        saveTimerState();
        if ($('#timerStatusLabel')) $('#timerStatusLabel').textContent = 'Taymer kutmoqda...';
        if ($('#timerDisplay')) $('#timerDisplay').textContent = '00:00:00';
        if ($('#timerStartBtn')) { $('#timerStartBtn').classList.remove('hidden'); $('#timerStartBtn').disabled = false; }
        if ($('#timerStopBtn')) $('#timerStopBtn').classList.add('hidden');
        if ($('#timerCancelBtn')) $('#timerCancelBtn').classList.add('hidden');
        timerStartTime = null;
        return;
      }
      
      const endTimeObj = new Date();
      let currentStartTime = new Date(timerStartTime);
      
      // Split by midnight
      while (currentStartTime.getDate() !== endTimeObj.getDate() || currentStartTime.getMonth() !== endTimeObj.getMonth()) {
        const nextMidnight = new Date(currentStartTime);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0,0,0,0);
        
        const partialElapsed = Math.max(0, Math.floor((nextMidnight - currentStartTime) / 1000));
        const partialId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const partialKey = dateKey(currentStartTime);
        
        (state.timeEntries[partialKey] ??= []).push({
          id: partialId, tag: timerTask.tag, startTime: currentStartTime.toISOString(), endTime: nextMidnight.toISOString(), duration: partialElapsed, description: timerTask.title
        });
        
        // Push activity entry using direct array push since addEntry targets todayKey
        const timeHHMM = `${String(currentStartTime.getHours()).padStart(2,'0')}:${String(currentStartTime.getMinutes()).padStart(2,'0')}`;
        (state.activities[partialKey] ??= []).push({ id: partialId, time: timeHHMM, title: timerTask.title, description: `Taymer: ${formatDuration(partialElapsed)}`, tag: timerTask.tag });
        
        currentStartTime = nextMidnight;
      }
      
      // Final piece
      const finalElapsed = Math.max(0, Math.floor((endTimeObj - currentStartTime) / 1000));
      const finalId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const finalKey = dateKey(endTimeObj);
      
      (state.timeEntries[finalKey] ??= []).push({
        id: finalId, tag: timerTask.tag, startTime: currentStartTime.toISOString(), endTime: endTimeObj.toISOString(), duration: finalElapsed, description: timerTask.title
      });
      // also activity entry
      const timeHHMM = `${String(currentStartTime.getHours()).padStart(2,'0')}:${String(currentStartTime.getMinutes()).padStart(2,'0')}`;
      (state.activities[finalKey] ??= []).push({ id: finalId, time: timeHHMM, title: timerTask.title, description: `Taymer: ${formatDuration(finalElapsed)}`, tag: timerTask.tag });

      saveLocal();
      await saveToFile();
      checkAchievements();
      
      timerRunning = false;
      saveTimerState();
      
      if ($('#timerStatusLabel')) $('#timerStatusLabel').textContent = 'Taymer kutmoqda...';
      if ($('#timerDisplay')) $('#timerDisplay').textContent = '00:00:00';
      if ($('#timerStartBtn')) { $('#timerStartBtn').classList.remove('hidden'); $('#timerStartBtn').disabled = false; }
      if ($('#timerStopBtn')) $('#timerStopBtn').classList.add('hidden');
      if ($('#timerCancelBtn')) $('#timerCancelBtn').classList.add('hidden');
      timerStartTime = null;
      queueToast('⏱ Vaqt saqlandi', `${escapeHtml(timerTask.title)}`);
      renderTimerView();
      renderTracker(); // in case tracker is visible behind
    } finally {
      btn.disabled = false;
    }
  };
}

if ($('#timerCancelBtn')) {
  $('#timerCancelBtn').onclick = () => {
    if (!confirm("Taymerni bekor qilasizmi? Kiritilgan vaqt o'chiriladi.")) return;
    clearInterval(timerInterval);
    timerRunning = false;
    timerStartTime = null;
    saveTimerState();
    if ($('#timerStatusLabel')) $('#timerStatusLabel').textContent = 'Taymer kutmoqda...';
    if ($('#timerDisplay')) $('#timerDisplay').textContent = '00:00:00';
    if ($('#timerStartBtn')) { $('#timerStartBtn').classList.remove('hidden'); $('#timerStartBtn').disabled = false; }
    if ($('#timerStopBtn')) $('#timerStopBtn').classList.add('hidden');
    if ($('#timerCancelBtn')) $('#timerCancelBtn').classList.add('hidden');
    queueToast('⏹ Taymer bekor qilindi');
  };
}

// ═══════════════════════════════════════════════
// APP USAGE FEATURE
// ═══════════════════════════════════════════════
function renderAppUsage() {
  if (!$('#appusageView') || !$('#appusageView').classList.contains('active')) return;
  const now = new Date();
  const key = todayKey();
  const todayApps = state.appUsage[key] || [];
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0,0,0,0);

  const todaySec = todayApps.reduce((s, a) => s + (a.duration || 0), 0);
  const weekSec = Object.entries(state.appUsage).filter(([k]) => localDate(k) >= weekStart).flatMap(([, a]) => a).reduce((s, a) => s + (a.duration || 0), 0);
  const allApps = Object.values(state.appUsage).flat();
  const uniqueApps = new Set(allApps.map(a => a.app));

  $('#appTotal').textContent = uniqueApps.size;
  $('#appTodayTime').textContent = formatDuration(todaySec);
  $('#appWeekTime').textContent = formatDuration(weekSec);

  // Top app
  const byApp = {};
  allApps.forEach(a => { byApp[a.app] = (byApp[a.app] || 0) + (a.duration || 0); });
  const topApp = Object.entries(byApp).sort((a, b) => b[1] - a[1])[0];
  $('#appTopApp').textContent = topApp ? topApp[0] : '—';

  // List
  const el = $('#appUsageList');
  if (!el) return;
  const totalDur = todayApps.reduce((s, a) => s + (a.duration || 0), 0) || 1;
  if (!todayApps.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:16px 0;">Bugun ilova yozuvi yo\'q. Yuqoridagi tugmadan ilova qo\'shing.</p>';
    return;
  }
  el.innerHTML = todayApps.map(a => {
    const pct = Math.round(a.duration / totalDur * 100);
    const bgColor = tagColor(a.category || a.app);
    return `<div class="app-row">
      <div class="app-icon-box" style="background:${bgColor}20;color:${bgColor};font-size:22px;">${escapeHtml(a.icon || '📱')}</div>
      <div class="app-info"><strong>${escapeHtml(a.app)}</strong><small>${escapeHtml(a.category || '')}</small></div>
      <div class="app-time"><strong>${formatDuration(a.duration)}</strong><div class="app-progress"><i style="width:${pct}%;background:${bgColor}"></i></div></div>
      <button type="button" class="app-delete-btn" onclick="deleteAppUsage('${escapeHtml(key)}', ${state.appUsage[key].indexOf(a)})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;padding:0 8px;font-size:18px;" title="O'chirish">✕</button>
    </div>`;
  }).join('');
}

if ($('#addAppBtn')) {
  $('#addAppBtn').onclick = () => openModal('appAddModal');
}

if ($('#appAddForm')) {
  $('#appAddForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const appName = $('#appName').value.trim();
      const category = $('#appCategory').value.trim();
      const icon = $('#appIcon').value.trim() || '📱';
      const durationMin = parseInt($('#appDuration').value);
      if (!appName || !durationMin) return;
      const key = todayKey();
      const currentTotal = (state.appUsage[key] || []).reduce((s, a) => s + Math.floor(a.duration / 60), 0);
      if (currentTotal + durationMin > 1440) {
        durationMin = 1440 - currentTotal;
        if (durationMin <= 0) { notify("Bir kunda 24 soatdan (1440 daqiqa) ortiq vaqt kiritib bo'lmaydi!"); return; }
        queueToast("Vaqt cheklovi", `Kunning qolgan vaqti hisobga olinib, ${durationMin} daqiqa saqlandi.`);
      }
      (state.appUsage[key] ??= []).push({
        app: appName,
        category: category,
        duration: durationMin * 60,
        icon: icon
      });
      saveLocal();
      await saveToFile();
      closeModal('appAddModal');
      e.target.reset();
      renderAppUsage();
      queueToast('📱 Ilova yozuvi saqlandi', `${appName} — ${durationMin} daqiqa`);
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

document.querySelectorAll('.emoji-presets span').forEach(span => {
  span.addEventListener('click', () => { document.getElementById('appIcon').value = span.textContent; });
});

// 3.8 JSON Export/Import for non-API browsers
function exportJson() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'activity-data.json';
  a.click();
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      state = normalizeState(parsed);
      data = state.activities;
      saveLocal();
      render();
      queueToast("✅ Import qilindi");
    } catch {
      notify("Xato fayl!");
    }
  };
  reader.readAsText(file);
}

window.addEventListener('storage', (e) => {
  if (e.key === STORE || e.key === STORE_ENCRYPTED) {
    console.log("3.9 Cross-tab sync: Data updated in another tab, reloading...");
    location.reload();
  }
});

window.deleteAppUsage = async function(key, index) {
  if (!confirm("Bu ilova yozuvini o'chirasizmi?")) return;
  if (state.appUsage[key]) {
    state.appUsage[key].splice(index, 1);
    if (!state.appUsage[key].length) delete state.appUsage[key];
    saveLocal();
    await saveToFile();
    renderAppUsage();
    queueToast("🗑️ O'chirildi");
  }
};
