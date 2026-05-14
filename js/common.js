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
