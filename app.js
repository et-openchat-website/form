(() => {
  const cfg = window.ET_ADMIN_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const hidden = (el, yes) => el.classList.toggle("hidden", yes);

  const EMAIL_KEYS = /email|e-mail|mailaddress|mail_address|メールアドレス|連絡先メール|登録用メール/i;
  const PRIVATE_KEYS = new Set(["question_35"]);
  const OMIT_KEYS = new Set(["created_at"]);
  const MODE_TABLE = "site_access_settings";
  const RESPONSE_RPC = "et_get_survey_responses";
  const ADMIN_RPC = "et_is_active_admin";

  let supabase = null;
  let allRows = [];
  let visibleRows = [];
  let fields = [];
  let aggregateChart = null;
  let isAdmin = false;
  let currentUserId = null;
  let accessSettings = null;

  const CHOICE_FIELDS = new Set([
    "et", "et_2", "et_3", "question_5", "question_6", "question_7",
    "question_11", "question_12", "question_16", "question_17", "question_18",
    "question_19", "question_20", "question_23", "question_25", "question_26",
    "question_27", "question_28", "question_29", "et_4", "et_5", "question_36"
  ]);
  const MULTI_SELECT_FIELDS = new Set(["question_19"]);

  const LABELS = {
    response_key: "回答キー",
    submitted_at: "タイムスタンプ",
    created_at: "登録日時",
    et: "ETをどのくらい利用していますか？",
    et_2: "ETを知ったきっかけは何ですか？",
    et_3: "ETを利用する主な目的は何ですか？",
    question_5: "本オープンチャットで配信している防災情報（テキスト・画像含む）は見やすいですか？",
    question_6: "本オープンチャットで配信している防災情報は分かりやすいですか？",
    question_7: "本オープンチャットで配信する防災情報の量について、どの程度満足していますか？",
    question_8: "本オープンチャットで配信している防災情報について、良い点・継続して欲しい点を教えてください。",
    question_9: "本オープンチャットで配信している防災情報について、良くない点・改善して欲しい点を教えてください。",
    question_10: "本オープンチャットで配信している防災情報について、その他質問・意見があれば教えてください。",
    question_11: "本オープンチャットで配信する交通情報の量について、どの程度満足していますか？",
    question_12: "交通情報の配信方法について、別トークルームに分けて欲しいと思いますか？",
    question_13: "本オープンチャットで配信している交通情報について、良い点・継続して欲しい点を教えてください。",
    question_14: "本オープンチャットで配信している交通情報について、良くない点・改善して欲しい点を教えてください。",
    question_15: "本オープンチャットで配信している交通情報について、その他質問・意見があれば教えてください。",
    question_16: "今までに開催したライブ配信を聴いたことがありますか？",
    question_17: "ライブトークの内容は分かりやすいですか？",
    question_18: "ライブトークの品質（音質や音飛び）について、最も近いものを教えてください。",
    question_19: "ライブトークの品質（音質や音飛び）について、主な症状を教えてください。（複数選択可）",
    question_20: "ライブトークにどの程度満足していますか？",
    question_21: "ライブトークについて、質問、意見・要望があれば教えてください。",
    question_22: "どのような時にどのような内容のライブトークがあれば参加したいと思いますか？",
    question_23: "現在の投稿ルールや情報共有の仕組みについて、どう感じますか？",
    question_24: "利用するうえで、不便に感じることはありますか？",
    question_25: "現在の運営からの対応に満足していますか？",
    question_26: "情報の誤りへの対応は、適切だと思いますか？",
    question_27: "非常時の対応は、適切だと思いますか？",
    question_28: "不適切な投稿への対応は、適切だと思いますか？",
    question_29: "何かあった際の対応は、適切だと思いますか？",
    question_30: "今後、運営に改善してほしいことはありますか？",
    et_4: "今後もETを利用したいと思いますか？",
    et_5: "ETを知人・友人にお勧めしたいと思いますか？",
    question_33: "ご意見・感想をご自由にお書きください。",
    question_34: "その他、ご質問・ご要望などがあればお書きください。",
    question_35: "個別での回答を希望する場合のメールアドレス",
    question_36: "利用規約・プライバシーポリシーに同意する"
  };

  function safeError(err) {
    const msg = err?.message || String(err || "不明なエラー");
    return msg.length > 250 ? `${msg.slice(0, 250)}…` : msg;
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "（未回答）";
    if (Array.isArray(value)) return value.join("、");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function visibleEntries(row) {
    return Object.entries(row || {}).filter(([key]) =>
      !PRIVATE_KEYS.has(key) && !EMAIL_KEYS.test(key) && !OMIT_KEYS.has(key) &&
      !["submitted_at", "created_at"].includes(key)
    );
  }

  function labelFor(key) {
    return LABELS[key] || key.replaceAll("_", " ");
  }

  function setStatus(text, error = false) {
    $("status").textContent = text;
    $("status").style.color = error ? "#b42318" : "";
  }

  function hideAllScreens() {
    ["loginPanel", "adminLoginPanel", "maintenancePanel", "blockedPanel", "setupErrorPanel", "dashboard"].forEach((id) => hidden($(id), true));
  }

  function closeHeaderMenu() {
    hidden($("siteMenu"), true);
    $("menuToggleBtn").setAttribute("aria-expanded", "false");
    $("menuToggleBtn").setAttribute("aria-label", "メニューを開く");
  }

  function toggleHeaderMenu(forceOpen = null) {
    const shouldOpen = forceOpen === null ? $("siteMenu").classList.contains("hidden") : forceOpen;
    hidden($("siteMenu"), !shouldOpen);
    $("menuToggleBtn").setAttribute("aria-expanded", String(shouldOpen));
    $("menuToggleBtn").setAttribute("aria-label", shouldOpen ? "メニューを閉じる" : "メニューを開く");
  }

  function updateNavPresentation() {
    const header = $("siteHeader");
    const brand = $("brandBlock");
    const desktopActions = $("desktopAuthActions");
    document.body.classList.remove("nav-compact");
    const forced = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
    if (!forced) {
      const style = window.getComputedStyle(header);
      const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const gap = parseFloat(style.gap) || 16;
      const available = header.clientWidth - horizontalPadding;
      const needed = brand.scrollWidth + desktopActions.scrollWidth + gap;
      if (needed > available) document.body.classList.add("nav-compact");
    } else {
      document.body.classList.add("nav-compact");
    }
    if (!document.body.classList.contains("nav-compact")) closeHeaderMenu();
  }

  function setHeaderNavState({ login = false, admin = false, logout = false } = {}) {
    hidden($("headerLoginBtn"), !login);
    hidden($("menuLoginBtn"), !login);
    hidden($("headerAdminLoginBtn"), !admin);
    hidden($("menuAdminLoginBtn"), !admin);
    hidden($("logoutBtn"), !logout);
    hidden($("menuLogoutBtn"), !logout);
    closeHeaderMenu();
    updateNavPresentation();
  }

  function showLogin() {
    hideAllScreens();
    hidden($("loginPanel"), false);
    setHeaderNavState({ login: true, admin: true });
  }

  function showAdminLogin() {
    hideAllScreens();
    hidden($("adminLoginPanel"), false);
    setHeaderNavState({ login: accessSettings?.maintenance_mode !== true });
    $("adminEmail").focus();
  }

  function showMaintenance() {
    hideAllScreens();
    hidden($("maintenancePanel"), false);
    setHeaderNavState({ admin: true });
  }

  function showBlocked() {
    hideAllScreens();
    hidden($("blockedPanel"), false);
    setHeaderNavState({ admin: true });
  }

  function showSetupError(error) {
    hideAllScreens();
    $("setupErrorMessage").textContent = `Supabaseの設定またはSQL適用状況を確認してください。${error ? ` (${safeError(error)})` : ""}`;
    hidden($("setupErrorPanel"), false);
    setHeaderNavState({ admin: true });
  }

  function showDashboard() {
    hideAllScreens();
    hidden($("dashboard"), false);
    setHeaderNavState({ admin: !isAdmin, logout: true });
    hidden($("adminPanel"), !isAdmin);
    hidden($("adminBadge"), !isAdmin);
  }

  async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async function getIsActiveAdmin() {
    const { data, error } = await supabase.rpc(ADMIN_RPC);
    if (error) throw error;
    return data === true;
  }

  async function readAccessSettings() {
    const { data, error } = await supabase
      .from(MODE_TABLE)
      .select("id, maintenance_mode, form_view_blocked, updated_at")
      .eq("id", true)
      .single();
    if (error) throw error;
    accessSettings = data;
    renderModeControls();
    return data;
  }

  function renderModeControls() {
    if (!accessSettings) return;
    const maintenance = accessSettings.maintenance_mode === true;
    const blocked = accessSettings.form_view_blocked === true;
    $("maintenanceState").textContent = maintenance ? "ON：一般利用者はメンテナンス画面" : "OFF：通常公開";
    $("blockedState").textContent = blocked ? "ON：一般利用者は閲覧禁止" : "OFF：通常閲覧";
    $("maintenanceToggle").textContent = maintenance ? "メンテナンスをOFF" : "メンテナンスをON";
    $("blockedToggle").textContent = blocked ? "閲覧禁止をOFF" : "閲覧禁止をON";
    $("maintenanceToggle").disabled = !isAdmin;
    $("blockedToggle").disabled = !isAdmin;
  }

  async function routeForCurrentUser() {
    let user = await getCurrentUser();
    currentUserId = user?.id || null;
    isAdmin = user ? await getIsActiveAdmin() : false;
    const settings = await readAccessSettings();

    if (isAdmin) {
      showDashboard();
      await loadRows();
      return;
    }
    if (user && String(user.email || "").toLowerCase() !== String(cfg.LOGIN_EMAIL || "").toLowerCase()) {
      await supabase.auth.signOut();
      currentUserId = null;
      user = null;
    }
    clearDashboardData();
    if (settings.maintenance_mode) {
      showMaintenance();
    } else if (user && settings.form_view_blocked) {
      showBlocked();
    } else if (user) {
      showDashboard();
      await loadRows();
    } else {
      showLogin();
    }
  }

  function clearDashboardData() {
    allRows = [];
    visibleRows = [];
    fields = [];
    $("totalCount").textContent = "0";
    $("shownCount").textContent = "0";
    $("responseRows").replaceChildren();
    $("aggregateField").replaceChildren();
    $("aggregateResults").replaceChildren();
    $("aggregateMeta").textContent = "";
    if (aggregateChart) {
      aggregateChart.destroy();
      aggregateChart = null;
    }
    $("chartWrap").classList.add("hidden");
    hidden($("detailPanel"), true);
    closeAnswerModal();
  }

  async function loadRows() {
    if (!isAdmin && accessSettings && (accessSettings.maintenance_mode || accessSettings.form_view_blocked)) {
      throw new Error("現在は回答データを閲覧できません。");
    }
    setStatus("アンケート回答を読み込み中…");
    const { data, error } = await supabase.rpc(RESPONSE_RPC);
    if (error) throw error;
    allRows = Array.isArray(data) ? data : [];
    fields = allRows.length ? visibleEntries(allRows[0]).map(([key]) => key) : [];
    $("totalCount").textContent = String(allRows.length);
    populateAggregateFields();
    renderRows();
    renderAggregate();
    setStatus(`${allRows.length}件の回答を読み込みました。最大5,000件まで表示します。`);
  }

  function renderRows() {
    visibleRows = allRows.slice();
    $("shownCount").textContent = String(visibleRows.length);
    const tbody = $("responseRows");
    tbody.replaceChildren();
    if (!visibleRows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.textContent = "回答はありません。";
      tr.append(td);
      tbody.append(tr);
      return;
    }
    visibleRows.slice(0, 300).forEach((row) => {
      const tr = document.createElement("tr");
      const summary = document.createElement("td");
      const entries = visibleEntries(row).filter(([key, value]) =>
        key !== "response_key" && displayValue(value) !== "（未回答）"
      );
      summary.className = "answer-summary";
      summary.textContent = entries.slice(0, 2).map(([key, value]) => `${labelFor(key)}：${displayValue(value)}`).join("\n") || "回答内容なし";
      const action = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "詳細";
      button.addEventListener("click", () => showDetail(row));
      action.append(button);
      tr.append(summary, action);
      tbody.append(tr);
    });
    if (visibleRows.length > 300) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.textContent = "一覧は先頭300件を表示中です。";
      tr.append(td);
      tbody.append(tr);
    }
  }

  function showDetail(row) {
    const target = $("detailContent");
    target.replaceChildren();
    visibleEntries(row).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "detail-row";
      const label = document.createElement("div");
      label.className = "detail-label";
      label.textContent = labelFor(key);
      const val = document.createElement("div");
      val.className = "detail-value";
      val.textContent = displayValue(value);
      item.append(label, val);
      target.append(item);
    });
    hidden($("detailPanel"), false);
    $("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function populateAggregateFields() {
    const select = $("aggregateField");
    select.replaceChildren();
    const answerFields = fields.filter((key) => key !== "response_key" && key !== "submitted_at");
    answerFields.forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = labelFor(key);
      select.append(option);
    });
    if (!answerFields.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "集計できる質問がありません";
      select.append(option);
    }
  }

  function isOtherAnswer(value) {
    return /その他|自由記述|別の回答/i.test(String(value || ""));
  }

  function splitMultiAnswer(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(/[,、;；\n]+/).map((item) => item.trim()).filter(Boolean);
  }

  function getAnswerCounts(key) {
    const counts = new Map();
    allRows.forEach((row) => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === "") return;
      const values = MULTI_SELECT_FIELDS.has(key) ? splitMultiAnswer(raw) : [displayValue(raw).trim()];
      values.forEach((value) => {
        if (!value || value === "（未回答）") return;
        counts.set(value, (counts.get(value) || 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function openAnswerModal(title, description, answers) {
    $("answerModalTitle").textContent = title;
    $("answerModalDescription").textContent = description || "";
    const list = $("answerModalList");
    list.replaceChildren();
    if (!answers.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "該当する回答はありません。";
      list.append(empty);
    } else {
      answers.forEach(({ value, question }) => {
        const card = document.createElement("article");
        card.className = "modal-answer";
        const head = document.createElement("div");
        head.className = "modal-answer-head";
        const questionLabel = document.createElement("span");
        questionLabel.textContent = question || "回答";
        head.append(questionLabel);
        const text = document.createElement("div");
        text.className = "modal-answer-text";
        text.textContent = value;
        card.append(head, text);
        list.append(card);
      });
    }
    hidden($("answerModal"), false);
    document.body.classList.add("modal-open");
    $("closeAnswerModalBtn").focus();
  }

  function closeAnswerModal() {
    hidden($("answerModal"), true);
    document.body.classList.remove("modal-open");
  }

  function showQuestionAnswers(key, filterValue = null) {
    const answers = [];
    allRows.forEach((row) => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === "") return;
      const value = displayValue(raw);
      if (value === "（未回答）") return;
      if (filterValue !== null) {
        if (isOtherAnswer(filterValue)) {
          if (!isOtherAnswer(value)) return;
        } else if (MULTI_SELECT_FIELDS.has(key)) {
          if (!splitMultiAnswer(raw).some((part) => part === filterValue)) return;
        } else if (value.trim() !== filterValue.trim()) {
          return;
        }
      }
      answers.push({ value, question: labelFor(key) });
    });
    const title = filterValue === null ? `${labelFor(key)}：回答一覧` : `「${filterValue}」の回答`;
    openAnswerModal(title, `${answers.length}件の回答`, answers);
  }

  function renderAggregate() {
    const key = $("aggregateField").value;
    const target = $("aggregateResults");
    const meta = $("aggregateMeta");
    const chartWrap = $("chartWrap");
    const canvas = $("aggregateChart");
    target.replaceChildren();
    meta.textContent = "";
    if (aggregateChart) {
      aggregateChart.destroy();
      aggregateChart = null;
    }
    if (!key) {
      chartWrap.classList.add("hidden");
      target.innerHTML = '<div class="empty-state">分析できる質問がありません。</div>';
      return;
    }
    if (PRIVATE_KEYS.has(key) || EMAIL_KEYS.test(key) || OMIT_KEYS.has(key)) {
      chartWrap.classList.add("hidden");
      return;
    }
    if (!CHOICE_FIELDS.has(key)) {
      chartWrap.classList.add("hidden");
      const answers = allRows.filter((row) => {
        const value = row[key];
        return value !== null && value !== undefined && String(value).trim() !== "";
      });
      meta.textContent = `自由記述の回答：${answers.length}件`;
      const row = document.createElement("div");
      row.className = "aggregate-item";
      const label = document.createElement("span");
      label.textContent = labelFor(key);
      const count = document.createElement("strong");
      count.textContent = `${answers.length}件`;
      row.append(label, count);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "回答を見る";
      button.addEventListener("click", () => showQuestionAnswers(key));
      row.append(button);
      target.append(row);
      return;
    }

    const sorted = getAnswerCounts(key);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    meta.textContent = `回答数：${total}件 · 選択肢：${sorted.length}種類`;
    if (!sorted.length) {
      chartWrap.classList.add("hidden");
      target.innerHTML = '<div class="empty-state">集計対象の回答はありません。</div>';
      return;
    }
    chartWrap.classList.remove("hidden");
    const usePie = sorted.length <= 6 && !MULTI_SELECT_FIELDS.has(key);
    const palette = ["#8bc34a", "#5f9e2f", "#b6dc83", "#3f6f1c", "#d8edbd", "#78b84b", "#a3cf6e", "#477d28", "#c1e39a", "#6a9d3c", "#e5f3d4", "#94c95b"];
    aggregateChart = new window.Chart(canvas, {
      type: usePie ? "pie" : "bar",
      data: {
        labels: sorted.map(([value]) => value),
        datasets: [{
          label: "回答数",
          data: sorted.map(([, count]) => count),
          backgroundColor: sorted.map((_, index) => palette[index % palette.length]),
          borderColor: usePie ? "#ffffff" : "#6b9f37",
          borderWidth: usePie ? 2 : 1,
          borderRadius: usePie ? 0 : 7,
          maxBarThickness: 48
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: usePie ? "x" : "y",
        plugins: {
          legend: { display: usePie, position: "bottom", labels: { usePointStyle: true, padding: 16, boxWidth: 9 } },
          tooltip: { callbacks: { label(context) {
            const count = usePie ? context.parsed : context.parsed.x;
            const percentage = total ? Math.round(Number(count) / total * 1000) / 10 : 0;
            return ` ${count}件（${percentage}%）`;
          } } }
        },
        scales: usePie ? {} : {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#edf3e7" } },
          y: { grid: { display: false }, ticks: { color: "#35472c", autoSkip: false } }
        }
      }
    });

    sorted.forEach(([value, count]) => {
      const item = document.createElement("div");
      item.className = "aggregate-item";
      const labelWrap = document.createElement("div");
      labelWrap.className = "aggregate-value";
      const label = document.createElement("span");
      label.textContent = value;
      const countLabel = document.createElement("span");
      countLabel.className = "answer-count";
      countLabel.textContent = `${count}件（${total ? (count / total * 100).toFixed(1) : "0.0"}%）`;
      labelWrap.append(label, countLabel);
      item.append(labelWrap);
      if (isOtherAnswer(value)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = "回答を見る";
        button.addEventListener("click", () => showQuestionAnswers(key, value));
        item.append(button);
      }
      target.append(item);
    });
  }

  async function requireConfigured() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !cfg.LOGIN_EMAIL ||
        cfg.SUPABASE_URL.includes("YOUR_PROJECT_REF") || cfg.SUPABASE_ANON_KEY.includes("YOUR_")) {
      throw new Error("config.jsのSupabase URL・公開キー・共通ログイン用メールアドレスを確認してください。");
    }
  }

  async function initializeClient() {
    await requireConfigured();
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = await getCurrentUser();
    currentUserId = user?.id || null;
    isAdmin = user ? await getIsActiveAdmin() : false;
    await readAccessSettings();
    if (!isAdmin && accessSettings.maintenance_mode) {
      clearDashboardData();
      showMaintenance();
      return;
    }
    if (!isAdmin && accessSettings.form_view_blocked) {
      clearDashboardData();
      showBlocked();
      return;
    }
    showDashboard();
    await loadRows();
  }

  async function handleAdminLogin(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = await getCurrentUser();
    currentUserId = user?.id || null;
    isAdmin = user ? await getIsActiveAdmin() : false;
    if (!isAdmin) {
      await supabase.auth.signOut();
      currentUserId = null;
      throw new Error("有効な管理者ではありません。admin_membersのactive=true、role='admin'を確認してください。");
    }
    await readAccessSettings();
    showDashboard();
    await loadRows();
  }

  async function updateMode(column) {
    if (!isAdmin || !accessSettings) return;
    const button = column === "maintenance_mode" ? $("maintenanceToggle") : $("blockedToggle");
    const status = $("modeStatus");
    button.disabled = true;
    status.textContent = "設定を保存中…";
    try {
      const nextValue = !accessSettings[column];
      const { data, error } = await supabase
        .from(MODE_TABLE)
        .update({ [column]: nextValue })
        .eq("id", true)
        .select("id, maintenance_mode, form_view_blocked, updated_at")
        .single();
      if (error) throw error;
      accessSettings = data;
      renderModeControls();
      status.textContent = "設定を保存しました。";
    } catch (error) {
      status.textContent = `保存できませんでした：${safeError(error)}`;
      status.style.color = "#b42318";
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    try {
      await initializeClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) {
        await routeForCurrentUser();
      } else {
        isAdmin = false;
        currentUserId = null;
        const settings = await readAccessSettings();
        settings.maintenance_mode ? showMaintenance() : showLogin();
      }
    } catch (error) {
      showSetupError(error);
    }
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginError").textContent = "";
    const button = $("loginForm").querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "確認中…";
    try {
      await signIn(cfg.LOGIN_EMAIL, $("password").value);
      $("password").value = "";
    } catch (error) {
      $("loginError").textContent = safeError(error);
    } finally {
      button.disabled = false;
      button.textContent = "ログイン";
    }
  });

  $("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("adminLoginError").textContent = "";
    const button = $("adminLoginForm").querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "確認中…";
    try {
      await handleAdminLogin($("adminEmail").value.trim(), $("adminPassword").value);
      $("adminPassword").value = "";
    } catch (error) {
      $("adminLoginError").textContent = safeError(error);
    } finally {
      button.disabled = false;
      button.textContent = "管理パネルへログイン";
    }
  });

  function openCommonLogin() {
    closeHeaderMenu();
    if (accessSettings?.maintenance_mode && !isAdmin) showMaintenance();
    else showLogin();
  }

  async function handleLogout() {
    closeHeaderMenu();
    if (supabase) await supabase.auth.signOut();
    isAdmin = false;
    currentUserId = null;
    clearDashboardData();
    try {
      const settings = await readAccessSettings();
      settings.maintenance_mode ? showMaintenance() : showLogin();
    } catch (error) {
      showSetupError(error);
    }
  }

  $("headerLoginBtn").addEventListener("click", openCommonLogin);
  $("menuLoginBtn").addEventListener("click", openCommonLogin);
  $("headerAdminLoginBtn").addEventListener("click", showAdminLogin);
  $("menuAdminLoginBtn").addEventListener("click", showAdminLogin);
  $("logoutBtn").addEventListener("click", handleLogout);
  $("menuLogoutBtn").addEventListener("click", handleLogout);
  $("menuToggleBtn").addEventListener("click", () => toggleHeaderMenu());
  document.addEventListener("click", (event) => {
    if (!$("siteMenu").classList.contains("hidden") && !$("siteHeader").contains(event.target)) closeHeaderMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHeaderMenu();
  });
  window.addEventListener("resize", updateNavPresentation);
  if ("ResizeObserver" in window) new ResizeObserver(updateNavPresentation).observe($("siteHeader"));

  $("backToLoginBtn").addEventListener("click", () => {
    if (accessSettings?.maintenance_mode) showMaintenance();
    else showLogin();
  });

  $("refreshBtn").addEventListener("click", async () => {
    try {
      await routeForCurrentUser();
    } catch (error) {
      if (isAdmin) setStatus(safeError(error), true);
      else {
        clearDashboardData();
        try {
          const settings = await readAccessSettings();
          if (settings.maintenance_mode) showMaintenance();
          else if (settings.form_view_blocked) showBlocked();
          else setStatus(safeError(error), true);
        } catch (settingsError) {
          showSetupError(settingsError);
        }
      }
    }
  });
  $("maintenanceToggle").addEventListener("click", () => updateMode("maintenance_mode"));
  $("blockedToggle").addEventListener("click", () => updateMode("form_view_blocked"));
  $("toggleResponsesBtn").addEventListener("click", () => {
    const list = $("responseListContent");
    const opening = list.classList.contains("hidden");
    hidden(list, !opening);
    $("toggleResponsesBtn").setAttribute("aria-expanded", String(opening));
    $("toggleResponsesBtn").textContent = opening ? "個別回答一覧を閉じる" : "個別回答一覧を表示";
  });
  $("aggregateField").addEventListener("change", renderAggregate);
  $("closeAnswerModalBtn").addEventListener("click", closeAnswerModal);
  $("answerModal").addEventListener("click", (event) => {
    if (event.target?.dataset?.closeModal === "true") closeAnswerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("answerModal").classList.contains("hidden")) closeAnswerModal();
  });
  $("closeDetailBtn").addEventListener("click", () => hidden($("detailPanel"), true));

  updateNavPresentation();
  init();
})();
