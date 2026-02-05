const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

class AuthService {
  async register(username, email, password) {
    console.log('📝 AuthService.register called with:', { username, email });
    
    // Check if email exists
    const existingEmail = await database.get(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingEmail) {
      throw new Error('Este email já está em uso');
    }

    // Check if username exists
    const existingUsername = await database.get(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUsername) {
      throw new Error('Este nome de usuário já está em uso');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const query = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id';
    const values = [username, email, passwordHash];
    
    console.log('📝 SQL Query:', query);
    console.log('📝 SQL Values:', values);
    
    const result = await database.run(query, values);

    // Generate token
    const token = jwt.sign(
      { userId: result.id, email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return {
      user: {
        id: result.id,
        username,
        email
      },
      token
    };
  }

  async login(email, password) {
    // Find user
    const user = await database.get(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login and online status
    await database.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = TRUE WHERE id = $1',
      [user.id]
    );

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    };
  }

  async getUserById(userId) {
    const user = await database.get(
      'SELECT id, username, email, is_online FROM users WHERE id = $1',
      [userId]
    );
    
    return user || null;
  }

  async setUserOnline(userId, isOnline) {
    await database.run(
      'UPDATE users SET is_online = $1 WHERE id = $2',
      [isOnline, userId]
    );
  }
}

module.exports = new AuthService();