(() => {
  const cfg = window.ET_ADMIN_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const hidden = (el, yes) => el.classList.toggle("hidden", yes);

  const EMAIL_KEYS =
    /email|e-mail|mailaddress|mail_address|メールアドレス|連絡先メール|登録用メール/i;

  // 個人情報・表示しない項目
  const PRIVATE_KEYS = new Set([
    "question_35"
  ]);

  const OMIT_KEYS = new Set(["created_at"]);

  let supabase = null;
  let allRows = [];
  let visibleRows = [];
  let fields = [];
  let aggregateChart = null;

  // 選択式としてグラフ表示する質問
  const CHOICE_FIELDS = new Set([
    "et", "et_2", "et_3",
    "question_5", "question_6", "question_7",
    "question_11", "question_12",
    "question_16", "question_17", "question_18",
    "question_19", "question_20",
    "question_23", "question_25", "question_26",
    "question_27", "question_28", "question_29",
    "et_4", "et_5", "question_36"
  ]);

  // 複数選択式の回答
  const MULTI_SELECT_FIELDS = new Set(["question_19"]);

  // Googleフォームの質問文
  const LABELS = {
    response_key: "回答キー",
    submitted_at: "タイムスタンプ",
    created_at: "登録日時",

    et: "ETをどのくらい利用していますか？",
    et_2: "ETを知ったきっかけは何ですか？",
    et_3: "ETを利用する主な目的は何ですか？",

    question_5:
      "本オープンチャットで配信している防災情報（テキスト・画像含む）は見やすいですか？",
    question_6:
      "本オープンチャットで配信している防災情報は分かりやすいですか？",
    question_7:
      "本オープンチャットで配信する防災情報の量について、どの程度満足していますか？",
    question_8:
      "本オープンチャットで配信している防災情報について、良い点・継続して欲しい点を教えてください。",
    question_9:
      "本オープンチャットで配信している防災情報について、良くない点・改善して欲しい点を教えてください。",
    question_10:
      "本オープンチャットで配信している防災情報について、その他質問・意見があれば教えてください。",

    question_11:
      "本オープンチャットで配信する交通情報の量について、どの程度満足していますか？",
    question_12:
      "交通情報の配信方法について、別トークルームに分けて欲しいと思いますか？",
    question_13:
      "本オープンチャットで配信している交通情報について、良い点・継続して欲しい点を教えてください。",
    question_14:
      "本オープンチャットで配信している交通情報について、良くない点・改善して欲しい点を教えてください。",
    question_15:
      "本オープンチャットで配信している交通情報について、その他質問・意見があれば教えてください。",

    question_16:
      "今までに開催したライブ配信を聴いたことがありますか？",
    question_17: "ライブトークの内容は分かりやすいですか？",
    question_18:
      "ライブトークの品質（音質や音飛び）について、最も近いものを教えてください。",
    question_19:
      "ライブトークの品質（音質や音飛び）について、主な症状を教えてください。（複数選択可）",
    question_20: "ライブトークにどの程度満足していますか？",
    question_21:
      "ライブトークについて、質問、意見・要望があれば教えてください。",
    question_22:
      "どのような時にどのような内容のライブトークがあれば参加したいと思いますか？",

    question_23:
      "現在の投稿ルールや情報共有の仕組みについて、どう感じますか？",
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
    return msg.length > 250 ? msg.slice(0, 250) + "…" : msg;
  }

  function displayValue(v) {
    if (v === null || v === undefined || v === "") {
      return "（未回答）";
    }

    if (Array.isArray(v)) return v.join("、");
    if (typeof v === "object") return JSON.stringify(v);

    return String(v);
  }

  // メールアドレスなどの非表示項目を除外する
  function visibleEntries(row) {
    return Object.entries(row).filter(([k]) => {
      return (
        !PRIVATE_KEYS.has(k) &&
        !EMAIL_KEYS.test(k) &&
        !OMIT_KEYS.has(k)
      );
    });
  }

  function labelFor(key) {
    return LABELS[key] || key.replaceAll("_", " ");
  }

  function formatDate(v) {
    if (!v) return "日時不明";

    const d = new Date(v);

    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString("ja-JP");
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
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

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
      .order("submitted_at", {
        ascending: false,
        nullsFirst: false
      })
      .limit(5000);

    if (error) throw error;

    allRows = data || [];

    fields = allRows.length
      ? visibleEntries(allRows[0]).map(([k]) => k)
      : [];

    $("totalCount").textContent = String(allRows.length);

    populateAggregateFields();
    renderRows();
    renderAggregate();

    setStatus(
      `${allRows.length}件の回答を読み込みました。最大5,000件まで表示します。`
    );
  }

  function renderRows() {
    const q = $("searchInput")
      .value.trim()
      .toLocaleLowerCase("ja");

    visibleRows = allRows.filter((row) => {
      if (!q) return true;

      return visibleEntries(row).some(([k, v]) =>
        (labelFor(k) + " " + displayValue(v))
          .toLocaleLowerCase("ja")
          .includes(q)
      );
    });

    $("shownCount").textContent = String(visibleRows.length);

    const tbody = $("responseRows");
    tbody.replaceChildren();

    if (!visibleRows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      td.colSpan = 3;
      td.textContent = "該当する回答はありません。";

      tr.append(td);
      tbody.append(tr);
      return;
    }

    visibleRows.slice(0, 300).forEach((row) => {
      const tr = document.createElement("tr");

      const date = document.createElement("td");
      date.textContent = formatDate(
        row.submitted_at || row.created_at
      );

      const summary = document.createElement("td");

      const entries = visibleEntries(row).filter(
        ([k, v]) =>
          !["response_key", "submitted_at"].includes(k) &&
          displayValue(v) !== "（未回答）"
      );

      summary.className = "answer-summary";
      summary.textContent =
        entries
          .slice(0, 2)
          .map(
            ([k, v]) =>
              `${labelFor(k)}：${displayValue(v)}`
          )
          .join("\n") || "回答内容なし";

      const action = document.createElement("td");
      const btn = document.createElement("button");

      btn.type = "button";
      btn.textContent = "詳細";
      btn.addEventListener("click", () => showDetail(row));

      action.append(btn);
      tr.append(date, summary, action);
      tbody.append(tr);
    });

    if (visibleRows.length > 300) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      td.colSpan = 3;
      td.textContent =
        "一覧は先頭300件を表示中です。検索で絞り込んでください。";

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

    $("detailPanel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function populateAggregateFields() {
    const select = $("aggregateField");
    select.replaceChildren();

    const answerFields = fields.filter(
      (k) => !["response_key", "submitted_at"].includes(k)
    );

    answerFields.forEach((k) => {
      const option = document.createElement("option");

      option.value = k;
      option.textContent = labelFor(k);

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
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    return String(value || "")
      .split(/[,、;；\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function getAnswerCounts(key) {
    const counts = new Map();

    allRows.forEach((row) => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === "") return;

      const values = MULTI_SELECT_FIELDS.has(key)
        ? splitMultiAnswer(raw)
        : [displayValue(raw).trim()];

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
      answers.forEach(({ date, value, question }) => {
        const card = document.createElement("article");
        card.className = "modal-answer";

        const head = document.createElement("div");
        head.className = "modal-answer-head";

        const questionLabel = document.createElement("span");
        questionLabel.textContent = question || "回答";

        const dateLabel = document.createElement("span");
        dateLabel.textContent = date || "日時不明";

        head.append(questionLabel, dateLabel);

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

      answers.push({
        date: formatDate(row.submitted_at || row.created_at),
        value,
        question: labelFor(key)
      });
    });

    const title = filterValue === null
      ? `${labelFor(key)}：回答一覧`
      : `「${filterValue}」の回答`;

    openAnswerModal(
      title,
      `${answers.length}件の回答${filterValue !== null && isOtherAnswer(filterValue) ? "（その他を含む回答）" : ""}`,
      answers
    );
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

    // 非表示項目は分析対象にしない
    if (PRIVATE_KEYS.has(key) || EMAIL_KEYS.test(key) || OMIT_KEYS.has(key)) {
      chartWrap.classList.add("hidden");
      return;
    }

    if (!CHOICE_FIELDS.has(key)) {
      chartWrap.classList.add("hidden");
      const answered = allRows.filter((row) => {
        const value = row[key];
        return value !== null && value !== undefined && String(value).trim() !== "";
      }).length;

      meta.textContent = `自由記述の回答：${answered}件`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "回答を見る";
      button.addEventListener("click", () => showQuestionAnswers(key));

      const row = document.createElement("div");
      row.className = "aggregate-item";
      const label = document.createElement("span");
      label.textContent = labelFor(key);
      row.append(label, button);
      target.append(row);
      return;
    }

    const sorted = getAnswerCounts(key);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    meta.textContent = `回答数：${total}件 · 選択肢：${sorted.length}種類 · グラフの項目を押すと該当回答を確認できます。`;

    if (!sorted.length) {
      chartWrap.classList.add("hidden");
      target.innerHTML = '<div class="empty-state">集計対象の回答はありません。</div>';
      return;
    }

    chartWrap.classList.remove("hidden");
    const usePie = sorted.length <= 6;
    const palette = [
      "#8bc34a", "#5f9e2f", "#b6dc83", "#3f6f1c", "#d8edbd",
      "#78b84b", "#a3cf6e", "#477d28", "#c1e39a", "#6a9d3c",
      "#e5f3d4", "#94c95b"
    ];

    aggregateChart = new window.Chart(canvas, {
      type: usePie ? "pie" : "bar",
      data: {
        labels: sorted.map(([value]) => value),
        datasets: [{
          label: "回答数",
          data: sorted.map(([, count]) => count),
          backgroundColor: sorted.map((_, i) => palette[i % palette.length]),
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
          legend: {
            display: usePie,
            position: "bottom",
            labels: { usePointStyle: true, padding: 16, boxWidth: 9 }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const count = usePie ? context.parsed : context.parsed.x;
                const percentage = total ? Math.round(Number(count) / total * 1000) / 10 : 0;
                return ` ${count}件（${percentage}%）`;
              }
            }
          }
        },
        scales: usePie ? {} : {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: "#edf3e7" }
          },
          y: {
            grid: { display: false },
            ticks: { color: "#35472c", autoSkip: false }
          }
        },
        onClick(_event, elements) {
          if (!elements.length) return;
          const index = elements[0].index;
          showQuestionAnswers(key, sorted[index][0]);
        }
      }
    });

    // グラフ下にも回答数と「その他」確認ボタンを表示
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

  async function login(password) {
    if (
      !cfg.SUPABASE_URL ||
      !cfg.SUPABASE_ANON_KEY ||
      !cfg.LOGIN_EMAIL ||
      cfg.SUPABASE_URL.includes("YOUR_PROJECT_REF") ||
      cfg.SUPABASE_ANON_KEY.includes("YOUR_")
    ) {
      throw new Error(
        "public/config.js の Supabase URL・公開キー・ログイン用メールアドレスを設定してください。"
      );
    }

    if (!supabase) {
      supabase = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cfg.LOGIN_EMAIL,
      password
    });

    if (error) throw error;

    if (!(await getMemberAccess())) {
      await supabase.auth.signOut();

      throw new Error(
        "このアカウントに閲覧権限がありません。Supabaseの admin_members 設定を確認してください。"
      );
    }

    showDashboard();
    await loadRows();
  }

  async function init() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      $("loginError").textContent = "config.js の設定が必要です。";
      return;
    }

    supabase = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data } = await supabase.auth.getSession();

    if (data.session) {
      try {
        if (await getMemberAccess()) {
          showDashboard();
          await loadRows();
        } else {
          await supabase.auth.signOut();
          showLogin();
        }
      } catch (e) {
        showLogin();
        $("loginError").textContent = safeError(e);
      }
    } else {
      showLogin();
    }
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginError").textContent = "";

    const button = $("loginForm").querySelector("button");

    button.disabled = true;
    button.textContent = "確認中…";

    try {
      await login($("password").value);
      $("password").value = "";
    } catch (e) {
      $("loginError").textContent = safeError(e);
    } finally {
      button.disabled = false;
      button.textContent = "ログイン";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    showLogin();
  });

  $("refreshBtn").addEventListener("click", async () => {
    try {
      await loadRows();
    } catch (e) {
      setStatus(safeError(e), true);
    }
  });

  $("searchInput").addEventListener("input", renderRows);
  $("aggregateField").addEventListener("change", renderAggregate);
  $("closeAnswerModalBtn").addEventListener("click", closeAnswerModal);
  $("answerModal").addEventListener("click", (event) => {
    if (event.target?.dataset?.closeModal === "true") closeAnswerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("answerModal").classList.contains("hidden")) {
      closeAnswerModal();
    }
  });

  $("closeDetailBtn").addEventListener("click", () => {
    hidden($("detailPanel"), true);
  });

  init();
})();
