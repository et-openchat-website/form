(() => {
  const cfg = window.ET_ADMIN_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const hidden = (el, yes) => el.classList.toggle("hidden", yes);
  const EMAIL_KEYS = /email|e-mail|mailaddress|mail_address|メールアドレス|連絡先メール|登録用メール/i;
  const OMIT_KEYS = new Set(["created_at"]); // created_at is not a response answer; still available for ordering.
  let supabase = null;
  let allRows = [];
  let visibleRows = [];
  let fields = [];

  function safeError(err) {
    const msg = err?.message || String(err || "不明なエラー");
    return msg.length > 250 ? msg.slice(0, 250) + "…" : msg;
  }
  function displayValue(v) {
    if (v === null || v === undefined || v === "") return "（未回答）";
    if (Array.isArray(v)) return v.join("、");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }
  function visibleEntries(row) {
    return Object.entries(row).filter(([k]) => !EMAIL_KEYS.test(k) && !OMIT_KEYS.has(k));
  }
  function labelFor(key) {
    const labels = {
      response_key: "回答キー", submitted_at: "送信日時",
      et: "ET", et_2: "ET（2）", et_3: "ET（3）", et_4: "ET（4）", et_5: "ET（5）"
    };
    return labels[key] || key.replaceAll("_", " ");
  }
  function formatDate(v) {
    if (!v) return "日時不明";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("ja-JP");
  }
  function setStatus(text, error = false) {
    $("status").textContent = text;
    $("status").style.color = error ? "#b42318" : "";
  }
  function showLogin() {
    hidden($("loginPanel"), false);
    hidden($("dashboard"), true);
    hidden($("logoutBtn"), true);
  }
  function showDashboard() {
    hidden($("loginPanel"), true);
    hidden($("dashboard"), false);
    hidden($("logoutBtn"), false);
  }
  async function getMemberAccess() {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return false;
    const { data, error } = await supabase
      .from("admin_members")
      .select("active, role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    return !!data && data.active === true;
  }
  async function loadRows() {
    setStatus("アンケート回答を読み込み中…");
    const { data, error } = await supabase
      .from("et_survey_responses_public")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw error;
    allRows = data || [];
    fields = allRows.length ? visibleEntries(allRows[0]).map(([k]) => k) : [];
    $("totalCount").textContent = String(allRows.length);
    populateAggregateFields();
    renderRows();
    renderAggregate();
    setStatus(`${allRows.length}件の回答を読み込みました。最大5,000件まで表示します。`);
  }
  function renderRows() {
    const q = $("searchInput").value.trim().toLocaleLowerCase("ja");
    visibleRows = allRows.filter(row => {
      if (!q) return true;
      return visibleEntries(row).some(([k,v]) =>
        (labelFor(k) + " " + displayValue(v)).toLocaleLowerCase("ja").includes(q));
    });
    $("shownCount").textContent = String(visibleRows.length);
    const tbody = $("responseRows");
    tbody.replaceChildren();
    if (!visibleRows.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 3; td.textContent = "該当する回答はありません。"; tr.append(td); tbody.append(tr); return;
    }
    visibleRows.slice(0, 300).forEach(row => {
      const tr = document.createElement("tr");
      const date = document.createElement("td");
      date.textContent = formatDate(row.submitted_at || row.created_at);
      const summary = document.createElement("td");
      const entries = visibleEntries(row).filter(([k]) => !["response_key","submitted_at"].includes(k) && displayValue(row[k]) !== "（未回答）");
      summary.className = "answer-summary";
      summary.textContent = entries.slice(0, 2).map(([k,v]) => `${labelFor(k)}：${displayValue(v)}`).join("\n") || "回答内容なし";
      const action = document.createElement("td");
      const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "詳細";
      btn.addEventListener("click", () => showDetail(row));
      action.append(btn); tr.append(date, summary, action); tbody.append(tr);
    });
    if (visibleRows.length > 300) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 3; td.textContent = "一覧は先頭300件を表示中です。検索で絞り込んでください。";
      tr.append(td); tbody.append(tr);
    }
  }
  function showDetail(row) {
    const target = $("detailContent"); target.replaceChildren();
    visibleEntries(row).forEach(([key, value]) => {
      const item = document.createElement("div"); item.className = "detail-row";
      const label = document.createElement("div"); label.className = "detail-label"; label.textContent = labelFor(key);
      const val = document.createElement("div"); val.className = "detail-value"; val.textContent = displayValue(value);
      item.append(label, val); target.append(item);
    });
    hidden($("detailPanel"), false);
    $("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function populateAggregateFields() {
    const select = $("aggregateField"); select.replaceChildren();
    const answerFields = fields.filter(k => !["response_key","submitted_at"].includes(k));
    answerFields.forEach(k => {
      const option = document.createElement("option"); option.value = k; option.textContent = labelFor(k); select.append(option);
    });
    if (!answerFields.length) {
      const option = document.createElement("option"); option.value = ""; option.textContent = "集計できる質問がありません"; select.append(option);
    }
  }
  function renderAggregate() {
    const key = $("aggregateField").value;
    const target = $("aggregateResults"); target.replaceChildren();
    if (!key) return;
    const counts = new Map();
    allRows.forEach(row => {
      const value = displayValue(row[key]).trim();
      if (value && value !== "（未回答）") counts.set(value, (counts.get(value) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 50);
    if (!sorted.length) { target.textContent = "集計対象の回答はありません。"; return; }
    sorted.forEach(([value, count]) => {
      const item = document.createElement("div"); item.className = "aggregate-item";
      const label = document.createElement("span"); label.textContent = value;
      const number = document.createElement("strong"); number.textContent = `${count}件`;
      item.append(label, number); target.append(item);
    });
  }
  async function login(password) {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !cfg.LOGIN_EMAIL ||
        cfg.SUPABASE_URL.includes("YOUR_PROJECT_REF") || cfg.SUPABASE_ANON_KEY.includes("YOUR_")) {
      throw new Error("public/config.js の Supabase URL・公開キー・ログイン用メールアドレスを設定してください。");
    }
    if (!supabase) supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { error } = await supabase.auth.signInWithPassword({ email: cfg.LOGIN_EMAIL, password });
    if (error) throw error;
    if (!(await getMemberAccess())) {
      await supabase.auth.signOut();
      throw new Error("このアカウントに閲覧権限がありません。Supabaseの admin_members 設定を確認してください。");
    }
    showDashboard();
    await loadRows();
  }
  async function init() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { $("loginError").textContent = "config.js の設定が必要です。"; return; }
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      try {
        if (await getMemberAccess()) { showDashboard(); await loadRows(); }
        else { await supabase.auth.signOut(); showLogin(); }
      } catch (e) { showLogin(); $("loginError").textContent = safeError(e); }
    } else showLogin();
  }
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault(); $("loginError").textContent = "";
    const button = $("loginForm").querySelector("button");
    button.disabled = true; button.textContent = "確認中…";
    try { await login($("password").value); $("password").value = ""; }
    catch (e) { $("loginError").textContent = safeError(e); }
    finally { button.disabled = false; button.textContent = "ログイン"; }
  });
  $("logoutBtn").addEventListener("click", async () => { if (supabase) await supabase.auth.signOut(); showLogin(); });
  $("refreshBtn").addEventListener("click", async () => { try { await loadRows(); } catch(e) { setStatus(safeError(e), true); } });
  $("searchInput").addEventListener("input", renderRows);
  $("aggregateField").addEventListener("change", renderAggregate);
  $("closeDetailBtn").addEventListener("click", () => hidden($("detailPanel"), true));
  init();
})();
