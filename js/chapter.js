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
    input.value = window.BokiMock.formatAmountText(input.value);
  }

  function bindRenderedAmountInputs() {
    elements.form.querySelectorAll("input.amount-input").forEach((input) => {
      window.BokiMock.bindAmountInput(input, saveAnswers);
    });
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

  function orderedOptions(options = []) {
    return [...options].sort((a, b) => String(a).localeCompare(String(b), "ja"));
  }

  function renderAccountSelect(name, value, options = [], label) {
    return `
      <select name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}">
        <option value="">選択</option>
        ${orderedOptions(options).map((option) => `
          <option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>
        `).join("")}
      </select>
    `;
  }

  function renderAnswerControl(table, rowIndex, key, expected, label) {
    const name = cellName(table, rowIndex, key);
    if (table.selectOptions?.[key]) {
      return renderAccountSelect(name, state.answers[name] || "", table.selectOptions[key], label);
    }
    return renderInput(name, expected);
  }

  function shouldHideZeroCell(table, key, expected) {
    return table.hideZeroCells && Number(expected) === 0 && !table.showZeroInputKeys?.includes(key);
  }

  function journalName(questionId, lineIndex, key) {
    return `journal.${questionId}.${lineIndex}.${key}`;
  }

  function renderSourceDocuments(documents = []) {
    if (!documents.length) return "";
    return documents.map((document) => `
      <section class="source-document">
        <h4>${escapeHtml(document.title)}</h4>
        ${document.summary ? `<p class="source-summary">${escapeHtml(document.summary)}</p>` : ""}
        ${document.rows ? `
          <div class="table-scroll">
            <table class="source-table">
              ${document.columns ? `
                <thead>
                  <tr>${document.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
                </thead>
              ` : ""}
              <tbody>
                ${document.rows.map((row) => `
                  <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
        ${document.total ? `<p class="source-total">${escapeHtml(document.total)}</p>` : ""}
        ${document.note ? `<p class="source-note">${escapeHtml(document.note)}</p>` : ""}
      </section>
    `).join("");
  }

  function renderJournalPractice(practice) {
    const options = practice.accountOptions || [];
    return `
      <section class="journal-practice-answer">
        ${practice.questions.map((question, questionIndex) => {
          const lineCount = question.maxLines || 5;
          return `
            <article class="question-card journal-question-card">
              <div class="question-head">
                <h3>第${questionIndex + 1}問</h3>
                <span class="score-chip">${question.score}点</span>
              </div>
              <p class="question-text">${escapeHtml(question.text)}</p>
              ${renderSourceDocuments(question.documents)}
              <div class="table-scroll">
                <table class="journal-multi-table chapter-journal-table">
                  <thead>
                    <tr>
                      <th>借方科目</th>
                      <th>借方金額</th>
                      <th>貸方科目</th>
                      <th>貸方金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${Array.from({ length: lineCount }, (_, lineIndex) => {
                      const debitAccountName = journalName(question.id, lineIndex, "debitAccount");
                      const debitAmountName = journalName(question.id, lineIndex, "debitAmount");
                      const creditAccountName = journalName(question.id, lineIndex, "creditAccount");
                      const creditAmountName = journalName(question.id, lineIndex, "creditAmount");
                      return `
                        <tr>
                          <td>${renderAccountSelect(debitAccountName, state.answers[debitAccountName] || "", options, "借方科目")}</td>
                          <td>${renderInput(debitAmountName, null)}</td>
                          <td>${renderAccountSelect(creditAccountName, state.answers[creditAccountName] || "", options, "貸方科目")}</td>
                          <td>${renderInput(creditAmountName, null)}</td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
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
                    <td class="${row.cells[key] === null || shouldHideZeroCell(table, key, row.cells[key]) ? "static-cell" : "answer-cell"}">
                      ${row.cells[key] === null || shouldHideZeroCell(table, key, row.cells[key]) ? "" : renderInput(cellName(table, rowIndex, key), row.cells[key])}
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
    let currentGroup = "";
    return `
      <section class="answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="${genericTableClassName(table)}">
            <thead>
              <tr>${tableColumnLabels(table).map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row, rowIndex) => {
                const group = table.groupByKey ? row.values?.[table.groupByKey] : "";
                const groupRow = group && group !== currentGroup
                  ? `<tr class="table-group-row"><th colspan="${table.columns.length}">${escapeHtml(group)}</th></tr>`
                  : "";
                if (group) currentGroup = group;
                return `
                  ${groupRow}
                  <tr>
                    ${table.columns.map((column) => {
                      const key = column.key;
                      if (column.type === "answer") {
                        const expected = row.cells?.[key];
                        if (shouldHideZeroCell(table, key, expected)) {
                          return "<td class=\"static-cell\"></td>";
                        }
                        return `
                          <td class="${expected === null || expected === undefined ? "static-cell" : "answer-cell"}">
                            ${expected === null || expected === undefined ? "" : renderAnswerControl(table, rowIndex, key, expected, column.label)}
                          </td>
                        `;
                      }
                      return `<td>${escapeHtml(row.values?.[key] ?? "")}</td>`;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
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
    elements.materials.innerHTML = (practice.materials || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    if (practice.mode === "journalPractice") {
      elements.answerArea.innerHTML = renderJournalPractice(practice);
      bindRenderedAmountInputs();
      return;
    }
    elements.answerArea.innerHTML = practice.tables.map((table) => {
      if (Array.isArray(table.answerKeys)) return renderGenericTable(table);
      return table.columns.length > 5 ? renderInventoryTable(table) : renderLedgerTable(table);
    }).join("") + renderSummary(practice.summary);
    bindRenderedAmountInputs();
  }

  function normalizedNumber(value) {
    return window.BokiMock.normalizeNumber(value);
  }

  function isAmountCorrect(actual, expected) {
    const expectedNumber = Number(expected);
    return actual === expectedNumber || (expectedNumber === 0 && actual === null);
  }

  function isCellCorrect(actual, expected, inputType) {
    if (inputType === "select") {
      return window.BokiMock.normalizeText(actual) === window.BokiMock.normalizeText(expected);
    }
    return isAmountCorrect(normalizedNumber(actual), expected);
  }

  function normalizeJournalLines(lines = []) {
    return lines
      .map((line) => ({
        debitAccount: window.BokiMock.normalizeText(line.debitAccount),
        debitAmount: normalizedNumber(line.debitAmount),
        creditAccount: window.BokiMock.normalizeText(line.creditAccount),
        creditAmount: normalizedNumber(line.creditAmount)
      }))
      .filter((line) => line.debitAccount || line.debitAmount !== null || line.creditAccount || line.creditAmount !== null);
  }

  function journalAnswerLines(question, answers) {
    const lineCount = question.maxLines || 5;
    return Array.from({ length: lineCount }, (_, lineIndex) => ({
      debitAccount: answers[journalName(question.id, lineIndex, "debitAccount")] || "",
      debitAmount: answers[journalName(question.id, lineIndex, "debitAmount")] || "",
      creditAccount: answers[journalName(question.id, lineIndex, "creditAccount")] || "",
      creditAmount: answers[journalName(question.id, lineIndex, "creditAmount")] || ""
    }));
  }

  function sideEntries(lines, side) {
    const accountKey = side === "debit" ? "debitAccount" : "creditAccount";
    const amountKey = side === "debit" ? "debitAmount" : "creditAmount";
    return lines
      .filter((line) => line[accountKey] || line[amountKey] !== null)
      .map((line) => ({ account: line[accountKey], amount: line[amountKey] }))
      .sort((a, b) => String(`${a.account}:${a.amount}`).localeCompare(String(`${b.account}:${b.amount}`), "ja"));
  }

  function sameEntries(actual, expected) {
    if (actual.length !== expected.length) return false;
    return actual.every((entry, index) => entry.account === expected[index].account && entry.amount === expected[index].amount);
  }

  function isJournalQuestionCorrect(question, answers) {
    const actualLines = normalizeJournalLines(journalAnswerLines(question, answers));
    const correctAnswers = [question.correctAnswer, ...(question.alternativeAnswers || [])];
    return correctAnswers.some((correctAnswer) => {
      const correctLines = normalizeJournalLines(correctAnswer?.lines || []);
      return sameEntries(sideEntries(actualLines, "debit"), sideEntries(correctLines, "debit")) &&
        sameEntries(sideEntries(actualLines, "credit"), sideEntries(correctLines, "credit"));
    });
  }

  function scoreJournalPractice(practice, answers) {
    const misses = [];
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;

    practice.questions.forEach((question, index) => {
      maxScore += question.score;
      if (isJournalQuestionCorrect(question, answers)) {
        score += question.score;
        correctCount += 1;
      } else {
        misses.push({
          tableTitle: `第${index + 1}問`,
          rowLabel: question.text,
          field: "journal",
          expected: question.correctAnswer,
          actual: journalAnswerLines(question, answers)
        });
      }
    });

    const totalCount = practice.questions.length;
    const rate = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
    return {
      practiceId: practice.id,
      title: practice.title,
      score,
      maxScore: practice.totalScore || maxScore,
      rate,
      correctCount,
      totalCount,
      misses,
      answers,
      submittedAt: new Date().toISOString()
    };
  }

  function scorePractice(practice, answers) {
    if (practice.mode === "journalPractice") return scoreJournalPractice(practice, answers);

    const misses = [];
    let correctCount = 0;
    let totalCount = 0;

    practice.tables.forEach((table) => {
      table.rows.forEach((row, rowIndex) => {
        Object.entries(row.cells).forEach(([key, expected]) => {
          if (expected === null) return;
          if (shouldHideZeroCell(table, key, expected)) return;
          totalCount += 1;
          const name = cellName(table, rowIndex, key);
          const inputType = table.selectOptions?.[key] ? "select" : "number";
          const actual = answers[name];
          if (isCellCorrect(actual, expected, inputType)) {
            correctCount += 1;
          } else {
            misses.push({
              tableTitle: table.title,
              rowLabel: `${row.date || row.values?.date || ""} ${row.description || row.values?.account || ""}`,
              field: key,
              expected,
              actual: inputType === "number" ? normalizedNumber(actual) : window.BokiMock.normalizeText(actual)
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
    elements.form.addEventListener("change", saveAnswers);
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
      elements.form.querySelectorAll("input, select").forEach((control) => {
        control.value = "";
        control.defaultValue = "";
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
