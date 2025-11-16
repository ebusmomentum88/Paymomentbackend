require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: "https://buying-and-selling-landing-233.vercel.app", // allow your frontend
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  credentials: true
}));
app.use(express.json());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Helper: get today's date YYYY-MM-DD
const getTodayDate = () => new Date().toISOString().split('T')[0];

// ------------------------
// ROUTES
// ------------------------

// POST /attendance/signin
app.post('/attendance/signin', async (req, res) => {
  try {
    const { full_name, reg_no, department } = req.body;
    if (!full_name || !reg_no || !department)
      return res.status(400).json({ error: 'All fields are required' });

    const today = getTodayDate();

    const { data: existing } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    if (existing) {
      return res.status(400).json({
        error: 'You have already signed in today',
        attendance: existing
      });
    }

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

    if (error) throw error;

    res.status(201).json({
      message: 'Sign in successful',
      attendance: data
    });

  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// POST /attendance/signout
app.post('/attendance/signout', async (req, res) => {
  try {
    const { reg_no } = req.body;
    if (!reg_no) return res.status(400).json({ error: 'Registration number is required' });

    const today = getTodayDate();

    const { data: existing } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    if (!existing) return res.status(404).json({ error: 'No sign-in record found for today' });
    if (existing.sign_out_time) return res.status(400).json({ error: 'Already signed out today' });

    const { data, error } = await supabase
      .from('attendance')
      .update({ sign_out_time: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Sign out successful',
      attendance: data
    });

  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

// GET /attendance/:reg_no/today
app.get('/attendance/:reg_no/today', async (req, res) => {
  try {
    const { reg_no } = req.params;
    const today = getTodayDate();

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .eq('date', today)
      .single();

    res.json(data || null);
  } catch (error) {
    console.error('Fetch today error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance' });
  }
});

// GET /attendance/:reg_no/history
app.get('/attendance/:reg_no/history', async (req, res) => {
  try {
    const { reg_no } = req.params;

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('reg_no', reg_no)
      .order('date', { ascending: false })
      .limit(30);

    res.json(data || []);
  } catch (error) {
    console.error('Fetch history error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));















