require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const paymentRoutes = require('./routes/payment');
const departmentRoutes = require('./routes/departments');
const adminRoutes = require('./routes/admin');
const recoveryRoutes = require('./routes/recovery');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('landing');
});

app.use('/payment', paymentRoutes);
app.use('/admin', adminRoutes);
app.use('/recover', recoveryRoutes);
app.use('/', departmentRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
