const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');

// --- DATABASE CONNECTION ---
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Exit process with failure
        process.exit(1); 
    }
};

// Check for required environment variable before connecting
if (!process.env.MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in environment variables. Please check your .env file.");
} else {
    connectDB();
}

const app = express();

// --- MIDDLEWARE ---

// Enable CORS: Allows your frontend (running on a different origin) to access the API
// In a production environment, you should replace '*' with your actual frontend URL.
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE']
})); 

// Body parser middleware: Allows the app to read JSON data from the request body
app.use(express.json()); 

// --- ROUTES ---

// Health check endpoint
app.get('/', (req, res) => {
    res.send('EbusPay API is running...');
});

// Authentication routes (e.g., /api/auth/signup, /api/auth/login)
app.use('/api/auth', authRoutes);

// User and Transaction routes (e.g., /api/user/profile, /api/transactions, /api/payments/verify)
app.use('/api', transactionRoutes); 

// --- SERVER START ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`Server running on port ${PORT}`));



