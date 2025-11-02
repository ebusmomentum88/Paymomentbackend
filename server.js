const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== PAYSTACK CONFIGURATION ====================
// IMPORTANT: Replace this with your actual Paystack secret key or use .env file
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_1ae7634d7d57171ef43b8ac0087dfa6c72c9633f';

// Validate Paystack key on startup
if (!process.env.PAYSTACK_SECRET_KEY) {
    console.warn('⚠️  WARNING: PAYSTACK_SECRET_KEY not found in environment variables!');
    console.warn('⚠️  Please add PAYSTACK_SECRET_KEY to your .env file or Render environment variables');
}

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB Connected Successfully');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

connectDB();

// ==================== MODELS ====================

// User Model
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const User = mongoose.model('User', userSchema);

// Transaction Model
const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal', 'transfer'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        default: 'paystack'
    },
    reference: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: 'Deposit via Paystack'
    },
    paystackData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// ==================== MIDDLEWARE ====================

// Auth Middleware
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }
};

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// ==================== ROUTES ====================

// Health Check
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'EbusPay API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        paystack: PAYSTACK_SECRET_KEY ? 'Configured ✅' : 'Not Configured ❌'
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'EbusPay API is healthy',
        timestamp: new Date().toISOString(),
        paystack: PAYSTACK_SECRET_KEY ? 'Configured ✅' : 'Not Configured ❌'
    });
});

// ==================== AUTH ROUTES ====================

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password
        });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Check for user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Verify Token
app.get('/api/auth/verify', protect, async (req, res) => {
    try {
        res.json({
            success: true,
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                balance: req.user.balance
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Logout
app.post('/api/auth/logout', protect, async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== USER ROUTES ====================

// Get Profile
app.get('/api/user/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update Profile
app.put('/api/user/profile', protect, async (req, res) => {
    try {
        const { name } = req.body;

        const user = await User.findById(req.user._id);

        if (name) user.name = name;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== TRANSACTION ROUTES ====================

// Get Transactions
app.get('/api/transactions', protect, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const formattedTransactions = transactions.map(tx => ({
            id: tx._id,
            type: tx.description,
            amount: tx.amount,
            status: tx.status,
            reference: tx.reference,
            date: tx.createdAt
        }));

        res.json({
            success: true,
            transactions: formattedTransactions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create Deposit
app.post('/api/transactions/deposit', protect, async (req, res) => {
    try {
        const { amount, reference, paymentMethod } = req.body;

        // Validate amount
        if (!amount || amount < 100) {
            return res.status(400).json({
                success: false,
                message: 'Minimum deposit amount is ₦100'
            });
        }

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: 'Payment reference is required'
            });
        }

        // Check if transaction already exists
        const existingTransaction = await Transaction.findOne({ reference });

        if (existingTransaction) {
            return res.status(400).json({
                success: false,
                message: 'Transaction already processed'
            });
        }

        // Create transaction
        const transaction = await Transaction.create({
            user: req.user._id,
            type: 'deposit',
            amount,
            reference,
            paymentMethod: paymentMethod || 'paystack',
            description: 'Deposit via Paystack',
            status: 'completed'
        });

        // Update user balance
        const user = await User.findById(req.user._id);
        user.balance += amount;
        await user.save();

        res.json({
            success: true,
            message: 'Deposit successful',
            transaction: {
                id: transaction._id,
                amount: transaction.amount,
                reference: transaction.reference,
                date: transaction.createdAt
            },
            balance: user.balance
        });
    } catch (error) {
        console.error('Deposit Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get Single Transaction
app.get('/api/transactions/:id', protect, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        res.json({
            success: true,
            transaction
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== PAYMENT ROUTES (WITH PAYSTACK SECRET KEY) ====================

// Verify Paystack Payment
app.post('/api/payments/verify', protect, async (req, res) => {
    try {
        const { reference, amount } = req.body;

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: 'Payment reference is required'
            });
        }

        // Check Paystack configuration
        if (!PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY === 'sk_test_your_paystack_secret_key_here') {
            return res.status(500).json({
                success: false,
                message: 'Paystack is not properly configured. Please contact administrator.'
            });
        }

        // Check if already verified
        const existingTransaction = await Transaction.findOne({ reference });

        if (existingTransaction) {
            return res.json({
                success: true,
                verified: true,
                message: 'Payment already verified'
            });
        }

        // Verify with Paystack using the secret key
        const paystackResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const { data } = paystackResponse.data;

        console.log('✅ Paystack Verification Response:', data);

        // Check if payment was successful
        if (data.status !== 'success') {
            return res.status(400).json({
                success: false,
                verified: false,
                message: 'Payment was not successful',
                paymentStatus: data.status
            });
        }

        // Verify amount matches
        const paidAmount = data.amount / 100; // Convert from kobo to naira

        if (Math.abs(paidAmount - amount) > 0.01) {
            console.error('Amount mismatch:', { expected: amount, received: paidAmount });
            return res.status(400).json({
                success: false,
                verified: false,
                message: 'Payment amount mismatch',
                expected: amount,
                received: paidAmount
            });
        }

        res.json({
            success: true,
            verified: true,
            message: 'Payment verified successfully',
            data: {
                amount: paidAmount,
                reference: data.reference,
                paidAt: data.paid_at,
                channel: data.channel,
                customer: {
                    email: data.customer.email
                }
            }
        });
    } catch (error) {
        console.error('❌ Paystack verification error:', error.response?.data || error.message);
        
        // Handle specific Paystack errors
        if (error.response?.status === 401) {
            return res.status(500).json({
                success: false,
                verified: false,
                message: 'Invalid Paystack secret key. Please check your configuration.'
            });
        }

        res.status(500).json({
            success: false,
            verified: false,
            message: 'Error verifying payment with Paystack',
            error: error.response?.data?.message || error.message
        });
    }
});

// Initialize Payment
app.post('/api/payments/initialize', protect, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount < 100) {
            return res.status(400).json({
                success: false,
                message: 'Minimum amount is ₦100'
            });
        }

        // Check Paystack configuration
        if (!PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY === 'sk_test_your_paystack_secret_key_here') {
            return res.status(500).json({
                success: false,
                message: 'Paystack is not properly configured. Please contact administrator.'
            });
        }

        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: req.user.email,
                amount: amount * 100, // Convert to kobo
                currency: 'NGN',
                callback_url: `${process.env.CLIENT_URL}/payment/callback`,
                metadata: {
                    user_id: req.user._id.toString(),
                    user_name: req.user.name
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Paystack Initialize Response:', response.data);

        res.json({
            success: true,
            message: 'Payment initialized successfully',
            data: response.data.data
        });
    } catch (error) {
        console.error('❌ Paystack initialization error:', error.response?.data || error.message);
        
        res.status(500).json({
            success: false,
            message: 'Error initializing payment',
            error: error.response?.data?.message || error.message
        });
    }
});

// Get Paystack Banks (Optional - for future bank transfer feature)
app.get('/api/payments/banks', protect, async (req, res) => {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                success: false,
                message: 'Paystack is not configured'
            });
        }

        const response = await axios.get(
            'https://api.paystack.co/bank',
            {
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            }
        );

        res.json({
            su




