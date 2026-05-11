(function () {
  const STORAGE_PREFIX = "boki3q_chapter_practice";
  const elements = {
    title: document.getElementById("result-title"),
    summary: document.getElementById("chapter-result-summary"),
    details: document.getElementById("chapter-result-details")
  };

  function getPracticeId() {
    return new URLSearchParams(location.search).get("practiceId");
  }

  function practiceUrl(id) {
    return `data/chapter_practice/${encodeURIComponent(id)}.json`;
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

  function renderSummary(practice, result) {
    const passed = result.rate >= 80;
    const status = passed ? "完了" : result.rate >= 60 ? "復習推奨" : "もう一度";
    elements.summary.className = `result-summary ${passed ? "passed" : "failed"}`;
    elements.summary.innerHTML = `
      <div>
        <h2>${escapeHtml(status)}</h2>
        <p class="result-score">${result.score}<span> / ${result.maxScore}点</span></p>
        <p>${result.correctCount} / ${result.totalCount}項目 正解（正答率 ${result.rate}%）</p>
      </div>
      <div>
        <h3>${escapeHtml(practice.title)}</h3>
        <p>${escapeHtml(practice.description)}</p>
      </div>
      <div class="result-actions">
        <a class="button primary" href="practice.html?practiceId=${encodeURIComponent(practice.id)}&restart=1">もう一度解く</a>
        <a class="button secondary" href="index.html">トップへ戻る</a>
      </div>
    `;
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

  function tableClassName(table) {
    if (Array.isArray(table.answerKeys)) {
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
    return table.columns.length > 5 ? "inventory-sheet-table" : "answer-table ledger-table";
  }

  function renderCorrectTable(table) {
    const keys = tableAnswerKeys(table);
    const generic = Array.isArray(table.answerKeys);
    return `
      <section class="answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="${tableClassName(table)}">
            <thead>
              <tr>${tableColumnLabels(table).map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row) => `
                <tr>
                  ${generic ? table.columns.map((column) => {
                    const key = column.key;
                    if (column.type === "answer") {
                      if (table.hideZeroCells && Number(row.cells[key]) === 0) return "<td></td>";
                      return `<td>${row.cells[key] === null || row.cells[key] === undefined ? "" : escapeHtml(window.BokiMock.formatYen(row.cells[key]))}</td>`;
                    }
                    return `<td>${escapeHtml(row.values?.[key] ?? "")}</td>`;
                  }).join("") : `
                    <td>${escapeHtml(row.date)}</td>
                    <td>${escapeHtml(row.description)}</td>
                    ${keys.map((key) => `
                      <td>${row.cells[key] === null ? "" : escapeHtml(window.BokiMock.formatYen(row.cells[key]))}</td>
                    `).join("")}
                  `}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function cellName(table, rowIndex, key) {
    return `${table.id}.${rowIndex}.${key}`;
  }

  function formatUserAnswer(value) {
    const number = window.BokiMock.normalizeNumber(value);
    if (number === null) return "";
    return window.BokiMock.formatYen(number);
  }

  function isAmountCorrect(actual, expected) {
    const expectedNumber = Number(expected);
    return actual === expectedNumber || (expectedNumber === 0 && actual === null);
  }

  function renderUserTable(table, result) {
    const keys = tableAnswerKeys(table);
    const generic = Array.isArray(table.answerKeys);
    return `
      <section class="answer-sheet result-answer-sheet">
        <h4>${escapeHtml(table.title)}</h4>
        <div class="table-scroll">
          <table class="${tableClassName(table)}">
            <thead>
              <tr>${tableColumnLabels(table).map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${table.rows.map((row, rowIndex) => `
                <tr>
                  ${generic ? table.columns.map((column) => {
                    const key = column.key;
                    if (column.type !== "answer") return `<td>${escapeHtml(row.values?.[key] ?? "")}</td>`;
                    const expected = row.cells?.[key];
                    if (table.hideZeroCells && Number(expected) === 0) return "<td></td>";
                    if (expected === null || expected === undefined) return "<td></td>";
                    const answer = result.answers?.[cellName(table, rowIndex, key)];
                    const actual = window.BokiMock.normalizeNumber(answer);
                    const correct = isAmountCorrect(actual, expected);
                    return `<td class="${correct ? "result-ok-cell" : "result-ng-cell"}">${escapeHtml(formatUserAnswer(answer))}</td>`;
                  }).join("") : `
                    <td>${escapeHtml(row.date)}</td>
                    <td>${escapeHtml(row.description)}</td>
                    ${keys.map((key) => {
                      const expected = row.cells[key];
                      if (expected === null) return "<td></td>";
                      const answer = result.answers?.[cellName(table, rowIndex, key)];
                      const actual = window.BokiMock.normalizeNumber(answer);
                      const correct = isAmountCorrect(actual, expected);
                      return `
                        <td class="${correct ? "result-ok-cell" : "result-ng-cell"}">
                          ${escapeHtml(formatUserAnswer(answer))}
                        </td>
                      `;
                    }).join("")}
                  `}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderUserSummary(practice, result) {
    if (!practice.summary?.length) return "";
    return `
      <div class="result-summary-fields">
        ${practice.summary.map((field) => {
          const answer = result.answers?.[`summary.${field.id}`];
          const actual = window.BokiMock.normalizeNumber(answer);
          const correct = isAmountCorrect(actual, field.correctAnswer);
          return `
            <p class="${correct ? "result-ok-cell" : "result-ng-cell"}">
              <strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(formatUserAnswer(answer))}
            </p>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderDetails(practice, result) {
    const misses = result.misses || [];
    elements.details.innerHTML = `
      <article class="result-section">
        <div class="result-section-head">
          <h2>あなたの答案</h2>
          <strong>${misses.length}件</strong>
        </div>
        <div class="review-body">
          <p class="result-hint">赤字のセルが正答と異なる箇所です。</p>
          ${practice.tables.map((table) => renderUserTable(table, result)).join("")}
          ${renderUserSummary(practice, result)}
        </div>
      </article>

      <article class="result-section">
        <div class="result-section-head">
          <h2>正答答案</h2>
        </div>
        <div class="review-body">
          ${practice.tables.map(renderCorrectTable).join("")}
          ${(practice.summary || []).map((field) => `
            <p><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(window.BokiMock.formatYen(field.correctAnswer))}円</p>
          `).join("")}
        </div>
      </article>

      <article class="result-section">
        <div class="result-section-head">
          <h2>解説</h2>
        </div>
        <div class="review-body">
          ${(practice.explanation || []).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      </article>
    `;
  }

  async function init() {
    const practiceId = getPracticeId();
    if (!practiceId) throw new Error("問題IDが指定されていません。");
    const practice = await loadJson(practiceUrl(practiceId));
    const result = window.BokiMock.readJson(resultKey(practiceId), null);
    elements.title.textContent = practice.title;
    if (!result) {
      elements.summary.outerHTML = `
        <section class="empty-state">
          <h2>前回結果がありません</h2>
          <p>先に問題を解いて採点してください。</p>
          <a class="button primary" href="practice.html?practiceId=${encodeURIComponent(practiceId)}&restart=1">問題を解く</a>
        </section>
      `;
      return;
    }
    renderSummary(practice, result);
    renderDetails(practice, result);
  }

  init().catch((error) => {
    document.querySelector("main").innerHTML = `<div class="empty-state"><h2>読み込みに失敗しました</h2><p>${escapeHtml(error.message)}</p></div>`;
  });
})();
