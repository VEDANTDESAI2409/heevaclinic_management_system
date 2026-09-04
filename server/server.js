import express from 'express';
import apiRoutes from './routes/apiRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3001);

// CORS headers
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '10mb' }));

// Mount all API endpoints under /api
app.use('/api', apiRoutes);

app.listen(port, () => {
  console.log(`HEEVA CLINIC JSON Storage API listening on http://localhost:${port}`);
});

export default app;
