const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // Increase pingTimeout to handle slow networks
  pingTimeout: 60000,
  // Add transport options for reliability
  transports: ["websocket", "polling"],
});

// Simple health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Keep track of connected users
const users = {};

// Track active connections for debugging
const connections = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Add connection to tracking object
  connections[socket.id] = {
    status: "connected",
    connectedAt: new Date().toISOString(),
    ip: socket.handshake.address,
    offers: [],
    answers: [],
  };

  // Register new user
  socket.on("register", (username) => {
    console.log(`User ${username} registered with socket ID: ${socket.id}`);
    users[socket.id] = { username, socketId: socket.id };

    // Broadcast updated user list to everyone
    io.emit("users_updated", Object.values(users));
  });

  // Handle WebRTC signaling
  socket.on("offer", (data) => {
    const fromUsername = users[socket.id]?.username || socket.id;
    const toUsername = users[data.target]?.username || data.target;

    console.log(`Offer from ${fromUsername} to ${toUsername}`);

    // Track the offer for debugging
    connections[socket.id].offers.push({
      to: data.target,
      timestamp: new Date().toISOString(),
    });

    io.to(data.target).emit("offer", {
      offer: data.offer,
      from: socket.id,
      username: users[socket.id]?.username,
    });
  });

  socket.on("answer", (data) => {
    const fromUsername = users[socket.id]?.username || socket.id;
    const toUsername = users[data.target]?.username || data.target;

    console.log(`Answer from ${fromUsername} to ${toUsername}`);

    // Track the answer for debugging
    connections[socket.id].answers.push({
      to: data.target,
      timestamp: new Date().toISOString(),
    });

    io.to(data.target).emit("answer", {
      answer: data.answer,
      from: socket.id,
      username: users[socket.id]?.username,
    });
  });

  socket.on("ice-candidate", (data) => {
    const fromUsername = users[socket.id]?.username || socket.id;
    const toUsername = users[data.target]?.username || data.target;

    console.log(`ICE candidate from ${fromUsername} to ${toUsername}`);

    io.to(data.target).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id,
      username: users[socket.id]?.username,
    });
  });

  // Handle connection status reporting
  socket.on("connection-status", (data) => {
    console.log(
      `Connection status from ${users[socket.id]?.username || socket.id}: ${
        data.status
      }`
    );

    // If the connection was successful, log it
    if (data.status === "connected" && data.target) {
      console.log(
        `Successful connection between ${
          users[socket.id]?.username || socket.id
        } and ${users[data.target]?.username || data.target}`
      );
    }

    // If there's a peer target, inform them about the status
    if (data.target) {
      io.to(data.target).emit("peer-connection-status", {
        from: socket.id,
        username: users[socket.id]?.username,
        status: data.status,
      });
    }
  });

  // Handle heartbeat to keep connections alive
  socket.on("heartbeat", () => {
    // Reset the connection timeout
    if (connections[socket.id]) {
      connections[socket.id].lastHeartbeat = new Date().toISOString();
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const username = users[socket.id]?.username;
    console.log(`User disconnected: ${username || socket.id}`);

    // Remove from tracking
    delete connections[socket.id];
    delete users[socket.id];

    // Inform others about the disconnection
    io.emit("user-disconnected", socket.id);
    io.emit("users_updated", Object.values(users));
  });
});

// Periodic cleanup of stale connections (every 5 minutes)
setInterval(() => {
  const now = new Date();
  Object.entries(connections).forEach(([socketId, connection]) => {
    if (connection.lastHeartbeat) {
      const lastHeartbeat = new Date(connection.lastHeartbeat);
      if (now - lastHeartbeat > 10 * 60 * 1000) {
        // 10 minutes
        console.log(`Removing stale connection: ${socketId}`);
        delete connections[socketId];
        delete users[socketId];
        io.emit("users_updated", Object.values(users));
      }
    }
  });
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
