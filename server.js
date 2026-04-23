const path = require('path');
const express = require('express');
const { detectDeadlock } = require('./detection');
const { recover } = require('./recovery');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.post('/detect', (req, res) => {
  try {
    res.json(detectDeadlock(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/recover', (req, res) => {
  try {
    res.json(recover(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, project: 'Deadlock Detection and Recovery Toolkit' });
});

app.listen(port, () => {
  console.log(`Deadlock toolkit running at http://localhost:${port}`);
});
