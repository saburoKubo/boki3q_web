(function () {
  const {
    getExamIdFromUrl,
    loadExam,
    formatTime,
    saveSession,
    getSession,
    gradeExam,
    saveResult,
    clearSession
  } = window.BokiMock;

  const state = {
    examId: getExamIdFromUrl(),
    exam: null,
    currentSectionIndex: 0,
    answers: {},
    remainingSeconds: 0,
    timerId: null,
    submitted: false
  };

  const elements = {
    title: document.getElementById("exam-title"),
    timer: document.getElementById("timer"),
    tabs: document.getElementById("section-tabs"),
    area: document.getElementById("question-area"),
    status: document.getElementById("exam-status"),
    prev: document.getElementById("prev-button"),
    next: document.getElementById("next-button"),
    submit: document.getElementById("submit-button"),
    modal: document.getElementById("confirm-modal"),
    cancelSubmit: document.getElementById("cancel-submit"),
    confirmSubmit: document.getElementById("confirm-submit")
  };

  const accountGroupOrder = [
    ["現金", "普通預金", "当座預金", "売掛金", "クレジット売掛金", "受取手形", "電子記録債権", "受取商品券", "繰越商品", "前払金", "前払家賃", "前払保険料", "仮払金", "未収入金", "未収手数料", "貯蔵品", "差入保証金", "備品", "備品減価償却累計額", "建物", "土地", "貸倒引当金"],
    ["買掛金", "支払手形", "電子記録債務", "未払金", "未払給料", "未払利息", "未払法人税等", "未払配当金", "前受金", "前受手数料", "所得税預り金", "住民税預り金", "社会保険料預り金", "借入金", "手形借入金", "当座借越"],
    ["資本金", "繰越利益剰余金", "利益準備金"],
    ["仕入", "給料", "支払家賃", "旅費交通費", "通信費", "消耗品費", "保険料", "法定福利費", "租税公課", "修繕費", "発送費", "支払手数料", "支払利息", "減価償却費", "貸倒引当金繰入", "貸倒損失", "貯蔵品消耗費", "固定資産売却損", "法人税、住民税及び事業税"],
    ["売上", "受取手数料", "償却債権取立益", "固定資産売却益"]
  ];

  const accountOrderMap = new Map();
  accountGroupOrder.flat().forEach((account, index) => {
    accountOrderMap.set(account, index);
  });

  function orderedOptions(options) {
    return [...options].sort((a, b) => {
      const rankA = accountOrderMap.has(a) ? accountOrderMap.get(a) : Number.MAX_SAFE_INTEGER;
      const rankB = accountOrderMap.has(b) ? accountOrderMap.get(b) : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return options.indexOf(a) - options.indexOf(b);
    });
  }

  function formatNumericText(value) {
    const normalized = String(value || "").replace(/[,\s￥¥]/g, "");
    if (normalized === "") return "";
    const number = Number(normalized);
    return Number.isFinite(number) ? number.toLocaleString("ja-JP") : value;
  }

  function commitFormattedNumber(input, onFormat) {
    const formatted = formatNumericText(input.value);
    input.classList.add("amount-input");
    input.style.textAlign = "right";
    if (formatted === input.value) return;
    input.value = formatted;
    onFormat(formatted);
    saveProgress();
  }

  function formatOnCommit(input, onFormat) {
    input.classList.add("amount-input");
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitFormattedNumber(input, onFormat);
    });
    input.addEventListener("blur", () => commitFormattedNumber(input, onFormat));
  }

  function initEmptyAnswer(question) {
    if (question.type === "journal_dropdown") {
      const current = state.answers[question.id];
      if (!current || typeof current !== "object" || Array.isArray(current) || current.lines) {
        state.answers[question.id] = {
          debitAccount: "",
          creditAccount: "",
          amount: ""
        };
      }
      return;
    }

    if (question.type === "journal_dropdown_multi") {
      const lineCount = question.answerLineCount || Math.max(question.correctAnswer?.lines?.length || 0, 2);
      const current = state.answers[question.id];
      if (!current || !Array.isArray(current.lines)) {
        state.answers[question.id] = {
          lines: Array.from({ length: lineCount }, () => ({
            debitAccount: "",
            debitAmount: "",
            creditAccount: "",
            creditAmount: ""
          }))
        };
        return;
      }
      while (current.lines.length < lineCount) {
        current.lines.push({ debitAccount: "", debitAmount: "", creditAccount: "", creditAmount: "" });
      }
      return;
    }

    if (question.type === "account_fill" || question.type === "financial_statement_fill") {
      const current = state.answers[question.id];
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        state.answers[question.id] = {};
      }
      (question.fields || []).forEach((field) => {
        if (state.answers[question.id][field.id] === undefined) {
          state.answers[question.id][field.id] = "";
        }
      });
      return;
    }

    if (state.answers[question.id] === undefined || typeof state.answers[question.id] === "object") {
      state.answers[question.id] = "";
    }
  }

  function saveProgress() {
    if (!state.exam || state.submitted) return;
    saveSession(state.exam.examId, {
      examId: state.exam.examId,
      currentSectionIndex: state.currentSectionIndex,
      remainingSeconds: state.remainingSeconds,
      answers: state.answers,
      updatedAt: new Date().toISOString()
    });
  }

  function restoreSession() {
    const session = getSession(state.exam.examId);
    if (!session || session.examId !== state.exam.examId) return;

    state.currentSectionIndex = Number.isInteger(session.currentSectionIndex) ? session.currentSectionIndex : 0;
    if (state.currentSectionIndex < 0 || state.currentSectionIndex >= state.exam.sections.length) {
      state.currentSectionIndex = 0;
    }
    state.remainingSeconds = Number(session.remainingSeconds) || state.exam.durationMinutes * 60;
    state.answers = session.answers && typeof session.answers === "object" && !Array.isArray(session.answers)
      ? session.answers
      : {};
  }

  function renderTabs() {
    elements.tabs.innerHTML = "";
    state.exam.sections.forEach((section, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `section-tab${index === state.currentSectionIndex ? " active" : ""}`;
      button.textContent = section.title.replace(" ", "\n");
      button.addEventListener("click", () => {
        state.currentSectionIndex = index;
        saveProgress();
        render();
      });
      elements.tabs.appendChild(button);
    });
  }

  function accountSelect(name, value, options, label) {
    const select = document.createElement("select");
    select.name = name;
    select.setAttribute("aria-label", label);

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "選択";
    select.appendChild(empty);

    orderedOptions(options).forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = optionValue === value;
      select.appendChild(option);
    });

    return select;
  }

  function renderJournal(question, number) {
    initEmptyAnswer(question);
    const answer = state.answers[question.id];
    const article = questionShell(question, number);
    const form = document.createElement("div");
    form.className = "journal-grid";

    const debitSelect = accountSelect("debitAccount", answer.debitAccount, state.exam.accountOptions, "借方科目");
    const creditSelect = accountSelect("creditAccount", answer.creditAccount, state.exam.accountOptions, "貸方科目");
    const amountInput = document.createElement("input");
    amountInput.type = "text";
    amountInput.inputMode = "numeric";
    
    amountInput.min = "0";
    amountInput.placeholder = "金額";
    amountInput.value = answer.amount || "";
    amountInput.className = "amount-input";
    amountInput.setAttribute("aria-label", "金額");

    form.append(
      fieldWrap("借方科目", debitSelect),
      fieldWrap("貸方科目", creditSelect),
      fieldWrap("金額", amountInput)
    );

    debitSelect.addEventListener("change", () => updateAnswer(question.id, "debitAccount", debitSelect.value));
    creditSelect.addEventListener("change", () => updateAnswer(question.id, "creditAccount", creditSelect.value));
    amountInput.addEventListener("input", () => updateAnswer(question.id, "amount", amountInput.value));
    formatOnCommit(amountInput, (value) => updateAnswer(question.id, "amount", value));

    article.appendChild(form);
    return article;
  }


  function renderSourceDocument(documentData) {
    if (!documentData) return null;
    const box = document.createElement("div");
    box.className = "source-document";
    const title = document.createElement("h4");
    title.textContent = documentData.title || "資料";
    const summary = document.createElement("p");
    summary.className = "source-summary";
    summary.textContent = documentData.summary || "";
    const table = document.createElement("table");
    table.className = "source-table";
    table.innerHTML = "<thead><tr><th>品名</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>";
    const tbody = document.createElement("tbody");
    (documentData.rows || []).forEach((row) => {
      const tr = document.createElement("tr");
      const unitPrice = typeof row.unitPrice === "number" ? row.unitPrice.toLocaleString("ja-JP") : row.unitPrice;
      const amount = typeof row.amount === "number" ? row.amount.toLocaleString("ja-JP") : row.amount;
      tr.innerHTML = "<th scope=\"row\">" + row.item + "</th><td>" + (row.quantity || "") + "</td><td>" + (unitPrice || "") + "</td><td>" + amount + "</td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent = documentData.note || "";
    box.append(title, summary, table);
    if (documentData.total) {
      const total = document.createElement("p");
      total.className = "source-total";
      total.textContent = "合計 " + Number(documentData.total).toLocaleString("ja-JP") + "円";
      box.appendChild(total);
    }
    box.appendChild(note);
    return box;
  }

  function renderJournalMulti(question, number) {
    initEmptyAnswer(question);
    const answer = state.answers[question.id];
    const article = questionShell(question, number);
    const source = renderSourceDocument(question.sourceDocument);
    if (source) article.appendChild(source);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "journal-multi-table";
    table.innerHTML = "<thead><tr><th>借方科目</th><th>借方金額</th><th>貸方科目</th><th>貸方金額</th></tr></thead>";
    const tbody = document.createElement("tbody");

    answer.lines.forEach((line, index) => {
      const row = document.createElement("tr");
      const debitSelect = accountSelect("debitAccount", line.debitAccount, state.exam.accountOptions, "借方科目");
      const creditSelect = accountSelect("creditAccount", line.creditAccount, state.exam.accountOptions, "貸方科目");
      const debitAmount = document.createElement("input");
      debitAmount.type = "text";
      debitAmount.inputMode = "numeric";
    
      debitAmount.min = "0";
      debitAmount.placeholder = "金額";
      debitAmount.value = line.debitAmount || "";
      debitAmount.className = "amount-input";
      debitAmount.setAttribute("aria-label", "借方金額");
      const creditAmount = document.createElement("input");
      creditAmount.type = "text";
      creditAmount.inputMode = "numeric";
    
      creditAmount.min = "0";
      creditAmount.placeholder = "金額";
      creditAmount.value = line.creditAmount || "";
      creditAmount.className = "amount-input";
      creditAmount.setAttribute("aria-label", "貸方金額");

      debitSelect.addEventListener("change", () => updateJournalLine(question.id, index, "debitAccount", debitSelect.value));
      debitAmount.addEventListener("input", () => updateJournalLine(question.id, index, "debitAmount", debitAmount.value));
      creditSelect.addEventListener("change", () => updateJournalLine(question.id, index, "creditAccount", creditSelect.value));
      creditAmount.addEventListener("input", () => updateJournalLine(question.id, index, "creditAmount", creditAmount.value));
      formatOnCommit(debitAmount, (value) => updateJournalLine(question.id, index, "debitAmount", value));
      formatOnCommit(creditAmount, (value) => updateJournalLine(question.id, index, "creditAmount", value));

      [debitSelect, debitAmount, creditSelect, creditAmount].forEach((control) => {
        const cell = document.createElement("td");
        cell.appendChild(control);
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    article.appendChild(tableWrap);
    return article;
  }

  function renderTerm(question, number) {
    initEmptyAnswer(question);
    const article = questionShell(question, number);
    const options = document.createElement("div");
    options.className = "choice-list";

    question.options.forEach((optionValue) => {
      const label = document.createElement("label");
      label.className = "choice-item";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = question.id;
      input.value = optionValue;
      input.checked = state.answers[question.id] === optionValue;
      input.addEventListener("change", () => {
        state.answers[question.id] = optionValue;
        saveProgress();
      });
      label.append(input, document.createTextNode(optionValue));
      options.appendChild(label);
    });

    article.appendChild(options);
    return article;
  }

  function fieldById(question, fieldId) {
    return question.fields.find((field) => field.id === fieldId);
  }

  function createAnswerControl(question, fieldId, label) {
    const field = fieldById(question, fieldId);
    if (!field) {
      const span = document.createElement("span");
      span.textContent = "";
      return span;
    }

    const input = field.inputType === "select"
      ? accountSelect(field.id, state.answers[question.id][field.id], field.options, label || field.label)
      : document.createElement("input");

    if (field.inputType !== "select") {
      input.type = "text";
      input.inputMode = "numeric";
      input.placeholder = "金額";
      input.value = state.answers[question.id][field.id] || "";
      input.className = "amount-input";
      input.setAttribute("aria-label", label || field.label);
    }

    input.addEventListener(field.inputType === "select" ? "change" : "input", () => {
      state.answers[question.id][field.id] = input.value;
      saveProgress();
    });

    if (field.inputType !== "select") {
      formatOnCommit(input, (value) => {
        state.answers[question.id][field.id] = value;
      });
    }

    return input;
  }

  function answerSheetCell(question, cell, label) {
    const td = document.createElement("td");
    if (!cell) return td;
    if (typeof cell === "string") {
      td.textContent = cell;
      return td;
    }
    if (cell.text !== undefined) {
      td.textContent = cell.text;
      return td;
    }
    if (cell.fieldId && cell.readonly) {
      const source = state.answers[question.id][cell.fieldId];
      td.textContent = source ? formatNumericText(source) : "";
      return td;
    }
    if (cell.fieldId) {
      td.className = "answer-cell";
      td.appendChild(createAnswerControl(question, cell.fieldId, label));
    }
    return td;
  }

  function renderAccountsAnswerSheet(question) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet account-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = "答案用紙";
    wrap.appendChild(heading);

    question.answerSheet.accounts.forEach((account) => {
      const block = document.createElement("section");
      block.className = "account-block";
      const title = document.createElement("h5");
      title.textContent = account.title;
      const tableWrap = document.createElement("div");
      tableWrap.className = "table-scroll";
      const table = document.createElement("table");
      table.className = "t-account-table";
      table.innerHTML = "<thead><tr><th>借方摘要</th><th>借方金額</th><th>貸方摘要</th><th>貸方金額</th></tr></thead>";
      const tbody = document.createElement("tbody");
      account.rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.append(
          answerSheetCell(question, row.debit, "借方摘要"),
          answerSheetCell(question, row.debitAmount, "借方金額"),
          answerSheetCell(question, row.credit, "貸方摘要"),
          answerSheetCell(question, row.creditAmount, "貸方金額")
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      block.append(title, tableWrap);
      wrap.appendChild(block);
    });

    return wrap;
  }

  function inventoryCell(question, value, label) {
    const td = document.createElement("td");
    if (value && typeof value === "object" && value.fieldId) {
      td.className = "answer-cell";
      td.appendChild(createAnswerControl(question, value.fieldId, label));
    } else {
      td.textContent = value || "";
    }
    return td;
  }

  function renderInventoryAnswerSheet(question) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet inventory-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = "答案用紙 商品有高帳（A商品）";
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "inventory-sheet-table";
    table.innerHTML = "<thead><tr><th>日付</th><th>摘要</th><th>受入 数量</th><th>受入 単価</th><th>受入 金額</th><th>払出 数量</th><th>払出 単価</th><th>払出 金額</th><th>残高 数量</th><th>残高 単価</th><th>残高 金額</th></tr></thead>";
    const tbody = document.createElement("tbody");
    question.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        inventoryCell(question, row.date, "日付"),
        inventoryCell(question, row.summary, "摘要"),
        inventoryCell(question, row.receiptQty, "受入数量"),
        inventoryCell(question, row.receiptUnit, "受入単価"),
        inventoryCell(question, row.receiptAmount, "受入金額"),
        inventoryCell(question, row.issueQty, "払出数量"),
        inventoryCell(question, row.issueUnit, "払出単価"),
        inventoryCell(question, row.issueAmount, "払出金額"),
        inventoryCell(question, row.balanceQty, "残高数量"),
        inventoryCell(question, row.balanceUnit, "残高単価"),
        inventoryCell(question, row.balanceAmount, "残高金額")
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (question.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      if (item.fieldId) {
        label.append(span, createAnswerControl(question, item.fieldId, item.label));
      } else {
        const strong = document.createElement("strong");
        strong.textContent = item.value;
        label.append(span, strong);
      }
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderTrialBalanceAnswerSheet(question) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet trial-balance-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = question.answerSheet.title || "答案用紙 決算整理後残高試算表";
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "trial-balance-sheet-table";
    table.innerHTML = "<thead><tr><th>借方</th><th>勘定科目</th><th>貸方</th></tr></thead>";
    const tbody = document.createElement("tbody");

    question.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        answerSheetCell(question, row.debit, row.account + " 借方"),
        answerSheetCell(question, { text: row.account }, "勘定科目"),
        answerSheetCell(question, row.credit, row.account + " 貸方")
      );
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (question.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      label.append(span, createAnswerControl(question, item.fieldId, item.label));
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderTableAnswerSheet(question) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet generic-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = question.answerSheet.title || "答案用紙";
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "answer-table generic-sheet-table";
    const columns = question.answerSheet.columns || [];
    if (columns.length >= 9) {
      table.classList.add("worksheet-table");
    } else if (columns.length <= 5) {
      table.classList.add("compact-sheet-table");
    }
    if (columns.includes("摘要")) {
      table.classList.add("ledger-table");
    }
    if (columns.includes("負債・純資産")) {
      table.classList.add("balance-sheet-table");
    }
    if (statement.format === "account") {
      const colgroup = document.createElement("colgroup");
      ["34%", "16%", "34%", "16%"].forEach((width) => {
        const col = document.createElement("col");
        col.style.width = width;
        colgroup.appendChild(col);
      });
      table.appendChild(colgroup);
    }
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    question.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.cells.forEach((cell, index) => {
        tr.appendChild(answerSheetCell(question, cell, question.answerSheet.columns[index]));
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (question.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      if (item.fieldId) {
        label.append(span, createAnswerControl(question, item.fieldId, item.label));
      } else {
        const strong = document.createElement("strong");
        strong.textContent = item.value;
        label.append(span, strong);
      }
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderStatementTable(question, statement) {
    const block = document.createElement("section");
    block.className = "statement-block";
    const title = document.createElement("h5");
    title.textContent = statement.title;
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "answer-table generic-sheet-table compact-sheet-table statement-table";
    const columns = statement.columns || [];
    if (statement.format === "account") {
      table.classList.add("statement-account-table");
    }
    if (columns.includes("負債・純資産")) {
      table.classList.add("balance-sheet-table");
    }
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    (statement.rows || []).forEach((row) => {
      const tr = document.createElement("tr");
      if (row.className) tr.className = row.className;
      row.cells.forEach((cell, index) => {
        tr.appendChild(answerSheetCell(question, cell, columns[index]));
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);
    block.append(title, tableWrap);
    return block;
  }

  function renderStatementsAnswerSheet(question) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet statements-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = question.answerSheet.title || "答案用紙";
    wrap.appendChild(heading);
    (question.answerSheet.statements || []).forEach((statement) => {
      wrap.appendChild(renderStatementTable(question, statement));
    });

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (question.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      if (item.fieldId) {
        label.append(span, createAnswerControl(question, item.fieldId, item.label));
      } else {
        const strong = document.createElement("strong");
        strong.textContent = item.value;
        label.append(span, strong);
      }
      summary.appendChild(label);
    });
    wrap.appendChild(summary);
    return wrap;
  }

  function renderStructuredAnswerSheet(question) {
    if (!question.answerSheet) return null;
    if (question.answerSheet.type === "accounts") return renderAccountsAnswerSheet(question);
    if (question.answerSheet.type === "inventory") return renderInventoryAnswerSheet(question);
    if (question.answerSheet.type === "trial_balance") return renderTrialBalanceAnswerSheet(question);
    if (question.answerSheet.type === "table") return renderTableAnswerSheet(question);
    if (question.answerSheet.type === "statements") return renderStatementsAnswerSheet(question);
    return null;
  }

  function renderFieldQuestion(question, number, className) {
    initEmptyAnswer(question);
    const article = questionShell(question, number);
    const source = renderSourceDocument(question.sourceDocument);
    if (source) article.appendChild(source);

    const structured = renderStructuredAnswerSheet(question);
    if (structured) {
      article.appendChild(structured);
      return article;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = className;
    table.innerHTML = "<thead><tr><th>項目</th><th>解答</th><th>配点</th></tr></thead>";
    const tbody = document.createElement("tbody");

    question.fields.forEach((field) => {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.textContent = field.label;
      const inputCell = document.createElement("td");
      inputCell.appendChild(createAnswerControl(question, field.id, field.label));
      const scoreCell = document.createElement("td");
      scoreCell.textContent = field.score + "点";
      row.append(labelCell, inputCell, scoreCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    article.appendChild(tableWrap);
    return article;
  }

  function fieldWrap(labelText, control) {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function questionShell(question, number) {
    const article = document.createElement("article");
    article.className = "question-card";
    const heading = document.createElement("h3");
    heading.textContent = question.title || `問${number}`;
    const score = document.createElement("span");
    score.className = "score-chip";
    score.textContent = `${question.score}点`;
    const head = document.createElement("div");
    head.className = "question-head";
    head.append(heading, score);
    const body = document.createElement("p");
    body.className = "question-text";
    body.textContent = question.question;
    article.append(head, body);
    return article;
  }

  function updateAnswer(questionId, field, value) {
    state.answers[questionId][field] = value;
    saveProgress();
  }

  function updateJournalLine(questionId, index, field, value) {
    state.answers[questionId].lines[index][field] = value;
    saveProgress();
  }

  function renderQuestions() {
    const section = state.exam.sections[state.currentSectionIndex];
    elements.area.innerHTML = "";

    const sectionHead = document.createElement("div");
    sectionHead.className = "section-heading in-exam";
    const title = document.createElement("h2");
    title.textContent = section.title;
    const description = document.createElement("p");
    description.textContent = section.description;
    sectionHead.append(title, description);
    elements.area.appendChild(sectionHead);

    section.questions.forEach((question, index) => {
      let node;
      try {
        if (question.type === "journal_dropdown") node = renderJournal(question, index + 1);
        if (question.type === "journal_dropdown_multi") node = renderJournalMulti(question, index + 1);
        if (question.type === "term_fill") node = renderTerm(question, index + 1);
        if (question.type === "account_fill") node = renderFieldQuestion(question, index + 1, "answer-table account-table");
        if (question.type === "financial_statement_fill") node = renderFieldQuestion(question, index + 1, "answer-table statement-table");
      } catch (error) {
        console.error("question render error", question.id, error);
        node = questionShell(question, index + 1);
        const message = document.createElement("p");
        message.className = "error-message";
        message.textContent = "この問題の表示中にエラーが発生しました。途中保存データを初期化して再読み込みしてください。";
        node.appendChild(message);
      }
      if (!node) return;
      elements.area.appendChild(node);
    });
  }

  function render() {
    const section = state.exam.sections[state.currentSectionIndex];
    elements.title.textContent = state.exam.title;
    elements.timer.textContent = formatTime(state.remainingSeconds);
    elements.status.textContent = `${state.currentSectionIndex + 1} / ${state.exam.sections.length}　${section.title}`;
    const isLastSection = state.currentSectionIndex === state.exam.sections.length - 1;
    elements.prev.disabled = state.currentSectionIndex === 0;
    elements.next.disabled = isLastSection;
    elements.submit.hidden = !isLastSection;
    elements.next.textContent = isLastSection ? "次へ" : "第" + (state.currentSectionIndex + 2) + "問へ";
    renderTabs();
    renderQuestions();
  }

  function startTimer() {
    clearInterval(state.timerId);
    elements.timer.textContent = formatTime(state.remainingSeconds);
    state.timerId = setInterval(() => {
      state.remainingSeconds -= 1;
      elements.timer.textContent = formatTime(state.remainingSeconds);
      if (state.remainingSeconds % 5 === 0) saveProgress();
      if (state.remainingSeconds <= 0) {
        submitExam(true);
      }
    }, 1000);
  }

  function submitExam(isTimeUp = false) {
    if (state.submitted) return;
    state.submitted = true;
    clearInterval(state.timerId);
    const result = gradeExam(state.exam, state.answers);
    result.isTimeUp = isTimeUp;
    saveResult(state.exam.examId, result);
    clearSession(state.exam.examId);
    location.href = `result.html?examId=${encodeURIComponent(state.exam.examId)}`;
  }

  function bindEvents() {
    elements.prev.addEventListener("click", () => {
      state.currentSectionIndex = Math.max(0, state.currentSectionIndex - 1);
      saveProgress();
      render();
      scrollTo({ top: 0, behavior: "smooth" });
    });

    elements.next.addEventListener("click", () => {
      state.currentSectionIndex = Math.min(state.exam.sections.length - 1, state.currentSectionIndex + 1);
      saveProgress();
      render();
      scrollTo({ top: 0, behavior: "smooth" });
    });

    elements.submit.addEventListener("click", () => {
      elements.modal.hidden = false;
    });

    elements.cancelSubmit.addEventListener("click", () => {
      elements.modal.hidden = true;
    });

    elements.confirmSubmit.addEventListener("click", () => submitExam(false));

    window.addEventListener("beforeunload", saveProgress);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveProgress();
    });
  }

  async function init() {
    try {
      state.exam = await loadExam(state.examId);
      state.remainingSeconds = state.exam.durationMinutes * 60;
      state.exam.sections.forEach((section) => {
        section.questions.forEach(initEmptyAnswer);
      });
      restoreSession();
      state.exam.sections.forEach((section) => {
        section.questions.forEach(initEmptyAnswer);
      });
      state.currentSectionIndex = Math.min(Math.max(state.currentSectionIndex, 0), state.exam.sections.length - 1);
      bindEvents();
      render();
      saveProgress();
      startTimer();
    } catch (error) {
      elements.area.innerHTML = `<div class="empty-state"><h2>読み込みに失敗しました</h2><p>${error.message}</p></div>`;
    }
  }

  init();
})();
