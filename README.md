---
name: defi-agent-toolkit
description: Live DeFi data for AI agents on Base. 30 read-only skills across Aave, Uniswap, Aerodrome, Morpho, and Fluid — supply/borrow APYs, swap quotes, health factors, TVL, whale tracking, yield optimization, and more. All on-chain, no API key required.
metadata: {"openclaw":{"requires":{"bins":["node","npx"],"env":["BASE_RPC_URL"]}}}
---

# DeFi Agent Toolkit

The first DeFi agent SDK that thinks AND acts. 30 data skills across 5 protocols on Base + Bankr execution integration. Your agent finds the best yield, then deposits. Finds the best swap, then executes. Detects liquidation risk, then protects.

## Install

```bash
npm install defi-agent-toolkit
```

Set your Base RPC endpoint:

```bash
export BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

Free tier from Alchemy or Infura works fine.

## Quick Start — Data Only

```typescript
import { execute } from 'defi-agent-toolkit';

// What's the best yield for USDC right now?
const yields = await execute('compare_yields', { token: 'USDC' });

// How much will I get swapping 1 ETH to USDC?
const quote = await execute('get_swap_quote', { tokenIn: 'ETH', tokenOut: 'USDC', amountIn: 1 });

// Is this wallet at risk of liquidation?
const health = await execute('check_health_factor', { walletAddress: '0x...' });
```

## Think + Act — With Bankr

This is the killer feature. Your agent analyzes AND executes in one call.

```typescript
import { BankrExecutor, optimizeAndExecute, smartSwap, monitorAndProtect } from 'defi-agent-toolkit';

const bankr = new BankrExecutor({ apiKey: 'bk_your_key' });

// Find best USDC yield across all protocols → deposit automatically
const result = await optimizeAndExecute(bankr, 'USDC', 10000);
// → "Found 5.1% APY on Morpho. Deposited successfully. TX: 0x..."

// Find cheapest swap route → execute it
const swap = await smartSwap(bankr, 'ETH', 'USDC', 1);
// → "Best route: Uniswap for 2043.83 USDC. Swapped. TX: 0x..."

// Monitor health factor → auto-repay if in danger
const health = await monitorAndProtect(bankr, '0x...wallet');
// → "Health factor 1.15 is below 1.2. Auto-repaying to protect position."
```

Get a Bankr API key at [bankr.bot/api](https://bankr.bot/api).

## REST API

Start the server:

```bash
npx defi-toolkit-server
```

Then query:

```
GET /api/skills                                    → list all 30 skills
GET /api/skills/check_supply_apy?token=USDC        → Aave/Morpho/Fluid supply rates
GET /api/skills/get_swap_quote?tokenIn=ETH&tokenOut=USDC&amountIn=1
GET /api/skills/yield_optimizer?token=USDC&amount=10000
```

## Protocols Covered

| Protocol | What You Get |
|----------|-------------|
| **Aave V3** | Supply/borrow APYs, health factors, liquidation thresholds, utilization, reserves |
| **Uniswap V3** | Pool lookup, swap quotes (multi-fee-tier), pool stats, liquidity depth |
| **Aerodrome** | Swap quotes, veAERO voting data, gauge rewards, bribes, LP emissions |
| **Morpho Blue** | Market APYs via GraphQL API, vault performance, reward programs |
| **Fluid** | fToken lending rates, vault resolver data, smart collateral/debt yields |

## All 30 Skills

### Lending (10 skills)

| Skill | What it does | Example input |
|-------|-------------|---------------|
| `check_supply_apy` | Supply APY for a token on a protocol | `{ token: "USDC" }` |
| `check_borrow_apy` | Borrow APR for a token | `{ token: "ETH" }` |
| `compare_yields` | Rank supply APYs across all protocols | `{ token: "USDC" }` |
| `compare_borrow_rates` | Rank borrow rates across all protocols | `{ token: "USDC" }` |
| `check_health_factor` | Wallet liquidation risk | `{ walletAddress: "0x..." }` |
| `check_liquidation_threshold` | LTV, liquidation %, penalty | `{ token: "WETH" }` |
| `check_available_liquidity` | Available to borrow right now | `{ token: "USDC" }` |
| `check_utilization_rate` | % of supply currently borrowed | `{ token: "USDC" }` |
| `list_supported_assets` | All tokens on a protocol | `{ protocol: "aave" }` |
| `check_vault_performance` | Morpho vault APY, curator, TVL | `{ token: "USDC" }` |

### DEX (8 skills)

| Skill | What it does | Example input |
|-------|-------------|---------------|
| `get_token_price` | USD price (CoinGecko → DefiLlama → on-chain) | `{ token: "ETH" }` |
| `get_swap_quote` | Best quote across Uniswap + Aerodrome | `{ tokenIn: "ETH", tokenOut: "USDC", amountIn: 1 }` |
| `compare_swap_routes` | Side-by-side DEX comparison | `{ tokenIn: "ETH", tokenOut: "USDC", amountIn: 1 }` |
| `check_pool_stats` | Pool TVL, volume, fees, APR | `{ tokenA: "ETH", tokenB: "USDC" }` |
| `check_liquidity_depth` | Liquidity at current price | `{ tokenA: "ETH", tokenB: "USDC" }` |
| `get_top_pools` | Top pools by volume/TVL/APR | `{ dex: "uniswap", sortBy: "volume" }` |
| `check_impermanent_loss` | IL estimate with breakeven APR | `{ tokenA: "ETH", tokenB: "USDC", priceChangePercent: 25 }` |
| `check_lp_rewards` | Gauge emissions and reward APR | `{ poolAddress: "0x..." }` |

### Aerodrome-Specific (2 skills)

| Skill | What it does | Example input |
|-------|-------------|---------------|
| `check_veAERO_voting` | Epoch voting data, emissions direction | `{}` |
| `check_bribes` | Active bribe incentives per pool | `{ poolAddress: "0x..." }` |

### Fluid-Specific (2 skills)

| Skill | What it does | Example input |
|-------|-------------|---------------|
| `check_smart_collateral` | Yield on collateral that doubles as LP | `{ tokenPair: "ETH/USDC" }` |
| `check_smart_debt` | Fee offset on debt used as LP | `{ debtPair: "USDC/USDT" }` |

### Analytics (8 skills)

| Skill | What it does | Example input |
|-------|-------------|---------------|
| `protocol_tvl` | Total value locked | `{ protocol: "aave" }` |
| `tvl_trend` | TVL change 24h/7d/30d | `{ protocol: "aerodrome" }` |
| `whale_tracker` | Large transactions on Aave | `{ minValueUsd: 100000 }` |
| `gas_estimator` | Gas cost in USD per action | `{ action: "swap" }` |
| `token_overview` | Full token profile across protocols | `{ token: "USDC" }` |
| `portfolio_check` | All positions for a wallet | `{ walletAddress: "0x..." }` |
| `risk_score` | Protocol safety rating (1-10) | `{ protocol: "morpho" }` |
| `yield_optimizer` | Best strategy for a token + amount | `{ token: "USDC", amount: 10000 }` |

## Response Format

Every skill returns:

```json
{
  "success": true,
  "data": { ... },
  "confidence": "high",
  "cached": false,
  "errors": [],
  "metadata": {
    "skill": "check_supply_apy",
    "chain": "base",
    "protocols": ["aave", "morpho", "fluid"],
    "timestamp": 1709150400000
  }
}
```

## Architecture

```
Agent → execute("skill_name", input) → SkillRegistry → Protocol Fetcher → On-chain / API → Structured Response
```

**Data sources** (all free, no API keys except RPC):
- Aave V3 Pool + DataProvider contracts (on-chain)
- Uniswap V3 Factory + Quoter contracts (on-chain)
- Aerodrome Router + Voter + Sugar contracts (on-chain)
- Morpho GraphQL API (`blue-api.morpho.org/graphql`)
- Fluid Lending Resolver + Vault Resolver + Liquidity Resolver (on-chain)
- CoinGecko free tier → DefiLlama → Uniswap (price fallback chain)
- DefiLlama TVL API

**Caching**: Built-in TTL cache per skill (30s for prices, 60s for rates, 300s for TVL).

## Use Cases

**Yield farming agent**: `compare_yields` → `risk_score` → `yield_optimizer` → pipe to Bankr for execution

**Liquidation monitor**: `check_health_factor` on loop → alert when < 1.5 → `check_liquidation_threshold` for parameters

**Portfolio tracker**: `portfolio_check` → `get_token_price` for each asset → `risk_score` per protocol

**Swap router**: `compare_swap_routes` → pick best → `gas_estimator` for cost → pipe to Bankr for execution

## Works With

- **Bankr** — use this toolkit for data, Bankr for execution
- **OpenClaw / Claude Code** — install as a skill
- **Any agent framework** — npm package or REST API

## Links

- GitHub: https://github.com/fluid-protocol/defi-agent-toolkit
- npm: `npm install defi-agent-toolkit`
- Built by [Fluid](https://fluid.instadapp.io) — the DeFi protocol with smart collateral and smart debt on Base
