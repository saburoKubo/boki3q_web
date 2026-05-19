(function () {
  const APP_PREFIX = "boki3_mock";
  const DEFAULT_EXAM_ID = "mock_001";
  const ACCESS_CODE = "boki3plus2026";
  const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const ACCESS_KEY = `${APP_PREFIX}:access`;

  function authState() {
    return readJson(ACCESS_KEY, null);
  }

  function hasValidAccess() {
    const state = authState();
    return Boolean(state?.expiresAt && Number(state.expiresAt) > Date.now());
  }

  function grantAccess() {
    writeJson(ACCESS_KEY, {
      grantedAt: Date.now(),
      expiresAt: Date.now() + ACCESS_TTL_MS
    });
  }

  function nextUrl() {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    if (!next || next.includes(":") || next.startsWith("/") || next.startsWith("//")) return "index.html";
    return next;
  }

  function unlockPage() {
    document.body.classList.remove("auth-pending");
  }

  function renderAccessGate() {
    const gate = document.createElement("main");
    gate.className = "access-gate";
    gate.innerHTML = `
      <section class="access-card" aria-labelledby="access-title">
        <p class="eyebrow">有料版ユーザー向け</p>
        <h1 id="access-title">簿記3級 補完サイト</h1>
        <p>アプリ有料版に記載されているパスコードを入力してください。認証後は30日間この端末に保存されます。</p>
        <form id="access-form" class="access-form">
          <label class="field">
            <span>パスコード</span>
            <input id="access-code" type="password" autocomplete="current-password" inputmode="text" required>
          </label>
          <label class="access-toggle">
            <input id="access-code-visible" type="checkbox">
            <span>パスコードを表示する</span>
          </label>
          <p id="access-error" class="access-error" role="alert" hidden>パスコードが違います。</p>
          <button class="button primary" type="submit">開く</button>
        </form>
      </section>
    `;
    document.body.prepend(gate);

    const form = gate.querySelector("#access-form");
    const input = gate.querySelector("#access-code");
    const visibleToggle = gate.querySelector("#access-code-visible");
    const error = gate.querySelector("#access-error");
    visibleToggle.addEventListener("change", () => {
      input.type = visibleToggle.checked ? "text" : "password";
      input.focus();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (normalizeText(input.value) === ACCESS_CODE) {
        grantAccess();
        location.href = nextUrl();
        return;
      }
      error.hidden = false;
      input.select();
      input.focus();
    });
    input.focus();
  }

  function requireAccess() {
    if (!document.body.classList.contains("auth-pending")) return;
    if (hasValidAccess()) {
      unlockPage();
      return;
    }

    const path = location.pathname.split("/").pop() || "index.html";
    if (path !== "index.html") {
      const current = `${path}${location.search}${location.hash}`;
      location.replace(`index.html?next=${encodeURIComponent(current)}`);
      return;
    }
    renderAccessGate();
  }

  function storageKey(name, examId = DEFAULT_EXAM_ID) {
    return `${APP_PREFIX}:${examId}:${name}`;
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("localStorage parse error", error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function loadExam(examId = DEFAULT_EXAM_ID) {
    const response = await fetch(`data/${examId}.json`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`問題データを読み込めませんでした: ${examId}`);
    }
    return response.json();
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatYen(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toLocaleString("ja-JP");
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeNumber(value) {
    const normalized = String(value || "").replace(/[,\s￥¥]/g, "");
    if (normalized === "") return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }



  const AMOUNT_KEYPAD_QUERY = "(max-width: 760px), (pointer: coarse)";
  const AMOUNT_EXPR_MAX_LEN = 48;
  let activeAmountInput = null;
  let amountKeypad = null;
  let amountKeypadDisplay = null;
  let amountKeypadExpression = "";

  function formatAmountText(value) {
    const normalized = String(value || "").replace(/[^0-9]/g, "");
    if (normalized === "") return "";
    return Number(normalized).toLocaleString("ja-JP");
  }

  function rawAmountDigits(value) {
    return String(value || "").replace(/[^0-9]/g, "");
  }

  function normalizeAmountExpression(expr) {
    return String(expr || "")
      .replace(/[,\s]/g, "")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-");
  }

  function formatAmountExpressionDisplay(expr) {
    const normalized = normalizeAmountExpression(expr);
    if (normalized === "") return "0";
    return normalized
      .replace(/\//g, "÷")
      .replace(/\*/g, "×")
      .replace(/-/g, "−");
  }

  function evaluateAmountExpression(expr) {
    const normalized = normalizeAmountExpression(expr);
    if (normalized === "") return null;
    if (!/^[\d+\-*/().]+$/.test(normalized)) return null;
    if (/[+\-*/.]{2,}/.test(normalized)) return null;
    try {
      const value = Function(`"use strict"; return (${normalized})`)();
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return Math.round(value);
    } catch {
      return null;
    }
  }

  function updateAmountKeypadDisplay() {
    if (!amountKeypadDisplay) return;
    amountKeypadDisplay.textContent = formatAmountExpressionDisplay(amountKeypadExpression);
  }

  function setAmountKeypadExpression(expr) {
    amountKeypadExpression = String(expr || "").slice(0, AMOUNT_EXPR_MAX_LEN);
    updateAmountKeypadDisplay();
  }

  function splitAmountExpressionTail(expr) {
    let lastOpAt = -1;
    for (const op of ["+", "-", "*", "/"]) {
      const index = expr.lastIndexOf(op);
      if (index > lastOpAt) lastOpAt = index;
    }
    if (lastOpAt < 0) {
      return { prefix: "", tail: expr };
    }
    return {
      prefix: expr.slice(0, lastOpAt + 1),
      tail: expr.slice(lastOpAt + 1),
    };
  }

  function appendAmountKeypadDigit(key) {
    const expr = normalizeAmountExpression(amountKeypadExpression);
    const { prefix, tail: currentTail } = splitAmountExpressionTail(expr);
    let tail = currentTail;

    if (key === "00") {
      tail = tail === "" || tail === "0" ? "0" : tail + "00";
    } else if (tail === "" || tail === "0") {
      tail = key;
    } else {
      tail += key;
    }

    if (tail.length > 1 && tail.startsWith("0")) {
      tail = String(Number(tail));
    }

    setAmountKeypadExpression(prefix + tail);
  }

  function appendAmountKeypadOperator(op) {
    let expr = normalizeAmountExpression(amountKeypadExpression);
    if (expr === "") return;
    if (/[+\-*/]$/.test(expr)) {
      expr = expr.slice(0, -1) + op;
    } else {
      expr += op;
    }
    setAmountKeypadExpression(expr);
  }

  function commitAmountKeypadExpression(input, notify = true) {
    const evaluated = evaluateAmountExpression(amountKeypadExpression);
    const rawDigits =
      evaluated === null
        ? rawAmountDigits(amountKeypadExpression)
        : String(Math.max(0, evaluated));
    const formatted = formatAmountText(rawDigits);
    input.value = formatted;
    setAmountKeypadExpression(rawDigits || "");
    if (notify) input.dispatchEvent(new Event("input", { bubbles: true }));
    return formatted;
  }

  function setAmountInputValue(input, rawDigits, notify = true) {
    const formatted = formatAmountText(rawDigits);
    input.value = formatted;
    if (amountKeypadDisplay && activeAmountInput === input) {
      setAmountKeypadExpression(rawDigits || "");
    }
    if (notify) input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function syncAmountInputMode(input) {
    input.inputMode = isMobileAmountInputMode() ? "none" : "numeric";
  }

  function isMobileAmountInputMode() {
    return window.matchMedia(AMOUNT_KEYPAD_QUERY).matches;
  }

  function amountDigitButton(key) {
    return `<button type="button" data-amount-key="${key}">${key}</button>`;
  }

  function amountOperatorButton(op, label) {
    return `<button type="button" data-amount-op="${op}" aria-label="${label}">${label}</button>`;
  }

  function ensureAmountKeypad() {
    if (amountKeypad) return amountKeypad;
    amountKeypad = document.createElement("div");
    amountKeypad.className = "amount-keypad";
    amountKeypad.hidden = true;
    amountKeypad.innerHTML = `
      <div class="amount-keypad__panel" role="dialog" aria-label="金額入力（電卓）">
        <div class="amount-keypad__display" aria-live="polite">0</div>
        <div class="amount-keypad__keys amount-keypad__keys--calc">
          ${["7", "8", "9"].map(amountDigitButton).join("")}
          ${amountOperatorButton("/", "÷")}
          ${["4", "5", "6"].map(amountDigitButton).join("")}
          ${amountOperatorButton("*", "×")}
          ${["1", "2", "3"].map(amountDigitButton).join("")}
          ${amountOperatorButton("-", "−")}
          ${amountDigitButton("0")}
          ${amountDigitButton("00")}
          <button type="button" data-amount-action="backspace" aria-label="1文字削除">⌫</button>
          ${amountOperatorButton("+", "+")}
          <button type="button" data-amount-action="equals" aria-label="計算">=</button>
          <button type="button" data-amount-action="clear">C</button>
          <button type="button" data-amount-action="done" class="amount-keypad__done">完了</button>
        </div>
      </div>
    `;

    amountKeypadDisplay = amountKeypad.querySelector(".amount-keypad__display");
    amountKeypad.addEventListener("pointerdown", (event) => event.preventDefault());
    amountKeypad.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !activeAmountInput) return;
      const key = button.dataset.amountKey;
      const op = button.dataset.amountOp;
      const action = button.dataset.amountAction;

      if (key) {
        appendAmountKeypadDigit(key);
        activeAmountInput.focus({ preventScroll: true });
        return;
      }
      if (op) {
        appendAmountKeypadOperator(op);
        activeAmountInput.focus({ preventScroll: true });
        return;
      }
      if (action === "backspace") {
        const expr = normalizeAmountExpression(amountKeypadExpression);
        setAmountKeypadExpression(expr.slice(0, -1));
        activeAmountInput.focus({ preventScroll: true });
        return;
      }
      if (action === "clear") {
        setAmountKeypadExpression("");
        activeAmountInput.focus({ preventScroll: true });
        return;
      }
      if (action === "equals") {
        const evaluated = evaluateAmountExpression(amountKeypadExpression);
        if (evaluated !== null) {
          setAmountKeypadExpression(String(Math.max(0, evaluated)));
        }
        activeAmountInput.focus({ preventScroll: true });
        return;
      }
      if (action === "done") {
        commitAmountKeypadExpression(activeAmountInput);
        hideAmountKeypad();
      }
    });
    document.body.appendChild(amountKeypad);
    return amountKeypad;
  }

  function showAmountKeypad(input) {
    activeAmountInput = input;
    const keypad = ensureAmountKeypad();
    document.body.classList.add("amount-keypad-open");
    setAmountKeypadExpression(rawAmountDigits(input.value) || "");
    keypad.hidden = false;
  }

  function hideAmountKeypad() {
    if (!amountKeypad) return;
    amountKeypad.hidden = true;
    document.body.classList.remove("amount-keypad-open");
    activeAmountInput = null;
    amountKeypadExpression = "";
  }

  function bindAmountInput(input, onValue) {
    input.classList.add("amount-input");
    input.autocomplete = "off";
    syncAmountInputMode(input);
    input.value = formatAmountText(input.value);

    input.addEventListener("focus", () => {
      const mobileMode = isMobileAmountInputMode();
      syncAmountInputMode(input);
      input.readOnly = mobileMode;
      if (mobileMode) {
        showAmountKeypad(input);
      } else {
        setAmountInputValue(input, input.value, false);
      }
    });
    input.addEventListener("input", () => {
      if (isMobileAmountInputMode()) return;
      setAmountInputValue(input, input.value, false);
      onValue?.(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (!isMobileAmountInputMode()) return;
      if (event.key.length === 1 && /[\d+\-*/.=]/.test(event.key)) {
        event.preventDefault();
        if (/\d/.test(event.key)) {
          appendAmountKeypadDigit(event.key);
        } else if (event.key === "=" || event.key === "Enter") {
          const evaluated = evaluateAmountExpression(amountKeypadExpression);
          if (evaluated !== null) {
            setAmountKeypadExpression(String(Math.max(0, evaluated)));
          }
        } else if ("+-*/".includes(event.key)) {
          appendAmountKeypadOperator(event.key);
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitAmountKeypadExpression(input);
        hideAmountKeypad();
      }
    });
    input.addEventListener("blur", () => {
      if (isMobileAmountInputMode() && activeAmountInput === input && amountKeypadExpression) {
        commitAmountKeypadExpression(input, false);
      } else {
        setAmountInputValue(input, input.value, false);
      }
      input.readOnly = false;
      syncAmountInputMode(input);
      setTimeout(() => {
        if (!amountKeypad?.contains(document.activeElement)) hideAmountKeypad();
      }, 0);
      onValue?.(input.value);
    });
  }


  function isNumberAnswerCorrect(actual, expected) {
    return normalizeNumber(actual) === Number(expected);
  }

  function isTextAnswerCorrect(actual, expected) {
    return normalizeText(actual) === normalizeText(expected);
  }

  function scoreJournal(question, answer) {
    const correct = question.correctAnswer;
    const userAnswer = {
      debitAccount: answer?.debitAccount || "",
      creditAccount: answer?.creditAccount || "",
      amount: normalizeNumber(answer?.amount)
    };
    const isCorrect =
      isTextAnswerCorrect(userAnswer.debitAccount, correct.debitAccount) &&
      isTextAnswerCorrect(userAnswer.creditAccount, correct.creditAccount) &&
      userAnswer.amount === Number(correct.amount);

    return {
      score: isCorrect ? question.score : 0,
      maxScore: question.score,
      isCorrect,
      userAnswer,
      detail: isCorrect ? "正解" : `正答: 借方 ${correct.debitAccount} / 貸方 ${correct.creditAccount} / ${formatYen(correct.amount)}円`
    };
  }


  function normalizeJournalLines(lines = []) {
    return lines
      .map((line) => ({
        debitAccount: normalizeText(line.debitAccount),
        debitAmount: normalizeNumber(line.debitAmount),
        creditAccount: normalizeText(line.creditAccount),
        creditAmount: normalizeNumber(line.creditAmount)
      }))
      .filter((line) => line.debitAccount || line.debitAmount !== null || line.creditAccount || line.creditAmount !== null);
  }

  function sideEntries(lines, side) {
    const accountKey = side === "debit" ? "debitAccount" : "creditAccount";
    const amountKey = side === "debit" ? "debitAmount" : "creditAmount";
    return lines
      .filter((line) => line[accountKey] || line[amountKey] !== null)
      .map((line) => ({ account: line[accountKey], amount: line[amountKey] }))
      .sort((a, b) => String(a.account + ":" + a.amount).localeCompare(String(b.account + ":" + b.amount), "ja"));
  }

  function sameEntries(actual, expected) {
    if (actual.length !== expected.length) return false;
    return actual.every((entry, index) => entry.account === expected[index].account && entry.amount === expected[index].amount);
  }

  function formatJournalLines(lines) {
    if (!lines || lines.length === 0) return "未回答";
    return lines.map((line) => {
      const debit = line.debitAccount ? "借方 " + line.debitAccount + " " + formatYen(line.debitAmount) + "円" : "";
      const credit = line.creditAccount ? "貸方 " + line.creditAccount + " " + formatYen(line.creditAmount) + "円" : "";
      return [debit, credit].filter(Boolean).join(" / ");
    }).join("、");
  }

  function scoreJournalMulti(question, answer) {
    const userAnswer = { lines: normalizeJournalLines(answer?.lines || []) };
    const correctLines = normalizeJournalLines(question.correctAnswer.lines || []);
    const actualDebits = sideEntries(userAnswer.lines, "debit");
    const actualCredits = sideEntries(userAnswer.lines, "credit");
    const correctDebits = sideEntries(correctLines, "debit");
    const correctCredits = sideEntries(correctLines, "credit");
    const isCorrect = sameEntries(actualDebits, correctDebits) && sameEntries(actualCredits, correctCredits);

    return {
      score: isCorrect ? question.score : 0,
      maxScore: question.score,
      isCorrect,
      userAnswer,
      detail: isCorrect ? "正解" : "正答: " + formatJournalLines(correctLines)
    };
  }

  function scoreTerm(question, answer) {
    const userAnswer = normalizeText(answer);
    const isCorrect = isTextAnswerCorrect(userAnswer, question.correctAnswer);
    return {
      score: isCorrect ? question.score : 0,
      maxScore: question.score,
      isCorrect,
      userAnswer,
      detail: isCorrect ? "正解" : `正答: ${question.correctAnswer}`
    };
  }

  function scoreFields(question, answer) {
    const fieldResults = question.fields.map((field) => {
      const actual = answer?.[field.id];
      const expected = field.correctAnswer;
      const correct =
        field.inputType === "select"
          ? isTextAnswerCorrect(actual, expected)
          : isNumberAnswerCorrect(actual, expected);

      return {
        id: field.id,
        label: field.label,
        score: correct ? field.score : 0,
        maxScore: field.score,
        isCorrect: correct,
        userAnswer: field.inputType === "select" ? normalizeText(actual) : normalizeNumber(actual),
        correctAnswer: expected
      };
    });

    const score = fieldResults.reduce((sum, result) => sum + result.score, 0);
    const maxScore = fieldResults.reduce((sum, result) => sum + result.maxScore, 0);

    return {
      score,
      maxScore,
      isCorrect: score === maxScore,
      detail: fieldResults
        .filter((result) => !result.isCorrect)
        .map((result) => `${result.label}: ${typeof result.correctAnswer === "number" ? formatYen(result.correctAnswer) + "円" : result.correctAnswer}`)
        .join(" / ") || "正解",
      fieldResults
    };
  }

  function scoreQuestion(question, answer) {
    switch (question.type) {
      case "journal_dropdown":
        return scoreJournal(question, answer);
      case "journal_dropdown_multi":
        return scoreJournalMulti(question, answer);
      case "term_fill":
        return scoreTerm(question, answer);
      case "account_fill":
      case "financial_statement_fill":
        return scoreFields(question, answer || {});
      default:
        return {
          score: 0,
          maxScore: question.score,
          isCorrect: false,
          detail: "未対応の問題タイプです。"
        };
    }
  }

  function gradeExam(exam, answers) {
    const sections = exam.sections.map((section) => {
      const questions = section.questions.map((question) => {
        const result = scoreQuestion(question, answers?.[question.id]);
        return {
          id: question.id,
          title: question.title || question.question,
          type: question.type,
          score: result.score,
          maxScore: result.maxScore,
          isCorrect: result.isCorrect,
          detail: result.detail,
          explanation: question.explanation,
          userAnswer: result.userAnswer,
          correctAnswer: question.correctAnswer,
          fieldResults: result.fieldResults || []
        };
      });
      const score = questions.reduce((sum, question) => sum + question.score, 0);
      const maxScore = questions.reduce((sum, question) => sum + question.maxScore, 0);
      return {
        sectionId: section.sectionId,
        title: section.title,
        score,
        maxScore,
        questions
      };
    });

    const totalScore = sections.reduce((sum, section) => sum + section.score, 0);
    const maxScore = sections.reduce((sum, section) => sum + section.maxScore, 0);

    return {
      examId: exam.examId,
      title: exam.title,
      totalScore,
      maxScore,
      passScore: exam.passScore,
      passed: totalScore >= exam.passScore,
      submittedAt: new Date().toISOString(),
      sections
    };
  }

  function getSession(examId = DEFAULT_EXAM_ID) {
    return readJson(storageKey("session", examId), null);
  }

  function saveSession(examId, session) {
    writeJson(storageKey("session", examId), session);
    localStorage.setItem(`${APP_PREFIX}:currentExamId`, examId);
  }

  function getResult(examId = DEFAULT_EXAM_ID) {
    return readJson(storageKey("result", examId), null);
  }

  function saveResult(examId, result) {
    writeJson(storageKey("result", examId), result);
    localStorage.setItem(`${APP_PREFIX}:currentExamId`, examId);
  }

  function clearSession(examId = DEFAULT_EXAM_ID) {
    localStorage.removeItem(storageKey("session", examId));
  }

  function getExamIdFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get("examId") || localStorage.getItem(`${APP_PREFIX}:currentExamId`) || DEFAULT_EXAM_ID;
  }

  window.BokiMock = {
    DEFAULT_EXAM_ID,
    storageKey,
    readJson,
    writeJson,
    loadExam,
    formatTime,
    formatYen,
    formatAmountText,
    bindAmountInput,
    normalizeText,
    normalizeNumber,
    gradeExam,
    getSession,
    saveSession,
    getResult,
    saveResult,
    clearSession,
    getExamIdFromUrl,
    hasValidAccess
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", requireAccess, { once: true });
  } else {
    requireAccess();
  }
})();
