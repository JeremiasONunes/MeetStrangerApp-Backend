const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

class AuthService {

  async register(username, email, password) {
    console.log('AuthService.register called with:', { username, email });

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

    // Insert user
    const query =
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id';

    const values = [username, email, passwordHash];

    const result = await database.run(query, values);

    const userId = result.rows[0].id;

    // Generate token
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return {
      user: {
        id: userId,
        username,
        email
      },
      token
    };
  }

  async login(email, password) {
    const user = await database.get(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    await database.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = TRUE WHERE id = $1',
      [user.id]
    );

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
    return await database.get(
      'SELECT id, username, email, is_online FROM users WHERE id = $1',
      [userId]
    );
  }

  async setUserOnline(userId, isOnline) {
    await database.run(
      'UPDATE users SET is_online = $1 WHERE id = $2',
      [isOnline, userId]
    );
  }
}

module.exports = new AuthService();
