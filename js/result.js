(function () {
  const { getExamIdFromUrl, getResult, loadExam, gradeExam, getSession, saveResult, formatYen } = window.BokiMock;

  const examId = getExamIdFromUrl();
  const title = document.getElementById("result-title");
  const summary = document.getElementById("result-summary");
  const details = document.getElementById("section-results");

  function scoreText(score, maxScore) {
    return `${score} / ${maxScore}点`;
  }

  function renderSummary(result) {
    title.textContent = `${result.title} 結果`;
    summary.className = `result-summary ${result.passed ? "passed" : "failed"}`;
    summary.innerHTML = `
      <div>
        <p class="eyebrow">${result.isTimeUp ? "時間切れ提出" : "提出完了"}</p>
        <h2>${result.passed ? "合格" : "不合格"}</h2>
        <p class="result-score">${result.totalScore}<span> / ${result.maxScore}点</span></p>
      </div>
      <dl class="meta-grid">
        <div>
          <dt>合格基準</dt>
          <dd>${result.passScore}点</dd>
        </div>
        <div>
          <dt>提出日時</dt>
          <dd>${new Date(result.submittedAt).toLocaleString("ja-JP")}</dd>
        </div>
      </dl>
      <div class="result-actions">
        <a class="button primary" href="exam.html?examId=${encodeURIComponent(result.examId)}">もう一度受ける</a>
        <a class="button secondary" href="index.html">トップへ戻る</a>
      </div>
    `;
  }

  function formatAnswerValue(value) {
    if (value === null || value === undefined || value === "") return "未回答";
    return typeof value === "number" ? `${formatYen(value)}円` : value;
  }

  function renderJournalAnswer(answer) {
    if (!answer) return "未回答";
    if (Array.isArray(answer.lines)) {
      const lines = answer.lines.filter((line) => line.debitAccount || line.debitAmount != null || line.creditAccount || line.creditAmount != null);
      if (lines.length === 0) return "未回答";
      return lines.map((line) => {
        const debit = line.debitAccount ? "借方 " + line.debitAccount + " " + formatAnswerValue(line.debitAmount) : "";
        const credit = line.creditAccount ? "貸方 " + line.creditAccount + " " + formatAnswerValue(line.creditAmount) : "";
        return [debit, credit].filter(Boolean).join(" / ");
      }).join("、");
    }
    return `借方 ${answer.debitAccount || "未選択"} / 貸方 ${answer.creditAccount || "未選択"} / ${formatAnswerValue(answer.amount)}`;
  }

  function journalEntries(answer) {
    if (!answer) return { debits: [], credits: [] };
    if (Array.isArray(answer.lines)) {
      return answer.lines.reduce((entries, line) => {
        if (line.debitAccount || line.debitAmount != null) {
          entries.debits.push({ account: line.debitAccount || "", amount: line.debitAmount });
        }
        if (line.creditAccount || line.creditAmount != null) {
          entries.credits.push({ account: line.creditAccount || "", amount: line.creditAmount });
        }
        return entries;
      }, { debits: [], credits: [] });
    }
    return {
      debits: answer.debitAccount || answer.amount != null ? [{ account: answer.debitAccount || "", amount: answer.amount }] : [],
      credits: answer.creditAccount || answer.amount != null ? [{ account: answer.creditAccount || "", amount: answer.amount }] : []
    };
  }

  function renderJournalAnswerTable(answer, titleText) {
    const entries = journalEntries(answer);
    if (entries.debits.length === 0 && entries.credits.length === 0) {
      const p = document.createElement("p");
      p.innerHTML = `<b>${titleText}</b>: 未回答`;
      return p;
    }

    const wrap = document.createElement("div");
    wrap.className = "journal-result-block";
    const title = document.createElement("p");
    title.innerHTML = `<b>${titleText}</b>`;
    const table = document.createElement("table");
    table.className = "journal-result-table";
    table.innerHTML = "<thead><tr><th>借方</th><th>貸方</th></tr></thead>";
    const tbody = document.createElement("tbody");
    const rowCount = Math.max(entries.debits.length, entries.credits.length);
    for (let index = 0; index < rowCount; index += 1) {
      const tr = document.createElement("tr");
      [entries.debits[index], entries.credits[index]].forEach((entry) => {
        const td = document.createElement("td");
        if (entry) {
          const account = document.createElement("span");
          account.textContent = entry.account;
          const amount = document.createElement("span");
          amount.textContent = formatAnswerValue(entry.amount);
          td.append(account, amount);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.append(title, table);
    return wrap;
  }

  function renderUserAnswer(question) {
    if (question.type === "journal_dropdown" || question.type === "journal_dropdown_multi") {
      return renderJournalAnswer(question.userAnswer);
    }
    if (question.fieldResults && question.fieldResults.length > 0) {
      return "下表参照";
    }
    return formatAnswerValue(question.userAnswer);
  }

  function renderCorrectAnswer(question) {
    if ((question.type === "journal_dropdown" || question.type === "journal_dropdown_multi") && question.correctAnswer) {
      return renderJournalAnswer(question.correctAnswer);
    }
    if (question.correctAnswer) {
      return formatAnswerValue(question.correctAnswer);
    }
    if (question.fieldResults && question.fieldResults.length > 0) {
      return "下表参照";
    }
    return question.detail;
  }

  function renderExplanation(question, definition) {
    return question.explanation || definition?.explanation || question.detail || "解説は準備中です。";
  }

  const practiceLinks = [
    { id: "journal_cash_deposits_001", label: "現金・預金の仕訳", keywords: ["現金", "普通預金", "当座預金", "当座借越", "小口現金"] },
    { id: "journal_merchandise_sales_001", label: "商品売買の仕訳", keywords: ["商品", "売上", "仕入", "返品", "値引", "消費税", "クレジット"] },
    { id: "journal_receivables_payables_001", label: "債権・債務の仕訳", keywords: ["売掛金", "買掛金", "貸付金", "借入金", "仮払金", "前払金"] },
    { id: "journal_notes_electronic_001", label: "手形・電子記録債権債務", keywords: ["手形", "電子記録"] },
    { id: "journal_fixed_assets_001", label: "固定資産の仕訳", keywords: ["固定資産", "備品", "建物", "減価償却", "売却", "修繕"] },
    { id: "journal_expenses_revenues_001", label: "費用・収益の仕訳", keywords: ["給料", "家賃", "保険料", "手数料", "未収", "未払", "前受", "前払"] },
    { id: "journal_taxes_equity_001", label: "税金・純資産の仕訳", keywords: ["税", "資本金", "配当", "利益準備金", "租税公課"] },
    { id: "journal_adjustments_001", label: "決算整理仕訳", keywords: ["決算整理", "繰越商品", "貸倒引当金", "貯蔵品", "未払法人税"] },
    { id: "journal_corrections_001", label: "訂正仕訳", keywords: ["訂正", "誤って", "誤記入"] },
    { id: "journal_source_documents_001", label: "証ひょう・資料読み取り仕訳", keywords: ["請求書", "領収書", "納品書", "売上票", "給与明細", "通帳"] },
    { id: "journal_closing_entries_001", label: "決算振替仕訳", keywords: ["損益", "当期純利益", "当期純損失", "繰越利益剰余金"] },
    { id: "journal_reversing_entries_001", label: "再振替仕訳", keywords: ["再振替", "前払", "未払", "前受", "未収"] },
    { id: "journal_book_001", label: "仕訳日記帳", keywords: ["仕訳日記帳"] },
    { id: "voucher_accounting_001", label: "伝票式会計", keywords: ["伝票", "入金伝票", "出金伝票", "振替伝票"] },
    { id: "petty_cash_book_001", label: "小口現金出納帳", keywords: ["小口現金", "補給"] },
    { id: "sales_purchase_books_001", label: "売上帳・仕入帳", keywords: ["売上帳", "仕入帳", "売上戻り", "仕入戻し", "売上値引", "仕入値引"] },
    { id: "notes_books_001", label: "受取手形記入帳・支払手形記入帳", keywords: ["受取手形記入帳", "支払手形記入帳", "受取手形", "支払手形", "満期"] },
    { id: "general_ledger_001", label: "総勘定元帳", keywords: ["総勘定元帳", "勘定記入"] },
    { id: "accounts_receivable_ledger_001", label: "売掛金元帳", keywords: ["売掛金元帳"] },
    { id: "accounts_payable_ledger_001", label: "買掛金元帳", keywords: ["買掛金元帳"] },
    { id: "merchandise_inventory_ledger_001", label: "商品有高帳", keywords: ["商品有高帳", "先入先出"] },
    { id: "moving_average_inventory_ledger_001", label: "商品有高帳（移動平均法）", keywords: ["移動平均"] },
    { id: "fixed_asset_register_001", label: "固定資産台帳", keywords: ["固定資産台帳"] },
    { id: "trial_balance_001", label: "残高試算表", keywords: ["残高試算表", "決算整理後残高試算表"] },
    { id: "total_trial_balance_001", label: "合計残高試算表", keywords: ["合計残高試算表"] },
    { id: "worksheet_001", label: "精算表", keywords: ["精算表"] },
    { id: "income_statement_001", label: "損益計算書", keywords: ["損益計算書"] },
    { id: "balance_sheet_001", label: "貸借対照表", keywords: ["貸借対照表"] }
  ];

  function relatedPracticeLinks(section, question, definition) {
    const haystack = [
      section.title,
      question.title,
      question.detail,
      definition?.title,
      definition?.question,
      definition?.description,
      ...(definition?.materials || []),
      ...(definition?.fields || []).map((field) => field.label)
    ].filter(Boolean).join(" ");
    const links = [];
    const add = (id) => {
      const link = practiceLinks.find((item) => item.id === id);
      if (link && !links.some((item) => item.id === id)) links.push(link);
    };

    if (question.type === "journal_dropdown" || question.type === "journal_dropdown_multi") {
      add("journal_source_documents_001");
      add("journal_merchandise_sales_001");
    }
    if (section.sectionId === "section_2") {
      add("journal_book_001");
      add("general_ledger_001");
    }
    if (section.sectionId === "section_3") {
      add("journal_adjustments_001");
      add("worksheet_001");
    }

    practiceLinks.forEach((link) => {
      if (link.keywords.some((keyword) => haystack.includes(keyword))) add(link.id);
    });

    return links.slice(0, 4);
  }

  function renderRelatedPracticeLinks(section, question, definition) {
    const links = relatedPracticeLinks(section, question, definition);
    if (!links.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "related-practice-links";
    const title = document.createElement("p");
    title.innerHTML = "<b>関連練習</b>";
    const actions = document.createElement("div");
    actions.className = "related-practice-actions";
    links.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.className = "button secondary";
      anchor.href = `practice.html?practiceId=${encodeURIComponent(link.id)}&restart=1`;
      anchor.textContent = link.label;
      actions.appendChild(anchor);
    });
    wrap.append(title, actions);
    return wrap;
  }

  function questionDefinitionMap(exam) {
    const map = new Map();
    exam.sections.forEach((section) => {
      section.questions.forEach((question) => map.set(question.id, question));
    });
    return map;
  }

  function fieldResultById(question) {
    const map = new Map();
    (question.fieldResults || []).forEach((field) => map.set(field.id, field));
    return map;
  }

  function answerDisplayCell(resultQuestion, definition, cell, mode) {
    const td = document.createElement("td");
    if (!cell) return td;
    if (cell.className) td.className = cell.className;
    if (typeof cell === "string") {
      td.textContent = cell;
      return td;
    }
    if (cell.text !== undefined) {
      td.textContent = cell.text;
      return td;
    }
    if (cell.fieldId) {
      const field = fieldResultById(resultQuestion).get(cell.fieldId);
      const value = mode === "user" ? field?.userAnswer : field?.correctAnswer;
      td.className = ["answer-cell", field?.isCorrect ? "result-ok" : "result-ng", cell.className || ""].filter(Boolean).join(" ");
      td.textContent = formatAnswerValue(value);
    }
    return td;
  }

  function isAccountColumnLabel(column) {
    const label = String(column || "");
    return label.includes("科目") || label.includes("勘定科目");
  }

  function renderResultAccountsSheet(resultQuestion, definition, mode) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet account-answer-sheet result-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = mode === "user" ? "あなたの答案" : "正答答案";
    wrap.appendChild(heading);

    definition.answerSheet.accounts.forEach((account) => {
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
          answerDisplayCell(resultQuestion, definition, row.debit, mode),
          answerDisplayCell(resultQuestion, definition, row.debitAmount, mode),
          answerDisplayCell(resultQuestion, definition, row.credit, mode),
          answerDisplayCell(resultQuestion, definition, row.creditAmount, mode)
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      block.append(title, tableWrap);
      wrap.appendChild(block);
    });

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (definition.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      const strong = document.createElement("strong");
      if (item.fieldId) {
        const field = fieldResultById(resultQuestion).get(item.fieldId);
        strong.className = field?.isCorrect ? "result-ok" : "result-ng";
        strong.textContent = formatAnswerValue(mode === "user" ? field?.userAnswer : field?.correctAnswer);
      } else {
        strong.textContent = item.value;
      }
      label.append(span, strong);
      summary.appendChild(label);
    });
    if (summary.children.length > 0) wrap.appendChild(summary);

    return wrap;
  }

  function inventoryDisplayCell(resultQuestion, definition, value, mode) {
    const td = document.createElement("td");
    if (value && typeof value === "object" && value.fieldId) {
      const field = fieldResultById(resultQuestion).get(value.fieldId);
      const display = mode === "user" ? field?.userAnswer : field?.correctAnswer;
      td.className = "answer-cell " + (field?.isCorrect ? "result-ok" : "result-ng");
      td.textContent = formatAnswerValue(display);
    } else {
      td.textContent = value || "";
    }
    return td;
  }

  function renderResultInventorySheet(resultQuestion, definition, mode) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet inventory-answer-sheet result-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = mode === "user" ? "あなたの答案 商品有高帳（A商品）" : "正答答案 商品有高帳（A商品）";
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "inventory-sheet-table";
    table.innerHTML = "<thead><tr><th>日付</th><th>摘要</th><th>受入 数量</th><th>受入 単価</th><th>受入 金額</th><th>払出 数量</th><th>払出 単価</th><th>払出 金額</th><th>残高 数量</th><th>残高 単価</th><th>残高 金額</th></tr></thead>";
    const tbody = document.createElement("tbody");
    definition.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        inventoryDisplayCell(resultQuestion, definition, row.date, mode),
        inventoryDisplayCell(resultQuestion, definition, row.summary, mode),
        inventoryDisplayCell(resultQuestion, definition, row.receiptQty, mode),
        inventoryDisplayCell(resultQuestion, definition, row.receiptUnit, mode),
        inventoryDisplayCell(resultQuestion, definition, row.receiptAmount, mode),
        inventoryDisplayCell(resultQuestion, definition, row.issueQty, mode),
        inventoryDisplayCell(resultQuestion, definition, row.issueUnit, mode),
        inventoryDisplayCell(resultQuestion, definition, row.issueAmount, mode),
        inventoryDisplayCell(resultQuestion, definition, row.balanceQty, mode),
        inventoryDisplayCell(resultQuestion, definition, row.balanceUnit, mode),
        inventoryDisplayCell(resultQuestion, definition, row.balanceAmount, mode)
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (definition.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      const strong = document.createElement("strong");
      if (item.fieldId) {
        const field = fieldResultById(resultQuestion).get(item.fieldId);
        strong.className = field?.isCorrect ? "result-ok" : "result-ng";
        strong.textContent = formatAnswerValue(mode === "user" ? field?.userAnswer : field?.correctAnswer);
      } else {
        strong.textContent = item.value;
      }
      label.append(span, strong);
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderResultTrialBalanceSheet(resultQuestion, definition, mode) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet trial-balance-answer-sheet result-answer-sheet";
    const heading = document.createElement("h4");
    heading.textContent = mode === "user" ? "あなたの答案 決算整理後残高試算表" : "正答答案 決算整理後残高試算表";
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "trial-balance-sheet-table";
    table.innerHTML = "<thead><tr><th>借方</th><th>勘定科目</th><th>貸方</th></tr></thead>";
    const tbody = document.createElement("tbody");
    definition.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        answerDisplayCell(resultQuestion, definition, row.debit, mode),
        answerDisplayCell(resultQuestion, definition, { text: row.account, className: "account-name-cell" }, mode),
        answerDisplayCell(resultQuestion, definition, row.credit, mode)
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (definition.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      const field = fieldResultById(resultQuestion).get(item.fieldId);
      const strong = document.createElement("strong");
      strong.className = field?.isCorrect ? "result-ok" : "result-ng";
      strong.textContent = formatAnswerValue(mode === "user" ? field?.userAnswer : field?.correctAnswer);
      label.append(span, strong);
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderResultTableSheet(resultQuestion, definition, mode) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet generic-answer-sheet result-answer-sheet";
    const heading = document.createElement("h4");
    const baseTitle = definition.answerSheet.title || "答案用紙";
    heading.textContent = (mode === "user" ? "あなたの答案 " : "正答答案 ") + baseTitle.replace(/^答案用紙\s*/, "");
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "answer-table generic-sheet-table";
    const columns = definition.answerSheet.columns || [];
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
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    definition.answerSheet.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.cells.forEach((cell, index) => {
        const td = answerDisplayCell(resultQuestion, definition, cell, mode);
        if (isAccountColumnLabel(columns[index])) td.classList.add("account-name-cell");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (definition.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      const strong = document.createElement("strong");
      if (item.fieldId) {
        const field = fieldResultById(resultQuestion).get(item.fieldId);
        strong.className = field?.isCorrect ? "result-ok" : "result-ng";
        strong.textContent = formatAnswerValue(mode === "user" ? field?.userAnswer : field?.correctAnswer);
      } else {
        strong.textContent = item.value;
      }
      label.append(span, strong);
      summary.appendChild(label);
    });

    wrap.append(heading, tableWrap, summary);
    return wrap;
  }

  function renderResultStatementTable(resultQuestion, definition, statement, mode) {
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
      const colgroup = document.createElement("colgroup");
      ["34%", "16%", "34%", "16%"].forEach((width) => {
        const col = document.createElement("col");
        col.style.width = width;
        colgroup.appendChild(col);
      });
      table.appendChild(colgroup);
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
        const td = answerDisplayCell(resultQuestion, definition, cell, mode);
        if (isAccountColumnLabel(columns[index])) td.classList.add("account-name-cell");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);
    block.append(title, tableWrap);
    return block;
  }

  function renderResultStatementsSheet(resultQuestion, definition, mode) {
    const wrap = document.createElement("div");
    wrap.className = "answer-sheet statements-answer-sheet result-answer-sheet";
    const heading = document.createElement("h4");
    const baseTitle = definition.answerSheet.title || "答案用紙";
    heading.textContent = (mode === "user" ? "あなたの答案 " : "正答答案 ") + baseTitle.replace(/^答案用紙\s*/, "");
    wrap.appendChild(heading);
    (definition.answerSheet.statements || []).forEach((statement) => {
      wrap.appendChild(renderResultStatementTable(resultQuestion, definition, statement, mode));
    });

    const summary = document.createElement("div");
    summary.className = "inventory-summary-fields";
    (definition.answerSheet.summaryFields || []).forEach((item) => {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = item.label;
      const strong = document.createElement("strong");
      if (item.fieldId) {
        const field = fieldResultById(resultQuestion).get(item.fieldId);
        strong.className = field?.isCorrect ? "result-ok" : "result-ng";
        strong.textContent = formatAnswerValue(mode === "user" ? field?.userAnswer : field?.correctAnswer);
      } else {
        strong.textContent = item.value;
      }
      label.append(span, strong);
      summary.appendChild(label);
    });
    wrap.appendChild(summary);
    return wrap;
  }

  function renderStructuredReview(resultQuestion, definition) {
    if (!definition?.answerSheet) return null;
    const wrap = document.createElement("div");
    wrap.className = "structured-review";
    const type = definition.answerSheet.type;
    const renderer = type === "accounts"
      ? renderResultAccountsSheet
      : type === "inventory"
        ? renderResultInventorySheet
        : type === "trial_balance"
          ? renderResultTrialBalanceSheet
          : type === "table"
            ? renderResultTableSheet
            : type === "statements"
              ? renderResultStatementsSheet
          : null;
    if (!renderer) return null;
    wrap.append(renderer(resultQuestion, definition, "user"), renderer(resultQuestion, definition, "correct"));
    return wrap;
  }

  function renderDetails(result, exam) {
    details.innerHTML = "";
    const definitionMap = exam ? questionDefinitionMap(exam) : new Map();
    result.sections.forEach((section) => {
      const sectionNode = document.createElement("article");
      sectionNode.className = "result-section";
      const head = document.createElement("div");
      head.className = "result-section-head";
      head.innerHTML = `<h2>${section.title}</h2><strong>${scoreText(section.score, section.maxScore)}</strong>`;
      sectionNode.appendChild(head);

      section.questions.forEach((question, index) => {
        const definition = definitionMap.get(question.id);
        const item = document.createElement("details");
        item.className = "review-item";
        item.open = true;
        item.innerHTML = `
          <summary>
            <span>${index + 1}. ${question.title}</span>
            <strong class="${question.isCorrect ? "ok" : "ng"}">${scoreText(question.score, question.maxScore)}</strong>
          </summary>
          <div class="review-body">
            <p><b>丁寧な解説</b>: ${renderExplanation(question, definition)}</p>
          </div>
        `;

        const reviewBody = item.querySelector(".review-body");
        if (question.type === "journal_dropdown" || question.type === "journal_dropdown_multi") {
          reviewBody.prepend(
            renderJournalAnswerTable(question.userAnswer, "あなたの解答"),
            renderJournalAnswerTable(question.correctAnswer, "正答答案")
          );
        } else {
          const correct = document.createElement("p");
          correct.innerHTML = `<b>正答</b>: ${renderCorrectAnswer(question)}`;
          const user = document.createElement("p");
          user.innerHTML = `<b>ユーザーの解答</b>: ${renderUserAnswer(question)}`;
          reviewBody.prepend(user, correct);
        }

        const structuredReview = renderStructuredReview(question, definition);
        if (structuredReview) {
          reviewBody.appendChild(structuredReview);
        } else if (question.fieldResults && question.fieldResults.length > 0) {
          const tableWrap = document.createElement("div");
          tableWrap.className = "table-scroll";
          const table = document.createElement("table");
          table.className = "answer-table";
          table.innerHTML = "<thead><tr><th>項目</th><th>ユーザーの解答</th><th>正答</th><th>結果</th></tr></thead>";
          const tbody = document.createElement("tbody");
          question.fieldResults.forEach((field) => {
            const row = document.createElement("tr");
            const user = formatAnswerValue(field.userAnswer);
            const correct = formatAnswerValue(field.correctAnswer);
            const accountClass = isAccountColumnLabel(field.label) ? " class=\"account-name-cell\"" : "";
            row.innerHTML = `<th scope="row">${field.label}</th><td${accountClass}>${user}</td><td${accountClass}>${correct}</td><td>${field.isCorrect ? "正解" : "不正解"}</td>`;
            tbody.appendChild(row);
          });
          table.appendChild(tbody);
          tableWrap.appendChild(table);
          reviewBody.appendChild(tableWrap);
        }

        const relatedLinks = renderRelatedPracticeLinks(section, question, definition);
        if (relatedLinks) {
          reviewBody.appendChild(relatedLinks);
        }

        sectionNode.appendChild(item);
      });
      details.appendChild(sectionNode);
    });
  }

  async function init() {
    let result = getResult(examId);
    const exam = await loadExam(examId);

    if (!result) {
      const session = getSession(examId);
      if (session?.answers) {
        result = gradeExam(exam, session.answers);
        result.isTimeUp = false;
        saveResult(examId, result);
      }
    }

    if (!result) {
      summary.innerHTML = `
        <div class="empty-state">
          <h2>結果がありません</h2>
          <p>模擬試験を提出すると、ここに採点結果が表示されます。</p>
          <a class="button primary" href="exam.html?examId=${encodeURIComponent(examId)}">試験を開始する</a>
        </div>
      `;
      return;
    }

    renderSummary(result);
    renderDetails(result, exam);
  }

  init().catch((error) => {
    summary.innerHTML = `<div class="empty-state"><h2>読み込みに失敗しました</h2><p>${error.message}</p></div>`;
  });
})();
