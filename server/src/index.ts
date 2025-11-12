import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import coursesRoutes from './routes/courses.js';
import sessionsRoutes from './routes/sessions.js';
import adminRoutes from './routes/admin.js';
import studyProgramRoutes from './routes/study-program.js';
import googleCalendarRoutes from './routes/google-calendar.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Initialize database and start server
async function startServer() {
  await initializeDatabase();

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/courses', coursesRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/study-program', studyProgramRoutes);
  app.use('/api/google-calendar', googleCalendarRoutes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DATABASE_PATH || './data/study-planner.db'}`);
  });
}

startServer().catch(console.error);
