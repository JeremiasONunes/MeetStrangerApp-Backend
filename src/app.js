require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const database = require('./database/database');
const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const matchingRoutes = require('./routes/matching.routes');
const websocketService = require('./services/websocket.service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize database
database.connect().catch(console.error);

// Middleware
app.use(helmet());
app.use(cors({
  origin: "*"
}));
app.use(express.json({ limit: '10mb' }));

// Swagger Documentation
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/swagger.yaml'));

// Serve custom documentation page
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/index.html'));
});

// Serve swagger.yaml file
app.get('/docs/swagger.yaml', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/swagger.yaml'));
});

// Alternative Swagger UI (if needed)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MeetStranger API Documentation'
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/matching', matchingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      websocket: 'active'
    }
  });
});

// WebSocket
websocketService.initialize(io);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await database.close();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
    console.log(`💾 Database: SQLite`);
  });
}

module.exports = app;