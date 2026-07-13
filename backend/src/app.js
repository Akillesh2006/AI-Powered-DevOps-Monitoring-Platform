const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/devops-monitoring';

// Middleware
app.use(express.json());

// MongoDB connection
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err.message);
  });

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// Routes
app.use('/auth', require('./routes/auth.routes'));
app.use('/organizations', require('./routes/organizations.routes'));
app.use('/users', require('./routes/users.routes'));

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
