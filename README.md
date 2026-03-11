# DeFi Agent Toolkit

Live DeFi skills for AI agents on Base.

## What is this?

A toolkit that gives AI agents instant access to structured, live DeFi data across 5 protocols on Base: **Aave, Uniswap, Aerodrome, Morpho, and Fluid**.

Instead of agents figuring out how to fetch and parse DeFi data from scratch, they call pre-built skills that return clean, actionable responses.

## Quick Start

### As an npm package

```bash
npm install defi-agent-toolkit
```

```typescript
import { execute, listSkills, searchSkills } from 'defi-agent-toolkit';

// Find available skills
const yieldSkills = searchSkills('yield');

// Execute a skill
const result = await execute('check_supply_apy', { token: 'USDC' });
console.log(result.data);
// [{ protocol: 'aave', token: 'USDC', supplyApy: 4.2, ... }]
```

### As a REST API

```bash
git clone https://github.com/your-repo/defi-agent-toolkit
cd defi-agent-toolkit
cp .env.example .env
npm install
npm run dev
```

```bash
# Discover skills
curl http://localhost:3000/skills

# Search skills
curl http://localhost:3000/skills/search?q=yield

# Execute a skill
curl -X POST http://localhost:3000/execute/check_supply_apy \
  -H "Content-Type: application/json" \
  -d '{"token": "USDC"}'

# Convenience endpoints
curl http://localhost:3000/supply-apy/USDC
curl http://localhost:3000/price/ETH
curl http://localhost:3000/health/0x1234...
curl http://localhost:3000/portfolio/0x1234...
```

## Skills (30 total)

### Lending (10)
| Skill | Description |
|-------|-------------|
| `check_supply_apy` | Supply rates per token |
| `check_borrow_apy` | Borrow rates per token |
| `compare_yields` | Best yield across protocols |
| `compare_borrow_rates` | Cheapest borrow rates |
| `check_health_factor` | Liquidation risk check |
| `check_liquidation_threshold` | LTV and liquidation params |
| `check_available_liquidity` | Available borrow capacity |
| `check_utilization_rate` | Pool usage percentage |
| `list_supported_assets` | Supported tokens per protocol |
| `check_vault_performance` | Morpho vault data |

### DEX (8)
| Skill | Description |
|-------|-------------|
| `get_token_price` | Current token price |
| `get_swap_quote` | Best swap rate |
| `compare_swap_routes` | Compare across DEXs |
| `check_pool_stats` | Pool TVL, volume, APR |
| `check_liquidity_depth` | Liquidity at current price |
| `get_top_pools` | Top pools by volume/TVL/APR |
| `check_impermanent_loss` | IL estimation |
| `check_lp_rewards` | LP reward emissions |

### Aerodrome Specific (2)
| Skill | Description |
|-------|-------------|
| `check_veAERO_voting` | Epoch voting data |
| `check_bribes` | Active bribe incentives |

### Fluid Specific (2)
| Skill | Description |
|-------|-------------|
| `check_smart_collateral` | Smart collateral yields |
| `check_smart_debt` | Smart debt fee offsets |

### Analytics (8)
| Skill | Description |
|-------|-------------|
| `protocol_tvl` | Protocol TVL |
| `tvl_trend` | TVL changes over time |
| `whale_tracker` | Large transaction monitor |
| `gas_estimator` | Gas cost estimates |
| `token_overview` | Full token info |
| `portfolio_check` | Wallet position overview |
| `risk_score` | Protocol risk assessment |
| `yield_optimizer` | Best strategy recommendation |

## Architecture

```
Agent Request
    ↓
REST API / npm SDK
    ↓
Skill Registry (discovery + routing)
    ↓
Skill (logic + data access)
    ↓
Data Engine (cache + fetch)
    ↓
Data Sources (RPC, APIs, Indexers)
```

## Project Structure

```
src/
├── api/          # REST API server
├── config/       # Protocol addresses, constants
├── engine/       # Data engine, provider, skill registry
├── skills/       # All 30 skills organized by category
│   ├── lending/
│   ├── dex/
│   ├── aerodrome/
│   ├── fluid/
│   └── analytics/
├── types/        # TypeScript types
└── index.ts      # SDK entry point
```

## License

MIT
