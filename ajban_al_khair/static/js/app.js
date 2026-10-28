/**
 * تعاونية أجبان الخير - Coopérative Ajban Al Khair
 * JavaScript Logic for Financial Management & Visual Analytics
 */

// Bulletproof Storage polyfill: Ensure localStorage never throws SecurityError in restricted WebViews
(function() {
  try {
    const testKey = "__ajban_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
  } catch (err) {
    console.warn("Native localStorage restricted or disabled in WebView. Activating in-memory safeStorage polyfill.");
    const memStore = {};
    const mockStorage = {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null; },
      setItem: function(k, v) { memStore[k] = String(v); },
      removeItem: function(k) { delete memStore[k]; },
      clear: function() { for (let k in memStore) delete memStore[k]; },
      get length() { return Object.keys(memStore).length; },
      key: function(i) { return Object.keys(memStore)[i] || null; }
    };
    try {
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        configurable: true,
        enumerable: true,
        writable: true
      });
    } catch (e) {
      window.localStorage = mockStorage;
    }
  }
})();

// Global Application State
const state = {
  period: "today",
  startDate: "",
  endDate: "",
  typeFilter: "all",
  categoryFilter: "all",
  searchQuery: "",
  categories: { income: [], expense: [], income_list: [], expense_list: [] },
  catManagerTab: "masrouf",
  catSummaryView: "comparative",
  catExpenseSummary: [],
  kounach: {
    summary: { total_due: 0, total_paid: 0, remaining: 0, count: 0 },
    accounts: [],
    search: "",
    category: "all",
    status: "all"
  },
  activeKounachAccountId: null,
  transactions: [],
  systemInfo: null,
  charts: {
    trends: null,
    expensePie: null
  },
  // PWA and Realtime Sync State
  appVersion: null,
  dataFingerprint: null,
  deferredPrompt: null,
  isPwaInstalled: false,
  syncInterval: null
};

// DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  initOfflineEngine();
  initPWA();
  loadInitialData();
  registerServiceWorker();
  initRealtimeSync();
});

/* ==========================================================================
   Initialization & Event Listeners
   ========================================================================== */
function setupEventListeners() {
  // Period Pills
  const periodPills = document.querySelectorAll(".period-pill");
  periodPills.forEach(pill => {
    pill.addEventListener("click", () => {
      periodPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const pVal = pill.getAttribute("data-period");
      state.period = pVal;

      const customRangeCard = document.getElementById("customRangeCard");
      if (pVal === "custom") {
        customRangeCard.style.display = "flex";
      } else {
        customRangeCard.style.display = "none";
        refreshDashboard();
      }
    });
  });

  // Custom Date Apply
  document.getElementById("btnApplyCustomDates").addEventListener("click", () => {
    const s = document.getElementById("startDateInput").value;
    const e = document.getElementById("endDateInput").value;
    if (!s || !e) {
      showToast("يرجى اختيار تاريخ البداية والنهاية", "error");
      return;
    }
    state.startDate = s;
    state.endDate = e;
    refreshDashboard();
  });

  // Category Summary Tabs (Comparative, Week, Month, Year)
  const summaryTabs = document.querySelectorAll(".btn-summary-tab");
  summaryTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      summaryTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.catSummaryView = tab.getAttribute("data-view");
      renderCategoryExpenseSummary();
    });
  });

  // Quick Action Buttons
  document.getElementById("btnQuickAddIncome").addEventListener("click", () => {
    openTransactionModal("mad5oul");
  });

  document.getElementById("btnQuickAddExpense").addEventListener("click", () => {
    openTransactionModal("masrouf");
  });

  // Type Segments inside Modal
  document.getElementById("btnSelectIncome").addEventListener("click", () => {
    setModalType("mad5oul");
  });

  document.getElementById("btnSelectExpense").addEventListener("click", () => {
    setModalType("masrouf");
  });

  // Modal Close & Cancel
  document.getElementById("btnCloseTxModal").addEventListener("click", closeTransactionModal);
  document.getElementById("btnCancelTxModal").addEventListener("click", closeTransactionModal);

  // Quick Amount Chips
  document.querySelectorAll(".quick-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const addVal = parseFloat(chip.getAttribute("data-val")) || 0;
      const amountInput = document.getElementById("txAmountInput");
      const current = parseFloat(amountInput.value) || 0;
      amountInput.value = (current + addVal).toFixed(2);
      amountInput.focus();
    });
  });

  // Category select change (check for custom)
  document.getElementById("txCategorySelect").addEventListener("change", (e) => {
    const customInput = document.getElementById("txCustomCategoryInput");
    if (e.target.value === "__custom__") {
      customInput.style.display = "block";
      customInput.focus();
    } else {
      customInput.style.display = "none";
    }
  });

  // Transaction Form Submit
  document.getElementById("txForm").addEventListener("submit", handleSaveTransaction);

  // Mobile Connect Modal
  const btnOpenMobile = document.getElementById("btnOpenMobileModal");
  if (btnOpenMobile) btnOpenMobile.addEventListener("click", openMobileModal);

  const btnCloseMobile = document.getElementById("btnCloseMobileModal");
  if (btnCloseMobile) btnCloseMobile.addEventListener("click", () => {
    const mm = document.getElementById("mobileModal");
    if (mm) mm.style.display = "none";
  });

  const btnCopyMobile = document.getElementById("btnCopyMobileUrl");
  if (btnCopyMobile) btnCopyMobile.addEventListener("click", copyMobileUrl);

  // PWA Install Triggers (Mobile banner, top nav, modal)
  const installBtns = ["btnInstallApp", "btnNavInstallApp", "btnModalInstallApp"];
  installBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", handleInstallPWA);
  });

  const btnCloseInstall = document.getElementById("btnCloseInstallBanner");
  if (btnCloseInstall) btnCloseInstall.addEventListener("click", () => {
    const mib = document.getElementById("mobileInstallBanner");
    if (mib) mib.style.display = "none";
  });

  // Live Update Notification Banner Triggers
  const btnApplyUp = document.getElementById("btnApplyUpdate");
  if (btnApplyUp) btnApplyUp.addEventListener("click", handleApplyAppUpdate);

  const btnCloseUp = document.getElementById("btnCloseUpdateBanner");
  if (btnCloseUp) btnCloseUp.addEventListener("click", () => {
    const aub = document.getElementById("appUpdateBanner");
    if (aub) aub.style.display = "none";
  });

  // Filters & Search
  document.getElementById("txTypeFilter").addEventListener("change", (e) => {
    state.typeFilter = e.target.value;
    loadTransactions();
  });

  document.getElementById("txCategoryFilter").addEventListener("change", (e) => {
    state.categoryFilter = e.target.value;
    loadTransactions();
  });

  let searchTimeout = null;
  document.getElementById("txSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value;
      loadTransactions();
    }, 300);
  });

  // Export CSV
  document.getElementById("btnExportCSV").addEventListener("click", handleExportCSV);

  // Delete Modal
  document.getElementById("btnCloseDeleteModal").addEventListener("click", () => {
    document.getElementById("deleteModal").style.display = "none";
  });
  document.getElementById("btnCancelDelete").addEventListener("click", () => {
    document.getElementById("deleteModal").style.display = "none";
  });
  document.getElementById("btnConfirmDelete").addEventListener("click", handleConfirmDelete);

  // Category Manager Modal Listeners
  const btnOpenCatModal = document.getElementById("btnOpenCatModal");
  if (btnOpenCatModal) {
    btnOpenCatModal.addEventListener("click", () => openCategoryManagerModal("masrouf"));
  }

  const btnManageCatsFromModal = document.getElementById("btnManageCatsFromModal");
  if (btnManageCatsFromModal) {
    btnManageCatsFromModal.addEventListener("click", () => {
      const currentType = document.getElementById("txTypeInput") ? document.getElementById("txTypeInput").value : "masrouf";
      openCategoryManagerModal(currentType);
    });
  }

  const btnCloseCatModal = document.getElementById("btnCloseCatModal");
  if (btnCloseCatModal) {
    btnCloseCatModal.addEventListener("click", closeCategoryManagerModal);
  }

  const btnCatTabExpense = document.getElementById("btnCatTabExpense");
  if (btnCatTabExpense) {
    btnCatTabExpense.addEventListener("click", () => switchCatManagerTab("masrouf"));
  }

  const btnCatTabIncome = document.getElementById("btnCatTabIncome");
  if (btnCatTabIncome) {
    btnCatTabIncome.addEventListener("click", () => switchCatManagerTab("mad5oul"));
  }

  const addCatForm = document.getElementById("addCategoryForm");
  if (addCatForm) {
    addCatForm.addEventListener("submit", handleAddCategorySubmit);
  }

  // Kounach Modal Openers
  const btnOpenKounachModal = document.getElementById("btnOpenKounachModal");
  if (btnOpenKounachModal) {
    btnOpenKounachModal.addEventListener("click", openKounachModal);
  }

  const btnQuickKounach = document.getElementById("btnQuickKounach");
  if (btnQuickKounach) {
    btnQuickKounach.addEventListener("click", openKounachModal);
  }

  const btnCloseKounachModal = document.getElementById("btnCloseKounachModal");
  if (btnCloseKounachModal) {
    btnCloseKounachModal.addEventListener("click", closeKounachModal);
  }

  const catTotalDebtBannerBox = document.getElementById("catTotalDebtBannerBox");
  if (catTotalDebtBannerBox) {
    catTotalDebtBannerBox.addEventListener("click", openKounachModal);
  }

  const btnOpenAddPersonModal = document.getElementById("btnOpenAddPersonModal");
  if (btnOpenAddPersonModal) {
    btnOpenAddPersonModal.addEventListener("click", openAddPersonModal);
  }

  const btnClosePersonModal = document.getElementById("btnClosePersonModal");
  if (btnClosePersonModal) {
    btnClosePersonModal.addEventListener("click", closePersonModal);
  }

  const btnCancelPersonModal = document.getElementById("btnCancelPersonModal");
  if (btnCancelPersonModal) {
    btnCancelPersonModal.addEventListener("click", closePersonModal);
  }

  const kounachPersonForm = document.getElementById("kounachPersonForm");
  if (kounachPersonForm) {
    kounachPersonForm.addEventListener("submit", handleSaveKounachPerson);
  }

  // Kounach Search & Filters
  let kounachSearchTimeout = null;
  const kounachSearchInput = document.getElementById("kounachSearchInput");
  if (kounachSearchInput) {
    kounachSearchInput.addEventListener("input", (e) => {
      clearTimeout(kounachSearchTimeout);
      kounachSearchTimeout = setTimeout(() => {
        state.kounach.search = e.target.value.trim().toLowerCase();
        renderKounachAccounts();
      }, 250);
    });
  }

  const kounachCatFilter = document.getElementById("kounachCategoryFilter");
  if (kounachCatFilter) {
    kounachCatFilter.addEventListener("change", (e) => {
      state.kounach.category = e.target.value;
      renderKounachAccounts();
    });
  }

  const kounachStatusBtns = document.querySelectorAll(".kounach-status-btn");
  kounachStatusBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      kounachStatusBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.kounach.status = btn.getAttribute("data-status");
      renderKounachAccounts();
    });
  });

  // Operation Modal Listeners
  const btnCloseOpModal = document.getElementById("btnCloseOpModal");
  if (btnCloseOpModal) {
    btnCloseOpModal.addEventListener("click", closeOpModal);
  }

  const btnCancelOpModal = document.getElementById("btnCancelOpModal");
  if (btnCancelOpModal) {
    btnCancelOpModal.addEventListener("click", closeOpModal);
  }

  const kounachOpForm = document.getElementById("kounachOpForm");
  if (kounachOpForm) {
    kounachOpForm.addEventListener("submit", handleSaveKounachOp);
  }

  const btnOpTypePayment = document.getElementById("btnOpTypePayment");
  const btnOpTypeCredit = document.getElementById("btnOpTypeCredit");
  if (btnOpTypePayment && btnOpTypeCredit) {
    btnOpTypePayment.addEventListener("click", () => setKounachOpType("payment"));
    btnOpTypeCredit.addEventListener("click", () => setKounachOpType("credit"));
  }

  // Ledger Modal Listeners
  const btnCloseLedgerModal = document.getElementById("btnCloseLedgerModal");
  if (btnCloseLedgerModal) {
    btnCloseLedgerModal.addEventListener("click", closeLedgerModal);
  }

  const btnLedgerAddOp = document.getElementById("btnLedgerAddOp");
  if (btnLedgerAddOp) {
    btnLedgerAddOp.addEventListener("click", () => {
      if (state.activeKounachAccountId) {
        openKounachOpModal(state.activeKounachAccountId, "payment");
      }
    });
  }

  // Close modals on overlay click
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.style.display = "none";
    }
  });
}

/* ==========================================================================
   Data Fetching & Rendering
   ========================================================================== */
async function loadInitialData() {
  await Promise.all([
    fetchSystemInfo(),
    fetchCategories(),
    fetchKounach()
  ]);
  await refreshDashboard();
}

async function refreshDashboard() {
  await Promise.all([
    loadSummary(),
    loadTransactions()
  ]);
}

async function fetchSystemInfo() {
  try {
    const res = await fetch("/api/system-info");
    const data = await res.json();
    state.systemInfo = data;

    // Use backend detected IP address or current origin
    const targetUrl = data.mobile_url || window.location.origin;
    data.mobile_url = targetUrl;

    if (targetUrl) {
      const urlInputs = [document.getElementById("mobileUrlDisplay"), document.getElementById("mobileUrlInput")];
      urlInputs.forEach(inp => { if (inp) inp.value = targetUrl; });

      const footerLink = document.getElementById("footerIpLink");
      if (footerLink) footerLink.textContent = targetUrl;

      // Generate QR Code using free reliable service
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}&margin=8`;
      const qrImgs = [document.getElementById("qrImage"), document.getElementById("qrCodeImg")];
      qrImgs.forEach(img => {
        if (img) {
          img.src = qrUrl;
          img.style.display = "block";
        }
      });
      const qrLoading = document.getElementById("qrLoading");
      if (qrLoading) qrLoading.style.display = "none";
    }
  } catch (err) {
    console.error("Error loading system info:", err);
  }
}

async function fetchCategories() {
  try {
    const res = await fetch("/api/categories");
    if (res.ok) {
      const data = await res.json();
      if (data && !data.offline) {
        state.categories = data;
        try { localStorage.setItem(OFFLINE_KEYS.CATEGORIES, JSON.stringify(data)); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Categories fetch failed, using offline cache:", err);
  }

  // Fallback to offline cache
  if (!state.categories || (!state.categories.expense.length && !state.categories.income.length)) {
    try {
      const cached = localStorage.getItem(OFFLINE_KEYS.CATEGORIES);
      if (cached) state.categories = JSON.parse(cached);
    } catch (e) {}
  }

  populateCategoryFilters();
  renderCategoryManagerList();
}

function populateCategoryFilters() {
  const catFilter = document.getElementById("txCategoryFilter");
  catFilter.innerHTML = '<option value="all">كل الأصناف (Toutes Catégories)</option>';

  const allCats = Array.from(new Set([...state.categories.expense, ...state.categories.income]));
  allCats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catFilter.appendChild(opt);
  });
}

function updateModalCategories(type, selectedCategory = "") {
  const select = document.getElementById("txCategorySelect");
  select.innerHTML = "";

  const list = type === "mad5oul" ? state.categories.income : state.categories.expense;
  list.forEach((cat, idx) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (selectedCategory ? cat === selectedCategory : idx === 0) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ صنف جديد (Autre / Nouveau)...";
  select.appendChild(customOpt);

  document.getElementById("txCustomCategoryInput").style.display = "none";
  document.getElementById("txCustomCategoryInput").value = "";
}

async function loadSummary() {
  let data = null;
  try {
    let url = `/api/summary?period=${encodeURIComponent(state.period)}`;
    if (state.period === "custom") {
      url += `&start_date=${encodeURIComponent(state.startDate)}&end_date=${encodeURIComponent(state.endDate)}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json && !json.offline) {
        data = json;
        try { localStorage.setItem(`${OFFLINE_KEYS.SUMMARY}_${state.period}`, JSON.stringify(data)); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Summary network fetch failed, using offline cache:", err);
  }

  // Fallback to offline cache
  if (!data) {
    try {
      const cached = localStorage.getItem(`${OFFLINE_KEYS.SUMMARY}_${state.period}`) || localStorage.getItem(`${OFFLINE_KEYS.SUMMARY}_today`);
      if (cached) {
        data = JSON.parse(cached);
        console.log("[Offline] Loaded summary from localStorage");
      }
    } catch (e) {
      console.warn("Failed to parse cached summary", e);
    }
  }

  if (!data) return;

  // Render KPIs
  const kpiIncome = document.getElementById("kpiTotalIncome");
  const kpiExpense = document.getElementById("kpiTotalExpense");
  const kpiBalance = document.getElementById("kpiNetBalance");
  const kpiCount = document.getElementById("kpiCount");
  const balanceCard = document.getElementById("kpiBalanceCard");

  if (kpiIncome) kpiIncome.innerHTML = `${formatMoney(data.total_income)} <span class="currency">DH</span>`;
  if (kpiExpense) kpiExpense.innerHTML = `${formatMoney(data.total_expense)} <span class="currency">DH</span>`;
  if (kpiBalance) kpiBalance.innerHTML = `${formatMoney(data.net_balance)} <span class="currency">DH</span>`;
  if (kpiCount) kpiCount.textContent = data.transaction_count;

  // Balance Card Styling based on positive/negative
  if (balanceCard && kpiBalance) {
    if (data.net_balance < 0) {
      balanceCard.style.borderColor = "var(--expense-red)";
      kpiBalance.style.color = "var(--expense-red)";
      const sub = document.getElementById("kpiBalanceSub");
      if (sub) sub.textContent = "تنبيه: المصاريف تفوق المداخيل!";
    } else {
      balanceCard.style.borderColor = "var(--emerald-primary)";
      kpiBalance.style.color = "var(--emerald-primary)";
      const sub = document.getElementById("kpiBalanceSub");
      if (sub) sub.textContent = "المداخيل تفوق المصاريف (ربح إيجابي)";
    }
  }

  // Update Period Badge & Chart Title
  const periodNames = {
    today: "اليوم",
    yesterday: "البارح",
    week: "هذا الأسبوع",
    month: "هذا الشهر",
    year: "هاد العام",
    all: "جميع العمليات",
    custom: `${data.start_date} إلى ${data.end_date}`
  };
  const badge = document.getElementById("chartPeriodBadge");
  if (badge) badge.textContent = periodNames[state.period] || "الفترة الحالية";

  const trendsTitle = document.getElementById("trendsChartTitle");
  if (trendsTitle) {
    if (state.period === "year" || data.trend_type === "monthly") {
      trendsTitle.textContent = "مقارنة المداخيل والمصاريف حسب شهور السنة (Mois par Mois)";
    } else {
      trendsTitle.textContent = "مقارنة المداخيل والمصاريف حسب الأيام (Jour par Jour)";
    }
  }

  // Update Totals Quick Banner
  if (document.getElementById("catTotalWeekExp")) {
    document.getElementById("catTotalWeekExp").textContent = `${formatMoney(data.total_week_expense || 0)} DH`;
  }
  if (document.getElementById("catTotalMonthExp")) {
    document.getElementById("catTotalMonthExp").textContent = `${formatMoney(data.total_month_expense || 0)} DH`;
  }
  if (document.getElementById("catTotalYearExp")) {
    document.getElementById("catTotalYearExp").textContent = `${formatMoney(data.total_year_expense || 0)} DH`;
  }
  if (document.getElementById("catTotalDebtExp")) {
    const debtRem = data.kounach_summary ? data.kounach_summary.remaining : 0;
    document.getElementById("catTotalDebtExp").textContent = `${formatMoney(debtRem)} DH`;
  }
  if (document.getElementById("catTotalDebtSub")) {
    const actCnt = data.kounach_summary ? (data.kounach_summary.active_creditors_count || 0) : 0;
    document.getElementById("catTotalDebtSub").textContent = `${actCnt} أشخاص كيتسالو`;
  }

  state.catExpenseSummary = data.category_expense_summary || [];
  renderCategoryExpenseSummary();

  // Update Kounach Badges from summary if present
  if (data.kounach_summary) {
    state.kounach.summary = data.kounach_summary;
    updateKounachBadges(data.kounach_summary);
  }

  // Render Charts
  if (data.trends) renderTrendsChart(data.trends);
  if (data.expense_categories) renderExpensePieChart(data.expense_categories);
}

async function loadTransactions() {
  let data = null;
  try {
    let url = `/api/transactions?period=${encodeURIComponent(state.period)}&type=${encodeURIComponent(state.typeFilter)}&category=${encodeURIComponent(state.categoryFilter)}&search=${encodeURIComponent(state.searchQuery)}`;
    if (state.period === "custom") {
      url += `&start_date=${encodeURIComponent(state.startDate)}&end_date=${encodeURIComponent(state.endDate)}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        data = json;
        try { localStorage.setItem(OFFLINE_KEYS.TRANSACTIONS, JSON.stringify(data)); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Transactions network fetch failed, using offline cache:", err);
  }

  // Fallback to offline cache
  if (!data) {
    try {
      const cached = localStorage.getItem(OFFLINE_KEYS.TRANSACTIONS);
      data = cached ? JSON.parse(cached) : [];
    } catch (e) {
      data = [];
    }
  }

  // Prepend any pending offline queued transactions
  const queue = getOfflineQueue();
  const pendingTxs = queue
    .filter(item => item.type === "transaction" && item.payload)
    .map(item => ({
      id: item.payload.id || item.id,
      type: item.payload.type,
      category: item.payload.category,
      amount: parseFloat(item.payload.amount) || 0,
      description: (item.payload.description ? item.payload.description + " " : "") + "(محفوظ محلياً 💾 فـ الانتظار)",
      payment_method: item.payload.payment_method || "Kache / Espèces",
      date: item.payload.date,
      time: item.payload.time,
      _offline_pending: true
    }));

  const merged = [...pendingTxs, ...(data || []).filter(tx => !pendingTxs.some(pt => pt.id === tx.id))];
  state.transactions = merged;
  renderTransactionsTable(merged);
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById("txTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";

  if (!transactions || transactions.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  transactions.forEach(tx => {
    const tr = document.createElement("tr");

    const isIncome = tx.type === "mad5oul";
    const badgeClass = isIncome ? "badge-income" : "badge-expense";
    const badgeIcon = isIncome ? "fa-arrow-up-right-dots" : "fa-arrow-down-right-dots";
    const badgeText = isIncome ? "مدخول" : "مصروف";
    const amountClass = isIncome ? "amount-income" : "amount-expense";
    const amountPrefix = isIncome ? "+" : "-";

    tr.innerHTML = `
      <td>
        <span class="tx-badge ${badgeClass}">
          <i class="fa-solid ${badgeIcon}"></i>
          ${badgeText}
        </span>
      </td>
      <td>
        <strong class="tx-category">${escapeHtml(tx.category)}</strong>
      </td>
      <td>
        <span class="tx-amount ${amountClass}">
          ${amountPrefix} ${formatMoney(tx.amount)} DH
        </span>
      </td>
      <td>
        <div class="tx-desc" title="${escapeHtml(tx.description)}">
          ${escapeHtml(tx.description) || '<em style="opacity: 0.5;">بدون تفاصيل</em>'}
        </div>
      </td>
      <td>
        <span class="tx-meta">${escapeHtml(tx.payment_method)}</span>
      </td>
      <td>
        <div class="tx-meta">
          <strong>${tx.date}</strong> &bull; <small>${tx.time}</small>
        </div>
      </td>
      <td>
        <div class="tx-actions">
          <button class="btn-action-icon btn-edit" title="تعديل" onclick="handleEditClick(${tx.id})">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-action-icon btn-delete" title="حذف" onclick="handleDeleteClick(${tx.id})">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Chart.js Visualizations
   ========================================================================== */
function renderTrendsChart(trends) {
  const ctx = document.getElementById("trendsChart").getContext("2d");

  // Destroy previous chart if exists
  if (state.charts.trends) {
    state.charts.trends.destroy();
  }

  const labels = trends.map(t => t.date);
  const incomes = trends.map(t => t.income);
  const expenses = trends.map(t => t.expense);

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
  const textColor = isDark ? "#94a3b8" : "#475569";

  state.charts.trends = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["اليوم"],
      datasets: [
        {
          label: "المداخيل (Revenus)",
          data: incomes.length ? incomes : [0],
          backgroundColor: "#10b981",
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        },
        {
          label: "المصاريف (Dépenses)",
          data: expenses.length ? expenses : [0],
          backgroundColor: "#f43f5e",
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          rtl: true,
          labels: {
            color: textColor,
            font: { family: "Cairo", weight: "700", size: 12 }
          }
        },
        tooltip: {
          rtl: true,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatMoney(item.raw)} DH`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: "Outfit", size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: "Outfit", size: 11 },
            callback: (v) => `${v} DH`
          }
        }
      }
    }
  });
}

function renderExpensePieChart(categories) {
  const ctx = document.getElementById("expensePieChart").getContext("2d");

  if (state.charts.expensePie) {
    state.charts.expensePie.destroy();
  }

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "#94a3b8" : "#475569";

  if (!categories || categories.length === 0) {
    state.charts.expensePie = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["لا توجد مصاريف"],
        datasets: [{
          data: [1],
          backgroundColor: [isDark ? "#1e293b" : "#e2e8f0"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  const labels = categories.map(c => c.category);
  const dataValues = categories.map(c => c.total);
  const palette = [
    "#f43f5e", "#fb923c", "#facc15", "#38bdf8", "#818cf8",
    "#a78bfa", "#f472b6", "#34d399", "#fb7185"
  ];

  state.charts.expensePie = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: palette.slice(0, labels.length),
        borderWidth: 2,
        borderColor: isDark ? "#0a1f18" : "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          rtl: true,
          labels: {
            color: textColor,
            font: { family: "Cairo", weight: "600", size: 11 },
            boxWidth: 12
          }
        },
        tooltip: {
          rtl: true,
          callbacks: {
            label: (item) => `${item.label}: ${formatMoney(item.raw)} DH`
          }
        }
      },
      cutout: "65%"
    }
  });
}

/* ==========================================================================
   Category Expenses Summary Component (Week, Month, Year)
   ========================================================================== */
function renderCategoryExpenseSummary() {
  const container = document.getElementById("catSummaryContainer");
  if (!container) return;

  const summary = state.catExpenseSummary || [];
  if (summary.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 24px; font-weight: 700;">لا توجد أي مصاريف مسجلة حتى الآن</div>';
    return;
  }

  if (state.catSummaryView === "comparative") {
    // Render Comparative Table with Creditors Column
    let tableHtml = `
      <div class="cat-comp-table-wrap">
        <table class="cat-comp-table">
          <thead>
            <tr>
              <th>الصنف (Catégorie de Dépense)</th>
              <th style="min-width: 170px;">شحال كيتسالونا (Créanciers / Dettes)</th>
              <th>هاد السيمانة (Semaine)</th>
              <th>هاد الشهر (Ce Mois)</th>
              <th>هاد العام (Cette Année)</th>
              <th>النسبة من مصاريف العام</th>
            </tr>
          </thead>
          <tbody>
    `;

    summary.forEach(item => {
      const weekBadge = item.week_total > 0
        ? `<span class="cat-comp-badge badge-val-week">${formatMoney(item.week_total)} DH</span>`
        : `<span class="cat-comp-badge badge-val-zero">0.00 DH</span>`;

      const monthBadge = item.month_total > 0
        ? `<span class="cat-comp-badge badge-val-month">${formatMoney(item.month_total)} DH</span>`
        : `<span class="cat-comp-badge badge-val-zero">0.00 DH</span>`;

      const yearBadge = item.year_total > 0
        ? `<span class="cat-comp-badge badge-val-year">${formatMoney(item.year_total)} DH</span>`
        : `<span class="cat-comp-badge badge-val-zero">0.00 DH</span>`;

      const pct = item.year_pct || 0;

      // Creditors / Debt badge
      let debtCellHtml = "";
      const credCount = item.creditors_count || 0;
      const totalCred = item.total_creditors || 0;
      const remDebt = item.remaining_debt || 0;
      const namesTooltip = item.creditors_names && item.creditors_names.length > 0 
        ? item.creditors_names.join(" • ") 
        : "";

      if (credCount > 0) {
        debtCellHtml = `
          <div class="cat-debt-cell-badge debt-active" onclick="openKounachModalForCat('${escapeHtml(item.category)}')" title="${escapeHtml(namesTooltip || 'أشخاص باقي كيتسالو')}">
            <span class="cdcb-count"><i class="fa-solid fa-users"></i> ${credCount} كيتسالو</span>
            <span class="cdcb-amt">${formatMoney(remDebt)} DH</span>
          </div>
        `;
      } else if (totalCred > 0) {
        debtCellHtml = `
          <div class="cat-debt-cell-badge debt-settled" onclick="openKounachModalForCat('${escapeHtml(item.category)}')" title="جميع الحسابات مسواة">
            <i class="fa-solid fa-circle-check"></i>
            <span>${totalCred} مخلص كامل</span>
          </div>
        `;
      } else {
        debtCellHtml = `<span class="cat-debt-zero">— (0 كيتسال)</span>`;
      }

      tableHtml += `
        <tr>
          <td>
            <div class="cat-comp-name">
              <i class="fa-solid fa-arrow-down-right-dots" style="color: var(--expense-red); font-size: 0.85rem;"></i>
              <span>${escapeHtml(item.category)}</span>
            </div>
          </td>
          <td>${debtCellHtml}</td>
          <td>${weekBadge}</td>
          <td>${monthBadge}</td>
          <td>${yearBadge}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px; min-width: 140px;">
              <div class="crc-bar-wrap" style="flex: 1;">
                <div class="crc-bar-fill" style="width: ${Math.min(pct, 100)}%;"></div>
              </div>
              <strong style="font-size: 0.8rem; font-family: 'Outfit'; color: var(--text-muted);">${pct}%</strong>
            </div>
          </td>
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = tableHtml;
  } else {
    // Single Period Ranked Cards Grid (Week, Month, or Year)
    const pKey = state.catSummaryView === "week" ? "week_total" : (state.catSummaryView === "month" ? "month_total" : "year_total");
    const pctKey = state.catSummaryView === "week" ? "week_pct" : (state.catSummaryView === "month" ? "month_pct" : "year_pct");
    const periodLabel = state.catSummaryView === "week" ? "هاد السيمانة" : (state.catSummaryView === "month" ? "هاد الشهر" : "هاد العام");

    // Sort descending by amount for this period
    const sorted = [...summary].sort((a, b) => (b[pKey] || 0) - (a[pKey] || 0));

    let gridHtml = '<div class="cat-ranked-grid">';
    sorted.forEach((item, idx) => {
      const amt = item[pKey] || 0;
      const pct = item[pctKey] || 0;
      const credCount = item.creditors_count || 0;
      const totalCred = item.total_creditors || 0;
      const remDebt = item.remaining_debt || 0;

      let debtRowHtml = "";
      if (credCount > 0) {
        debtRowHtml = `
          <div class="crc-debt-row">
            <span class="crc-debt-label"><i class="fa-solid fa-book-bookmark"></i> لي كايتسالونا:</span>
            <strong class="crc-debt-val" onclick="openKounachModalForCat('${escapeHtml(item.category)}')" title="فتح الكناش">${credCount} كيتسالو (${formatMoney(remDebt)} DH)</strong>
          </div>
        `;
      } else if (totalCred > 0) {
        debtRowHtml = `
          <div class="crc-debt-row">
            <span class="crc-debt-label"><i class="fa-solid fa-book-bookmark"></i> لي كايتسالونا:</span>
            <span class="crc-debt-settled"><i class="fa-solid fa-circle-check"></i> مخلص كامل (0 DH)</span>
          </div>
        `;
      } else {
        debtRowHtml = `
          <div class="crc-debt-row">
            <span class="crc-debt-label"><i class="fa-solid fa-book-bookmark"></i> لي كايتسالونا:</span>
            <span class="crc-debt-none">لا أحد (0 DH)</span>
          </div>
        `;
      }

      gridHtml += `
        <div class="cat-ranked-card">
          <div class="crc-header">
            <div class="crc-title">
              <i class="fa-solid fa-receipt" style="color: var(--expense-red);"></i>
              <span>${escapeHtml(item.category)}</span>
            </div>
            <span class="crc-rank">#${idx + 1}</span>
          </div>
          <div class="crc-amount">${formatMoney(amt)} <small style="font-size: 0.85rem; color: var(--text-muted);">DH</small></div>
          <div class="crc-bar-wrap">
            <div class="crc-bar-fill" style="width: ${Math.min(pct, 100)}%;"></div>
          </div>
          <div class="crc-meta">
            <span>مجموع مصاريف ${periodLabel}</span>
            <strong>${pct}% من المجموع</strong>
          </div>
          ${debtRowHtml}
        </div>
      `;
    });
    gridHtml += '</div>';

    container.innerHTML = gridHtml;
  }
}


/* ==========================================================================
   Modal Operations (Add / Edit / Delete)
   ========================================================================== */
function openTransactionModal(type = "mad5oul", editData = null) {
  const modal = document.getElementById("txModal");
  const modalTitle = document.getElementById("modalTitle");
  const form = document.getElementById("txForm");

  form.reset();
  document.getElementById("editTxId").value = "";

  const now = new Date();
  document.getElementById("txDateInput").value = now.toISOString().split("T")[0];
  document.getElementById("txTimeInput").value = now.toTimeString().slice(0, 5);

  if (editData) {
    modalTitle.textContent = "تعديل العملية";
    document.getElementById("editTxId").value = editData.id;
    setModalType(editData.type);
    document.getElementById("txAmountInput").value = editData.amount;
    document.getElementById("txDescInput").value = editData.description || "";
    document.getElementById("txPaymentSelect").value = editData.payment_method || "Kache / Espèces";
    document.getElementById("txDateInput").value = editData.date;
    document.getElementById("txTimeInput").value = editData.time;
    updateModalCategories(editData.type, editData.category);
  } else {
    modalTitle.textContent = type === "mad5oul" ? "تسجيل مدخول اليوم (Recette du jour)" : "تسجيل مصروف جديد";
    setModalType(type);
    if (type === "mad5oul") {
      document.getElementById("txDescInput").placeholder = "مثال: مجموع مبيعات اليوم للتعاونية...";
    } else {
      document.getElementById("txDescInput").placeholder = "مثال: شراء الحليب من الكسابة، المازوط، الأعلاف...";
    }
  }

  modal.style.display = "flex";
  document.getElementById("txAmountInput").focus();
}

function setModalType(type) {
  document.getElementById("txTypeInput").value = type;
  const incomeSeg = document.getElementById("btnSelectIncome");
  const expenseSeg = document.getElementById("btnSelectExpense");
  const modalTitle = document.getElementById("modalTitle");

  if (type === "mad5oul") {
    incomeSeg.classList.add("active");
    expenseSeg.classList.remove("active");
    modalTitle.textContent = "تسجيل مدخول اليوم (Recette du jour)";
    document.getElementById("txDescInput").placeholder = "مثال: مجموع مبيعات اليوم للتعاونية...";
  } else {
    expenseSeg.classList.add("active");
    incomeSeg.classList.remove("active");
    modalTitle.textContent = "تسجيل مصروف جديد";
    document.getElementById("txDescInput").placeholder = "مثال: شراء الحليب من الكسابة، المازوط، الأعلاف...";
  }

  updateModalCategories(type);
}

function closeTransactionModal() {
  document.getElementById("txModal").style.display = "none";
}

async function handleSaveTransaction(e) {
  e.preventDefault();
  const editId = document.getElementById("editTxId").value;
  const type = document.getElementById("txTypeInput").value;
  let category = document.getElementById("txCategorySelect").value;

  if (category === "__custom__") {
    category = document.getElementById("txCustomCategoryInput").value.trim();
  }

  if (!category) {
    showToast("يرجى تحديد أو كتابة صنف العملية", "error");
    return;
  }

  const amount = parseFloat(document.getElementById("txAmountInput").value);
  if (isNaN(amount) || amount <= 0) {
    showToast("يرجى إدخال مبلغ صحيح أكبر من الصفر", "error");
    return;
  }

  const payload = {
    type,
    category,
    amount,
    description: document.getElementById("txDescInput").value.trim(),
    payment_method: document.getElementById("txPaymentSelect").value,
    date: document.getElementById("txDateInput").value,
    time: document.getElementById("txTimeInput").value
  };

  // Check if offline before network attempt
  if (!navigator.onLine) {
    handleOfflineTransactionSave(payload, editId);
    return;
  }

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/transactions/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      if (res.status === 503) {
        handleOfflineTransactionSave(payload, editId);
        return;
      }
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "وقع خطأ أثناء الحفظ", "error");
      return;
    }

    closeTransactionModal();
    showToast(editId ? "تم تعديل العملية بنجاح! ✨" : "تم تسجيل العملية بنجاح! 🚀", "success");
    await fetchCategories();
    await refreshDashboard();
  } catch (err) {
    console.warn("Save network error, falling back to offline save:", err);
    handleOfflineTransactionSave(payload, editId);
  }
}

window.handleEditClick = function(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (tx) {
    openTransactionModal(tx.type, tx);
  }
};

window.handleDeleteClick = function(id) {
  document.getElementById("deleteTargetId").value = id;
  document.getElementById("deleteModal").style.display = "flex";
};

async function handleConfirmDelete() {
  const id = document.getElementById("deleteTargetId").value;
  if (!id) return;

  try {
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    const data = await res.json();

    document.getElementById("deleteModal").style.display = "none";
    if (res.ok) {
      showToast("تم حذف العملية بنجاح", "success");
      await refreshDashboard();
    } else {
      showToast(data.error || "تعذر الحذف", "error");
    }
  } catch (err) {
    console.error("Delete error:", err);
    showToast("حدث خطأ أثناء محاولة الحذف", "error");
  }
}

/* ==========================================================================
   Mobile Modal & Sharing
   ========================================================================== */
function openMobileModal() {
  document.getElementById("mobileModal").style.display = "flex";
}

function copyMobileUrl() {
  const input = document.getElementById("mobileUrlInput");
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value)
    .then(() => showToast("تم نسخ الرابط بنجاح! شاركه مع هاتفك.", "success"))
    .catch(() => showToast("تعذر النسخ التلقائي", "error"));
}

/* ==========================================================================
   Export CSV
   ========================================================================== */
async function handleExportCSV() {
  let url = `/api/export/csv?period=${encodeURIComponent(state.period)}`;
  if (state.period === "custom") {
    url += `&start_date=${encodeURIComponent(state.startDate)}&end_date=${encodeURIComponent(state.endDate)}`;
  }
  showToast("جاري إعداد تقرير العمليات... 📊", "info");

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("تعذر تحميل التقرير من السيرفر");
    const csvText = await res.text();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(csvText);
      showToast("✅ تم نسخ التقرير كاملاً إلى الحافظة! يمكنك لصقه فـ واتساب أو إكسيل.", "success");
    } else {
      showToast("✅ تم تجهيز التقرير بنجاح!", "success");
    }

    // Only try direct file download outside of restricted WebViews
    const isRestrictedWebView = /wv|Android.*Version\/[0-9.]+/i.test(navigator.userAgent);
    if (!isRestrictedWebView) {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ajban_al_khair_rapport_${state.period}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.warn("Export CSV error:", err);
    try {
      window.open(url, "_blank");
    } catch (e) {}
  }
}

/* ==========================================================================
   Theme & Utilities
   ========================================================================== */
function initTheme() {
  const saved = localStorage.getItem("ajban_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const target = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", target);
  localStorage.setItem("ajban_theme", target);
  updateThemeIcon(target);

  // Refresh charts colors
  if (state.charts.trends) state.charts.trends.update();
  if (state.charts.expensePie) state.charts.expensePie.update();
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  if (theme === "dark") {
    icon.className = "fa-solid fa-sun";
  } else {
    icon.className = "fa-solid fa-moon";
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatMoney(amount) {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/static/sw.js").catch(err => {
      console.log("Service Worker registration skipped or failed:", err);
    });
  }
}

/* ==========================================================================
   Category Manager Operations (Add & Delete Categories)
   ========================================================================== */
function openCategoryManagerModal(tab = "masrouf") {
  switchCatManagerTab(tab);
  document.getElementById("categoryModal").style.display = "flex";
  const input = document.getElementById("newCatInput");
  if (input) input.focus();
}

function closeCategoryManagerModal() {
  document.getElementById("categoryModal").style.display = "none";
}

function switchCatManagerTab(tab) {
  state.catManagerTab = tab;
  const tabExpense = document.getElementById("btnCatTabExpense");
  const tabIncome = document.getElementById("btnCatTabIncome");
  const input = document.getElementById("newCatInput");

  if (tab === "masrouf") {
    if (tabExpense) tabExpense.classList.add("active");
    if (tabIncome) tabIncome.classList.remove("active");
    if (input) input.placeholder = "اكتب صنفاً جديداً للمصاريف (مثال: تأمين، شراء بقرة، مواد تنظيف...)";
  } else {
    if (tabIncome) tabIncome.classList.add("active");
    if (tabExpense) tabExpense.classList.remove("active");
    if (input) input.placeholder = "اكتب صنفاً جديداً للمداخيل...";
  }

  renderCategoryManagerList();
}

function renderCategoryManagerList() {
  const listEl = document.getElementById("catChipList");
  if (!listEl) return;
  listEl.innerHTML = "";

  const isExpense = state.catManagerTab === "masrouf";
  const items = isExpense ? (state.categories.expense_list || []) : (state.categories.income_list || []);

  if (items.length === 0) {
    listEl.innerHTML = '<li style="text-align: center; color: var(--text-dim); padding: 18px 12px; font-weight: 700;">لا توجد أي أصناف مسجلة</li>';
    return;
  }

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = `cat-chip-item ${isExpense ? "type-expense" : "type-income"}`;

    const icon = isExpense ? "fa-arrow-down-right-dots" : "fa-arrow-up-right-dots";
    const isFirst = idx === 0;
    const isLast = idx === items.length - 1;

    li.innerHTML = `
      <div class="cat-chip-left">
        <span class="cat-order-badge" title="الترتيب رقم ${idx + 1}">${idx + 1}</span>
        <div class="cat-chip-name">
          <i class="fa-solid ${icon}"></i>
          <span>${escapeHtml(item.name)}</span>
        </div>
      </div>
      <div class="cat-item-actions">
        <button type="button" class="btn-order-cat btn-move-up" title="تحريك للأعلى" ${isFirst ? "disabled" : ""}>
          <i class="fa-solid fa-chevron-up"></i>
        </button>
        <button type="button" class="btn-order-cat btn-move-down" title="تحريك للأسفل" ${isLast ? "disabled" : ""}>
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <button type="button" class="btn-delete-cat" title="مسح الصنف">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    const upBtn = li.querySelector(".btn-move-up");
    if (upBtn && !isFirst) {
      upBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleMoveCategory(idx, -1);
      });
    }

    const downBtn = li.querySelector(".btn-move-down");
    if (downBtn && !isLast) {
      downBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleMoveCategory(idx, 1);
      });
    }

    const delBtn = li.querySelector(".btn-delete-cat");
    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        delBtn.disabled = true;
        delBtn.style.opacity = "0.5";
        await handleDeleteCategory(item.id, item.name);
      });
    }

    listEl.appendChild(li);
  });
}

window.handleMoveCategory = async function(index, direction) {
  const isExpense = state.catManagerTab === "masrouf";
  const list = isExpense ? state.categories.expense_list : state.categories.income_list;
  if (!list) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;

  // Swap locally for instant visual response
  const temp = list[index];
  list[index] = list[targetIndex];
  list[targetIndex] = temp;

  // Re-render UI immediately
  renderCategoryManagerList();

  // Send new ordering to backend
  const orderIds = list.map(item => item.id);
  try {
    const res = await fetch("/api/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderIds })
    });
    if (res.ok) {
      if (isExpense) {
        state.categories.expense = list.map(x => x.name);
      } else {
        state.categories.income = list.map(x => x.name);
      }
      populateCategoryFilters();
      const currentTxType = document.getElementById("txTypeInput") ? document.getElementById("txTypeInput").value : null;
      if (currentTxType) {
        updateModalCategories(currentTxType);
      }
    }
  } catch (err) {
    console.error("Reorder save error:", err);
  }
};

async function handleAddCategorySubmit(e) {
  e.preventDefault();
  const input = document.getElementById("newCatInput");
  const name = input.value.trim();
  if (!name) return;

  try {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        type: state.catManagerTab
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "تعذر إضافة الصنف", "error");
      return;
    }

    input.value = "";
    showToast(`تمت إضافة "${name}" بنجاح! ✨`, "success");
    await fetchCategories();
    
    // Auto update transaction modal categories if currently open
    const currentTxType = document.getElementById("txTypeInput") ? document.getElementById("txTypeInput").value : null;
    if (currentTxType) {
      updateModalCategories(currentTxType, name);
    }
  } catch (err) {
    console.error("Add category error:", err);
    showToast("حدث خطأ أثناء إضافة الصنف", "error");
  }
}

window.handleDeleteCategory = async function(id, catName) {
  try {
    const res = await fetch(`/api/categories/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "تعذر حذف الصنف", "error");
      return;
    }

    showToast(`تم حذف "${catName || "الصنف"}" بنجاح 🗑️`, "success");
    await fetchCategories();
    
    const currentTxType = document.getElementById("txTypeInput") ? document.getElementById("txTypeInput").value : null;
    if (currentTxType) {
      updateModalCategories(currentTxType);
    }
  } catch (err) {
    console.error("Delete category error:", err);
    showToast("حدث خطأ أثناء محاولة الحذف", "error");
  }
};

/* ==========================================================================
   KOUNACH (CARNET DE CRÉDIT & DETTES) MODULE
   ========================================================================== */

function updateKounachBadges(summary) {
  if (!summary) return;
  const rem = summary.remaining || summary.total_remaining || 0;
  const formattedRem = `${formatMoney(rem)} DH`;

  // Top Nav Badge
  const navBadge = document.getElementById("navKounachBadge");
  if (navBadge) {
    navBadge.textContent = formattedRem;
    if (rem > 0) {
      navBadge.style.background = "rgba(239, 68, 68, 0.25)";
      navBadge.style.color = "#fca5a5";
    } else {
      navBadge.style.background = "rgba(16, 185, 129, 0.25)";
      navBadge.style.color = "#6ee7b7";
    }
  }

  // Quick Action Badge
  const quickBadge = document.getElementById("quickKounachBadge");
  if (quickBadge) {
    quickBadge.textContent = `باقي: ${formattedRem}`;
    if (rem > 0) {
      quickBadge.style.background = "rgba(239, 68, 68, 0.25)";
      quickBadge.style.color = "#fca5a5";
      quickBadge.style.borderColor = "rgba(239, 68, 68, 0.4)";
    } else {
      quickBadge.style.background = "rgba(16, 185, 129, 0.25)";
      quickBadge.style.color = "#6ee7b7";
      quickBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
    }
  }

  // Modal KPIs
  const kpiDue = document.getElementById("kounachKpiTotalDue");
  if (kpiDue) kpiDue.textContent = `${formatMoney(summary.total_due || 0)} DH`;

  const kpiPaid = document.getElementById("kounachKpiTotalPaid");
  if (kpiPaid) kpiPaid.textContent = `${formatMoney(summary.total_paid || 0)} DH`;

  const kpiRem = document.getElementById("kounachKpiTotalRemaining");
  if (kpiRem) kpiRem.textContent = `${formatMoney(summary.total_remaining || rem || 0)} DH`;

  const kpiCount = document.getElementById("kounachKpiAccountsCount");
  if (kpiCount) kpiCount.textContent = summary.total_count || summary.count || 0;

  const kpiSubCount = document.getElementById("kounachKpiSubCount");
  if (kpiSubCount) {
    const act = summary.active_count || 0;
    const set = summary.settled_count || 0;
    kpiSubCount.textContent = `${act} باقي كيتسال &bull; ${set} مسوى بالكامل`;
  }
}

async function fetchKounach() {
  try {
    const res = await fetch("/api/kounach");
    if (res.ok) {
      const data = await res.json();
      if (data && !data.offline) {
        state.kounach.summary = data.summary;
        state.kounach.accounts = data.accounts || [];
        try { localStorage.setItem(OFFLINE_KEYS.KOUNACH, JSON.stringify(data)); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Kounach fetch failed, using offline cache:", err);
  }

  // Fallback to offline cache
  if (!state.kounach.accounts || state.kounach.accounts.length === 0) {
    try {
      const cached = localStorage.getItem(OFFLINE_KEYS.KOUNACH);
      if (cached) {
        const data = JSON.parse(cached);
        state.kounach.summary = data.summary;
        state.kounach.accounts = data.accounts || [];
      }
    } catch (e) {}
  }

  if (state.kounach.summary) {
    updateKounachBadges(state.kounach.summary);
  }
  renderKounachAccounts();
}

function renderKounachAccounts() {
  const container = document.getElementById("kounachAccountsContainer");
  if (!container) return;
  container.innerHTML = "";

  const query = state.kounach.search;
  const category = state.kounach.category;
  const status = state.kounach.status;

  const filtered = state.kounach.accounts.filter(acc => {
    // Search query
    if (query) {
      const matchName = acc.person_name.toLowerCase().includes(query);
      const matchPhone = acc.phone && acc.phone.includes(query);
      const matchNotes = acc.notes && acc.notes.toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchNotes) return false;
    }

    // Category filter
    if (category !== "all" && acc.category !== category) {
      return false;
    }

    // Status filter
    if (status === "active" && acc.is_settled) return false;
    if (status === "settled" && !acc.is_settled) return false;

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="kounach-empty-state">
        <i class="fa-solid fa-address-book"></i>
        <h4>لا توجد أي حسابات مطابقة للبحث</h4>
        <p>تقدر تزيد حساب جديد بالضغط على زر "إضافة حساب جديد" الفوق</p>
      </div>
    `;
    return;
  }

  filtered.forEach(acc => {
    const card = document.createElement("div");
    card.className = `kounach-card ${acc.is_settled ? "card-settled" : "card-active"}`;

    const pct = acc.progress_pct || 0;
    const phoneHtml = acc.phone ? `
      <a href="tel:${acc.phone}" class="kounach-phone-link" title="اتصل بـ ${escapeHtml(acc.person_name)}">
        <i class="fa-solid fa-phone"></i>
        <span>${escapeHtml(acc.phone)}</span>
      </a>
    ` : `<span class="kounach-no-phone"><i class="fa-solid fa-phone-slash"></i> بدون رقم</span>`;

    const statusBadge = acc.is_settled
      ? `<span class="kounach-status-badge settled"><i class="fa-solid fa-circle-check"></i> مخلص كامل (Réglé)</span>`
      : `<span class="kounach-status-badge active"><i class="fa-solid fa-clock"></i> باقي كيتسالنا</span>`;

    card.innerHTML = `
      <div class="kcard-header">
        <div class="kcard-person-info">
          <div class="kcard-avatar">
            <i class="fa-solid ${acc.category && acc.category.includes('أعلاف') ? 'fa-wheat-awn' : acc.category && acc.category.includes('نقل') ? 'fa-truck' : acc.category && acc.category.includes('بيطرة') ? 'fa-stethoscope' : 'fa-user-tie'}"></i>
          </div>
          <div>
            <h4 class="kcard-name">${escapeHtml(acc.person_name)}</h4>
            <div class="kcard-meta">
              <span class="kcard-cat-badge">${escapeHtml(acc.category)}</span>
              ${phoneHtml}
            </div>
          </div>
        </div>
        <div class="kcard-header-actions">
          ${statusBadge}
          <div class="kcard-menu-btns">
            <button class="kcard-btn-icon" onclick="openEditPersonModal(${acc.id})" title="تعديل معلومات الحساب">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="kcard-btn-icon danger" onclick="handleDeleteKounachPerson(${acc.id}, '${escapeHtml(acc.person_name)}')" title="حذف الحساب">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Notes snippet if present -->
      ${acc.notes ? `<div class="kcard-notes"><i class="fa-solid fa-quote-right"></i> ${escapeHtml(acc.notes)}</div>` : ''}

      <!-- Progress bar -->
      <div class="kcard-progress-wrap">
        <div class="kcard-progress-labels">
          <span>نسبة التسديد (Payé)</span>
          <strong>${pct}%</strong>
        </div>
        <div class="kcard-progress-bar">
          <div class="kcard-progress-fill ${acc.is_settled ? 'fill-settled' : ''}" style="width: ${pct}%"></div>
        </div>
      </div>

      <!-- 3 Amounts Grid -->
      <div class="kcard-amounts-grid">
        <div class="kamount-box box-due">
          <span class="kamount-label">كايتسالنا (Total Dû)</span>
          <strong class="kamount-val">${formatMoney(acc.total_due)} <span class="curr">DH</span></strong>
        </div>
        <div class="kamount-box box-paid">
          <span class="kamount-label">خلصنا (Total Payé)</span>
          <strong class="kamount-val">${formatMoney(acc.paid_amount)} <span class="curr">DH</span></strong>
        </div>
        <div class="kamount-box box-remaining ${acc.is_settled ? 'box-settled' : ''}">
          <span class="kamount-label">باقي لينا (Reste)</span>
          <strong class="kamount-val">${formatMoney(acc.remaining)} <span class="curr">DH</span></strong>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="kcard-actions">
        <button class="btn btn-kcard-op btn-add-payment" onclick="openKounachOpModal(${acc.id}, 'payment')">
          <i class="fa-solid fa-money-bill-wave"></i>
          <span>تسجيل دفعة / خلاص</span>
        </button>

        <button class="btn btn-kcard-op btn-add-credit" onclick="openKounachOpModal(${acc.id}, 'credit')">
          <i class="fa-solid fa-circle-plus"></i>
          <span>زيادة كريدي / سلعة</span>
        </button>

        <button class="btn btn-kcard-op btn-view-ledger" onclick="openKounachLedgerModal(${acc.id})">
          <i class="fa-solid fa-receipt"></i>
          <span>الكشف (Détails)</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Modal controls
function openKounachModal() {
  fetchKounach();
  const modal = document.getElementById("kounachModal");
  if (modal) modal.style.display = "flex";
}

function closeKounachModal() {
  const modal = document.getElementById("kounachModal");
  if (modal) modal.style.display = "none";
}

function populatePersonCategories(selectedVal = "") {
  const select = document.getElementById("personCategorySelect");
  if (!select) return;
  select.innerHTML = "";

  const presets = [
    "كساب (حليب)",
    "أعلاف وتغذية",
    "نقل ومحروقات",
    "أدوية وبيطرة",
    "صيانة وإصلاح",
    "تغليف ومواد",
    "أخرى"
  ];

  const expenseCats = state.categories.expense || [];
  const allOptions = Array.from(new Set([...expenseCats, ...presets]));

  allOptions.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (selectedVal && (cat === selectedVal || cat.toLowerCase().includes(selectedVal.toLowerCase()))) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

window.openKounachModalForCat = function(catName) {
  openKounachModal();
  const searchInput = document.getElementById("kounachSearchInput");
  if (searchInput) {
    const cleanTerm = catName.replace(/\(.*?\)/g, "").trim();
    state.kounach.search = cleanTerm.toLowerCase();
    searchInput.value = cleanTerm;
    renderKounachAccounts();
  }
};

function openAddPersonModal() {
  const modal = document.getElementById("kounachPersonModal");
  if (!modal) return;
  populatePersonCategories("كساب (حليب)");
  document.getElementById("kounachPersonModalTitle").innerHTML = '<i class="fa-solid fa-user-plus"></i> إضافة حساب / شخص جديد في الكناش';
  document.getElementById("editPersonId").value = "";
  document.getElementById("personNameInput").value = "";
  document.getElementById("personPhoneInput").value = "";
  document.getElementById("personInitialDue").value = "";
  document.getElementById("personInitialPaid").value = "";
  document.getElementById("personNotesInput").value = "";
  document.getElementById("initialAmountsRow").style.display = "flex";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("personNameInput").focus(), 100);
}

window.openEditPersonModal = function(id) {
  const acc = state.kounach.accounts.find(a => a.id === id);
  if (!acc) return;
  const modal = document.getElementById("kounachPersonModal");
  if (!modal) return;

  populatePersonCategories(acc.category || "");
  document.getElementById("kounachPersonModalTitle").innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل معلومات الحساب';
  document.getElementById("editPersonId").value = acc.id;
  document.getElementById("personNameInput").value = acc.person_name;
  document.getElementById("personPhoneInput").value = acc.phone || "";
  document.getElementById("personNotesInput").value = acc.notes || "";

  // Hide initial amounts during edit since they are adjusted via operations
  document.getElementById("initialAmountsRow").style.display = "none";

  modal.style.display = "flex";
  setTimeout(() => document.getElementById("personNameInput").focus(), 100);
};

function closePersonModal() {
  const modal = document.getElementById("kounachPersonModal");
  if (modal) modal.style.display = "none";
}

async function handleSaveKounachPerson(e) {
  e.preventDefault();
  const editId = document.getElementById("editPersonId").value;
  const personName = document.getElementById("personNameInput").value.trim();
  const phone = document.getElementById("personPhoneInput").value.trim();
  const category = document.getElementById("personCategorySelect").value;
  const notes = document.getElementById("personNotesInput").value.trim();

  if (!personName) {
    showToast("يرجى إدخال اسم الشخص أو الكساب", "error");
    return;
  }

  const isEdit = Boolean(editId);
  const url = isEdit ? `/api/kounach/${editId}` : "/api/kounach";
  const method = isEdit ? "PUT" : "POST";

  const payload = {
    person_name: personName,
    phone: phone,
    category: category,
    notes: notes
  };

  if (!isEdit) {
    payload.initial_due = parseFloat(document.getElementById("personInitialDue").value) || 0;
    payload.initial_paid = parseFloat(document.getElementById("personInitialPaid").value) || 0;
  }

  if (!navigator.onLine) {
    handleOfflinePersonSave(payload, editId);
    return;
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      if (res.status === 503) {
        handleOfflinePersonSave(payload, editId);
        return;
      }
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "حدث خطأ أثناء حفظ الحساب", "error");
      return;
    }
    const data = await res.json();
    showToast(data.message || "تم حفظ الحساب بنجاح! 📒", "success");
    closePersonModal();
    await fetchKounach();
    await refreshDashboard();
  } catch (err) {
    console.warn("Save person network error, using offline fallback:", err);
    handleOfflinePersonSave(payload, editId);
  }
}

window.handleDeleteKounachPerson = async function(id, name) {
  if (!confirm(`واش متأكد باغي تحذف حساب "${name}" نهائياً من الكناش؟ غادي يتحذفو جميع العمليات المسجلة ليه.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/kounach/${id}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "تعذر حذف الحساب", "error");
      return;
    }

    showToast(`تم حذف حساب "${name}" بنجاح 🗑️`, "success");
    await fetchKounach();
    await refreshDashboard();
  } catch (err) {
    console.error("Delete person error:", err);
    showToast("حدث خطأ أثناء محاولة الحذف", "error");
  }
};

function setKounachOpType(type) {
  document.getElementById("opTypeInput").value = type;
  const btnPayment = document.getElementById("btnOpTypePayment");
  const btnCredit = document.getElementById("btnOpTypeCredit");
  const autoExpenseWrap = document.getElementById("autoExpenseCheckboxWrap");

  if (type === "payment") {
    btnPayment.classList.add("active");
    btnCredit.classList.remove("active");
    if (autoExpenseWrap) autoExpenseWrap.style.display = "block";
    document.getElementById("kounachOpModalTitle").innerHTML = '<i class="fa-solid fa-money-bill-wave"></i> تسجيل دفعة / خلاص (خروج فلوس 💸)';
  } else {
    btnCredit.classList.add("active");
    btnPayment.classList.remove("active");
    if (autoExpenseWrap) autoExpenseWrap.style.display = "none";
    document.getElementById("kounachOpModalTitle").innerHTML = '<i class="fa-solid fa-circle-plus"></i> زيادة كريدي / سلعة (تزادت فالحساب ➕)';
  }
}

window.openKounachOpModal = function(accountId, opType = "payment") {
  const acc = state.kounach.accounts.find(a => a.id === accountId);
  if (!acc) return;

  state.activeKounachAccountId = accountId;
  document.getElementById("opAccountId").value = accountId;
  document.getElementById("opPersonNameText").textContent = acc.person_name;
  document.getElementById("opPersonRemText").textContent = `الباقي كيتسال: ${formatMoney(acc.remaining)} DH`;

  // Set today's date
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById("opDateInput").value = `${y}-${m}-${d}`;

  document.getElementById("opAmountInput").value = "";
  document.getElementById("opNotesInput").value = "";
  const chk = document.getElementById("chkRecordInTransactions");
  if (chk) chk.checked = true;

  setKounachOpType(opType);

  const modal = document.getElementById("kounachOpModal");
  if (modal) modal.style.display = "flex";
  setTimeout(() => document.getElementById("opAmountInput").focus(), 100);
};

function closeOpModal() {
  const modal = document.getElementById("kounachOpModal");
  if (modal) modal.style.display = "none";
}

async function handleSaveKounachOp(e) {
  e.preventDefault();
  const accountId = document.getElementById("opAccountId").value;
  const opType = document.getElementById("opTypeInput").value;
  const amount = parseFloat(document.getElementById("opAmountInput").value);
  const dateVal = document.getElementById("opDateInput").value;
  const notes = document.getElementById("opNotesInput").value.trim();
  const recordInTx = opType === "payment" && document.getElementById("chkRecordInTransactions").checked;

  if (!amount || amount <= 0) {
    showToast("يرجى إدخال مبلغ صحيح أكبر من الصفر", "error");
    return;
  }

  if (!dateVal) {
    showToast("يرجى تحديد تاريخ العملية", "error");
    return;
  }

  const payload = {
    type: opType,
    amount: amount,
    date: dateVal,
    notes: notes,
    record_in_transactions: recordInTx
  };

  if (!navigator.onLine) {
    handleOfflineKounachOpSave(accountId, payload);
    return;
  }

  try {
    const res = await fetch(`/api/kounach/${accountId}/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      if (res.status === 503) {
        handleOfflineKounachOpSave(accountId, payload);
        return;
      }
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "تعذر تسجيل العملية", "error");
      return;
    }
    const data = await res.json();
    showToast(data.message || "تم تسجيل العملية في الكناش بنجاح! ✅", "success");
    closeOpModal();

    await fetchKounach();
    await refreshDashboard();

    // If ledger modal is open, refresh it as well
    if (state.activeKounachAccountId) {
      openKounachLedgerModal(state.activeKounachAccountId);
    }
  } catch (err) {
    console.warn("Save kounach op network error, using offline fallback:", err);
    handleOfflineKounachOpSave(accountId, payload);
  }
}

window.openKounachLedgerModal = async function(accountId) {
  state.activeKounachAccountId = accountId;
  const modal = document.getElementById("kounachLedgerModal");
  if (!modal) return;

  try {
    const res = await fetch(`/api/kounach/${accountId}`);
    if (!res.ok) throw new Error("Failed to load account ledger");
    const data = await res.json();
    const acc = data.account;
    const ops = data.operations;

    document.getElementById("ledgerModalTitle").innerHTML = `<i class="fa-solid fa-receipt"></i> كشف حساب: ${escapeHtml(acc.person_name)}`;
    document.getElementById("ledgerModalSub").textContent = `الفئة: ${acc.category} &bull; ${acc.phone ? 'الهاتف: ' + acc.phone : 'بدون هاتف'}`;

    document.getElementById("ledgerDueVal").textContent = `${formatMoney(acc.total_due)} DH`;
    document.getElementById("ledgerPaidVal").textContent = `${formatMoney(acc.paid_amount)} DH`;
    document.getElementById("ledgerRemVal").textContent = `${formatMoney(acc.remaining)} DH`;

    const tbody = document.getElementById("ledgerTableBody");
    tbody.innerHTML = "";

    if (!ops || ops.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-muted);">لا توجد أي عمليات مسجلة لهاد الحساب بعد</td></tr>`;
    } else {
      ops.forEach(op => {
        const tr = document.createElement("tr");
        const isPayment = op.type === "payment";
        const badgeClass = isPayment ? "badge-income" : "badge-expense";
        const badgeText = isPayment ? "خلاص / دفعة (Payé 💸)" : "كريدي / سلعة (Dû ➕)";
        const amountSign = isPayment ? "- " : "+ ";
        const amountClass = isPayment ? "amount-income" : "amount-expense";

        tr.innerHTML = `
          <td><strong>${op.date}</strong></td>
          <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
          <td><strong class="${amountClass}">${amountSign}${formatMoney(op.amount)} DH</strong></td>
          <td>${escapeHtml(op.notes || "—")}</td>
          <td>
            <button class="btn-table-icon danger" onclick="handleDeleteKounachOp(${op.id}, ${accountId})" title="حذف العملية">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    modal.style.display = "flex";
  } catch (err) {
    console.error("Error opening ledger modal:", err);
    showToast("تعذر تحميل كشف الحساب", "error");
  }
};

function closeLedgerModal() {
  const modal = document.getElementById("kounachLedgerModal");
  if (modal) modal.style.display = "none";
}

window.handleDeleteKounachOp = async function(opId, accountId) {
  if (!confirm("واش متأكد باغي تحذف هاد العملية من الكناش؟ غادي يتصحح مجموع الحساب أوتوماتيكياً.")) {
    return;
  }

  try {
    const res = await fetch(`/api/kounach/operations/${opId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "تعذر حذف العملية", "error");
      return;
    }

    showToast("تم حذف العملية وتصحيح رصيد الحساب بنجاح 🗑️", "success");
    await fetchKounach();
    await refreshDashboard();
    openKounachLedgerModal(accountId);
  } catch (err) {
    console.error("Delete kounach op error:", err);
    showToast("حدث خطأ أثناء محاولة الحذف", "error");
  }
};

/* ==========================================================================
   PWA Installation & Mobile Connect Logic
   ========================================================================== */

function isAppStandalone() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

function initPWA() {
  // If app is already installed or running in standalone mode, hide install prompts
  if (isAppStandalone()) {
    state.isPwaInstalled = true;
    const mib = document.getElementById("mobileInstallBanner");
    if (mib) mib.style.display = "none";
    const navBtn = document.getElementById("btnNavInstallApp");
    if (navBtn) navBtn.style.display = "none";
    const modalWrap = document.getElementById("modalInstallWrap");
    if (modalWrap) modalWrap.style.display = "none";
    console.log("App running in standalone PWA mode");
  }

  // Capture native install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    console.log("PWA beforeinstallprompt event captured");

    if (!isAppStandalone()) {
      const mib = document.getElementById("mobileInstallBanner");
      if (mib) mib.style.display = "flex";
      const navBtn = document.getElementById("btnNavInstallApp");
      if (navBtn) navBtn.style.display = "inline-flex";
      const modalWrap = document.getElementById("modalInstallWrap");
      if (modalWrap) modalWrap.style.display = "block";
    }
  });

  // Handle successful installation
  window.addEventListener("appinstalled", () => {
    state.deferredPrompt = null;
    state.isPwaInstalled = true;

    const mib = document.getElementById("mobileInstallBanner");
    if (mib) mib.style.display = "none";
    const navBtn = document.getElementById("btnNavInstallApp");
    if (navBtn) navBtn.style.display = "none";
    const modalWrap = document.getElementById("modalInstallWrap");
    if (modalWrap) modalWrap.style.display = "none";

    showToast("تم تثبيت تطبيق أجبان الخير بنجاح فـ جهازك! 🎉", "success");
    console.log("PWA successfully installed on user device");
  });
}

async function handleInstallPWA() {
  if (state.deferredPrompt) {
    try {
      state.deferredPrompt.prompt();
      const choiceResult = await state.deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        showToast("جاري تثبيت التطبيق فـ الهاتف / الحاسوب...", "info");
      } else {
        console.log("User dismissed install prompt");
      }
      state.deferredPrompt = null;
    } catch (err) {
      console.error("Install prompt error:", err);
      openMobileModal();
    }
  } else {
    // If deferredPrompt is unavailable (e.g., iOS Safari or non-Chrome), guide via modal
    openMobileModal();
  }
}

async function openMobileModal() {
  await fetchSystemInfo();
  const modal = document.getElementById("mobileModal");
  if (modal) modal.style.display = "flex";
}

function copyMobileUrl() {
  const urlInp = document.getElementById("mobileUrlDisplay") || document.getElementById("mobileUrlInput");
  if (!urlInp || !urlInp.value) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(urlInp.value).then(() => {
      showToast("تم نسخ رابط الهاتف بنجاح 📋: " + urlInp.value, "success");
    }).catch(() => {
      fallbackCopy(urlInp);
    });
  } else {
    fallbackCopy(urlInp);
  }
}

function fallbackCopy(inp) {
  inp.select();
  inp.setSelectionRange(0, 99999);
  document.execCommand("copy");
  showToast("تم نسخ رابط الهاتف بنجاح 📋", "success");
}

/* ==========================================================================
   Service Worker Registration & Live Updates
   ========================================================================== */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/static/sw.js", { scope: "/" })
      .then((registration) => {
        console.log("Service Worker registered with scope:", registration.scope);

        // Check for updates to the service worker
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is available! Show update alert banner
              console.log("New Service Worker version installed and waiting");
              const aub = document.getElementById("appUpdateBanner");
              if (aub) aub.style.display = "flex";
              showToast("تحديث جديد متوفر للبرنامج! ✨ اضغط على 'تحديث الآن'", "info");
            }
          });
        });
      })
      .catch((err) => {
        console.warn("Service Worker registration failed:", err);
      });

    // Handle reload when new controller takes over
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

/* ==========================================================================
   Real-Time Data Sync & Live Update Polling Engine
   ========================================================================== */

function initRealtimeSync() {
  // Initial fingerprint capture
  checkSyncStatus(true);

  // Poll sync status every 5 seconds
  if (state.syncInterval) clearInterval(state.syncInterval);
  state.syncInterval = setInterval(() => {
    checkSyncStatus(false);
  }, 5000);
}

async function checkSyncStatus(isInitial = false) {
  try {
    const res = await fetch("/api/sync-status");
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.status !== "success") return;

    const newVersion = data.app_version;
    const newFingerprint = data.data_fingerprint;

    if (isInitial) {
      state.appVersion = newVersion;
      state.dataFingerprint = newFingerprint;
      return;
    }

    // 1. Code / App Update Detected (Mise à jour du système)
    if (state.appVersion && newVersion !== state.appVersion) {
      console.log(`[UpdateEngine] Code update detected: ${state.appVersion} -> ${newVersion}`);
      state.appVersion = newVersion;
      const aub = document.getElementById("appUpdateBanner");
      if (aub) aub.style.display = "flex";
      showToast("تحديث جديد متوفر للبرنامج! ✨ اضغط على 'تحديث الآن'", "info");
    }

    // 2. Data Fingerprint Change Detected (New transaction, payment, credit, etc.)
    if (state.dataFingerprint && newFingerprint !== state.dataFingerprint) {
      console.log(`[SyncEngine] Data change detected: ${state.dataFingerprint} -> ${newFingerprint}`);
      state.dataFingerprint = newFingerprint;
      await refreshDashboardSilently();
      showToast("تم مزامنة البيانات تلقائياً مع السيرفر 🔄", "info");
    }
  } catch (err) {
    // Network errors are normal in offline mode or during server restart
  }
}

async function refreshDashboardSilently() {
  try {
    // Refresh summary, transactions, categories, and kounach accounts silently
    await Promise.all([
      loadSummary(),
      loadTransactions(),
      fetchCategories(),
      fetchKounach()
    ]);

    // If Ledger Modal is open, update its operations live
    if (state.activeKounachAccountId) {
      const ledgerModal = document.getElementById("kounachLedgerModal");
      if (ledgerModal && ledgerModal.style.display !== "none") {
        openKounachLedgerModal(state.activeKounachAccountId);
      }
    }
  } catch (err) {
    console.warn("Silent dashboard refresh failed:", err);
  }
}

function handleApplyAppUpdate() {
  showToast("جاري تطبيق التحديث الجديد للبرنامج... 🔄", "info");

  // Post message to service worker to activate new version
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
  }

  // Clear cache if supported and reload
  setTimeout(() => {
    if (window.caches) {
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }).finally(() => {
        window.location.reload(true);
      });
    } else {
      window.location.reload(true);
    }
  }, 400);
}

/* ==========================================================================
   OFFLINE DATA STORAGE & MUTATION ENGINE (HORS-LIGNE)
   ========================================================================== */

const OFFLINE_KEYS = {
  SUMMARY: "ajban_cache_summary",
  TRANSACTIONS: "ajban_cache_transactions",
  CATEGORIES: "ajban_cache_categories",
  KOUNACH: "ajban_cache_kounach",
  QUEUE: "ajban_offline_queue"
};

let isSyncingQueue = false;

function initOfflineEngine() {
  window.addEventListener("online", () => {
    handleConnectionChange(true);
    syncOfflineQueue();
  });

  window.addEventListener("offline", () => {
    handleConnectionChange(false);
    showToast("انقطع الاتصال ⚠️ التطبيق مستمر فالعمل بدون إنترنت وكيحفظ العمليات محلياً!", "warning");
  });

  // Initial check
  handleConnectionChange(navigator.onLine);
  if (navigator.onLine) {
    setTimeout(syncOfflineQueue, 1500);
  }
}

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEYS.QUEUE)) || [];
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_KEYS.QUEUE, JSON.stringify(queue));
    updateOfflineQueueUI();
  } catch (e) {
    console.error("Failed to save offline queue", e);
  }
}

function updateOfflineQueueUI() {
  const queue = getOfflineQueue();
  const queueCountEl = document.getElementById("offlineQueueCount");
  if (queueCountEl) queueCountEl.textContent = queue.length;
}

function enqueueOfflineMutation(type, endpoint, method, payload, description) {
  const queue = getOfflineQueue();
  const item = {
    id: "offline_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    type,
    endpoint,
    method,
    payload,
    description,
    timestamp: new Date().toISOString()
  };
  queue.push(item);
  saveOfflineQueue(queue);
  return item;
}

function handleOfflineTransactionSave(payload, editId) {
  const isIncome = payload.type === "mad5oul";
  const numAmount = parseFloat(payload.amount) || 0;

  // 1. Enqueue mutation
  const queueItem = enqueueOfflineMutation(
    "transaction",
    editId ? `/api/transactions/${editId}` : "/api/transactions",
    editId ? "PUT" : "POST",
    payload,
    `${isIncome ? "مدخول" : "مصروف"}: ${formatMoney(numAmount)} DH (${payload.category})`
  );

  // 2. Optimistic local update in state.transactions
  const localId = editId || queueItem.id;
  const localTx = {
    id: localId,
    type: payload.type,
    category: payload.category,
    amount: numAmount,
    description: (payload.description ? payload.description + " " : "") + "(محفوظ محلياً 💾 فـ الانتظار)",
    payment_method: payload.payment_method || "Kache / Espèces",
    date: payload.date,
    time: payload.time,
    _offline_pending: true
  };

  if (editId) {
    const idx = state.transactions.findIndex(t => t.id === editId);
    if (idx !== -1) state.transactions[idx] = localTx;
  } else {
    state.transactions.unshift(localTx);
  }

  try {
    localStorage.setItem(OFFLINE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  } catch (e) {}

  renderTransactionsTable(state.transactions);

  // 3. Optimistic KPI update
  const kpiIncome = document.getElementById("kpiTotalIncome");
  const kpiExpense = document.getElementById("kpiTotalExpense");
  const kpiBalance = document.getElementById("kpiNetBalance");

  if (kpiIncome && kpiExpense && kpiBalance) {
    let curInc = parseFloat(kpiIncome.textContent.replace(/[^0-9.]/g, "")) || 0;
    let curExp = parseFloat(kpiExpense.textContent.replace(/[^0-9.]/g, "")) || 0;
    if (isIncome) curInc += numAmount;
    else curExp += numAmount;
    const curBal = curInc - curExp;

    kpiIncome.innerHTML = `${formatMoney(curInc)} <span class="currency">DH</span>`;
    kpiExpense.innerHTML = `${formatMoney(curExp)} <span class="currency">DH</span>`;
    kpiBalance.innerHTML = `${formatMoney(curBal)} <span class="currency">DH</span>`;
  }

  closeTransactionModal();
  handleConnectionChange(false);
  showToast("تم تسجيل العملية بدون إنترنت 💾 محفوظة فـ الهاتف وغادي تتزامن أوتوماتيكياً!", "success");
}

function handleOfflinePersonSave(payload, editId) {
  const queueItem = enqueueOfflineMutation(
    "kounach_person",
    editId ? `/api/kounach/${editId}` : "/api/kounach",
    editId ? "PUT" : "POST",
    payload,
    `حساب كناش جديد: ${payload.person_name} (${payload.category})`
  );

  const newAcc = {
    id: editId || queueItem.id,
    person_name: payload.person_name,
    phone: payload.phone || "",
    category: payload.category || "كساب (حليب)",
    notes: (payload.notes ? payload.notes + " " : "") + "(محفوظ محلياً 💾)",
    total_due: payload.initial_due || 0,
    paid_amount: payload.initial_paid || 0,
    remaining: Math.max(0, (payload.initial_due || 0) - (payload.initial_paid || 0)),
    is_settled: (payload.initial_due || 0) <= (payload.initial_paid || 0),
    _offline_pending: true
  };

  if (!state.kounach.accounts) state.kounach.accounts = [];
  if (editId) {
    const idx = state.kounach.accounts.findIndex(a => a.id === editId);
    if (idx !== -1) state.kounach.accounts[idx] = newAcc;
  } else {
    state.kounach.accounts.unshift(newAcc);
  }

  try {
    localStorage.setItem(OFFLINE_KEYS.KOUNACH, JSON.stringify(state.kounach));
  } catch (e) {}

  renderKounachAccounts();
  closePersonModal();
  handleConnectionChange(false);
  showToast("تم حفظ الحساب محلياً بدون إنترنت 💾 وغادي يتزامن أوتوماتيكياً!", "success");
}

function handleOfflineKounachOpSave(accountId, payload) {
  const queueItem = enqueueOfflineMutation(
    "kounach_op",
    `/api/kounach/${accountId}/operations`,
    "POST",
    payload,
    `كناش: ${payload.type === "payment" ? "خلاص" : "كريدي"} ${formatMoney(payload.amount)} DH`
  );

  // Optimistic update of the account
  const acc = (state.kounach.accounts || []).find(a => String(a.id) === String(accountId));
  if (acc) {
    if (payload.type === "credit") {
      acc.total_due = (acc.total_due || 0) + payload.amount;
    } else {
      acc.paid_amount = (acc.paid_amount || 0) + payload.amount;
    }
    acc.remaining = Math.max(0, acc.total_due - acc.paid_amount);
    acc.is_settled = acc.remaining <= 0;

    // If auto record in transactions requested for payment
    if (payload.record_in_transactions) {
      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
      const opTx = {
        type: "masrouf",
        category: acc.category || "شراء الحليب من الكسابة",
        amount: payload.amount,
        description: `خلاص كناش (${acc.person_name}): ${payload.notes || 'دفعة مسجلة محلياً'}`,
        payment_method: "Kache / Espèces",
        date: payload.date,
        time: timeStr
      };
      handleOfflineTransactionSave(opTx, null);
    }
  }

  try {
    localStorage.setItem(OFFLINE_KEYS.KOUNACH, JSON.stringify(state.kounach));
  } catch (e) {}

  renderKounachAccounts();
  closeOpModal();
  handleConnectionChange(false);
  showToast("تم تسجيل عملية الكناش بدون إنترنت 💾 محفوظة وغادي تتزامن أوتوماتيكياً!", "success");
}

async function syncOfflineQueue() {
  if (isSyncingQueue || !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isSyncingQueue = true;
  console.log(`[OfflineSync] Syncing ${queue.length} pending offline mutations...`);
  showToast(`جاري مزامنة ${queue.length} عمليات مسجلة بدون إنترنت مع السيرفر... 🔄`, "info");

  const remainingQueue = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });

      if (res.ok || res.status === 201 || res.status === 200) {
        syncedCount++;
        console.log(`[OfflineSync] Successfully synced: ${item.description || item.id}`);
      } else if (res.status >= 400 && res.status < 500) {
        console.warn(`[OfflineSync] Item rejected by server with ${res.status}:`, item);
      } else {
        remainingQueue.push(item);
      }
    } catch (err) {
      console.warn(`[OfflineSync] Network error on item ${item.id}, keep in queue:`, err);
      remainingQueue.push(item);
    }
  }

  saveOfflineQueue(remainingQueue);
  isSyncingQueue = false;

  if (syncedCount > 0) {
    showToast(`🟢 رجعات الكونيكسيون! تم مزامنة ${syncedCount} عمليات بنجاح مع السيرفر 🎉`, "success");
    await fetchCategories();
    await fetchKounach();
    await refreshDashboard();
  }
}

function handleConnectionChange(isOnline) {
  const connPill = document.getElementById("connectionPill");
  const connText = document.getElementById("connectionPillText");
  const offBanner = document.getElementById("offlineStatusBar");
  const queueCount = document.getElementById("offlineQueueCount");

  const queue = getOfflineQueue();
  if (queueCount) queueCount.textContent = queue.length;

  if (isOnline) {
    if (connPill) {
      connPill.className = "connection-pill online";
      if (connText) connText.textContent = "متصل (En ligne)";
    }
    if (offBanner) offBanner.style.display = "none";
  } else {
    if (connPill) {
      connPill.className = "connection-pill offline";
      if (connText) connText.textContent = "غير متصل (Hors-ligne)";
    }
    if (offBanner) offBanner.style.display = "flex";
  }
}



