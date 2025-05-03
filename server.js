const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve static files from the React build directory in production
app.use(express.static(path.join(__dirname, "client/build")));

// Keep track of connected users
const users = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Register new user
  socket.on("register", (username) => {
    console.log(`User ${username} registered with socket ID: ${socket.id}`);
    users[socket.id] = { username, socketId: socket.id };

    // Broadcast updated user list to everyone
    io.emit("users_updated", Object.values(users));
  });

  // Handle WebRTC signaling
  socket.on("offer", (data) => {
    console.log(
      `Offer from ${users[socket.id]?.username || socket.id} to ${data.target}`
    );
    io.to(data.target).emit("offer", {
      offer: data.offer,
      from: socket.id,
      username: users[socket.id]?.username,
    });
  });

  socket.on("answer", (data) => {
    console.log(
      `Answer from ${users[socket.id]?.username || socket.id} to ${data.target}`
    );
    io.to(data.target).emit("answer", {
      answer: data.answer,
      from: socket.id,
      username: users[socket.id]?.username,
    });
  });

  socket.on("ice-candidate", (data) => {
    console.log(
      `ICE candidate from ${users[socket.id]?.username || socket.id} to ${
        data.target
      }`
    );
    io.to(data.target).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const username = users[socket.id]?.username;
    console.log(`User disconnected: ${username || socket.id}`);
    delete users[socket.id];
    io.emit("users_updated", Object.values(users));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
