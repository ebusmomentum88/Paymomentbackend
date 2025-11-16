require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS - allow your frontend URL
const FRONTEND_URL = process.env.VITE_API_URL || "https://buying-and-selling-landing-233.vercel.app";
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDate = () => new Date().toISOString().split('T')[0];

// POST /attendance/signin
app.post('/attendance/signin', async (req, res) => {
  try {
    const { full_name, reg_no, department } = req.body;

    if (!full_name || !reg_no || !department) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const today = getTodayDate();

    // Check if already signed in
    const { data: existing, error: checkError } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existing) {
      return res.status(400).json({ 
        error: 'You have already signed in today',
        attendance: existing
      });
    }

    // Insert new record
    const { data, error } = await supabase
      .from('attendance')
      .insert([{
        full_name,
        reg_no,
        department,
        sign_in_time: new Date().toISOString(),
        date: today
      }])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: 'Failed to sign in', details: error });
    }

    res.status(201).json({ message: 'Sign in successful', attendance: data });
  } catch (err) {
    console.error('Sign in error:', err);
    res.status(500).json({ error: 'Failed to sign in', details: err.message });
  }
});

// POST /attendance/signout
app.post('/attendance/signout', async (req, res) => {
  try {
    const { reg_no } = req.body;

    if (!reg_no) {
      return res.status(400).json({ error: 'Registration number is required' });
    }

    const today = getTodayDate();

    // Find today's attendance record
    const { data: existing, error: findError } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    if (findError && findError.code !== 'PGRST116') throw findError;

    if (!existing) return res.status(404).json({ error: 'No sign-in record found for today' });
    if (existing.sign_out_time) return res.status(400).json({ error: 'Already signed out today' });

    // Update sign_out_time
    const { data, error } = await supabase
      .from('attendance')
      .update({ sign_out_time: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return res.status(500).json({ error: 'Failed to sign out', details: error });
    }

    res.json({ message: 'Sign out successful', attendance: data });
  } catch (err) {
    console.error('Sign out error:', err);
    res.status(500).json({ error: 'Failed to sign out', details: err.message });
  }
});

// GET /attendance/:reg_no/today
app.get('/attendance/:reg_no/today', async (req, res) => {
  try {
    const { reg_no } = req.params;
    const today = getTodayDate();

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Supabase fetch today error:", error);
      throw error;
    }

    res.json(data || null);
  } catch (err) {
    console.error('Fetch today error:', err);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance', details: err.message });
  }
});

// GET /attendance/:reg_no/history
app.get('/attendance/:reg_no/history', async (req, res) => {
  try {
    const { reg_no } = req.params;

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .order('date', { ascending: false })
      .limit(30);

    if (error) {
      console.error("Supabase fetch history error:", error);
      return res.status(500).json({ error: 'Failed to fetch attendance history', details: error });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance history', details: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});















