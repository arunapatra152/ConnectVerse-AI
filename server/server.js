const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { initializeSocket } = require('./sockets/chatSocket');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// ==================== MIDDLEWARE ====================

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==================== DATABASE CONNECTION ====================

const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/connectverse';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// ==================== SOCKET.IO INITIALIZATION ====================

const io = initializeSocket(server);

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ==================== ROUTES ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ConnectVerse-AI server is running',
    timestamp: new Date(),
  });
});

// Import and use routes
// app.use('/api/auth', require('./routes/authRoutes'));
// app.use('/api/chat', require('./routes/chatRoutes'));
// app.use('/api/community', require('./routes/communityRoutes'));
// app.use('/api/confession', require('./routes/confessionRoutes'));

// TODO: Uncomment above routes once they are created

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);

  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
});

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🚀 ConnectVerse-AI Server Running        ║
║   📍 Port: ${PORT}                            ║
║   🔗 URL: http://localhost:${PORT}           ║
║   🗄️  Database: MongoDB                      ║
║   💬 WebSocket: Socket.io Enabled          ║
╚════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', async () => {
  console.log('\n📛 Shutting down gracefully...');

  // Close Socket.io
  io.close();

  // Disconnect MongoDB
  await mongoose.disconnect();

  // Close server
  server.close(() => {
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n📛 Shutting down gracefully...');

  // Close Socket.io
  io.close();

  // Disconnect MongoDB
  await mongoose.disconnect();

  // Close server
  server.close(() => {
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });
});

// ==================== EXPORTS ====================

module.exports = { app, server, io };
