import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

function useUniqueStudentName() {
  const [name, setName] = useState(() => sessionStorage.getItem("studentName") || "");
  useEffect(() => { if (name) sessionStorage.setItem("studentName", name); }, [name]);
  return [name, setName];
}

export default function App() {
  // MAIN APP STATE
  const [userType, setUserType] = useState(null);
  const [studentName, setStudentName] = useUniqueStudentName();
  const [isNameSet, setIsNameSet] = useState(!!studentName);

  const [currentPoll, setCurrentPoll] = useState(null);
  const [pollResults, setPollResults] = useState(null);
  const [students, setStudents] = useState([]);
  const [pollHistory, setPollHistory] = useState([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isKicked, setIsKicked] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  const timerRef = useRef();
  const chatBottom = useRef();

  // SOCKET EVENT HANDLERS
  useEffect(() => {
    socket.on("current-poll", (poll) => { setCurrentPoll(poll); setHasAnswered(false); poll && poll.isActive && poll.duration && startTimer(poll.duration); });
    socket.on("new-poll", (poll) => { setCurrentPoll(poll); setPollResults(null); setHasAnswered(false); poll && poll.isActive && poll.duration && startTimer(poll.duration); });
    socket.on("poll-results", setPollResults);
    socket.on("poll-ended", (results) => { setPollResults(results); setCurrentPoll((p) => (p ? { ...p, isActive: false } : p)); setTimeLeft(0); if (timerRef.current) clearInterval(timerRef.current); });
    socket.on("students-list", setStudents);
    socket.on("poll-history", setPollHistory);
    socket.on("kicked-out", () => setIsKicked(true));
    socket.on("new-message", (msg) => setChatMessages((prev) => [...prev, msg]));
    socket.on("chat-history", setChatMessages);
    return () => socket.removeAllListeners();
    // eslint-disable-next-line
  }, []);

  function startTimer(seconds) {
    setTimeLeft(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    if (userType === "teacher") {
      socket.emit("join-as-teacher");
      socket.emit("get-chat-history");
    }
    if (userType === "student" && isNameSet) {
      socket.emit("join-as-student", studentName);
      socket.emit("get-chat-history");
    }
    // eslint-disable-next-line
  }, [userType, isNameSet, studentName]);

  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, showChat]);

  function handleSubmitAnswer(selectedOption) {
    socket.emit("submit-answer", { selectedOption });
    setHasAnswered(true);
  }
  function handleCreatePoll({ question, options, correctIndexes, duration }) {
    socket.emit("create-poll", { question, options, correctIndexes, duration });
  }
  function handleKickStudent(studentId) { socket.emit("kick-student", studentId); }
  function handleSendMessage() {
    if (!chatInput.trim()) return;
    socket.emit("send-message", { text: chatInput, isTeacher: userType === "teacher" });
    setChatInput("");
  }
  function handleUserTypeSelection(selectedType) {
    setUserType(selectedType);
  }

  // ---- FLOW CONTROL/ROUTING ----

  if (isKicked)
    return (
      <CenteredCard>
        <h2>You've been Kicked out!</h2>
        <p>
          Looks like the teacher has removed you from the poll system.<br />
          <button onClick={() => window.location.reload()}>Try Again</button>
        </p>
      </CenteredCard>
    );

  if (!userType)
    return (
      <UserTypeSelection onSelectType={handleUserTypeSelection} />
    );

  if (userType === "student" && !isNameSet)
    return (
      <CenteredCard>
        <h2>Let's Get Started</h2>
        <p>
          Please enter your name to join as student.<br />
          <small>(Name stays unique to this browser tab)</small>
        </p>
        <input
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          placeholder="Your name"
          style={{ marginTop: 10, marginBottom: 20, padding: 8, border: "1px solid #ccc", borderRadius: 8, width: "70%" }}
        />
        <br />
        <button
          onClick={() => studentName.trim() ? setIsNameSet(true) : null}
          disabled={!studentName.trim()}
          style={{
            background: "#8246e6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 26px"
          }}
        >Continue</button>
      </CenteredCard>
    );

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f8f8fa", minHeight: "100vh", padding: 24 }}>
      <Header userType={userType} studentName={studentName} />
      <div style={{ maxWidth: 700, margin: "auto" }}>
        {userType === "teacher" && (
          <TeacherDashboard
            currentPoll={currentPoll}
            pollResults={pollResults}
            students={students}
            pollHistory={pollHistory}
            onCreatePoll={handleCreatePoll}
            onKickStudent={handleKickStudent}
          />
        )}
        {userType === "student" && (
          <StudentDashboard
            currentPoll={currentPoll}
            pollResults={pollResults}
            timeLeft={timeLeft}
            hasAnswered={hasAnswered}
            onSubmitAnswer={handleSubmitAnswer}
          />
        )}
      </div>
<ChatPopup
  open={showChat}
  onOpen={() => setShowChat(true)}
  onClose={() => setShowChat(false)}
  messages={chatMessages}
  input={chatInput}
  setInput={setChatInput}
  onSend={handleSendMessage}
  userType={userType}
  chatBottom={chatBottom}
  students={students}
  onKickStudent={handleKickStudent}
/>


      <ChatFab onClick={() => setShowChat(true)} />
    </div>
  );
}

// --- NEW LANDING PAGE USING FIGMA DESIGN ---
function UserTypeSelection({ onSelectType }) {
  const [selectedType, setSelectedType] = useState(null);
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8fa"
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, boxShadow: "0px 4px 32px #6242a011",
        padding: "32px 35px", minWidth: 350, textAlign: "center"
      }}>
        <span style={{
          background: "#8246e6", color: "#fff", padding: "3px 15px", borderRadius: 16, fontSize: 13
        }}>
          Welcome
        </span>
        <h1 style={{ fontWeight: "bold", fontSize: 22, margin: "18px 0 10px" }}>
          Welcome to the <b>Live Polling System</b>
        </h1>
        <p style={{ color: "#666", marginBottom: 26 }}>
          Please select the role that best describes you to begin using the live polling system.
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          {/* Student */}
          <button
            type="button"
            style={{
              flex: 1,
              border: selectedType === "student" ? "2px solid #8246e6" : "2px solid #e5e0ee",
              background: selectedType === "student" ? "#f6f0ff" : "#fff",
              borderRadius: 12,
              padding: "18px 12px",
              textAlign: "left",
              transition: "all 0.15s"
            }}
            onClick={() => setSelectedType("student")}
          >
            <span style={{ fontWeight: "bold", fontSize: 15 }}>I'm a Student</span>
            <br />
            <span style={{ fontSize: 13, color: "#666" }}>Join to submit answers and view live poll results in real time.</span>
          </button>
          {/* Teacher */}
          <button
            type="button"
            style={{
              flex: 1,
              border: selectedType === "teacher" ? "2px solid #8246e6" : "2px solid #e5e0ee",
              background: selectedType === "teacher" ? "#f6f0ff" : "#fff",
              borderRadius: 12,
              padding: "18px 12px",
              textAlign: "left",
              transition: "all 0.15s"
            }}
            onClick={() => setSelectedType("teacher")}
          >
            <span style={{ fontWeight: "bold", fontSize: 15 }}>I'm a Teacher</span>
            <br />
            <span style={{ fontSize: 13, color: "#666" }}>Create and manage polls, view live poll results.</span>
          </button>
        </div>
        <button
          style={{
            width: "100%", marginTop: 5,
            background: selectedType ? "#8246e6" : "#c3b3d8",
            color: "#fff", padding: "11px 0", border: "none", borderRadius: 10, fontWeight: 600,
            fontSize: 16, cursor: selectedType ? "pointer" : "not-allowed"
          }}
          disabled={!selectedType}
          onClick={() => selectedType && onSelectType(selectedType)}
        >Continue</button>
      </div>
    </div>
  );
}

// ---------- rest is unchanged ----------

function Header({ userType, studentName }) {
  return (
    <div style={{ textAlign: "center", marginBottom: "1em" }}>
      <span style={{
        background: "#8246e6", color: "#fff",
        padding: "2px 12px", borderRadius: 16, fontSize: 13
      }}>
        {userType === "teacher" ? "Teacher" : "Student"}
      </span>
      <h1 style={{ fontWeight: "bold", fontSize: 24, margin: "14px 0" }}>
        {userType === "teacher"
          ? "Teacher Dashboard"
          : `Welcome, ${studentName}!`}
      </h1>
    </div>
  );
}

function StudentDashboard({ currentPoll, pollResults, timeLeft, hasAnswered, onSubmitAnswer }) {
  if (!currentPoll)
    return (
      <ResultCard>
        <h3>Wait for the teacher to ask questions..</h3>
      </ResultCard>
    );
  if (!currentPoll.isActive || hasAnswered || timeLeft === 0) {
    return (
      <ResultCard>
        <PollResults poll={currentPoll} results={pollResults} />
        <p style={{ color: "#888", marginTop: 30, textAlign: "center" }}>
          {currentPoll.isActive === false
            ? "Wait for the teacher to ask the next question."
            : (timeLeft === 0 ? "Time's up! See the results." : null)}
        </p>
      </ResultCard>
    );
  }
  return (
    <PollQuestion
      poll={currentPoll}
      timeLeft={timeLeft}
      onSubmitAnswer={onSubmitAnswer}
    />
  );
}

function TeacherDashboard({ currentPoll, pollResults, students, pollHistory, onCreatePoll, onKickStudent }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canCreate = (!currentPoll || !currentPoll.isActive ||
    students.length === 0 || students.every(s => s.hasAnswered));

  return (
    <div>
      {!showCreate && !showHistory && (
        <>
          <div style={{
            background: "#fff", borderRadius: 12, boxShadow: "0 0 4px #eee", padding: 24, marginBottom: 24
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <h2 style={{ margin: 0, fontWeight: 500 }}>Current Poll</h2>
              <div>
                <button onClick={() => setShowCreate(true)} disabled={!canCreate} style={{
                  marginRight: 8,
                  background: canCreate ? "#8246e6" : "#eee", color: "#fff",
                  border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 500
                }}>
                  + Ask a new question
                </button>
                <button onClick={() => setShowHistory(true)} style={{
                  background: "#e6e6f6", color: "#8246e6",
                  border: "none", borderRadius: 6, padding: "8px 18px"
                }}>
                  View Poll History
                </button>
              </div>
            </div>
            {currentPoll ? (
              <PollDisplay poll={currentPoll} results={pollResults} />
            ) : (
              <div style={{ textAlign: "center", color: "#bbb", marginTop: 40, marginBottom: 30 }}>
                <p>No active poll.<br /> Create one to get started!</p>
                <button style={{ background: "#8246e6", color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px" }}
                  onClick={() => setShowCreate(true)}>
                  Create Poll
                </button>
              </div>
            )}
          </div>
          <StudentsPanel students={students} onKick={onKickStudent} />
        </>
      )}
      {showCreate && (
        <CreatePollForm
          onSubmit={(data) => {
            onCreatePoll(data);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {showHistory && (
        <PollHistoryView history={pollHistory} onBack={() => setShowHistory(false)} />
      )}
    </div>
  );
}

function CreatePollForm({ onSubmit, onCancel }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndexes, setCorrectIndexes] = useState([]);
  const [duration, setDuration] = useState(60);

  function updateOption(i, value) {
    setOptions((opts) => opts.map((o, idx) => (i === idx ? value : o)));
    // Remove correctIndex if option text is cleared
    if (!value && correctIndexes.includes(i))
      setCorrectIndexes((idxs) => idxs.filter((ci) => ci !== i));
  }
  function handleSubmit() {
    const filteredOpts = options.filter((o) => o.trim());
    // Re-index correctIndexes relative to filtered options
    const realIndexes = correctIndexes
      .map((oldi) => options[oldi].trim() ? options.slice(0, oldi + 1).filter((o) => o.trim()).length - 1 : -1)
      .filter((idx) => idx !== -1);
    onSubmit({
      question: question.trim(),
      options: filteredOpts,
      correctIndexes: realIndexes,
      duration: Number(duration),
    });
    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrectIndexes([]);
    setDuration(60);
  }
  function toggleCorrect(i) {
    setCorrectIndexes((old) =>
      old.includes(i) ? old.filter((idx) => idx !== i) : [...old, i]
    );
  }
  return (
    <div style={{
      background: "#fff", borderRadius: 12, boxShadow: "0 0 4px #eee", padding: 24
    }}>
      <h3 style={{ fontWeight: 500 }}>Let's Get Started</h3>
      <label>
        <b>Enter your question</b><br />
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          maxLength={100}
          style={{ width: "100%", margin: "6px 0 12px 0", padding: 8, borderRadius: 6, border: "1px solid #e5e3ef" }}
          placeholder="Your question"
        />
      </label>
      <b>Poll Options</b><br />
      {options.map((o, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "4px 0" }}>
          <input
            type="text"
            value={o}
            onChange={e => updateOption(i, e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #e5e3ef" }}
            placeholder={`Option ${i + 1}${i < 2 ? "" : " (Optional)"}`}
          />
          <label style={{ marginLeft: 12, display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              disabled={!o.trim()}
              checked={correctIndexes.includes(i)}
              onChange={() => toggleCorrect(i)}
              style={{ accentColor: "#8246e6", marginRight: 4 }}
            />
            <span style={{ fontSize: 14, color: "#8246e6" }}>Correct</span>
          </label>
        </div>
      ))}
      <label>
        <b>Duration (seconds):</b>&nbsp;
        <input
          type="number"
          value={duration}
          min={10}
          max={180}
          onChange={e => setDuration(e.target.value)}
          style={{ width: 70, margin: "10px 0", borderRadius: 6, border: "1px solid #e5e3ef" }}
        />
      </label>
      <div style={{ marginTop: 10 }}>
        <button onClick={handleSubmit} disabled={!question.trim() || options.filter(x => x.trim()).length < 2 || correctIndexes.length < 1} style={{
          background: "#8246e6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", marginRight: 6
        }}>
          Ask Question
        </button>
        <button onClick={onCancel} style={{
          background: "#eee", color: "#333", border: "none", borderRadius: 8, padding: "8px 20px"
        }}>Cancel</button>
      </div>
      <div style={{ color: "#888", fontSize: 12, marginTop: 7 }}>
        {correctIndexes.length === 0 && "Please select the correct answer before submitting."}
      </div>
    </div>
  );
}

function StudentsPanel({ students, onKick }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 0 4px #eee", padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontWeight: 500 }}>Connected Students ({students.length})</h3>
      {students.length === 0
        ? <p style={{ color: "#abb" }}>No students connected yet.</p>
        : <ul style={{ paddingLeft: 0 }}>
          {students.map(s => (
            <li key={s.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div>
                <b>{s.name}</b>
                <span style={{
                  marginLeft: 12, fontSize: 13,
                  background: s.hasAnswered ? "#d5f7df" : "#f7efcf",
                  color: s.hasAnswered ? "#20844d" : "#cab02e",
                  borderRadius: 8, padding: "0 7px"
                }}>
                  {s.hasAnswered ? "Answered" : "Pending"}
                </span>
                {s.answer && <span style={{ fontSize: 12, color: "#888", marginLeft: 10 }}>• {s.answer}</span>}
              </div>
              <button style={{
                color: "#f14d43", background: "none", border: "none", fontWeight: 600, fontSize: 14
              }} onClick={() => onKick(s.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}

function PollQuestion({ poll, onSubmitAnswer, timeLeft }) {
  const [selected, setSelected] = useState("");
  return (
    <div style={{
      background: "#fff", borderRadius: 12, boxShadow: "0 0 4px #eee", padding: 24
    }}>
      <h3 style={{ fontWeight: 500 }}>Question</h3>
      <div style={{ background: "#222", color: "#fff", padding: 12, borderRadius: 6, margin: "12px 0" }}>
        {poll.question}
      </div>
      {poll.options.map(option => (
        <label key={option} style={{
          display: "flex", alignItems: "center", cursor: "pointer", marginBottom: 10, border: "1px solid #e9e6f3",
          borderRadius: 6, padding: "10px 10px", background: selected === option ? "#eee9fc" : "#fff"
        }}>
          <input
            type="radio"
            name="poll"
            value={option}
            checked={selected === option}
            onChange={() => setSelected(option)}
            style={{ marginRight: 15, accentColor: "#8246e6" }}
          />
          {option}
        </label>
      ))}
      <button
        onClick={() => onSubmitAnswer(selected)}
        disabled={!selected}
        style={{
          marginTop: 18,
          background: "#8246e6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 26px"
        }}>Submit</button>
      <p style={{ fontSize: 13, color: "#888", marginTop: 18 }}>Time left: {timeLeft}s</p>
    </div>
  );
}

function PollResults({ poll, results }) {
  if (!results || !results.responses)
    return <div style={{ color: "#aaa" }}>Waiting for results...</div>;
  const totalVotes = results.totalVotes || 0;
  return (
    <div>
      <h3>Results</h3>
      {results.responses.map(r => {
        const percent = totalVotes > 0 ? Math.round((r.count / totalVotes) * 100) : 0;
        return (
          <div key={r.option} style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <span>{r.option}</span>
              <span style={{ fontWeight: 600 }}>{percent}%</span>
            </div>
            <div style={{ background: "#e9e9f1", borderRadius: 5, height: 9, marginTop: 5 }}>
              <div style={{
                width: `${percent}%`, background: "#8246e6",
                height: 9, borderRadius: 5, transition: "width 0.3s"
              }}></div>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 13, color: "#888", marginTop: 18 }}>{totalVotes} responses</div>
    </div>
  );
}

function PollDisplay({ poll, results }) {
  return (
    <div>
      <div style={{ background: "#222", color: "#fff", borderRadius: 6, padding: 12, marginBottom: 12 }}>{poll.question}</div>
      <div style={{ fontSize: 13, color: "#888" }}>
        Status: <b>{poll.isActive ? "Active" : "Ended"}</b>
      </div>
      {results && <PollResults poll={poll} results={results} />}
    </div>
  );
}

function PollHistoryView({ history, onBack }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, boxShadow: "0 0 4px #eee", padding: 24
    }}>
      <h3 style={{ fontWeight: 500 }}>Poll History</h3>
      <button onClick={onBack} style={{ marginBottom: 12, background: "#eee", border: "none", borderRadius: 5, padding: "6px 14px" }}>← Back</button>
      {history.length === 0
        ? <p style={{ color: "#abb" }}>No poll history yet.</p>
        : history.map((poll, i) => (
          <div key={poll.id} style={{ marginBottom: 20, marginTop: 9 }}>
            <b>Q{i + 1}: {poll.question}</b>
            <PollResults poll={poll} results={{
              responses: poll.responses,
              totalVotes: poll.responses.reduce((sum, r) => sum + r.count, 0),
            }} />
          </div>
        ))}
    </div>
  );
}

// --- Chat Popup ---
function ChatPopup({
  open,
  onOpen,
  onClose,
  messages,
  input,
  setInput,
  onSend,
  userType,
  chatBottom,
  students,
  onKickStudent // pass kick callback here!
}) {
  const [tab, setTab] = useState('chat'); // 'chat' or 'participants'

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", right: 28, bottom: 90, width: 340, maxHeight: 462, zIndex: 100,
      background: "#fff", borderRadius: 12, boxShadow: "0 6px 40px #b3a5e780", border: "1px solid #eee",
      display: "flex", flexDirection: "column"
    }}>
      {/* Tab Switcher */}
      <div style={{ display: "flex", borderBottom: "1px solid #eee", fontWeight: 600 }}>
        <button
          onClick={() => setTab("chat")}
          style={{
            flex: 1,
            padding: "12px 0",
            border: "none",
            background: tab === "chat" ? "#f6f0ff" : "none",
            color: tab === "chat" ? "#8246e6" : "#333",
            cursor: "pointer",
            fontWeight: tab === "chat" ? 700 : 600,
            borderRadius: tab === "chat" ? "12px 12px 0 0" : "0"
          }}
        >Chat</button>
        <button
          onClick={() => setTab("participants")}
          style={{
            flex: 1,
            padding: "12px 0",
            border: "none",
            background: tab === "participants" ? "#f6f0ff" : "none",
            color: tab === "participants" ? "#8246e6" : "#333",
            cursor: "pointer",
            fontWeight: tab === "participants" ? 700 : 600,
            borderRadius: tab === "participants" ? "12px 12px 0 0" : "0"
          }}
        >Participants</button>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#999", fontSize: 21, marginLeft: "auto", marginRight: 10, marginTop: 3, cursor: "pointer"
        }}>×</button>
      </div>

      {/* Main content area */}
      <div style={{ padding: 12, overflowY: "auto", flex: 1, minHeight: 150 }}>
        {/* --- CHAT TAB --- */}
        {tab === "chat" && (
          <div>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", marginTop: 24 }}>No messages yet</div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} style={{
                  display: "block", background: msg.isTeacher ? "#f4ecff" : "#f7f7fb", padding: "6px 12px",
                  borderRadius: 6, marginBottom: 5, maxWidth: 234, marginLeft: msg.isTeacher ? "auto" : 0
                }}>
                  <b style={{ fontSize: 11, color: "#8765e9" }}>{msg.sender}</b>
                  <div style={{ fontSize: 13 }}>{msg.text}</div>
                </div>
              ))
            )}
            <div ref={chatBottom}></div>
          </div>
        )}
        {/* --- PARTICIPANTS TAB --- */}
        {tab === "participants" && (
          <div>
            {students.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", marginTop: 32 }}>No students connected</div>
            ) : (
              <div style={{ marginTop: 5 }}>
                {students.map(s => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 0", borderBottom: "1px solid #faf8fb", gap: 10
                  }}>
                    <div>
                      <b>{s.name}</b>
                      <span style={{
                        marginLeft: 10, fontSize: 12,
                        background: s.hasAnswered ? "#d5f7df" : "#f7efcf",
                        color: s.hasAnswered ? "#20844d" : "#cab02e",
                        borderRadius: 8, padding: "0 7px"
                      }}>
                        {s.hasAnswered ? "Answered" : "Pending"}
                      </span>
                    </div>
                    {userType === "teacher" && (
                      <button
                        onClick={() => onKickStudent(s.id)}
                        style={{
                          color: "#e64638", background: "none", border: "none", borderRadius: 8,
                          padding: "4px 13px", fontWeight: 500, fontSize: 14, cursor: "pointer"
                        }}>
                        Kick
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* --- Chat Input Only if on Chat --- */}
      {tab === "chat" && (
        <form
          style={{ display: "flex", borderTop: "1px solid #eee" }}
          onSubmit={e => { e.preventDefault(); onSend(); }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type..."
            style={{
              border: "none", flex: 1, padding: 12, outline: "none"
            }}
          />
          <button type="submit" style={{
            background: "#8246e6", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 6, fontWeight: 600
          }} disabled={!input.trim()}>Send</button>
        </form>
      )}
    </div>
  );
}


function ChatFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed", right: 30, bottom: 30, zIndex: 99,
        background: "#1050e9", borderRadius: "50%", color: "#fff",
        width: 62, height: 62, boxShadow: "0 2px 12px #6e3dc818",
        border: "none", fontSize: 27,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
      💬
    </button>
  );
}
function CenteredCard({ children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafe",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, boxShadow: "0px 4px 32px #6242a011",
        padding: "28px 40px", minWidth: 340, textAlign: "center", fontSize: 18
      }}>
        {children}
      </div>
    </div>
  );
}
function ResultCard({ children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, boxShadow: "0 0 4px #eee", padding: 24, marginTop: 24
    }}>{children}</div>
  );
}
