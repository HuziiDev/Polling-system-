const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // for simplicity; on prod: use your deployed frontend URL
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// === In-Memory DB ===
let currentPoll = null;
let students = new Map(); // key: socket.id, value: studentObj
let pollHistory = [];
let chatMessages = [];

// === Socket.io Logic ===
io.on('connection', (socket) => {
  // --- Teacher ---
  socket.on('join-as-teacher', () => {
    socket.join('teachers');
    socket.emit('current-poll', currentPoll);
    socket.emit('students-list', Array.from(students.values()));
    socket.emit('poll-history', pollHistory);
  });

  // --- Student ---
  socket.on('join-as-student', (studentName) => {
    const studentObj = {
      id: socket.id,
      name: studentName,
      hasAnswered: false,
      answer: null,
      joinedAt: new Date(),
    };
    students.set(socket.id, studentObj);
    socket.join('students');
    io.to('teachers').emit('student-joined', studentObj);
    io.to('teachers').emit('students-list', Array.from(students.values()));
    socket.emit('current-poll', currentPoll);
  });

  // --- Handle Create Poll ---
  socket.on('create-poll', (pollData) => {
    // Reset all students' status
    students.forEach(s => {
      s.hasAnswered = false;
      s.answer = null;
    });
    currentPoll = {
      id: Date.now(),
      question: pollData.question,
      options: pollData.options,
      correctIndexes: pollData.correctIndexes || [],
      duration: pollData.duration || 60,
      isActive: true,
      responses: pollData.options.map(option => ({
        option,
        count: 0,
        voters: []
      })),
      createdAt: new Date(),
    };
    io.emit('new-poll', currentPoll);

    // End poll after duration
    setTimeout(() => {
      if (currentPoll && currentPoll.isActive) {
        endCurrentPoll();
      }
    }, currentPoll.duration * 1000);
  });

  // --- Answer Submit ---
  socket.on('submit-answer', ({ selectedOption }) => {
    if (!currentPoll || !currentPoll.isActive) {
      socket.emit('poll-error', 'No active poll');
      return;
    }
    const student = students.get(socket.id);
    if (!student) return;
    if (student.hasAnswered) {
      socket.emit('poll-error', 'Already answered');
      return;
    }
    // Mark as answered
    student.hasAnswered = true;
    student.answer = selectedOption;

    const i = currentPoll.responses.findIndex(opt => opt.option === selectedOption);
    if (i !== -1) {
      currentPoll.responses[i].count++;
      currentPoll.responses[i].voters.push({ id: socket.id, name: student.name });
    }

    // Notify all
    io.emit('poll-results', {
      responses: currentPoll.responses,
      totalVotes: currentPoll.responses.reduce((sum, r) => sum + r.count, 0),
    });
    io.to('teachers').emit('students-list', Array.from(students.values()));

    // If all answered, end poll
    if (Array.from(students.values()).every(s => s.hasAnswered)) {
      endCurrentPoll();
    }
  });

  // --- Kick Student ---
  socket.on('kick-student', (studentId) => {
    const s = students.get(studentId);
    if (s) {
      io.to(studentId).emit('kicked-out');
      students.delete(studentId);
      io.to('teachers').emit('students-list', Array.from(students.values()));
    }
  });

  // --- Chat ---
  socket.on('send-message', (message) => {
    const student = students.get(socket.id);
    const messageObj = {
      id: Date.now(),
      text: message.text,
      sender: message.isTeacher ? 'Teacher' : (student ? student.name : 'Unknown'),
      isTeacher: message.isTeacher,
      timestamp: new Date(),
    };
    chatMessages.push(messageObj);
    io.emit('new-message', messageObj);
  });

  socket.on('get-chat-history', () => {
    socket.emit('chat-history', chatMessages);
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const student = students.get(socket.id);
    if (student) {
      students.delete(socket.id);
      io.to('teachers').emit('student-left', student);
      io.to('teachers').emit('students-list', Array.from(students.values()));
    }
  });

  // === Helper ===
  function endCurrentPoll() {
    if (currentPoll) {
      currentPoll.isActive = false;
      currentPoll.endedAt = new Date();
      pollHistory.push({ ...currentPoll });
      io.emit('poll-ended', {
        responses: currentPoll.responses,
        totalVotes: currentPoll.responses.reduce((sum, r) => sum + r.count, 0),
      });
      io.to('teachers').emit('poll-history', pollHistory);
    }
  }
});

// REST (for poll history - good to have)
app.get('/api/poll-history', (req, res) => res.json(pollHistory));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('Server running at', PORT);
});
