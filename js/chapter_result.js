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

  function isAccountColumn(column) {
    const key = String(column?.key || "");
    const label = String(typeof column === "string" ? column : column?.label || "");
    return key.toLowerCase().includes("account") || label.includes("科目") || label.includes("勘定科目");
  }

  function resultCellClass(table, column, baseClass = "") {
    return [baseClass, isAccountColumn(column) ? "account-name-cell" : ""].filter(Boolean).join(" ");
  }

  function renderCorrectTable(table) {
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
              ${table.rows.map((row) => `
                <tr>
                  ${generic ? table.columns.map((column) => {
                    const key = column.key;
                    if (column.type === "answer") {
                      if (table.hideZeroCells && Number(row.cells[key]) === 0) return "<td></td>";
                      return `<td class="${resultCellClass(table, column)}">${escapeHtml(formatCellValue(table, key, row.cells[key]))}</td>`;
                    }
                    return `<td class="${resultCellClass(table, column)}">${escapeHtml(row.values?.[key] ?? "")}</td>`;
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

  function isSelectCell(table, key) {
    return Boolean(table.selectOptions?.[key]);
  }

  function formatCellValue(table, key, value) {
    if (value === null || value === undefined) return "";
    if (isSelectCell(table, key)) return String(value);
    return window.BokiMock.formatYen(value);
  }

  function formatUserCellValue(table, key, value) {
    if (isSelectCell(table, key)) return window.BokiMock.normalizeText(value);
    return formatUserAnswer(value);
  }

  function isAmountCorrect(actual, expected) {
    const expectedNumber = Number(expected);
    return actual === expectedNumber || (expectedNumber === 0 && actual === null);
  }

  function isCellCorrect(table, key, answer, expected) {
    if (isSelectCell(table, key)) {
      return window.BokiMock.normalizeText(answer) === window.BokiMock.normalizeText(expected);
    }
    return isAmountCorrect(window.BokiMock.normalizeNumber(answer), expected);
  }

  function journalName(questionId, lineIndex, key) {
    return `journal.${questionId}.${lineIndex}.${key}`;
  }

  function normalizeJournalLines(lines = []) {
    return lines
      .map((line) => ({
        debitAccount: window.BokiMock.normalizeText(line.debitAccount),
        debitAmount: window.BokiMock.normalizeNumber(line.debitAmount),
        creditAccount: window.BokiMock.normalizeText(line.creditAccount),
        creditAmount: window.BokiMock.normalizeNumber(line.creditAmount)
      }))
      .filter((line) => line.debitAccount || line.debitAmount !== null || line.creditAccount || line.creditAmount !== null);
  }

  function journalAnswerLines(question, answers) {
    const lineCount = question.maxLines || 5;
    return Array.from({ length: lineCount }, (_, lineIndex) => ({
      debitAccount: answers?.[journalName(question.id, lineIndex, "debitAccount")] || "",
      debitAmount: answers?.[journalName(question.id, lineIndex, "debitAmount")] || "",
      creditAccount: answers?.[journalName(question.id, lineIndex, "creditAccount")] || "",
      creditAmount: answers?.[journalName(question.id, lineIndex, "creditAmount")] || ""
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

  function emptyJournalMarkers(lines) {
    return lines.map(() => ({
      debitAccount: "",
      debitAmount: "",
      creditAccount: "",
      creditAmount: ""
    }));
  }

  function sideAnswerEntries(lines, side) {
    const accountKey = side === "debit" ? "debitAccount" : "creditAccount";
    const amountKey = side === "debit" ? "debitAmount" : "creditAmount";
    return lines
      .map((line, lineIndex) => ({
        lineIndex,
        accountKey,
        amountKey,
        account: window.BokiMock.normalizeText(line[accountKey]),
        amount: window.BokiMock.normalizeNumber(line[amountKey])
      }))
      .filter((entry) => entry.account || entry.amount !== null);
  }

  function markSideJournalCells(markers, actualLines, expectedLines, side) {
    const accountKey = side === "debit" ? "debitAccount" : "creditAccount";
    const amountKey = side === "debit" ? "debitAmount" : "creditAmount";
    const actualEntries = sideAnswerEntries(actualLines, side);
    const expectedEntries = sideEntries(expectedLines, side).map((entry) => ({ ...entry, matched: false }));

    actualEntries.forEach((actual) => {
      const exact = expectedEntries.find((expected) => !expected.matched && actual.account === expected.account && actual.amount === expected.amount);
      if (!exact) return;
      exact.matched = true;
      markers[actual.lineIndex][actual.accountKey] = "result-ok-cell";
      markers[actual.lineIndex][actual.amountKey] = "result-ok-cell";
      actual.matched = true;
    });

    actualEntries.forEach((actual) => {
      if (actual.matched) return;
      const sameAccount = expectedEntries.find((expected) => !expected.matched && actual.account && actual.account === expected.account);
      if (!sameAccount) return;
      sameAccount.matched = true;
      markers[actual.lineIndex][actual.accountKey] = "result-ok-cell";
      markers[actual.lineIndex][actual.amountKey] = actual.amount === sameAccount.amount ? "result-ok-cell" : "result-ng-cell";
      actual.matched = true;
    });

    actualEntries.forEach((actual) => {
      if (actual.matched) return;
      const sameAmount = expectedEntries.find((expected) => !expected.matched && actual.amount !== null && actual.amount === expected.amount);
      if (!sameAmount) return;
      sameAmount.matched = true;
      markers[actual.lineIndex][actual.accountKey] = actual.account === sameAmount.account ? "result-ok-cell" : "result-ng-cell";
      markers[actual.lineIndex][actual.amountKey] = "result-ok-cell";
      actual.matched = true;
    });

    actualEntries.forEach((actual) => {
      if (actual.matched) return;
      if (actual.account) markers[actual.lineIndex][actual.accountKey] = "result-ng-cell";
      if (actual.amount !== null) markers[actual.lineIndex][actual.amountKey] = "result-ng-cell";
    });

    expectedEntries
      .filter((expected) => !expected.matched)
      .forEach(() => {
        const blankIndex = actualLines.findIndex((line, lineIndex) => {
          const marker = markers[lineIndex];
          return !window.BokiMock.normalizeText(line[accountKey]) &&
            window.BokiMock.normalizeNumber(line[amountKey]) === null &&
            !marker[accountKey] &&
            !marker[amountKey];
        });
        if (blankIndex === -1) return;
        markers[blankIndex][accountKey] = "result-ng-cell";
        markers[blankIndex][amountKey] = "result-ng-cell";
      });
  }

  function journalCellMarkers(actualLines, expectedLines) {
    const markers = emptyJournalMarkers(actualLines);
    markSideJournalCells(markers, actualLines, expectedLines, "debit");
    markSideJournalCells(markers, actualLines, expectedLines, "credit");
    return markers;
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

  function formatJournalAmount(value) {
    const number = window.BokiMock.normalizeNumber(value);
    if (number === null) return "";
    return window.BokiMock.formatYen(number);
  }

  function renderJournalLineTable(lines, className = "", cellMarkers = []) {
    const safeLines = lines.length ? lines : [{ debitAccount: "", debitAmount: "", creditAccount: "", creditAmount: "" }];
    return `
      <div class="table-scroll">
        <table class="journal-multi-table chapter-journal-table ${className}">
          <thead>
            <tr>
              <th>借方科目</th>
              <th>借方金額</th>
              <th>貸方科目</th>
              <th>貸方金額</th>
            </tr>
          </thead>
          <tbody>
            ${safeLines.map((line, lineIndex) => `
              <tr>
                <td class="${["account-name-cell", cellMarkers[lineIndex]?.debitAccount].filter(Boolean).join(" ")}">${escapeHtml(line.debitAccount || "")}</td>
                <td class="${cellMarkers[lineIndex]?.debitAmount || ""}">${escapeHtml(formatJournalAmount(line.debitAmount))}</td>
                <td class="${["account-name-cell", cellMarkers[lineIndex]?.creditAccount].filter(Boolean).join(" ")}">${escapeHtml(line.creditAccount || "")}</td>
                <td class="${cellMarkers[lineIndex]?.creditAmount || ""}">${escapeHtml(formatJournalAmount(line.creditAmount))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderJournalDetails(practice, result) {
    const misses = result.misses || [];
    elements.details.innerHTML = `
      <article class="result-section">
        <div class="result-section-head">
          <h2>仕訳答案</h2>
          <strong>${misses.length}件</strong>
        </div>
        <div class="review-body">
          <p class="result-hint">赤字のセルが正答と異なる箇所です。借方内・貸方内の行順は採点で問いません。</p>
          ${practice.questions.map((question, index) => {
            const correct = isJournalQuestionCorrect(question, result.answers || {});
            const lines = journalAnswerLines(question, result.answers || {});
            const correctLines = normalizeJournalLines(question.correctAnswer?.lines || []);
            return `
              <section class="answer-sheet result-answer-sheet">
                <h4>第${index + 1}問</h4>
                <p class="question-text">${escapeHtml(question.text)}</p>
                <div class="journal-answer-pair">
                  <div>
                    <p><strong>あなたの解答</strong></p>
                    ${renderJournalLineTable(lines, "", correct ? emptyJournalMarkers(lines) : journalCellMarkers(lines, correctLines))}
                  </div>
                  <div>
                    <p><strong>正答答案</strong></p>
                    ${renderJournalLineTable(correctLines)}
                  </div>
                </div>
                <p class="result-explanation"><strong>解説:</strong> ${escapeHtml(question.explanation || "")}</p>
              </section>
            `;
          }).join("")}
          ${(practice.explanation || []).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      </article>
    `;
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
                    if (column.type !== "answer") return `<td class="${resultCellClass(table, column)}">${escapeHtml(row.values?.[key] ?? "")}</td>`;
                    const expected = row.cells?.[key];
                    if (table.hideZeroCells && Number(expected) === 0) return "<td></td>";
                    if (expected === null || expected === undefined) return "<td></td>";
                    const answer = result.answers?.[cellName(table, rowIndex, key)];
                    const correct = isCellCorrect(table, key, answer, expected);
                    return `<td class="${resultCellClass(table, column, correct ? "result-ok-cell" : "result-ng-cell")}">${escapeHtml(formatUserCellValue(table, key, answer))}</td>`;
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
    if (practice.mode === "journalPractice") {
      renderJournalDetails(practice, result);
      return;
    }

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
