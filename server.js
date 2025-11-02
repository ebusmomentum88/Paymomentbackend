const express = require('express');
const cors = require('cors');
// 1. Paystack Library Initialization
const Paystack = require('paystack-node'); 

const app = express();
const PORT = process.env.PORT || 3000; 

// --- Configuration ---
// 🛑 ACTION REQUIRED: Replace the placeholder below with your actual sk_test_... key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_1ae7634d7d57171ef43b8ac0087dfa6c72c9633f';
const paystack = new Paystack(PAYSTACK_SECRET_KEY, process.env.NODE_ENV);


// --- Mock Database (Holds users and transactions in memory) ---
let users = [];
let transactions = []; // To keep track of payment references

// --- Middleware ---
// Note: '*' in origin allows any domain to access your API (good for testing)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
}));
app.use(express.json());

// --- Utility Functions ---

// Simple unique ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);


// --- API Routes ---

// 1. SIGNUP Route
app.post('/api/signup', (req, res) => {
    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    if (users.some(user => user.email === email)) {
        return res.status(409).json({ message: 'User already exists.' });
    }

    const newUser = { id: generateId(), fullname, email, password }; 
    users.push(newUser);
    console.log(`[USER DB]: User signed up: ${email}`);
    res.status(200).json({ message: 'User created successfully. Please log in.', user: newUser });
});

// 2. LOGIN Route
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);

    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid email or password.' });
    }

    console.log(`[USER DB]: User logged in: ${email}`);
    // Return user data without the password
    const { password: _, ...userData } = user; 
    res.status(200).json({ message: 'Login successful.', user: userData });
});

// 3. PAYSTACK INITIALIZATION Route (Called by frontend)
app.post('/api/pay', async (req, res) => {
    const { amount, email } = req.body;
    
    if (!amount || !email) {
         return res.status(400).json({ message: 'Amount and email are required for payment initialization.' });
    }
    
    // Convert Naira (NGN) to kobo (Paystack standard: amount is in the lowest denomination)
    const amountInKobo = amount * 100;

    const transactionReference = `ref-${Date.now()}-${generateId()}`;

    try {
        // Use Paystack Node SDK to initialize the transaction
        const response = await paystack.transaction.initialize({
            email: email,
            amount: amountInKobo,
            reference: transactionReference,
            currency: 'NGN',
            metadata: {
                custom_fields: [{
                    display_name: "User Email",
                    variable_name: "user_email",
                    value: email
                }]
            }
        });

        if (response.status) {
            console.log(`[PAYSTACK]: Transaction initialized for ${email}. Ref: ${transactionReference}`);
            // Store the reference for later verification (or webhooks)
            transactions.push({ reference: transactionReference, email, amount: amountInKobo, status: 'pending', date: new Date().toISOString() });
            
            // Send the initialization data back to the frontend to launch the pop-up
            return res.json({ success: true, data: response.data });
        } else {
            console.error('[PAYSTACK ERROR]: Initialization failed:', response.message);
            return res.status(500).json({ success: false, message: response.message || 'Payment initialization failed.' });
        }

    } catch (error) {
        console.error('[SERVER ERROR]: Error during Paystack initialization:', error);
        return res.status(500).json({ success: false, message: 'Server error during payment processing.' });
    }
});


// 4. Verification Route (Placeholder - Usually done via Webhooks in production)
app.get('/api/verify/:reference', async (req, res) => {
    // This route would be used to securely check the payment status on the server side
    const { reference } = req.params;
    
    // Simple mock logic:
    const transaction = transactions.find(t => t.reference === reference);
    if(transaction) {
        return res.json({ message: "Verification successful (Mock response).", transaction });
    }
    
    res.status(404).json({ message: "Transaction reference not found." });
});


// 5. Health Check Route
app.get('/', (req, res) => {
    res.status(200).send('EbusPay Backend is running and Paystack is initialized.');
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

