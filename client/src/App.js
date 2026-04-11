import React, { useState, useEffect } from "react";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL;

function App() {
  const [exams, setExams] = useState([]);
  const [sourceText, setSourceText] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeExam, setActiveExam] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [explanations, setExplanations] = useState({});
  const [loadingExplanation, setLoadingExplanation] = useState(null);
  const [view, setView] = useState("create"); // create, exam, history

  useEffect(() => { fetchExams(); }, []);

  useEffect(() => {
    if (!activeExam || activeExam.status !== "generating") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER_URL}/exams/${activeExam.id}`);
        const data = await res.json();
        if (data.status === "ready") {
          setActiveExam(data);
          fetchExams();
          clearInterval(interval);
        } else if (data.status === "error") {
          setActiveExam(data);
          clearInterval(interval);
        }
      } catch (e) { console.error("폴링 오류:", e); }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeExam]);

  const fetchExams = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/exams`);
      const data = await res.json();
      if (Array.isArray(data)) setExams(data);
    } catch (e) { console.error("시험 목록 조회 오류:", e); }
  };

  const generateExam = async () => {
    if (!sourceText.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`${SERVER_URL}/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sourceText, questionCount }),
      });
      const data = await res.json();
      if (data.id) {
        setActiveExam({ id: data.id, status: "generating" });
        setSourceText("");
        setUserAnswers({});
        setSubmitted(false);
        setExplanations({});
        setView("exam");
      }
    } catch (e) { console.error("시험 생성 오류:", e); }
    finally { setIsGenerating(false); }
  };

  const deleteExam = async (id) => {
    try {
      await fetch(`${SERVER_URL}/exams/${id}`, { method: "DELETE" });
      if (activeExam?.id === id) {
        setActiveExam(null);
        setUserAnswers({});
        setSubmitted(false);
        setExplanations({});
        setView("create");
      }
      await fetchExams();
    } catch (e) { console.error("시험 삭제 오류:", e); }
  };

  const deleteAllExams = async () => {
    if (!window.confirm("모든 시험 기록을 삭제하시겠습니까?")) return;
    try {
      await fetch(`${SERVER_URL}/exams`, { method: "DELETE" });
      setActiveExam(null);
      setUserAnswers({});
      setSubmitted(false);
      setExplanations({});
      setView("create");
      await fetchExams();
    } catch (e) { console.error("전체 삭제 오류:", e); }
  };

  const selectAnswer = (qi, oi) => {
    if (submitted) return;
    setUserAnswers((prev) => ({ ...prev, [qi]: oi }));
  };

  const submitExam = () => setSubmitted(true);

  const loadExam = (exam) => {
    setActiveExam(exam);
    setUserAnswers({});
    setSubmitted(false);
    setExplanations({});
    setView("exam");
  };

  const requestExplanation = async (qi) => {
    if (!activeExam || loadingExplanation !== null) return;
    const questions = typeof activeExam.questions === "string"
      ? JSON.parse(activeExam.questions) : activeExam.questions;
    const q = questions[qi];
    setLoadingExplanation(qi);
    try {
      const res = await fetch(`${SERVER_URL}/exams/${activeExam.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.question, options: q.options, answer: q.answer, questionIndex: qi }),
      });
      const data = await res.json();
      setExplanations((prev) => ({ ...prev, [qi]: data.explanation }));
    } catch (e) { console.error("해석 요청 오류:", e); }
    finally { setLoadingExplanation(null); }
  };

  const getQuestions = () => {
    if (!activeExam?.questions) return [];
    try {
      return typeof activeExam.questions === "string"
        ? JSON.parse(activeExam.questions) : activeExam.questions;
    } catch { return []; }
  };

  const getScore = () => {
    const qs = getQuestions();
    let correct = 0;
    qs.forEach((q, i) => { if (userAnswers[i] === q.answer) correct++; });
    return { correct, total: qs.length };
  };

  const questions = getQuestions();
  const score = submitted ? getScore() : null;
  const readyExams = exams.filter(e => e.status === "ready");

  return (
    <div className="layout">
      {/* 사이드바 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>시험 생성기</h1>
          <p className="sidebar-subtitle">AI 기반 모의시험</p>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === "create" ? "active" : ""}`}
            onClick={() => setView("create")}
          >
            <span className="nav-icon">✏️</span>
            새 시험 만들기
          </button>
          <button
            className={`nav-item ${view === "exam" ? "active" : ""}`}
            onClick={() => setView("exam")}
            disabled={!activeExam}
          >
            <span className="nav-icon">📄</span>
            현재 시험
          </button>
          <button
            className={`nav-item ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
          >
            <span className="nav-icon">📋</span>
            시험 기록
            {readyExams.length > 0 && (
              <span className="nav-badge">{readyExams.length}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="stat-card">
            <span className="stat-number">{readyExams.length}</span>
            <span className="stat-label">완료된 시험</span>
          </div>
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="main-content">
        {/* 새 시험 만들기 */}
        {view === "create" && (
          <div className="panel">
            <div className="panel-header">
              <h2>새 시험 만들기</h2>
              <p className="panel-desc">학습 내용을 입력하면 AI가 객관식 문제를 생성합니다</p>
            </div>
            <div className="panel-body">
              <label className="field-label" htmlFor="source-text">학습 내용</label>
              <textarea
                id="source-text"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="시험으로 만들 학습 내용을 붙여넣으세요..."
                className="text-input"
              />
              <div className="form-row">
                <div className="form-group">
                  <label className="field-label" htmlFor="q-count">문제 수</label>
                  <select
                    id="q-count"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="select-input"
                  >
                    <option value={3}>3문제</option>
                    <option value={5}>5문제</option>
                    <option value={10}>10문제</option>
                  </select>
                </div>
                <button
                  onClick={generateExam}
                  disabled={isGenerating || !sourceText.trim()}
                  className="btn btn-primary btn-lg"
                >
                  {isGenerating ? "생성 중..." : "시험 생성하기"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 현재 시험 */}
        {view === "exam" && (
          <div className="panel">
            {activeExam && activeExam.status === "generating" && (
              <div className="state-message">
                <div className="spinner" role="status" aria-label="문제 생성 중"></div>
                <h3>AI가 문제를 생성하고 있습니다</h3>
                <p className="state-sub">잠시만 기다려주세요. 보통 10~20초 정도 걸립니다.</p>
              </div>
            )}

            {activeExam && activeExam.status === "error" && (
              <div className="state-message error">
                <h3>문제 생성에 실패했습니다</h3>
                <p className="state-sub">다시 시도해주세요.</p>
                <button className="btn btn-primary" onClick={() => setView("create")}>
                  돌아가기
                </button>
              </div>
            )}

            {!activeExam && (
              <div className="state-message">
                <h3>진행 중인 시험이 없습니다</h3>
                <p className="state-sub">새 시험을 만들거나, 기록에서 이전 시험을 불러오세요.</p>
                <button className="btn btn-primary" onClick={() => setView("create")}>
                  시험 만들기
                </button>
              </div>
            )}

            {activeExam && activeExam.status === "ready" && questions.length > 0 && (
              <>
                <div className="panel-header">
                  <h2>시험 진행</h2>
                  {!submitted && (
                    <p className="panel-desc">
                      {Object.keys(userAnswers).length} / {questions.length} 문제 선택됨
                    </p>
                  )}
                </div>

                {submitted && score && (
                  <div className="score-banner">
                    <div className="score-main">
                      <span className="score-number">{Math.round((score.correct / score.total) * 100)}</span>
                      <span className="score-unit">점</span>
                    </div>
                    <p className="score-detail">{score.total}문제 중 {score.correct}문제 정답</p>
                  </div>
                )}

                <div className="questions-list">
                  {questions.map((q, qi) => {
                    const ua = userAnswers[qi];
                    const isCorrect = submitted && ua === q.answer;
                    const isWrong = submitted && ua !== undefined && ua !== q.answer;
                    return (
                      <div key={qi} className={`q-card ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}>
                        <div className="q-header">
                          <span className="q-num">{qi + 1}</span>
                          <h3 className="q-text">{q.question}</h3>
                        </div>
                        <div className="q-options">
                          {q.options.map((opt, oi) => (
                            <button
                              key={oi}
                              className={`opt-btn ${ua === oi ? "selected" : ""} ${
                                submitted && oi === q.answer ? "correct-answer" : ""
                              } ${submitted && ua === oi && oi !== q.answer ? "wrong-answer" : ""}`}
                              onClick={() => selectAnswer(qi, oi)}
                              disabled={submitted}
                            >
                              <span className="opt-num">{oi + 1}</span>
                              <span className="opt-text">{opt}</span>
                            </button>
                          ))}
                        </div>
                        {submitted && (
                          <div className="explain-area">
                            {explanations[qi] ? (
                              <div className="explain-box">
                                <div className="explain-title">AI 해석</div>
                                {explanations[qi].split('\n').map((line, i) => (
                                  <p key={i} className="explain-line">{line}</p>
                                ))}
                              </div>
                            ) : (
                              <button
                                onClick={() => requestExplanation(qi)}
                                className="btn btn-ghost"
                                disabled={loadingExplanation !== null}
                              >
                                {loadingExplanation === qi ? "해석 불러오는 중..." : "AI 해석 보기"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!submitted && (
                  <button
                    onClick={submitExam}
                    className="btn btn-primary btn-block"
                    disabled={Object.keys(userAnswers).length !== questions.length}
                  >
                    {Object.keys(userAnswers).length !== questions.length
                      ? `답안 제출 (${Object.keys(userAnswers).length}/${questions.length})`
                      : "답안 제출하기"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* 시험 기록 */}
        {view === "history" && (
          <div className="panel">
            <div className="panel-header">
              <h2>시험 기록</h2>
              {exams.length > 0 && (
                <button onClick={deleteAllExams} className="btn btn-danger btn-sm">
                  전체 삭제
                </button>
              )}
            </div>
            {exams.length === 0 ? (
              <div className="state-message">
                <h3>아직 시험 기록이 없습니다</h3>
                <p className="state-sub">새 시험을 만들어보세요.</p>
                <button className="btn btn-primary" onClick={() => setView("create")}>
                  시험 만들기
                </button>
              </div>
            ) : (
              <div className="history-list">
                {exams.map((exam) => (
                  <div key={exam.id} className="history-item">
                    <div className="history-info">
                      <span className={`badge ${exam.status}`}>
                        {exam.status === "ready" ? "완료" : exam.status === "generating" ? "생성 중" : "오류"}
                      </span>
                      <p className="history-preview">{exam.source_text?.substring(0, 100)}...</p>
                      <small className="history-date">
                        {new Date(exam.created_at).toLocaleString("ko-KR")}
                      </small>
                    </div>
                    <div className="history-actions">
                      {exam.status === "ready" && (
                        <button onClick={() => loadExam(exam)} className="btn btn-secondary btn-sm">
                          시험 보기
                        </button>
                      )}
                      <button onClick={() => deleteExam(exam.id)} className="btn btn-danger btn-sm">
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
