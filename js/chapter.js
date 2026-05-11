(function () {
  const LIST_URL = "data/chapter_practice/index.json";
  const STORAGE_PREFIX = "boki3q_chapter_practice";
  const state = {
    practice: null,
    answers: {},
    ignoreSubmitUntil: 0
  };

  const elements = {
    pageTitle: document.getElementById("chapter-page-title"),
    listView: document.getElementById("chapter-list-view"),
    practiceView: document.getElementById("chapter-practice-view"),
    list: document.getElementById("chapter-list"),
    category: document.getElementById("practice-category"),
    title: document.getElementById("practice-title"),
    description: document.getElementById("practice-description"),
    meta: document.getElementById("practice-meta"),
    intro: document.getElementById("practice-intro"),
    materials: document.getElementById("practice-materials"),
    answerArea: document.getElementById("practice-answer-area"),
    form: document.getElementById("practice-form"),
    clearButton: document.getElementById("clear-button")
  };

  function getPracticeId() {
    return new URLSearchParams(location.search).get("practiceId");
  }

  function shouldRestart() {
    return new URLSearchParams(location.search).get("restart") === "1";
  }

  function practiceUrl(id) {
    return `data/chapter_practice/${encodeURIComponent(id)}.json`;
  }

  function progressKey(id) {
    return `${STORAGE_PREFIX}:${id}:answers`;
  }

  function resultKey(id) {
    return `${STORAGE_PREFIX}:${id}:result`;
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("データを読み込めませんでした。");
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function getSavedAnswers(id) {
    return window.BokiMock.readJson(progressKey(id), {});
  }

  function clearSavedAnswers(id) {
    localStorage.removeItem(progressKey(id));
  }

  function saveAnswers() {
    if (!state.practice) return;
    const formData = new FormData(elements.form);
    const answers = {};
    formData.forEach((value, key) => {
      answers[key] = value;
    });
    state.answers = answers;
    window.BokiMock.writeJson(progressKey(state.practice.id), answers);
  }

  function formatAmountInput(input) {
    const number = window.BokiMock.normalizeNumber(input.value);
    if (number === null) {
      input.value = "";
      return;
    }
    input.value = window.BokiMock.formatYen(number);
  }

  function statusLabel(practice) {
    const result = window.BokiMock.readJson(resultKey(practice.id), null);
    if (result) return result.rate >= 80 ? "完了" : result.rate >= 60 ? "復習推奨" : "もう一度";
    const answers = getSavedAnswers(practice.id);
    return Object.keys(answers).length ? "途中" : "未挑戦";
  }

  function renderList(index) {
    elements.list.innerHTML = index.practices.map((practice) => `
      <article class="exam-card chapter-card">
        <div class="exam-card-main">
          <p class="eyebrow">${escapeHtml(practice.category)} / ${escapeHtml(practice.chapterTitle)}</p>
          <h3>${escapeHtml(practice.title)}</h3>
          <dl class="meta-grid">
            <div><dt>目安時間</dt><dd>${practice.estimatedMinutes}分</dd></div>
            <div><dt>配点</dt><dd>${practice.totalScore}点</dd></div>
            <div><dt>状態</dt><dd>${escapeHtml(statusLabel(practice))}</dd></div>
          </dl>
          <p class="exam-note">${escapeHtml(practice.description)}</p>
        </div>
        <div class="exam-card-actions">
          <a class="button primary" href="practice.html?practiceId=${encodeURIComponent(practice.id)}&restart=1">問題を解く</a>
          <a class="button secondary" href="chapter_result.html?practiceId=${encodeURIComponent(practice.id)}">前回結果</a>
        </div>
      </article>
    `).join("");
  }

  function cellName(table, rowIndex, key) {
    return `${table.id}.${rowIndex}.${key}`;
  }

  function tableAnswerKeys(table) {
    if (Array.isArray(table.answerKeys)) return table.answerKeys;
    return table.columns.length > 5
      ? ["in_qty", "in_unit", "in_amount", "out_qty", "out_unit", "out_amount", "balance_qty", "balance_unit", "balance_amount"]
      : ["debit", "credit", "balance"];
  }

  function tableColumnLabels(table) {
    return table.columns.map((column) => typeof column === "string" ? column : column.label);
  }

  function genericTableClassName(table) {
    const labels = tableColumnLabels(table);
    const classes = ["answer-table", "generic-sheet-table"];
    if (table.columns.length >= 9) {
      classes.push("worksheet-table", "chapter-worksheet-table");
    } else {
      classes.push("compact-sheet-table");
    }
    if (labels.includes("負債・純資産")) classes.push("balance-sheet-table");
    if (table.format === "account") classes.push("statement-account-table");
    return classes.join(" ");
  }

  function renderInput(name, value) {
    const saved = state.answers[name] || "";
    const aria = value === null ? "" : "金額";
    return `<input class="amount-input" name="${escapeHtml(name)}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(aria)}" value="${escapeHtml(saved)}">`;
  }

  function renderLedgerTable(table) {
    return `
      <section class="answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="answer-table ledger-table chapter-ledger-table">
            <thead>
              <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row, rowIndex) => `
                <tr>
                  <td>${escapeHtml(row.date)}</td>
                  <td>${escapeHtml(row.description)}</td>
                  ${["debit", "credit", "balance"].map((key) => `
                    <td class="${row.cells[key] === null ? "static-cell" : "answer-cell"}">
                      ${row.cells[key] === null ? "" : renderInput(cellName(table, rowIndex, key), row.cells[key])}
                    </td>
                  `).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderInventoryTable(table) {
    const keys = tableAnswerKeys(table);
    return `
      <section class="answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="inventory-sheet-table chapter-inventory-table">
            <thead>
              <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row, rowIndex) => `
                <tr>
                  <td>${escapeHtml(row.date)}</td>
                  <td>${escapeHtml(row.description)}</td>
                  ${keys.map((key) => `
                    <td class="${row.cells[key] === null ? "static-cell" : "answer-cell"}">
                      ${row.cells[key] === null ? "" : renderInput(cellName(table, rowIndex, key), row.cells[key])}
                    </td>
                  `).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderGenericTable(table) {
    return `
      <section class="answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="${genericTableClassName(table)}">
            <thead>
              <tr>${tableColumnLabels(table).map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row, rowIndex) => `
                <tr>
                  ${table.columns.map((column) => {
                    const key = column.key;
                    if (column.type === "answer") {
                      const expected = row.cells?.[key];
                      if (table.hideZeroCells && Number(expected) === 0) {
                        return "<td class=\"static-cell\"></td>";
                      }
                      return `
                        <td class="${expected === null || expected === undefined ? "static-cell" : "answer-cell"}">
                          ${expected === null || expected === undefined ? "" : renderInput(cellName(table, rowIndex, key), expected)}
                        </td>
                      `;
                    }
                    return `<td>${escapeHtml(row.values?.[key] ?? "")}</td>`;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderSummary(summary = []) {
    if (!summary.length) return "";
    return `
      <section class="answer-sheet">
        <h4>集計</h4>
        <div class="inventory-summary-fields">
          ${summary.map((field) => `
            <label class="field">
              ${escapeHtml(field.label)}
              <input class="amount-input" name="summary.${escapeHtml(field.id)}" inputmode="numeric" autocomplete="off" value="${escapeHtml(state.answers[`summary.${field.id}`] || "")}">
            </label>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderPractice(practice) {
    state.practice = practice;
    state.answers = getSavedAnswers(practice.id);
    elements.listView.hidden = true;
    elements.practiceView.hidden = false;
    elements.pageTitle.textContent = practice.chapterTitle;
    elements.category.textContent = `${practice.category} / ${practice.chapterTitle}`;
    elements.title.textContent = practice.title;
    elements.description.textContent = practice.description;
    elements.meta.innerHTML = `
      <div><dt>目安時間</dt><dd>${practice.estimatedMinutes}分</dd></div>
      <div><dt>配点</dt><dd>${practice.totalScore}点</dd></div>
      <div><dt>形式</dt><dd>チャプター仕上げ</dd></div>
    `;
    elements.intro.textContent = practice.intro || "";
    elements.materials.innerHTML = practice.materials.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    elements.answerArea.innerHTML = practice.tables.map((table) => {
      if (Array.isArray(table.answerKeys)) return renderGenericTable(table);
      return table.columns.length > 5 ? renderInventoryTable(table) : renderLedgerTable(table);
    }).join("") + renderSummary(practice.summary);
  }

  function normalizedNumber(value) {
    return window.BokiMock.normalizeNumber(value);
  }

  function isAmountCorrect(actual, expected) {
    const expectedNumber = Number(expected);
    return actual === expectedNumber || (expectedNumber === 0 && actual === null);
  }

  function scorePractice(practice, answers) {
    const misses = [];
    let correctCount = 0;
    let totalCount = 0;

    practice.tables.forEach((table) => {
      table.rows.forEach((row, rowIndex) => {
        Object.entries(row.cells).forEach(([key, expected]) => {
          if (expected === null) return;
          if (table.hideZeroCells && Number(expected) === 0) return;
          totalCount += 1;
          const name = cellName(table, rowIndex, key);
          const actual = normalizedNumber(answers[name]);
          if (isAmountCorrect(actual, expected)) {
            correctCount += 1;
          } else {
            misses.push({
              tableTitle: table.title,
              rowLabel: `${row.date} ${row.description}`,
              field: key,
              expected,
              actual
            });
          }
        });
      });
    });

    (practice.summary || []).forEach((field) => {
      totalCount += 1;
      const name = `summary.${field.id}`;
      const actual = normalizedNumber(answers[name]);
      if (isAmountCorrect(actual, field.correctAnswer)) {
        correctCount += 1;
      } else {
        misses.push({
          tableTitle: "集計",
          rowLabel: field.label,
          field: "amount",
          expected: field.correctAnswer,
          actual
        });
      }
    });

    const rate = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
    const score = Math.round((rate / 100) * practice.totalScore);
    return {
      practiceId: practice.id,
      title: practice.title,
      score,
      maxScore: practice.totalScore,
      rate,
      correctCount,
      totalCount,
      misses,
      answers,
      submittedAt: new Date().toISOString()
    };
  }

  function bindEvents() {
    elements.form.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      event.preventDefault();
      event.stopPropagation();
      state.ignoreSubmitUntil = Date.now() + 500;
      formatAmountInput(target);
      saveAnswers();
    }, true);
    elements.form.addEventListener("blur", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      formatAmountInput(target);
      saveAnswers();
    }, true);
    elements.form.addEventListener("input", saveAnswers);
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (Date.now() < state.ignoreSubmitUntil) return;
      saveAnswers();
      const result = scorePractice(state.practice, state.answers);
      window.BokiMock.writeJson(resultKey(state.practice.id), result);
      location.href = `chapter_result.html?practiceId=${encodeURIComponent(state.practice.id)}`;
    });
    elements.clearButton.addEventListener("click", () => {
      if (!state.practice) return;
      state.answers = {};
      clearSavedAnswers(state.practice.id);
      elements.form.querySelectorAll("input").forEach((input) => {
        input.value = "";
        input.defaultValue = "";
      });
    });
  }

  async function init() {
    bindEvents();
    const practiceId = getPracticeId();
    if (!practiceId) {
      const index = await loadJson(LIST_URL);
      renderList(index);
      return;
    }
    const practice = await loadJson(practiceUrl(practiceId));
    if (shouldRestart()) {
      clearSavedAnswers(practiceId);
    }
    renderPractice(practice);
  }

  init().catch((error) => {
    document.querySelector("main").innerHTML = `<div class="empty-state"><h2>読み込みに失敗しました</h2><p>${escapeHtml(error.message)}</p></div>`;
  });
})();
