/**
 * BakerOS — Complete Application
 *
 * Architecture:
 *   1.  Utilities (UUID, format helpers)
 *   2.  Data Layer (localStorage read/write)
 *   3.  App State
 *   4.  Toast & Confirm (UI primitives)
 *   5.  Theme
 *   6.  Router (view switching)
 *   7.  Sidebar
 *   8.  Spinner Component
 *   9.  Photo Upload helpers
 *   10. Onboarding View
 *   11. Profile Select View
 *   12. Dashboard View
 *   13. Ingredients View
 *   14. Recipes View
 *   15. Recipe Builder View
 *   16. Quote Builder View
 *   17. Invoice View
 *   18. Job History View
 *   19. Settings View
 *   20. Drag & Drop (Recipe Builder)
 *   21. Event Delegation & Global Listeners
 *   22. Init
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     1. UTILITIES
  ═══════════════════════════════════════════════════════ */

  /** Generate a unique ID */
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
  }

  /** Format a number as currency */
  function formatCurrency(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2);
  }

  /** Format minutes into "X hr Y min" */
  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m + ' min';
    if (m === 0) return h + ' hr';
    return h + ' hr ' + m + ' min';
  }

  /** Format ISO date string to locale date */
  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Get time-aware greeting */
  function getGreeting(name) {
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    return 'Good ' + part + (name ? ', ' + name.split(' ')[0] : '') + '!';
  }

  /** Escape HTML to prevent injection */
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /** Get initials from name string */
  function initials(name) {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  /** Deep clone a value */
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /** Generate sequential invoice number */
  function genInvoiceNumber(jobs) {
    const year = new Date().getFullYear();
    const prefix = 'INV-' + year + '-';
    let max = 0;
    (jobs || []).forEach(j => {
      if (j.invoiceNumber && j.invoiceNumber.startsWith(prefix)) {
        const n = parseInt(j.invoiceNumber.replace(prefix, ''), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    return prefix + String(max + 1).padStart(4, '0');
  }

  /* ═══════════════════════════════════════════════════════
     2. DATA LAYER
  ═══════════════════════════════════════════════════════ */

  const KEYS = {
    profiles:   'bakerOS_profiles',
    ingredient: id => 'bakerOS_ingredients_' + id,
    recipes:    id => 'bakerOS_recipes_' + id,
    settings:   id => 'bakerOS_settings_' + id,
    jobs:       id => 'bakerOS_jobs_' + id,
  };

  const DEFAULT_SETTINGS = {
    theme: 'light',
    hourlyRate: 25,
    defaultMarkup: 20,
    defaultTax: 0,
    defaultUnits: 'imperial',
    timeCategories: [
      { id: uuid(), name: 'Single Layer Cake',  estimatedMinutes: 120 },
      { id: uuid(), name: 'Double Layer Cake',  estimatedMinutes: 210 },
      { id: uuid(), name: 'Triple Layer Cake',  estimatedMinutes: 300 },
      { id: uuid(), name: 'Sheet Cake',         estimatedMinutes: 150 },
      { id: uuid(), name: '6 Cupcakes',         estimatedMinutes: 60  },
      { id: uuid(), name: '12 Cupcakes',        estimatedMinutes: 90  },
      { id: uuid(), name: '24 Cupcakes',        estimatedMinutes: 150 },
      { id: uuid(), name: '6 Cake Pops',        estimatedMinutes: 90  },
      { id: uuid(), name: '12 Cake Pops',       estimatedMinutes: 150 },
      { id: uuid(), name: '24 Cake Pops',       estimatedMinutes: 240 },
      { id: uuid(), name: 'Cookies (dozen)',     estimatedMinutes: 60  },
      { id: uuid(), name: 'Brownies',           estimatedMinutes: 75  },
      { id: uuid(), name: 'Bread Loaf',         estimatedMinutes: 120 },
    ]
  };

  const DB = {
    getProfiles()           { return JSON.parse(localStorage.getItem(KEYS.profiles) || '[]'); },
    saveProfiles(list)      { localStorage.setItem(KEYS.profiles, JSON.stringify(list)); },
    getIngredients(pid)     { return JSON.parse(localStorage.getItem(KEYS.ingredient(pid)) || '[]'); },
    saveIngredients(pid, d) { localStorage.setItem(KEYS.ingredient(pid), JSON.stringify(d)); },
    getRecipes(pid)         { return JSON.parse(localStorage.getItem(KEYS.recipes(pid)) || '[]'); },
    saveRecipes(pid, d)     { localStorage.setItem(KEYS.recipes(pid), JSON.stringify(d)); },
    getSettings(pid) {
      const raw = localStorage.getItem(KEYS.settings(pid));
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : clone(DEFAULT_SETTINGS);
    },
    saveSettings(pid, d)    { localStorage.setItem(KEYS.settings(pid), JSON.stringify(d)); },
    getJobs(pid)            { return JSON.parse(localStorage.getItem(KEYS.jobs(pid)) || '[]'); },
    saveJobs(pid, d)        { localStorage.setItem(KEYS.jobs(pid), JSON.stringify(d)); },
  };

  /* ═══════════════════════════════════════════════════════
     3. APP STATE
  ═══════════════════════════════════════════════════════ */

  const State = {
    profileId: null,         // Active profile ID
    profile: null,           // Active profile object
    settings: null,          // Active settings
    currentView: null,       // Current visible view name
    editingRecipeId: null,   // Recipe being edited (null = new)
    editingJobId: null,      // Job being edited (null = new)
    quoteItems: [],          // Items in the active quote builder
    recipeDraft: {           // Draft state for recipe builder
      ingredients: [],
      photos: [],
      hours: 0,
      minutes: 0,
      simultaneous: 1,
    },
  };

  /* ═══════════════════════════════════════════════════════
     4. TOAST & CONFIRM
  ═══════════════════════════════════════════════════════ */

  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-msg">${esc(message)}</span>
      <button class="toast-dismiss" aria-label="Dismiss">×</button>
    `;
    container.appendChild(toast);

    const dismiss = () => {
      toast.classList.add('dismissing');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-dismiss').addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }

  function showConfirm(message, title, okLabel) {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirm-overlay');
      document.getElementById('confirm-title').textContent = title || 'Are you sure?';
      document.getElementById('confirm-message').textContent = message || 'This action cannot be undone.';
      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = okLabel || 'Delete';

      overlay.classList.remove('hidden');

      const handleOk = () => { cleanup(); resolve(true); };
      const handleCancel = () => { cleanup(); resolve(false); };

      function cleanup() {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', handleOk);
        document.getElementById('confirm-cancel').removeEventListener('click', handleCancel);
      }

      okBtn.addEventListener('click', handleOk);
      document.getElementById('confirm-cancel').addEventListener('click', handleCancel);
    });
  }

  /* ═══════════════════════════════════════════════════════
     5. THEME
  ═══════════════════════════════════════════════════════ */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggle = document.getElementById('theme-toggle-input');
    if (toggle) toggle.checked = (theme === 'dark');
  }

  function toggleTheme() {
    if (!State.profileId) return;
    const settings = DB.getSettings(State.profileId);
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    DB.saveSettings(State.profileId, settings);
    State.settings = settings;
    applyTheme(settings.theme);
  }

  /* ═══════════════════════════════════════════════════════
     6. ROUTER
  ═══════════════════════════════════════════════════════ */

  const VIEWS = [
    'onboarding', 'profile-select',
    'dashboard', 'ingredients', 'recipes', 'recipe-builder',
    'new-quote', 'invoice', 'job-history', 'settings'
  ];

  function showView(name, options) {
    // Hide all sections
    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.add('hidden');
    });

    // Show/hide app shell vs full-page views
    const appShell = document.getElementById('app-shell');
    const fullPageViews = ['onboarding', 'profile-select'];
    if (fullPageViews.includes(name)) {
      appShell.classList.add('hidden');
    } else {
      appShell.classList.remove('hidden');
    }

    // Show requested view
    const el = document.getElementById('view-' + name);
    if (el) el.classList.remove('hidden');

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === name);
    });

    State.currentView = name;

    // Render view-specific content
    switch (name) {
      case 'dashboard':      renderDashboard(); break;
      case 'ingredients':    renderIngredients(); break;
      case 'recipes':        renderRecipes(); break;
      case 'recipe-builder': renderRecipeBuilder(options); break;
      case 'new-quote':      renderQuoteBuilder(options); break;
      case 'invoice':        renderInvoice(options); break;
      case 'job-history':    renderJobHistory(); break;
      case 'settings':       renderSettings(); break;
    }

    // Scroll to top
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
  }

  /* ═══════════════════════════════════════════════════════
     7. SIDEBAR
  ═══════════════════════════════════════════════════════ */

  function updateSidebar() {
    if (!State.profile) return;
    const p = State.profile;

    // Bakery / owner names
    document.getElementById('sidebar-bakery-name').textContent = p.bakeryName;
    document.getElementById('sidebar-owner-name').textContent = p.ownerName;
    document.getElementById('sidebar-initials').textContent = initials(p.ownerName);

    const photoEl = document.getElementById('sidebar-photo');
    if (p.photo) {
      photoEl.src = p.photo;
      photoEl.classList.remove('hidden');
      document.getElementById('sidebar-initials').style.display = 'none';
    } else {
      photoEl.classList.add('hidden');
      document.getElementById('sidebar-initials').style.display = '';
    }
  }

  function initSidebar() {
    // Desktop collapse toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    // Nav link clicks
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const view = link.dataset.view;
        if (view === 'new-quote') {
          startNewQuote();
        } else {
          showView(view);
        }
        // Close mobile sidebar
        closeMobileSidebar();
      });
    });

    // Switch profile
    document.getElementById('switch-profile-btn').addEventListener('click', () => {
      State.profileId = null;
      State.profile = null;
      State.settings = null;
      showProfileSelect();
    });

    // Mobile overlay
    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
  }

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('sidebar-overlay').classList.remove('hidden');
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebar-overlay').classList.add('hidden');
  }

  /** Inject mobile header into main content */
  function ensureMobileHeader() {
    if (document.getElementById('mobile-header')) return;
    const header = document.createElement('div');
    header.id = 'mobile-header';
    header.className = 'mobile-header';
    header.innerHTML = `
      <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="mobile-header-logo">
        <span>🧁</span> BakerOS
      </div>
    `;
    document.getElementById('main-content').prepend(header);
    header.querySelector('#mobile-menu-btn').addEventListener('click', openMobileSidebar);
  }

  /* ═══════════════════════════════════════════════════════
     8. SPINNER COMPONENT
  ═══════════════════════════════════════════════════════ */

  function initSpinner(el) {
    if (!el || el._spinnerInited) return;
    el._spinnerInited = true;

    const minVal   = parseFloat(el.dataset.min   ?? 0);
    const maxVal   = parseFloat(el.dataset.max   ?? 9999);
    const step     = parseFloat(el.dataset.step  ?? 1);
    const decimals = parseInt(  el.dataset.decimals ?? 2, 10);
    let   value    = parseFloat(el.dataset.value  ?? 0);

    const input  = el.querySelector('.spinner-input');
    const minBtn = el.querySelector('.spinner-minus');
    const plusBtn= el.querySelector('.spinner-plus');

    function clamp(v) {
      return Math.min(maxVal, Math.max(minVal, v));
    }

    function setVal(v, emit = true) {
      value = clamp(parseFloat(v) || minVal);
      input.value = value.toFixed(decimals);
      el.dataset.value = value;
      if (emit) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 200);
      }
    }

    minBtn.addEventListener('click', () => setVal(value - step));
    plusBtn.addEventListener('click', () => setVal(value + step));

    input.addEventListener('blur', () => setVal(parseFloat(input.value)));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') setVal(parseFloat(input.value));
      if (e.key === 'ArrowUp')   { e.preventDefault(); setVal(value + step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setVal(value - step); }
    });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      setVal(value + (e.deltaY < 0 ? step : -step));
    }, { passive: false });

    // Init display
    setVal(value, false);
  }

  function getSpinnerValue(el) {
    return parseFloat(el ? el.dataset.value : 0) || 0;
  }

  function setSpinnerValue(el, v) {
    if (!el) return;
    el.dataset.value = v;
    const input = el.querySelector('.spinner-input');
    const decimals = parseInt(el.dataset.decimals ?? 2, 10);
    if (input) input.value = parseFloat(v).toFixed(decimals);
  }

  /** Init all spinners in a container (or document) */
  function initSpinners(root) {
    (root || document).querySelectorAll('.spinner').forEach(initSpinner);
  }

  /* ═══════════════════════════════════════════════════════
     9. PHOTO UPLOAD HELPERS
  ═══════════════════════════════════════════════════════ */

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function bindPhotoUpload(inputId, previewId, placeholderId, onSet) {
    const input       = document.getElementById(inputId);
    const preview     = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);
    if (!input) return;

    const area = input.closest('.photo-preview-wrapper') || input.parentElement;
    if (area) {
      area.addEventListener('click', () => input.click());
    }

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const b64 = await readFileAsBase64(file);
        if (preview) { preview.src = b64; preview.classList.remove('hidden'); }
        if (placeholder) placeholder.classList.add('hidden');
        if (onSet) onSet(b64);
      } catch (err) {
        showToast('Could not read image file.', 'error');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     10. ONBOARDING VIEW
  ═══════════════════════════════════════════════════════ */

  let obPhoto = null; // base64 of profile photo during onboarding

  function showOnboarding() {
    showView('onboarding');
    obPhoto = null;
    const preview = document.getElementById('ob-photo-preview');
    const placeholder = document.getElementById('ob-photo-placeholder');
    preview.classList.add('hidden');
    preview.src = '';
    placeholder.classList.remove('hidden');
    document.getElementById('ob-bakery-name').value = '';
    document.getElementById('ob-owner-name').value = '';
  }

  function initOnboarding() {
    bindPhotoUpload('ob-photo-input', 'ob-photo-preview', 'ob-photo-placeholder', b64 => { obPhoto = b64; });

    document.getElementById('onboarding-form').addEventListener('submit', e => {
      e.preventDefault();
      const bakeryName = document.getElementById('ob-bakery-name').value.trim();
      const ownerName  = document.getElementById('ob-owner-name').value.trim();
      if (!bakeryName || !ownerName) return;

      const profile = { id: uuid(), bakeryName, ownerName, photo: obPhoto, createdAt: new Date().toISOString() };
      const profiles = DB.getProfiles();
      profiles.push(profile);
      DB.saveProfiles(profiles);

      // Initialize default settings for this profile
      DB.saveSettings(profile.id, clone(DEFAULT_SETTINGS));

      loginProfile(profile);
    });
  }

  /* ═══════════════════════════════════════════════════════
     11. PROFILE SELECT VIEW
  ═══════════════════════════════════════════════════════ */

  function showProfileSelect() {
    const profiles = DB.getProfiles();
    if (profiles.length === 0) {
      showOnboarding();
      return;
    }
    showView('profile-select');
    renderProfileCards(profiles);
  }

  function renderProfileCards(profiles) {
    const grid = document.getElementById('profile-cards-grid');
    grid.innerHTML = '';
    profiles.forEach(p => {
      const card = document.createElement('div');
      card.className = 'profile-card';
      card.dataset.id = p.id;
      const avatarContent = p.photo
        ? `<img src="${p.photo}" alt="${esc(p.ownerName)}" />`
        : `<span style="font-size:1.4rem;font-weight:700;">${esc(initials(p.ownerName))}</span>`;
      card.innerHTML = `
        <div class="profile-card-avatar">${avatarContent}</div>
        <div class="profile-card-bakery">${esc(p.bakeryName)}</div>
        <div class="profile-card-owner">${esc(p.ownerName)}</div>
      `;
      card.addEventListener('click', () => loginProfile(p));
      grid.appendChild(card);
    });
  }

  function initProfileSelect() {
    document.getElementById('new-bakery-btn').addEventListener('click', showOnboarding);
  }

  function loginProfile(profile) {
    State.profileId = profile.id;
    State.profile   = profile;
    State.settings  = DB.getSettings(profile.id);
    applyTheme(State.settings.theme);
    updateSidebar();
    ensureMobileHeader();
    showView('dashboard');
  }

  /* ═══════════════════════════════════════════════════════
     12. DASHBOARD VIEW
  ═══════════════════════════════════════════════════════ */

  function renderDashboard() {
    const pid = State.profileId;
    const profile = State.profile;

    // Greeting
    document.getElementById('dashboard-greeting').textContent = getGreeting(profile.ownerName);

    // Stats
    const ingredients = DB.getIngredients(pid);
    const recipes     = DB.getRecipes(pid);
    const jobs        = DB.getJobs(pid);
    const openJobs    = jobs.filter(j => j.status === 'open');
    const completed   = jobs.filter(j => j.status === 'completed');

    document.getElementById('stat-ingredients').textContent = ingredients.length;
    document.getElementById('stat-recipes').textContent     = recipes.length;
    document.getElementById('stat-open-quotes').textContent  = openJobs.length;
    document.getElementById('stat-completed').textContent    = completed.length;

    // Recent activity (last 5 jobs by date)
    const sorted = clone(jobs).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const list = document.getElementById('recent-activity-list');
    if (sorted.length === 0) {
      list.innerHTML = '<p class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">No jobs yet. Create your first quote!</p>';
    } else {
      list.innerHTML = sorted.map(j => `
        <div class="activity-item" data-job-id="${j.id}">
          <div class="activity-info">
            <div class="activity-customer">${esc(j.customerName)}</div>
            <div class="activity-meta">${esc(j.invoiceNumber)} · ${formatDate(j.createdAt)}</div>
          </div>
          <span class="status-badge ${j.status}">${j.status}</span>
          <div class="activity-total">${formatCurrency(j.total)}</div>
        </div>
      `).join('');

      list.querySelectorAll('.activity-item').forEach(item => {
        item.addEventListener('click', () => {
          const jobId = item.dataset.jobId;
          showView('invoice', { jobId });
        });
      });
    }
  }

  function initDashboard() {
    // Quick action buttons
    document.getElementById('view-dashboard').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'add-ingredient') openIngredientModal();
      if (action === 'new-recipe')     showView('recipe-builder');
      if (action === 'new-quote')      startNewQuote();
    });
  }

  /* ═══════════════════════════════════════════════════════
     13. INGREDIENTS VIEW
  ═══════════════════════════════════════════════════════ */

  function renderIngredients() {
    const pid = State.profileId;
    const ingredients = DB.getIngredients(pid);
    const search = (document.getElementById('ingredient-search').value || '').toLowerCase();
    const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search));

    const empty   = document.getElementById('ingredients-empty');
    const wrapper = document.getElementById('ingredients-table-wrapper');
    const tbody   = document.getElementById('ingredients-tbody');

    if (ingredients.length === 0) {
      empty.classList.remove('hidden');
      wrapper.classList.add('hidden');
    } else {
      empty.classList.add('hidden');
      wrapper.classList.remove('hidden');
      tbody.innerHTML = filtered.map(ing => `
        <tr>
          <td>${esc(ing.name)}</td>
          <td>${esc(ing.defaultUnit)}</td>
          <td>${formatCurrency(ing.costPerUnit)} / ${esc(ing.defaultUnit)}</td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" data-action="edit-ingredient" data-id="${ing.id}">Edit</button>
              <button class="btn btn-danger-outline btn-sm" data-action="delete-ingredient" data-id="${ing.id}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  function openIngredientModal(ingredientId) {
    const overlay = document.getElementById('ingredient-modal-overlay');
    const form    = document.getElementById('ingredient-form');
    const titleEl = document.getElementById('ingredient-modal-title');
    const saveBtn = document.getElementById('ingredient-save-btn');

    form.reset();
    document.getElementById('ingredient-id').value = '';

    if (ingredientId) {
      const ingredients = DB.getIngredients(State.profileId);
      const ing = ingredients.find(i => i.id === ingredientId);
      if (!ing) return;
      titleEl.textContent = 'Edit Ingredient';
      saveBtn.textContent = 'Save Changes';
      document.getElementById('ingredient-id').value = ing.id;
      document.getElementById('ingredient-name').value = ing.name;
      document.getElementById('ingredient-unit').value = ing.defaultUnit;
      document.getElementById('ingredient-cost').value = ing.costPerUnit;
    } else {
      titleEl.textContent = 'Add Ingredient';
      saveBtn.textContent = 'Save Ingredient';
    }

    overlay.classList.remove('hidden');
    document.getElementById('ingredient-name').focus();
  }

  function initIngredients() {
    document.getElementById('add-ingredient-btn').addEventListener('click', () => openIngredientModal());
    document.getElementById('add-ingredient-empty-btn').addEventListener('click', () => openIngredientModal());
    document.getElementById('ingredient-search').addEventListener('input', renderIngredients);

    document.getElementById('ingredient-form').addEventListener('submit', async e => {
      e.preventDefault();
      const pid  = State.profileId;
      const id   = document.getElementById('ingredient-id').value;
      const name = document.getElementById('ingredient-name').value.trim();
      const unit = document.getElementById('ingredient-unit').value;
      const cost = parseFloat(document.getElementById('ingredient-cost').value) || 0;

      if (!name) return;

      let ingredients = DB.getIngredients(pid);

      if (id) {
        ingredients = ingredients.map(i => i.id === id ? { ...i, name, defaultUnit: unit, costPerUnit: cost } : i);
        showToast('Ingredient updated!', 'success');
      } else {
        ingredients.push({ id: uuid(), name, defaultUnit: unit, costPerUnit: cost, createdAt: new Date().toISOString() });
        showToast('Ingredient added!', 'success');
      }

      DB.saveIngredients(pid, ingredients);
      document.getElementById('ingredient-modal-overlay').classList.add('hidden');
      renderIngredients();

      // Also refresh recipe builder library if open
      if (State.currentView === 'recipe-builder') renderIngredientLibrary();
    });

    // Table action buttons (delegated)
    document.getElementById('view-ingredients').addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'edit-ingredient') {
        openIngredientModal(id);
      }
      if (action === 'delete-ingredient') {
        const ok = await showConfirm('This will permanently delete this ingredient.', 'Delete Ingredient?', 'Delete');
        if (!ok) return;
        let ingredients = DB.getIngredients(State.profileId);
        ingredients = ingredients.filter(i => i.id !== id);
        DB.saveIngredients(State.profileId, ingredients);
        showToast('Ingredient deleted.', 'success');
        renderIngredients();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     14. RECIPES VIEW
  ═══════════════════════════════════════════════════════ */

  function renderRecipes(filterCategory) {
    const pid     = State.profileId;
    let recipes   = DB.getRecipes(pid);
    const empty   = document.getElementById('recipes-empty');
    const grid    = document.getElementById('recipes-grid');
    const settings = DB.getSettings(pid);

    if (filterCategory && filterCategory !== 'all') {
      // Map chip data-category to recipe categories
      const catMap = {
        'Single Layer Cake': ['Single Layer Cake', 'Double Layer Cake', 'Triple Layer Cake', 'Sheet Cake'],
        'cupcakes': ['6 Cupcakes', '12 Cupcakes', '24 Cupcakes'],
        'cake-pops': ['6 Cake Pops', '12 Cake Pops', '24 Cake Pops'],
        'cookies': ['Cookies (dozen)', 'Brownies', 'Bread Loaf'],
        'other': ['Custom']
      };
      const allowed = catMap[filterCategory] || [];
      recipes = recipes.filter(r => allowed.includes(r.category));
    }

    if (DB.getRecipes(pid).length === 0) {
      empty.classList.remove('hidden');
      grid.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    const emojis = {
      'Single Layer Cake': '🎂', 'Double Layer Cake': '🎂', 'Triple Layer Cake': '🎂',
      'Sheet Cake': '🍰', '6 Cupcakes': '🧁', '12 Cupcakes': '🧁', '24 Cupcakes': '🧁',
      '6 Cake Pops': '🍭', '12 Cake Pops': '🍭', '24 Cake Pops': '🍭',
      'Cookies (dozen)': '🍪', 'Brownies': '🍫', 'Bread Loaf': '🍞', 'Custom': '✨'
    };

    grid.innerHTML = recipes.map(r => {
      const cost = calcRecipeCost(r, settings);
      const timeStr = formatMinutes(r.timeMinutes || 0);
      const thumb = r.photos && r.photos.length > 0
        ? `<img class="recipe-card-photo" src="${r.photos[0]}" alt="${esc(r.name)}" />`
        : `<div class="recipe-card-gradient">${emojis[r.category] || '🍴'}</div>`;

      return `
        <div class="recipe-card" data-id="${r.id}">
          ${thumb}
          <div class="recipe-card-body">
            <div class="recipe-card-name">${esc(r.name)}</div>
            <div class="recipe-card-category">${esc(r.category)}</div>
            <div class="recipe-card-meta">
              <span class="recipe-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8"/></svg>
                ${r.ingredients ? r.ingredients.length : 0} ingredients
              </span>
              <span class="recipe-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                ${timeStr}
              </span>
            </div>
            <div class="recipe-card-cost">${formatCurrency(cost.total)} suggested</div>
            <div class="recipe-card-actions">
              <button class="btn btn-outline btn-sm" data-action="edit-recipe" data-id="${r.id}">Edit</button>
              <button class="btn btn-outline btn-sm" data-action="quote-recipe" data-id="${r.id}">Quote</button>
              <button class="btn btn-danger-outline btn-sm" data-action="delete-recipe" data-id="${r.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function calcRecipeCost(recipe, settings) {
    const ingredients = DB.getIngredients(State.profileId);
    let ingredientCost = 0;
    (recipe.ingredients || []).forEach(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredientId);
      if (ing) ingredientCost += (ri.amount || 0) * ing.costPerUnit;
    });

    const hourlyRate = recipe.hourlyRate != null ? recipe.hourlyRate : (settings.hourlyRate || 25);
    const markup     = recipe.markup     != null ? recipe.markup     : (settings.defaultMarkup || 0);
    const hours      = ((recipe.timeMinutes || 0) / 60) / Math.max(1, recipe.simultaneousItems || 1);
    const laborCost  = hours * hourlyRate;
    const base       = ingredientCost + laborCost;
    const markupAmt  = base * (markup / 100);
    const total      = base + markupAmt;

    return { ingredientCost, laborCost, markup, markupAmt, total, hours, hourlyRate };
  }

  function initRecipes() {
    document.getElementById('create-recipe-btn').addEventListener('click', () => {
      showView('recipe-builder');
    });
    document.getElementById('create-recipe-empty-btn').addEventListener('click', () => {
      showView('recipe-builder');
    });

    // Filter chips
    document.querySelectorAll('#view-recipes .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#view-recipes .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderRecipes(chip.dataset.category);
      });
    });

    // Card action buttons (delegated)
    document.getElementById('view-recipes').addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'edit-recipe') {
        showView('recipe-builder', { recipeId: id });
      }
      if (action === 'quote-recipe') {
        startNewQuoteWithRecipe(id);
      }
      if (action === 'delete-recipe') {
        const ok = await showConfirm('This will permanently delete this recipe.', 'Delete Recipe?', 'Delete');
        if (!ok) return;
        let recipes = DB.getRecipes(State.profileId);
        recipes = recipes.filter(r => r.id !== id);
        DB.saveRecipes(State.profileId, recipes);
        showToast('Recipe deleted.', 'success');
        renderRecipes();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     15. RECIPE BUILDER VIEW
  ═══════════════════════════════════════════════════════ */

  function renderRecipeBuilder(options) {
    const recipeId = options && options.recipeId;
    State.editingRecipeId = recipeId || null;

    // Reset draft
    State.recipeDraft = { ingredients: [], photos: [], hours: 0, minutes: 0, simultaneous: 1 };

    const titleEl = document.getElementById('recipe-builder-title');

    // Clear form
    document.getElementById('recipe-id').value = '';
    document.getElementById('recipe-name').value = '';
    document.getElementById('recipe-category').value = 'Single Layer Cake';
    document.getElementById('recipe-description').value = '';
    document.getElementById('recipe-hourly-rate').value = '';
    document.getElementById('recipe-markup').value = '';
    document.getElementById('recipe-photos-grid').innerHTML = '';
    // Re-add the add slot
    const addSlot = document.createElement('div');
    addSlot.className = 'photo-add-slot';
    addSlot.id = 'recipe-photo-add';
    addSlot.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
      <span>Add Photo</span>
      <input type="file" id="recipe-photo-input" accept="image/*" multiple class="hidden" />
    `;
    document.getElementById('recipe-photos-grid').appendChild(addSlot);
    bindRecipePhotoUpload();

    // Clear ingredient lists
    document.getElementById('recipe-ingredients-list').innerHTML = '';
    document.getElementById('recipe-ingredients-empty').classList.remove('hidden');

    // Reset spinners
    const hoursSpinner   = document.getElementById('time-hours-spinner');
    const minsSpinner    = document.getElementById('time-minutes-spinner');
    const simSpinner     = document.getElementById('simultaneous-spinner');
    setSpinnerValue(hoursSpinner, 0);
    setSpinnerValue(minsSpinner, 0);
    setSpinnerValue(simSpinner, 1);
    if (!hoursSpinner._spinnerInited) initSpinner(hoursSpinner);
    if (!minsSpinner._spinnerInited)  initSpinner(minsSpinner);
    if (!simSpinner._spinnerInited)   initSpinner(simSpinner);

    // Load existing recipe if editing
    if (recipeId) {
      const recipe = DB.getRecipes(State.profileId).find(r => r.id === recipeId);
      if (recipe) {
        titleEl.textContent = 'Edit Recipe';
        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-name').value = recipe.name;
        document.getElementById('recipe-category').value = recipe.category;
        document.getElementById('recipe-description').value = recipe.description || '';
        if (recipe.hourlyRate != null) document.getElementById('recipe-hourly-rate').value = recipe.hourlyRate;
        if (recipe.markup     != null) document.getElementById('recipe-markup').value     = recipe.markup;

        const hours = Math.floor((recipe.timeMinutes || 0) / 60);
        const mins  = (recipe.timeMinutes || 0) % 60;
        setSpinnerValue(hoursSpinner, hours);
        setSpinnerValue(minsSpinner, mins);
        setSpinnerValue(simSpinner, recipe.simultaneousItems || 1);
        State.recipeDraft.hours       = hours;
        State.recipeDraft.minutes     = mins;
        State.recipeDraft.simultaneous = recipe.simultaneousItems || 1;
        State.recipeDraft.ingredients = clone(recipe.ingredients || []);
        State.recipeDraft.photos      = clone(recipe.photos || []);

        // Render photos
        (recipe.photos || []).forEach(p => addPhotoThumb(p));

        // Render ingredients
        (recipe.ingredients || []).forEach(ri => addRecipeIngredientRow(ri));
      }
    } else {
      titleEl.textContent = 'New Recipe';
    }

    // Render ingredient library
    renderIngredientLibrary();

    // Update pricing preview
    updatePricingPreview();

    // Time per item display
    updateTimePerItem();
  }

  function renderIngredientLibrary(search) {
    const pid = State.profileId;
    const ingredients = DB.getIngredients(pid);
    const q = (search || document.getElementById('library-search').value || '').toLowerCase();
    const filtered = ingredients.filter(i => i.name.toLowerCase().includes(q));
    const chips = document.getElementById('ingredient-chips');

    if (ingredients.length === 0) {
      chips.innerHTML = '<p class="hint-text" style="padding:0.5rem;">No ingredients yet. Add one with the + button.</p>';
      return;
    }

    const addedIds = State.recipeDraft.ingredients.map(ri => ri.ingredientId);
    chips.innerHTML = filtered.map(ing => `
      <div class="ingredient-chip ${addedIds.includes(ing.id) ? 'already-added' : ''}"
           draggable="true"
           data-id="${ing.id}"
           data-name="${esc(ing.name)}"
           data-unit="${esc(ing.defaultUnit)}">
        <span>${esc(ing.name)}</span>
        <span class="chip-unit">${esc(ing.defaultUnit)}</span>
      </div>
    `).join('');

    initDragAndDrop();
  }

  function addRecipeIngredientRow(ri) {
    const listEl = document.getElementById('recipe-ingredients-list');
    const emptyEl = document.getElementById('recipe-ingredients-empty');
    emptyEl.classList.add('hidden');

    // Ensure in draft
    if (!State.recipeDraft.ingredients.find(x => x.ingredientId === ri.ingredientId)) {
      State.recipeDraft.ingredients.push({ ...ri });
    }

    const row = document.createElement('div');
    row.className = 'recipe-ingredient-row';
    row.dataset.ingredientId = ri.ingredientId;

    const unitOptions = ['g','kg','oz','lb','ml','L','fl oz','cup','tbsp','tsp','each','dozen']
      .map(u => `<option value="${u}" ${u === ri.unit ? 'selected' : ''}>${u}</option>`).join('');

    row.innerHTML = `
      <span class="recipe-ingredient-name">${esc(ri.name)}</span>
      <div class="spinner" data-min="0.01" data-max="9999" data-step="0.25" data-decimals="2" data-value="${ri.amount || 1}">
        <button type="button" class="spinner-btn spinner-minus" aria-label="Decrease">−</button>
        <input type="text" class="spinner-input" value="${(ri.amount || 1).toFixed(2)}" aria-label="Amount" />
        <button type="button" class="spinner-btn spinner-plus" aria-label="Increase">+</button>
      </div>
      <select class="unit-select" aria-label="Unit">${unitOptions}</select>
      <button class="btn-icon-remove" data-remove-ingredient="${ri.ingredientId}" aria-label="Remove">×</button>
    `;

    // Init spinner
    const spinner = row.querySelector('.spinner');
    initSpinner(spinner);
    spinner.addEventListener('change', () => {
      updateIngredientInDraft(ri.ingredientId, 'amount', getSpinnerValue(spinner));
      updatePricingPreview();
    });

    // Unit change
    row.querySelector('.unit-select').addEventListener('change', e => {
      updateIngredientInDraft(ri.ingredientId, 'unit', e.target.value);
    });

    listEl.appendChild(row);
    renderIngredientLibrary();
    updatePricingPreview();
  }

  function updateIngredientInDraft(ingredientId, field, value) {
    const ing = State.recipeDraft.ingredients.find(i => i.ingredientId === ingredientId);
    if (ing) ing[field] = value;
  }

  function removeIngredientFromRecipe(ingredientId) {
    State.recipeDraft.ingredients = State.recipeDraft.ingredients.filter(i => i.ingredientId !== ingredientId);
    const row = document.querySelector(`.recipe-ingredient-row[data-ingredient-id="${ingredientId}"]`);
    if (row) row.remove();
    if (State.recipeDraft.ingredients.length === 0) {
      document.getElementById('recipe-ingredients-empty').classList.remove('hidden');
    }
    renderIngredientLibrary();
    updatePricingPreview();
  }

  function updatePricingPreview() {
    const settings = State.settings || DB.getSettings(State.profileId);
    const hourlyRateInput = document.getElementById('recipe-hourly-rate');
    const markupInput     = document.getElementById('recipe-markup');

    const hourlyRate = parseFloat(hourlyRateInput.value) || settings.hourlyRate || 25;
    const markup     = parseFloat(markupInput.value) !== '' && markupInput.value !== ''
                       ? parseFloat(markupInput.value)
                       : (settings.defaultMarkup || 0);

    const ingredients = DB.getIngredients(State.profileId);
    let ingredientCost = 0;
    State.recipeDraft.ingredients.forEach(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredientId);
      if (ing) ingredientCost += (ri.amount || 0) * ing.costPerUnit;
    });

    const hours = State.recipeDraft.hours + (State.recipeDraft.minutes / 60);
    const sim   = Math.max(1, State.recipeDraft.simultaneous);
    const laborHours = hours / sim;
    const laborCost  = laborHours * hourlyRate;
    const base       = ingredientCost + laborCost;
    const markupAmt  = base * (markup / 100);
    const total      = base + markupAmt;

    document.getElementById('pp-ingredient-cost').textContent = formatCurrency(ingredientCost);
    document.getElementById('pp-labor-label').textContent  = `Labor (${laborHours.toFixed(2)} hrs @ $${hourlyRate}/hr)`;
    document.getElementById('pp-labor-cost').textContent   = formatCurrency(laborCost);
    document.getElementById('pp-markup-label').textContent = `Markup (${markup}%)`;
    document.getElementById('pp-markup-amount').textContent = formatCurrency(markupAmt);
    document.getElementById('pp-total').textContent        = formatCurrency(total);
  }

  function updateTimePerItem() {
    const h    = State.recipeDraft.hours;
    const m    = State.recipeDraft.minutes;
    const sim  = Math.max(1, State.recipeDraft.simultaneous);
    const total = h * 60 + m;
    const perItem = Math.round(total / sim);
    const display = document.getElementById('time-per-item-display');

    if (total > 0 && sim > 0) {
      display.classList.remove('hidden');
      document.getElementById('tpi-count').textContent = sim;
      document.getElementById('tpi-time').textContent  = formatMinutes(perItem);
    } else {
      display.classList.add('hidden');
    }
  }

  function bindRecipePhotoUpload() {
    const addSlot = document.getElementById('recipe-photo-add');
    if (!addSlot) return;
    addSlot.addEventListener('click', () => {
      document.getElementById('recipe-photo-input').click();
    });
    document.getElementById('recipe-photo-input').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      const remaining = 5 - State.recipeDraft.photos.length;
      const toAdd = files.slice(0, remaining);
      for (const file of toAdd) {
        const b64 = await readFileAsBase64(file);
        State.recipeDraft.photos.push(b64);
        addPhotoThumb(b64);
      }
      if (State.recipeDraft.photos.length >= 5) {
        addSlot.style.display = 'none';
      }
    });
  }

  function addPhotoThumb(b64) {
    const grid = document.getElementById('recipe-photos-grid');
    const wrapper = document.createElement('div');
    wrapper.className = 'photo-thumb-wrapper';
    wrapper.innerHTML = `
      <img src="${b64}" alt="Recipe photo" />
      <button class="photo-thumb-remove" aria-label="Remove photo">×</button>
    `;
    wrapper.querySelector('.photo-thumb-remove').addEventListener('click', () => {
      const idx = State.recipeDraft.photos.indexOf(b64);
      if (idx > -1) State.recipeDraft.photos.splice(idx, 1);
      wrapper.remove();
      document.getElementById('recipe-photo-add').style.display = '';
    });
    // Insert before the add slot
    const addSlot = document.getElementById('recipe-photo-add');
    if (addSlot) grid.insertBefore(wrapper, addSlot);
    else grid.appendChild(wrapper);
  }

  function saveRecipe() {
    const pid  = State.profileId;
    const id   = document.getElementById('recipe-id').value;
    const name = document.getElementById('recipe-name').value.trim();

    if (!name) {
      showToast('Please enter a recipe name.', 'error');
      return;
    }

    const recipe = {
      id: id || uuid(),
      name,
      category:         document.getElementById('recipe-category').value,
      description:      document.getElementById('recipe-description').value.trim(),
      photos:           State.recipeDraft.photos,
      ingredients:      State.recipeDraft.ingredients,
      timeMinutes:      State.recipeDraft.hours * 60 + State.recipeDraft.minutes,
      simultaneousItems: State.recipeDraft.simultaneous,
      hourlyRate:       document.getElementById('recipe-hourly-rate').value !== ''
                          ? parseFloat(document.getElementById('recipe-hourly-rate').value) : null,
      markup:           document.getElementById('recipe-markup').value !== ''
                          ? parseFloat(document.getElementById('recipe-markup').value) : null,
      createdAt:        new Date().toISOString(),
    };

    let recipes = DB.getRecipes(pid);
    if (id) {
      recipes = recipes.map(r => r.id === id ? recipe : r);
      showToast('Recipe saved!', 'success');
    } else {
      recipes.push(recipe);
      showToast('Recipe created!', 'success');
    }
    DB.saveRecipes(pid, recipes);
    showView('recipes');
  }

  function initRecipeBuilder() {
    // Back button
    document.getElementById('recipe-builder-back').addEventListener('click', () => showView('recipes'));

    // Save buttons (header + footer)
    document.getElementById('save-recipe-btn').addEventListener('click', saveRecipe);
    document.getElementById('save-recipe-footer-btn').addEventListener('click', saveRecipe);
    document.getElementById('save-recipe-cancel').addEventListener('click', () => showView('recipes'));

    // Library search
    document.getElementById('library-search').addEventListener('input', e => {
      renderIngredientLibrary(e.target.value);
    });

    // Quick add ingredient button
    document.getElementById('quick-add-ingredient-btn').addEventListener('click', () => {
      document.getElementById('quick-ingredient-modal-overlay').classList.remove('hidden');
      document.getElementById('qi-name').focus();
    });

    // Quick ingredient form submit
    document.getElementById('quick-ingredient-form').addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('qi-name').value.trim();
      const unit = document.getElementById('qi-unit').value;
      const cost = parseFloat(document.getElementById('qi-cost').value) || 0;
      if (!name) return;
      const ingredients = DB.getIngredients(State.profileId);
      ingredients.push({ id: uuid(), name, defaultUnit: unit, costPerUnit: cost, createdAt: new Date().toISOString() });
      DB.saveIngredients(State.profileId, ingredients);
      document.getElementById('quick-ingredient-modal-overlay').classList.add('hidden');
      document.getElementById('quick-ingredient-form').reset();
      showToast('Ingredient added to library!', 'success');
      renderIngredientLibrary();
    });

    // Time spinners
    const hoursSpinner = document.getElementById('time-hours-spinner');
    const minsSpinner  = document.getElementById('time-minutes-spinner');
    const simSpinner   = document.getElementById('simultaneous-spinner');

    initSpinners(document.getElementById('view-recipe-builder'));

    hoursSpinner.addEventListener('change', () => {
      State.recipeDraft.hours = getSpinnerValue(hoursSpinner);
      updateTimePerItem();
      updatePricingPreview();
    });
    minsSpinner.addEventListener('change', () => {
      State.recipeDraft.minutes = getSpinnerValue(minsSpinner);
      updateTimePerItem();
      updatePricingPreview();
    });
    simSpinner.addEventListener('change', () => {
      State.recipeDraft.simultaneous = getSpinnerValue(simSpinner);
      updateTimePerItem();
      updatePricingPreview();
    });

    // Pricing overrides
    document.getElementById('recipe-hourly-rate').addEventListener('input', updatePricingPreview);
    document.getElementById('recipe-markup').addEventListener('input', updatePricingPreview);

    // Remove ingredient (delegated)
    document.getElementById('recipe-ingredients-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-remove-ingredient]');
      if (btn) removeIngredientFromRecipe(btn.dataset.removeIngredient);
    });
  }

  /* ═══════════════════════════════════════════════════════
     16. QUOTE BUILDER VIEW
  ═══════════════════════════════════════════════════════ */

  function startNewQuote() {
    State.editingJobId = null;
    State.quoteItems = [];
    showView('new-quote', { fresh: true });
  }

  function startNewQuoteWithRecipe(recipeId) {
    State.editingJobId = null;
    State.quoteItems = [];
    const recipe = DB.getRecipes(State.profileId).find(r => r.id === recipeId);
    if (recipe) {
      const settings = DB.getSettings(State.profileId);
      const cost = calcRecipeCost(recipe, settings);
      State.quoteItems.push({
        type: 'recipe',
        recipeId: recipe.id,
        name: recipe.name,
        description: recipe.category,
        quantity: 1,
        unitPrice: Math.round(cost.total * 100) / 100,
      });
    }
    showView('new-quote', { fresh: true });
  }

  function renderQuoteBuilder(options) {
    const pid      = State.profileId;
    const settings = DB.getSettings(pid);

    document.getElementById('quote-view-title').textContent = State.editingJobId ? 'Edit Quote' : 'New Quote';

    // Load job data if editing
    if (State.editingJobId) {
      const job = DB.getJobs(pid).find(j => j.id === State.editingJobId);
      if (job) {
        document.getElementById('quote-job-id').value   = job.id;
        document.getElementById('quote-customer-name').value = job.customerName;
        document.getElementById('quote-email').value    = job.customerEmail || '';
        document.getElementById('quote-phone').value    = job.customerPhone || '';
        document.getElementById('quote-due-date').value = job.dueDate || '';
        document.getElementById('quote-notes').value    = job.notes || '';
        document.getElementById('quote-markup').value   = job.markupPct;
        document.getElementById('quote-tax').value      = job.taxPct;
        document.getElementById('quote-hourly-rate').value = settings.hourlyRate || 25;
        State.quoteItems = clone(job.items || []);
      }
    } else if (options && options.fresh) {
      document.getElementById('quote-job-id').value   = '';
      document.getElementById('quote-customer-name').value = '';
      document.getElementById('quote-email').value    = '';
      document.getElementById('quote-phone').value    = '';
      document.getElementById('quote-due-date').value = '';
      document.getElementById('quote-notes').value    = '';
      document.getElementById('quote-markup').value   = settings.defaultMarkup || 0;
      document.getElementById('quote-tax').value      = settings.defaultTax || 0;
      document.getElementById('quote-hourly-rate').value = settings.hourlyRate || 25;
    }

    renderQuoteItems();
    updateQuoteSummary();
  }

  function renderQuoteItems() {
    const list    = document.getElementById('quote-items-list');
    const emptyEl = document.getElementById('quote-items-empty');

    if (State.quoteItems.length === 0) {
      emptyEl.classList.remove('hidden');
      list.innerHTML = '';
      return;
    }

    emptyEl.classList.add('hidden');
    list.innerHTML = State.quoteItems.map((item, idx) => `
      <div class="quote-item-row" data-idx="${idx}">
        <div class="quote-item-info">
          <div class="quote-item-name">${esc(item.name)}</div>
          ${item.description ? `<div class="quote-item-desc">${esc(item.description)}</div>` : ''}
        </div>
        <div class="spinner" data-min="1" data-max="999" data-step="1" data-decimals="0" data-value="${item.quantity}" style="max-width:110px;">
          <button type="button" class="spinner-btn spinner-minus" aria-label="Decrease">−</button>
          <input type="text" class="spinner-input" value="${item.quantity}" aria-label="Quantity" />
          <button type="button" class="spinner-btn spinner-plus" aria-label="Increase">+</button>
        </div>
        <div class="quote-item-price">
          <div class="quote-item-unit-price">${formatCurrency(item.unitPrice)} ea</div>
          <div class="quote-item-line-total">${formatCurrency(item.quantity * item.unitPrice)}</div>
        </div>
        <button class="btn-icon-remove" data-remove-item="${idx}" aria-label="Remove">×</button>
      </div>
    `).join('');

    // Init spinners and wire changes
    list.querySelectorAll('.spinner').forEach((spinner, idx) => {
      initSpinner(spinner);
      spinner.addEventListener('change', () => {
        const row = spinner.closest('.quote-item-row');
        const itemIdx = parseInt(row.dataset.idx, 10);
        State.quoteItems[itemIdx].quantity = Math.max(1, getSpinnerValue(spinner));
        // Update line total display
        const lineTotal = row.querySelector('.quote-item-line-total');
        if (lineTotal) lineTotal.textContent = formatCurrency(State.quoteItems[itemIdx].quantity * State.quoteItems[itemIdx].unitPrice);
        updateQuoteSummary();
      });
    });

    // Remove item
    list.querySelectorAll('[data-remove-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeItem, 10);
        State.quoteItems.splice(idx, 1);
        renderQuoteItems();
        updateQuoteSummary();
      });
    });
  }

  function updateQuoteSummary() {
    const markup = parseFloat(document.getElementById('quote-markup').value) || 0;
    const tax    = parseFloat(document.getElementById('quote-tax').value) || 0;

    const subtotal   = State.quoteItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const markupAmt  = subtotal * (markup / 100);
    const taxAmt     = (subtotal + markupAmt) * (tax / 100);
    const total      = subtotal + markupAmt + taxAmt;

    document.getElementById('qs-subtotal').textContent      = formatCurrency(subtotal);
    document.getElementById('qs-markup-label').textContent  = `Markup (${markup}%)`;
    document.getElementById('qs-markup').textContent        = formatCurrency(markupAmt);
    document.getElementById('qs-tax-label').textContent     = `Tax (${tax}%)`;
    document.getElementById('qs-tax').textContent           = formatCurrency(taxAmt);
    document.getElementById('qs-total').textContent         = formatCurrency(total);
  }

  function generateInvoiceFromQuote() {
    const pid = State.profileId;
    const customerName = document.getElementById('quote-customer-name').value.trim();
    if (!customerName) {
      showToast('Please enter a customer name.', 'error');
      return;
    }
    if (State.quoteItems.length === 0) {
      showToast('Please add at least one item.', 'error');
      return;
    }

    const markup = parseFloat(document.getElementById('quote-markup').value) || 0;
    const tax    = parseFloat(document.getElementById('quote-tax').value) || 0;

    const subtotal  = State.quoteItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const markupAmt = subtotal * (markup / 100);
    const taxAmt    = (subtotal + markupAmt) * (tax / 100);
    const total     = subtotal + markupAmt + taxAmt;

    const jobs = DB.getJobs(pid);
    const existingId = document.getElementById('quote-job-id').value;

    const job = {
      id: existingId || uuid(),
      invoiceNumber: existingId
        ? (jobs.find(j => j.id === existingId) || {}).invoiceNumber || genInvoiceNumber(jobs)
        : genInvoiceNumber(jobs),
      customerName,
      customerEmail: document.getElementById('quote-email').value.trim(),
      customerPhone: document.getElementById('quote-phone').value.trim(),
      dueDate:       document.getElementById('quote-due-date').value,
      items:         State.quoteItems,
      notes:         document.getElementById('quote-notes').value.trim(),
      subtotal,
      markupPct:     markup,
      taxPct:        tax,
      total,
      status:        'open',
      createdAt:     existingId ? (jobs.find(j => j.id === existingId) || {}).createdAt || new Date().toISOString() : new Date().toISOString(),
      completedAt:   null,
    };

    let updatedJobs;
    if (existingId) {
      updatedJobs = jobs.map(j => j.id === existingId ? job : j);
    } else {
      updatedJobs = [...jobs, job];
    }
    DB.saveJobs(pid, updatedJobs);
    showToast('Invoice generated!', 'success');
    showView('invoice', { jobId: job.id });
  }

  function initQuoteBuilder() {
    document.getElementById('add-from-recipes-btn').addEventListener('click', openRecipePicker);
    document.getElementById('add-custom-item-btn').addEventListener('click', () => {
      document.getElementById('custom-item-modal-overlay').classList.remove('hidden');
      document.getElementById('custom-item-name').focus();
      initSpinners(document.getElementById('custom-item-modal-overlay'));
    });

    document.getElementById('quote-markup').addEventListener('input', updateQuoteSummary);
    document.getElementById('quote-tax').addEventListener('input', updateQuoteSummary);

    document.getElementById('generate-invoice-btn').addEventListener('click', generateInvoiceFromQuote);
    document.getElementById('generate-invoice-footer-btn').addEventListener('click', generateInvoiceFromQuote);
    document.getElementById('quote-cancel-btn').addEventListener('click', () => showView('dashboard'));

    // Custom item form
    document.getElementById('custom-item-form').addEventListener('submit', e => {
      e.preventDefault();
      const nameEl   = document.getElementById('custom-item-name');
      const descEl   = document.getElementById('custom-item-desc');
      const priceEl  = document.getElementById('custom-item-price');
      const qtySpinner = document.getElementById('custom-item-qty-spinner');

      const name  = nameEl.value.trim();
      const price = parseFloat(priceEl.value) || 0;
      if (!name) return;

      State.quoteItems.push({
        type: 'custom',
        name,
        description: descEl.value.trim(),
        quantity: Math.max(1, getSpinnerValue(qtySpinner)),
        unitPrice: price,
      });

      document.getElementById('custom-item-modal-overlay').classList.add('hidden');
      document.getElementById('custom-item-form').reset();
      renderQuoteItems();
      updateQuoteSummary();
      showToast('Item added!', 'success');
    });
  }

  function openRecipePicker() {
    const overlay = document.getElementById('recipe-picker-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('recipe-picker-search').value = '';
    renderRecipePickerList('');
    document.getElementById('recipe-picker-search').focus();
  }

  function renderRecipePickerList(query) {
    const recipes  = DB.getRecipes(State.profileId);
    const settings = DB.getSettings(State.profileId);
    const q        = query.toLowerCase();
    const filtered = recipes.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    const list     = document.getElementById('recipe-picker-list');

    if (filtered.length === 0) {
      list.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;font-size:0.85rem;">No recipes found.</p>';
      return;
    }

    const emojis = {
      'Single Layer Cake':'🎂','Double Layer Cake':'🎂','Triple Layer Cake':'🎂',
      'Sheet Cake':'🍰','6 Cupcakes':'🧁','12 Cupcakes':'🧁','24 Cupcakes':'🧁',
      '6 Cake Pops':'🍭','12 Cake Pops':'🍭','24 Cake Pops':'🍭',
      'Cookies (dozen)':'🍪','Brownies':'🍫','Bread Loaf':'🍞','Custom':'✨'
    };

    list.innerHTML = filtered.map(r => {
      const cost  = calcRecipeCost(r, settings);
      const thumb = r.photos && r.photos.length > 0
        ? `<img src="${r.photos[0]}" alt="${esc(r.name)}" />`
        : (emojis[r.category] || '🍴');
      return `
        <div class="recipe-picker-item" data-recipe-id="${r.id}" data-price="${cost.total.toFixed(2)}">
          <div class="recipe-picker-thumb">${typeof thumb === 'string' && thumb.startsWith('<img') ? thumb : `<span>${thumb}</span>`}</div>
          <div class="recipe-picker-info">
            <div class="recipe-picker-name">${esc(r.name)}</div>
            <div class="recipe-picker-meta">${esc(r.category)}</div>
          </div>
          <div class="recipe-picker-price">${formatCurrency(cost.total)}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.recipe-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const rid   = item.dataset.recipeId;
        const price = parseFloat(item.dataset.price) || 0;
        const recipe = recipes.find(r => r.id === rid);
        if (!recipe) return;

        State.quoteItems.push({
          type: 'recipe',
          recipeId: rid,
          name: recipe.name,
          description: recipe.category,
          quantity: 1,
          unitPrice: Math.round(price * 100) / 100,
        });

        document.getElementById('recipe-picker-overlay').classList.add('hidden');
        renderQuoteItems();
        updateQuoteSummary();
        showToast('Recipe added to quote!', 'success');
      });
    });
  }

  function initRecipePicker() {
    document.getElementById('recipe-picker-search').addEventListener('input', e => {
      renderRecipePickerList(e.target.value);
    });
  }

  /* ═══════════════════════════════════════════════════════
     17. INVOICE VIEW
  ═══════════════════════════════════════════════════════ */

  function renderInvoice(options) {
    const pid   = State.profileId;
    const jobId = options && options.jobId;
    if (!jobId) return;

    const job     = DB.getJobs(pid).find(j => j.id === jobId);
    if (!job) { showToast('Job not found.', 'error'); return; }

    const profile = State.profile;

    // Store job id for action buttons
    document.getElementById('invoice-complete-btn').dataset.jobId = jobId;
    document.getElementById('invoice-edit-btn').dataset.jobId = jobId;
    document.getElementById('invoice-back-btn').dataset.jobId = jobId;

    // Bakery info
    document.getElementById('inv-bakery-name').textContent  = profile.bakeryName;
    document.getElementById('inv-owner-name').textContent   = profile.ownerName;
    const photoEl = document.getElementById('inv-bakery-photo');
    if (profile.photo) {
      photoEl.src = profile.photo;
      photoEl.classList.remove('hidden');
    } else {
      photoEl.classList.add('hidden');
    }

    // Invoice meta
    document.getElementById('inv-number').textContent   = job.invoiceNumber;
    document.getElementById('inv-date').textContent     = formatDate(job.createdAt);
    document.getElementById('inv-due-date').textContent = job.dueDate ? formatDate(job.dueDate) : '—';
    const statusBadge = document.getElementById('inv-status');
    statusBadge.textContent = job.status;
    statusBadge.className   = 'status-badge ' + job.status;

    // Customer
    document.getElementById('inv-customer-name').textContent  = job.customerName;
    const emailEl = document.getElementById('inv-customer-email');
    const phoneEl = document.getElementById('inv-customer-phone');
    emailEl.textContent = job.customerEmail || '';
    phoneEl.textContent = job.customerPhone || '';

    // Items
    const tbody = document.getElementById('inv-items-tbody');
    tbody.innerHTML = (job.items || []).map(item => `
      <tr>
        <td>
          <div>${esc(item.name)}</div>
          ${item.description ? `<div class="invoice-item-desc">${esc(item.description)}</div>` : ''}
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">${formatCurrency(item.unitPrice)}</td>
        <td class="text-right">${formatCurrency(item.quantity * item.unitPrice)}</td>
      </tr>
    `).join('');

    // Totals
    const markupAmt = job.subtotal * (job.markupPct / 100);
    const taxAmt    = (job.subtotal + markupAmt) * (job.taxPct / 100);

    document.getElementById('inv-subtotal').textContent = formatCurrency(job.subtotal);

    const markupRow = document.getElementById('inv-markup-row');
    if (job.markupPct > 0) {
      markupRow.style.display = '';
      document.getElementById('inv-markup-label').textContent = `Markup (${job.markupPct}%)`;
      document.getElementById('inv-markup').textContent = formatCurrency(markupAmt);
    } else {
      markupRow.style.display = 'none';
    }

    const taxRow = document.getElementById('inv-tax-row');
    if (job.taxPct > 0) {
      taxRow.style.display = '';
      document.getElementById('inv-tax-label').textContent = `Tax (${job.taxPct}%)`;
      document.getElementById('inv-tax').textContent = formatCurrency(taxAmt);
    } else {
      taxRow.style.display = 'none';
    }

    document.getElementById('inv-total').textContent = formatCurrency(job.total);

    // Notes
    const notesSection = document.getElementById('inv-notes-section');
    const notesEl = document.getElementById('inv-notes');
    if (job.notes) {
      notesSection.style.display = '';
      notesEl.textContent = job.notes;
    } else {
      notesSection.style.display = 'none';
    }

    // Complete button visibility
    const completeBtn = document.getElementById('invoice-complete-btn');
    if (job.status === 'completed') {
      completeBtn.textContent = 'Mark as Open';
    } else {
      completeBtn.textContent = 'Mark as Completed';
    }
  }

  function initInvoice() {
    document.getElementById('invoice-back-btn').addEventListener('click', () => {
      showView('job-history');
    });

    document.getElementById('invoice-edit-btn').addEventListener('click', e => {
      const jobId = e.currentTarget.dataset.jobId;
      const job   = DB.getJobs(State.profileId).find(j => j.id === jobId);
      if (!job) return;
      State.editingJobId = jobId;
      State.quoteItems   = clone(job.items || []);
      showView('new-quote');
    });

    document.getElementById('invoice-complete-btn').addEventListener('click', e => {
      const jobId = e.currentTarget.dataset.jobId;
      const jobs  = DB.getJobs(State.profileId);
      const job   = jobs.find(j => j.id === jobId);
      if (!job) return;

      if (job.status === 'open') {
        job.status      = 'completed';
        job.completedAt = new Date().toISOString();
        showToast('Job marked as completed!', 'success');
      } else {
        job.status      = 'open';
        job.completedAt = null;
        showToast('Job marked as open.', 'info');
      }
      DB.saveJobs(State.profileId, jobs);
      renderInvoice({ jobId });
    });
  }

  /* ═══════════════════════════════════════════════════════
     18. JOB HISTORY VIEW
  ═══════════════════════════════════════════════════════ */

  function renderJobHistory() {
    const pid  = State.profileId;
    const jobs = DB.getJobs(pid);

    const search  = (document.getElementById('job-search').value || '').toLowerCase();
    const status  = document.querySelector('#view-job-history .filter-chip.active')?.dataset.status || 'all';

    let filtered = jobs.filter(j => {
      const matchSearch = !search || j.customerName.toLowerCase().includes(search);
      const matchStatus = status === 'all' || j.status === status;
      return matchSearch && matchStatus;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const empty   = document.getElementById('jobs-empty');
    const wrapper = document.getElementById('jobs-table-wrapper');
    const tbody   = document.getElementById('jobs-tbody');

    if (jobs.length === 0) {
      empty.classList.remove('hidden');
      wrapper.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    wrapper.classList.remove('hidden');

    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-3);">No jobs match your search.</td></tr>`
      : filtered.map(j => `
        <tr class="clickable" data-job-id="${j.id}">
          <td>${esc(j.invoiceNumber)}</td>
          <td>${esc(j.customerName)}</td>
          <td>${formatDate(j.createdAt)}</td>
          <td>${j.items ? j.items.length : 0} item${(j.items || []).length !== 1 ? 's' : ''}</td>
          <td>${formatCurrency(j.total)}</td>
          <td><span class="status-badge ${j.status}">${j.status}</span></td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" data-action="view-job" data-id="${j.id}">View</button>
              <button class="btn btn-danger-outline btn-sm" data-action="delete-job" data-id="${j.id}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');

    // Click row to view
    tbody.querySelectorAll('tr.clickable').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return; // Don't trigger on button clicks
        showView('invoice', { jobId: row.dataset.jobId });
      });
    });
  }

  function initJobHistory() {
    document.getElementById('new-job-btn').addEventListener('click', startNewQuote);
    document.getElementById('new-job-empty-btn').addEventListener('click', startNewQuote);
    document.getElementById('job-search').addEventListener('input', renderJobHistory);

    // Status filter chips
    document.querySelectorAll('#view-job-history .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#view-job-history .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderJobHistory();
      });
    });

    // Table action buttons (delegated)
    document.getElementById('view-job-history').addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'view-job') {
        showView('invoice', { jobId: id });
      }
      if (action === 'delete-job') {
        const ok = await showConfirm('This will permanently delete this job and invoice.', 'Delete Job?', 'Delete');
        if (!ok) return;
        let jobs = DB.getJobs(State.profileId);
        jobs = jobs.filter(j => j.id !== id);
        DB.saveJobs(State.profileId, jobs);
        showToast('Job deleted.', 'success');
        renderJobHistory();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     19. SETTINGS VIEW
  ═══════════════════════════════════════════════════════ */

  function renderSettings() {
    const pid      = State.profileId;
    const profile  = State.profile;
    const settings = DB.getSettings(pid);

    // Profile fields
    document.getElementById('settings-bakery-name').value = profile.bakeryName;
    document.getElementById('settings-owner-name').value  = profile.ownerName;

    // Profile photo preview
    const initEl    = document.getElementById('settings-initials');
    const photoEl   = document.getElementById('settings-photo-preview');
    initEl.textContent = initials(profile.ownerName);
    if (profile.photo) {
      photoEl.src = profile.photo;
      photoEl.classList.remove('hidden');
      initEl.style.display = 'none';
    } else {
      photoEl.classList.add('hidden');
      initEl.style.display = '';
    }

    // Pricing
    document.getElementById('settings-hourly-rate').value = settings.hourlyRate || 25;
    document.getElementById('settings-markup').value      = settings.defaultMarkup || 0;
    document.getElementById('settings-tax').value         = settings.defaultTax || 0;

    // Theme
    document.getElementById('theme-toggle-input').checked = settings.theme === 'dark';

    // Units
    document.getElementById('units-imperial-btn').classList.toggle('active', settings.defaultUnits === 'imperial');
    document.getElementById('units-metric-btn').classList.toggle('active', settings.defaultUnits === 'metric');

    // Time categories
    renderTimeCategories(settings.timeCategories || []);
  }

  function renderTimeCategories(cats) {
    const list = document.getElementById('time-categories-list');
    list.innerHTML = cats.map((cat, idx) => `
      <div class="time-category-row" data-idx="${idx}">
        <input type="text" class="time-cat-name" value="${esc(cat.name)}" placeholder="Category name" />
        <input type="number" class="time-cat-minutes" value="${cat.estimatedMinutes}" min="0" step="5" placeholder="mins" />
        <span class="time-cat-label">min</span>
        <button class="btn-icon-remove" data-remove-cat="${idx}" aria-label="Remove category">×</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-remove-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeCat, 10);
        const settings = DB.getSettings(State.profileId);
        settings.timeCategories.splice(idx, 1);
        DB.saveSettings(State.profileId, settings);
        renderTimeCategories(settings.timeCategories);
      });
    });
  }

  let settingsPhotoB64 = null;

  function initSettings() {
    // Profile photo change
    document.getElementById('settings-change-photo-btn').addEventListener('click', () => {
      document.getElementById('settings-photo-input').click();
    });

    document.getElementById('settings-photo-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      settingsPhotoB64 = await readFileAsBase64(file);
      const photoEl = document.getElementById('settings-photo-preview');
      photoEl.src = settingsPhotoB64;
      photoEl.classList.remove('hidden');
      document.getElementById('settings-initials').style.display = 'none';
    });

    // Save profile
    document.getElementById('save-profile-btn').addEventListener('click', () => {
      const pid     = State.profileId;
      const profiles = DB.getProfiles();
      const idx     = profiles.findIndex(p => p.id === pid);
      if (idx === -1) return;

      const bakeryName = document.getElementById('settings-bakery-name').value.trim();
      const ownerName  = document.getElementById('settings-owner-name').value.trim();
      if (!bakeryName || !ownerName) {
        showToast('Name fields cannot be empty.', 'error');
        return;
      }

      profiles[idx].bakeryName = bakeryName;
      profiles[idx].ownerName  = ownerName;
      if (settingsPhotoB64) profiles[idx].photo = settingsPhotoB64;

      DB.saveProfiles(profiles);
      State.profile = profiles[idx];
      settingsPhotoB64 = null;
      updateSidebar();
      showToast('Profile saved!', 'success');
    });

    // Delete profile
    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
      const ok = await showConfirm(
        'This will permanently delete your bakery profile, all ingredients, recipes, and jobs.',
        'Delete Profile?',
        'Delete Everything'
      );
      if (!ok) return;
      const pid = State.profileId;
      let profiles = DB.getProfiles();
      profiles = profiles.filter(p => p.id !== pid);
      DB.saveProfiles(profiles);
      localStorage.removeItem('bakerOS_ingredients_' + pid);
      localStorage.removeItem('bakerOS_recipes_' + pid);
      localStorage.removeItem('bakerOS_settings_' + pid);
      localStorage.removeItem('bakerOS_jobs_' + pid);
      State.profileId = null;
      State.profile   = null;
      State.settings  = null;
      showToast('Profile deleted.', 'info');
      showProfileSelect();
    });

    // Theme toggle
    document.getElementById('theme-toggle-input').addEventListener('change', () => {
      toggleTheme();
    });

    // Pricing save
    document.getElementById('save-pricing-btn').addEventListener('click', () => {
      const settings = DB.getSettings(State.profileId);
      settings.hourlyRate    = parseFloat(document.getElementById('settings-hourly-rate').value) || 25;
      settings.defaultMarkup = parseFloat(document.getElementById('settings-markup').value) || 0;
      settings.defaultTax    = parseFloat(document.getElementById('settings-tax').value) || 0;
      DB.saveSettings(State.profileId, settings);
      State.settings = settings;
      showToast('Pricing defaults saved!', 'success');
    });

    // Units
    document.getElementById('units-imperial-btn').addEventListener('click', () => {
      document.getElementById('units-imperial-btn').classList.add('active');
      document.getElementById('units-metric-btn').classList.remove('active');
    });
    document.getElementById('units-metric-btn').addEventListener('click', () => {
      document.getElementById('units-metric-btn').classList.add('active');
      document.getElementById('units-imperial-btn').classList.remove('active');
    });

    document.getElementById('save-units-btn').addEventListener('click', () => {
      const settings = DB.getSettings(State.profileId);
      settings.defaultUnits = document.getElementById('units-imperial-btn').classList.contains('active') ? 'imperial' : 'metric';
      DB.saveSettings(State.profileId, settings);
      State.settings = settings;
      showToast('Unit preferences saved!', 'success');
    });

    // Add time category
    document.getElementById('add-time-category-btn').addEventListener('click', () => {
      const settings = DB.getSettings(State.profileId);
      settings.timeCategories = settings.timeCategories || [];
      settings.timeCategories.push({ id: uuid(), name: '', estimatedMinutes: 60 });
      DB.saveSettings(State.profileId, settings);
      renderTimeCategories(settings.timeCategories);
      // Focus last name input
      const inputs = document.querySelectorAll('.time-cat-name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Save time categories on blur (delegated)
    document.getElementById('time-categories-list').addEventListener('blur', e => {
      if (!e.target.matches('.time-cat-name, .time-cat-minutes')) return;
      saveTimeCategoriesFromDOM();
    }, true);

    // Change event for saving too
    document.getElementById('time-categories-list').addEventListener('change', e => {
      if (!e.target.matches('.time-cat-name, .time-cat-minutes')) return;
      saveTimeCategoriesFromDOM();
    });
  }

  function saveTimeCategoriesFromDOM() {
    const rows = document.querySelectorAll('.time-category-row');
    const cats = [];
    rows.forEach((row, idx) => {
      const name  = row.querySelector('.time-cat-name').value.trim();
      const mins  = parseInt(row.querySelector('.time-cat-minutes').value, 10) || 0;
      const settings = DB.getSettings(State.profileId);
      const existing = (settings.timeCategories || [])[idx];
      cats.push({ id: existing ? existing.id : uuid(), name, estimatedMinutes: mins });
    });
    const settings = DB.getSettings(State.profileId);
    settings.timeCategories = cats;
    DB.saveSettings(State.profileId, settings);
    State.settings = settings;
  }

  /* ═══════════════════════════════════════════════════════
     20. DRAG & DROP (Recipe Builder)
  ═══════════════════════════════════════════════════════ */

  function initDragAndDrop() {
    const chips   = document.querySelectorAll('.ingredient-chip:not(.already-added)');
    const dropZone = document.getElementById('recipe-drop-zone');
    if (!dropZone) return;

    // Make chips draggable
    chips.forEach(chip => {
      chip.addEventListener('dragstart', e => {
        chip.classList.add('dragging');
        e.dataTransfer.setData('text/plain', chip.dataset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
      });

      // Double-click to add
      chip.addEventListener('dblclick', () => {
        addIngredientToRecipe(chip.dataset.id, chip.dataset.name, chip.dataset.unit);
      });
    });

    // Drop zone events
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', e => {
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
      }
    });

    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      const chip = document.querySelector(`.ingredient-chip[data-id="${id}"]`);
      if (!chip) return;
      addIngredientToRecipe(id, chip.dataset.name, chip.dataset.unit);
    });
  }

  function addIngredientToRecipe(ingredientId, name, unit) {
    // Check for duplicate
    if (State.recipeDraft.ingredients.find(i => i.ingredientId === ingredientId)) {
      showToast(name + ' is already in this recipe.', 'info');
      return;
    }

    const ri = { ingredientId, name, amount: 1, unit };
    addRecipeIngredientRow(ri);
  }

  /* ═══════════════════════════════════════════════════════
     21. GLOBAL EVENT LISTENERS
  ═══════════════════════════════════════════════════════ */

  function initGlobalListeners() {
    // Close modals via close buttons and [data-modal] buttons
    document.addEventListener('click', e => {
      const closeBtn = e.target.closest('.modal-close, [data-modal]');
      if (closeBtn) {
        const targetId = closeBtn.dataset.modal || closeBtn.closest('.overlay')?.id;
        if (targetId) document.getElementById(targetId)?.classList.add('hidden');
      }
    });

    // Close modal on overlay click (but not modal itself)
    document.querySelectorAll('.overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
        }
      });
    });

    // Close modals on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.overlay:not(.hidden)').forEach(overlay => {
          overlay.classList.add('hidden');
        });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     22. INIT
  ═══════════════════════════════════════════════════════ */

  function init() {
    // Init all UI modules
    initGlobalListeners();
    initSidebar();
    initOnboarding();
    initProfileSelect();
    initDashboard();
    initIngredients();
    initRecipes();
    initRecipeBuilder();
    initQuoteBuilder();
    initRecipePicker();
    initInvoice();
    initJobHistory();
    initSettings();

    // Init global spinner instances in modals
    initSpinners();

    // Determine initial view
    const profiles = DB.getProfiles();
    if (profiles.length === 0) {
      showOnboarding();
    } else if (profiles.length === 1) {
      // Auto-login if only one profile
      loginProfile(profiles[0]);
    } else {
      showProfileSelect();
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
