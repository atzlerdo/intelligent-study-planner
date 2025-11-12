import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { dbWrapper } from '../db.js';
import { generateToken } from '../auth.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    // Check if user already exists
    const existing = dbWrapper.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Insert user
    dbWrapper.prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, name, now, now);

    // Initialize study program defaults
    dbWrapper.prepare(`
      INSERT INTO study_programs (user_id, total_ects, completed_ects, hours_per_ects)
      VALUES (?, 180, 0, 27.5)
    `).run(userId);

    // Generate token
    const token = generateToken({ userId, email });

    res.status(201).json({
      token,
      user: { id: userId, email, name },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = dbWrapper.prepare('SELECT id, email, password_hash, name FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate token
    const token = generateToken({ userId: user.id, email: user.email });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
