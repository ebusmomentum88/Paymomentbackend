const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');

// ==================== CONFIG ====================
const PAYSTACK_SECRET_KEY = 'sk_test_1ae7634d7d57171ef43b8ac0087dfa6c72c9633f';
const JWT_SECRET = 'your_jwt_secret';
const CLIENT_URL = 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL; // PostgreSQL URL from Render

// ==================== INIT ====================
const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== DATABASE ====================
const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false
});

// Test DB connection
sequelize.authenticate()
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => {
        console.error('❌ DB Connection Error:', err.message);
        process.exit(1);
    });

// ==================== MODELS ====================
const User = sequelize.define('User', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    balance: { type: DataTypes.FLOAT, defaultValue: 0 }
});

const Transaction = sequelize.define('Transaction', {
    type: { type: DataTypes.ENUM('deposit', 'withdrawal', 'transfer'), allowNull: false },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), defaultValue: 'pending' },
    reference: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.STRING, defaultValue: 'Deposit via Paystack' }
});

// Relationships
User.hasMany(Transaction);
Transaction.belongsTo(User);

// Sync models
sequelize.sync({ alter: true });

// ==================== HELPERS ====================
const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(401).json({ success: false, message: 'User not found' });
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token invalid' });
    }
};

// ==================== ROUTES ====================
// Health check
app.get('/', (req, res) => {
    res.json({ success: true, message: 'EbusPay API running', paystack: PAYSTACK_SECRET_KEY ? 'Configured ✅' : 'Not Configured ❌' });
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields required' });

        if (await User.findOne({ where: { email } })) return res.status(400).json({ success: false, message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashedPassword });

        res.status(201).json({ success: true, user: { id: user.id, name: user.name, email: user.email, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const token = generateToken(user.id);
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Deposit transaction
app.post('/api/transactions/deposit', protect, async (req, res) => {
    try {
        const { amount, reference } = req.body;
        if (!amount || amount < 100) return res.status(400).json({ success: false, message: 'Minimum deposit ₦100' });
        if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

        if (await Transaction.findOne({ where: { reference } })) return res.status(400).json({ success: false, message: 'Transaction already processed' });

        const transaction = await Transaction.create({ type: 'deposit', amount, reference, status: 'completed', UserId: req.user.id });
        req.user.balance += amount;
        await req.user.save();

        res.json({ success: true, transaction, balance: req.user.balance });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get user transactions
app.get('/api/transactions', protect, async (req, res) => {
    try {
        const userTx = await Transaction.findAll({ where: { UserId: req.user.id }, order: [['createdAt', 'DESC']] });
        res.json({ success: true, transactions: userTx });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Initialize and verify Paystack payment routes remain same
// ...

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));


