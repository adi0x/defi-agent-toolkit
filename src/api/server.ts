import express from 'express';
import { registry } from '../engine/SkillRegistry';
import { dataEngine } from '../engine/DataEngine';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== DISCOVERY ENDPOINTS =====

// List all available skills
app.get('/skills', (req, res) => {
  res.json({
    count: registry.count,
    skills: registry.listSkills(),
  });
});

// Search skills by query
app.get('/skills/search', (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  res.json({
    query,
    results: registry.searchSkills(query),
  });
});

// Skills by protocol
app.get('/skills/protocol/:protocol', (req, res) => {
  res.json({
    protocol: req.params.protocol,
    skills: registry.skillsForProtocol(req.params.protocol),
  });
});

// Skills by category
app.get('/skills/category/:category', (req, res) => {
  res.json({
    category: req.params.category,
    skills: registry.skillsForCategory(req.params.category),
  });
});

// ===== SKILL EXECUTION =====

// Execute any skill by name
app.post('/execute/:skillName', async (req, res) => {
  const { skillName } = req.params;
  const input = req.body;

  try {
    const result = await registry.execute(skillName, input);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      errors: [{ code: 'EXECUTION_ERROR', message: err.message }],
    });
  }
});

// ===== CONVENIENCE ENDPOINTS =====
// These map directly to skills for easier agent access

// GET /supply-apy/:token
app.get('/supply-apy/:token', async (req, res) => {
  const result = await registry.execute('check_supply_apy', {
    token: req.params.token,
    protocol: req.query.protocol,
  });
  res.json(result);
});

// GET /borrow-apy/:token
app.get('/borrow-apy/:token', async (req, res) => {
  const result = await registry.execute('check_borrow_apy', {
    token: req.params.token,
    protocol: req.query.protocol,
  });
  res.json(result);
});

// GET /compare-yields/:token
app.get('/compare-yields/:token', async (req, res) => {
  const result = await registry.execute('compare_yields', {
    token: req.params.token,
  });
  res.json(result);
});

// GET /price/:token
app.get('/price/:token', async (req, res) => {
  const result = await registry.execute('get_token_price', {
    token: req.params.token,
    quoteToken: req.query.quote,
  });
  res.json(result);
});

// GET /swap-quote
app.get('/swap-quote', async (req, res) => {
  const result = await registry.execute('get_swap_quote', {
    tokenIn: req.query.from,
    tokenOut: req.query.to,
    amountIn: Number(req.query.amount),
  });
  res.json(result);
});

// GET /health/:wallet
app.get('/health/:wallet', async (req, res) => {
  const result = await registry.execute('check_health_factor', {
    walletAddress: req.params.wallet,
    protocol: req.query.protocol,
  });
  res.json(result);
});

// GET /portfolio/:wallet
app.get('/portfolio/:wallet', async (req, res) => {
  const result = await registry.execute('portfolio_check', {
    walletAddress: req.params.wallet,
  });
  res.json(result);
});

// GET /tvl/:protocol
app.get('/tvl/:protocol', async (req, res) => {
  const result = await registry.execute('protocol_tvl', {
    protocol: req.params.protocol,
  });
  res.json(result);
});

// GET /risk/:protocol
app.get('/risk/:protocol', async (req, res) => {
  const result = await registry.execute('risk_score', {
    protocol: req.params.protocol,
  });
  res.json(result);
});

// GET /optimize
app.get('/optimize', async (req, res) => {
  const result = await registry.execute('yield_optimizer', {
    token: req.query.token,
    amount: Number(req.query.amount),
    riskTolerance: req.query.risk || 'moderate',
    timeHorizon: req.query.horizon || 'medium',
  });
  res.json(result);
});

// GET /whales
app.get('/whales', async (req, res) => {
  const result = await registry.execute('whale_tracker', {
    minValueUsd: Number(req.query.min) || 100000,
    protocol: req.query.protocol,
    action: req.query.action,
    timeframe: req.query.timeframe || '24h',
  });
  res.json(result);
});

// ===== ENGINE STATUS =====

app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    skills: registry.count,
    engine: dataEngine.getStats(),
    uptime: process.uptime(),
  });
});

// ===== START =====

app.listen(PORT, () => {
  console.log(`🚀 DeFi Agent Toolkit API running on port ${PORT}`);
  console.log(`📋 ${registry.count} skills loaded`);
  console.log(`🔍 Discovery: GET /skills`);
  console.log(`⚡ Execute: POST /execute/:skillName`);
});

export default app;
