/**
 * Learning AI Assistant - Express Server
 * Main entry point for the application
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import modules
const { testConnection } = require('./supabase');
const chatRoutes = require('./routes/chats');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
app.use('/api', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from dashboard
app.use(express.static(path.join(__dirname, '../dashboard')));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Service unavailable',
      code: 'HEALTH_CHECK_FAILED'
    });
  }
});

// API routes
app.use('/api/chats', chatRoutes);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// Webhook endpoints for bots (future implementation)
app.post('/webhook/telegram', (req, res) => {
  // Telegram webhook will be handled here in production
  res.status(200).json({ ok: true });
});

app.post('/webhook/discord', (req, res) => {
  // Discord webhook will be handled here if needed
  res.status(200).json({ ok: true });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: error.stack })
  });
});

/**
 * Initialize bots and start server
 */
async function startServer() {
  try {
    console.log('🚀 Starting Learning AI Assistant...');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Database connection failed. Please check your Supabase configuration.');
      process.exit(1);
    }

    // Initialize bots
    try {
      if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log('📱 Initializing Telegram bot...');
        const { bot } = require('./telegram'); // Updated import
        console.log('✅ Telegram bot initialized');
      } else {
        console.log('⚠️  TELEGRAM_BOT_TOKEN not found, skipping Telegram bot');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Telegram bot:', error.message);
    }

    try {
      if (process.env.DISCORD_BOT_TOKEN) {
        console.log('🎮 Initializing Discord bot...');
        require('./discord');
        console.log('✅ Discord bot initialized');
      } else {
        console.log('⚠️  DISCORD_BOT_TOKEN not found, skipping Discord bot');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Discord bot:', error.message);
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🌐 Server running on http://localhost:${PORT}`);
      console.log(`📊 Dashboard available at http://localhost:${PORT}`);
      console.log(`🔗 API available at http://localhost:${PORT}/api`);
      console.log(`❤️  Health check at http://localhost:${PORT}/health`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app; 