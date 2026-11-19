const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('Falta JWT_SECRET en .env');

const SALT_ROUNDS = 10;
const TOKEN_TTL = '7d';

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

const signToken = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, apartmentId: user.apartment_id },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

const verifyToken = (token) => {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
};

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };