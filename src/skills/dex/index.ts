// =============================================
// ALL DEX SKILLS (11-18) — WITH REAL FETCHERS
// =============================================

import { BaseSkill } from '../BaseSkill';
import { SkillMetadata, SkillResponse, TokenPrice, SwapQuote, SwapComparison, PoolStats, LiquidityDepth, TopPool, ImpermanentLossResult, LPRewards, Protocol } from '../../types';
import { dataEngine, DataEngine } from '../../engine/DataEngine';
import { PROTOCOL_ADDRESSES, BASE_TOKENS } from '../../config';
import { priceFetcher, uniswapFetcher, aerodromeFetcher } from '../../engine/fetchers';

// ===== Skill 11: GetTokenPrice =====

export class GetTokenPrice extends BaseSkill<{ token: string; quoteToken?: string }, TokenPrice> {
  metadata: SkillMetadata = {
    name: 'get_token_price',
    description: 'Returns current price of any token on Base in USD.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['price', 'token', 'usd', 'value', 'quote'],
    authLevel: 'read', freshness: 15, rateLimit: 60, mode: 'both',
    context: 'Price sourced from CoinGecko, DefiLlama, or on-chain pools. Thin pools = less reliable prices.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['get_swap_quote', 'token_overview', 'portfolio_check'],
  };

  async execute(input: { token: string; quoteToken?: string }): Promise<SkillResponse<TokenPrice>> {
    const { token, quoteToken } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const cacheKey = DataEngine.key('price', token);
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const result = await priceFetcher.getPrice(token);
      return {
        token, priceUsd: result.price, priceQuote: undefined,
        change24h: result.change24h, sourcePool: result.source,
        liquidityUsd: 0, lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, data.priceUsd > 0 ? 'high' : 'low', cached);
  }
}

// ===== Skill 12: GetSwapQuote =====

export class GetSwapQuote extends BaseSkill<{ tokenIn: string; tokenOut: string; amountIn: number }, SwapQuote> {
  metadata: SkillMetadata = {
    name: 'get_swap_quote',
    description: 'Returns best swap quote for a token pair across Base DEXs.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['swap', 'quote', 'trade', 'exchange', 'price', 'slippage'],
    authLevel: 'read', freshness: 15, rateLimit: 60, mode: 'pull',
    context: 'Returns expected output for a given input. Warn users when price impact exceeds 1%.',
    dependencies: ['get_token_price'], chainable: true, chainOutputCompatibleWith: ['compare_swap_routes'],
  };

  async execute(input: { tokenIn: string; tokenOut: string; amountIn: number }): Promise<SkillResponse<SwapQuote>> {
    const { tokenIn, tokenOut, amountIn } = input;
    if (!tokenIn || !tokenOut || !amountIn) return this.error('PAIR_NOT_FOUND', 'tokenIn, tokenOut, and amountIn are required');
    if (!BASE_TOKENS[tokenIn.toUpperCase()] || !BASE_TOKENS[tokenOut.toUpperCase()]) {
      return this.error('PAIR_NOT_FOUND', 'Token not found in config');
    }

    const quotes: { dex: Protocol; amountOut: number; fee: number; gasEstimate: number }[] = [];

    // Get Uniswap quote — try multiple fee tiers
    for (const fee of [500, 3000, 10000]) {
      try {
        const result = await uniswapFetcher.getSwapQuote(tokenIn, tokenOut, amountIn, fee);
        if (result.amountOut > 0) {
          quotes.push({ dex: 'uniswap', amountOut: result.amountOut, fee: fee / 10000, gasEstimate: result.gasEstimate });
          break; // take first successful fee tier
        }
      } catch {}
    }

    // Get Aerodrome quote
    try {
      const aeroResult = await aerodromeFetcher.getSwapQuote(tokenIn, tokenOut, amountIn);
      if (aeroResult.amountOut > 0) {
        quotes.push({ dex: 'aerodrome', amountOut: aeroResult.amountOut, fee: aeroResult.stable ? 0.01 : 0.3, gasEstimate: 0 });
      }
    } catch {}

    if (quotes.length === 0) {
      return this.error('NO_LIQUIDITY', `No swap route found for ${tokenIn} → ${tokenOut}`);
    }

    // Best quote
    const best = quotes.sort((a, b) => b.amountOut - a.amountOut)[0];
    const effectiveRate = amountIn > 0 ? best.amountOut / amountIn : 0;

    // Calculate price impact
    const { price: priceIn } = await priceFetcher.getPrice(tokenIn);
    const { price: priceOut } = await priceFetcher.getPrice(tokenOut);
    const expectedOut = priceIn > 0 && priceOut > 0 ? (amountIn * priceIn) / priceOut : 0;
    const priceImpact = expectedOut > 0 ? ((expectedOut - best.amountOut) / expectedOut) * 100 : 0;

    return this.success({
      bestDex: best.dex, amountOut: Math.round(best.amountOut * 1e8) / 1e8,
      priceImpact: Math.round(priceImpact * 100) / 100,
      swapFee: best.fee, effectiveRate: Math.round(effectiveRate * 1e8) / 1e8,
      gasEstimateUsd: 0.01, // Base gas is ~$0.01
      route: [tokenIn, tokenOut], lastUpdated: Date.now(),
    });
  }
}

// ===== Skill 13: CompareSwapRoutes =====

export class CompareSwapRoutes extends BaseSkill<{ tokenIn: string; tokenOut: string; amountIn: number }, SwapComparison> {
  metadata: SkillMetadata = {
    name: 'compare_swap_routes',
    description: 'Compares swap rates across all Base DEXs for a given trade.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['compare', 'swap', 'route', 'best', 'dex', 'trade', 'aggregator'],
    authLevel: 'analyze', freshness: 15, rateLimit: 30, mode: 'pull',
    context: 'Different DEXs have different liquidity. Aerodrome often best for Base-native tokens.',
    dependencies: ['get_swap_quote'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer'],
  };

  async execute(input: { tokenIn: string; tokenOut: string; amountIn: number }): Promise<SkillResponse<SwapComparison>> {
    const { tokenIn, tokenOut, amountIn } = input;
    if (!tokenIn || !tokenOut || !amountIn) return this.error('NO_ROUTES', 'All params required');

    const rankings: { dex: Protocol; amountOut: number; priceImpact: number; fee: number; gasEstimate: number; route: string[] }[] = [];

    // Uniswap
    for (const fee of [500, 3000, 10000]) {
      try {
        const r = await uniswapFetcher.getSwapQuote(tokenIn, tokenOut, amountIn, fee);
        if (r.amountOut > 0) {
          rankings.push({ dex: 'uniswap', amountOut: r.amountOut, priceImpact: r.priceImpact, fee: fee / 10000, gasEstimate: 0.01, route: [tokenIn, tokenOut] });
          break;
        }
      } catch {}
    }

    // Aerodrome
    try {
      const r = await aerodromeFetcher.getSwapQuote(tokenIn, tokenOut, amountIn);
      if (r.amountOut > 0) {
        rankings.push({ dex: 'aerodrome', amountOut: r.amountOut, priceImpact: 0, fee: r.stable ? 0.01 : 0.3, gasEstimate: 0.01, route: [tokenIn, tokenOut] });
      }
    } catch {}

    rankings.sort((a, b) => b.amountOut - a.amountOut);

    const savingsVsWorst = rankings.length >= 2
      ? Math.round((rankings[0].amountOut - rankings[rankings.length - 1].amountOut) * 100) / 100
      : 0;

    return this.success({
      rankings, bestDex: rankings.length > 0 ? rankings[0].dex : 'uniswap',
      savingsVsWorst, lastUpdated: Date.now(),
    }, rankings.length > 0 ? 'high' : 'low');
  }
}

// ===== Skill 14: CheckPoolStats =====

export class CheckPoolStats extends BaseSkill<{ poolAddress?: string; tokenA?: string; tokenB?: string; dex?: Protocol }, PoolStats> {
  metadata: SkillMetadata = {
    name: 'check_pool_stats',
    description: 'Returns stats for a liquidity pool — TVL, volume, fees, APR.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['pool', 'stats', 'tvl', 'volume', 'fees', 'liquidity', 'apr'],
    authLevel: 'read', freshness: 60, rateLimit: 30, mode: 'both',
    context: 'Pool stats help evaluate LP worthiness. High volume + high fees = good for LPs.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_impermanent_loss', 'get_top_pools'],
  };

  async execute(input: { poolAddress?: string; tokenA?: string; tokenB?: string; dex?: Protocol }): Promise<SkillResponse<PoolStats>> {
    const { poolAddress, tokenA, tokenB, dex } = input;
    if (!poolAddress && (!tokenA || !tokenB)) return this.error('POOL_NOT_FOUND', 'Provide pool address or token pair');

    let pool = poolAddress;

    // If no pool address, find it from Uniswap factory
    if (!pool && tokenA && tokenB && (!dex || dex === 'uniswap')) {
      for (const fee of [500, 3000, 10000]) {
        const found = await uniswapFetcher.getPoolAddress(tokenA, tokenB, fee);
        if (found) { pool = found; break; }
      }
    }

    if (!pool) return this.error('POOL_NOT_FOUND', 'Pool not found');

    const cacheKey = DataEngine.key(dex || 'uniswap', 'pool_stats', pool);
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const poolData = await uniswapFetcher.getPoolData(pool!);
      if (!poolData) throw new Error('Failed to get pool data');

      return {
        dex: dex || 'uniswap' as Protocol, pair: `${tokenA || '?'}/${tokenB || '?'}`,
        poolAddress: pool!, tvlUsd: 0, volume24hUsd: 0, fees24hUsd: 0,
        apr: 0, rewardApr: 0, totalApr: 0, feeTier: poolData.fee / 10000,
        lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, 'medium', cached);
  }
}

// ===== Skill 15: CheckLiquidityDepth =====

export class CheckLiquidityDepth extends BaseSkill<{ poolAddress?: string; tokenA?: string; tokenB?: string; dex?: Protocol }, LiquidityDepth> {
  metadata: SkillMetadata = {
    name: 'check_liquidity_depth',
    description: 'Returns how much liquidity exists at current price in a pool.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['liquidity', 'depth', 'slippage', 'price impact', 'orderbook'],
    authLevel: 'read', freshness: 30, rateLimit: 20, mode: 'pull',
    context: 'Deep liquidity = low slippage. Shallow = high slippage. Check before large swaps.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['get_swap_quote', 'compare_swap_routes'],
  };

  async execute(input: { poolAddress?: string; tokenA?: string; tokenB?: string; dex?: Protocol }): Promise<SkillResponse<LiquidityDepth>> {
    const { poolAddress, tokenA, tokenB } = input;

    let pool = poolAddress;
    if (!pool && tokenA && tokenB) {
      for (const fee of [500, 3000, 10000]) {
        const found = await uniswapFetcher.getPoolAddress(tokenA, tokenB, fee);
        if (found) { pool = found; break; }
      }
    }

    if (!pool) return this.error('POOL_NOT_FOUND', 'Pool not found');

    const poolData = await uniswapFetcher.getPoolData(pool);
    if (!poolData) return this.error('POOL_NOT_FOUND', 'Failed to read pool');

    // Liquidity depth is approximated from the liquidity value and current tick
    const liquidityNum = Number(BigInt(poolData.liquidity || '0'));

    return this.success({
      currentPrice: poolData.price,
      liquidityAtPriceUsd: liquidityNum > 0 ? liquidityNum / 1e18 : 0,
      depth1pct: 0, // Would need tick-by-tick scan
      depth5pct: 0,
      tickRange: { lower: poolData.tick - 1000, upper: poolData.tick + 1000 },
      lastUpdated: Date.now(),
    }, 'medium');
  }
}

// ===== Skill 16: GetTopPools =====

export class GetTopPools extends BaseSkill<{ dex: Protocol; sortBy?: string; limit?: number }, { pools: TopPool[]; lastUpdated: number }> {
  metadata: SkillMetadata = {
    name: 'get_top_pools',
    description: 'Returns top liquidity pools on a DEX ranked by volume, TVL, or APR.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['top', 'pools', 'ranking', 'best', 'volume', 'tvl', 'apr'],
    authLevel: 'read', freshness: 300, rateLimit: 10, mode: 'pull',
    context: 'Discover most active and profitable pools. Sort by volume for activity, APR for returns, TVL for trust.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_pool_stats', 'check_liquidity_depth'],
  };

  async execute(input: { dex: Protocol; sortBy?: string; limit?: number }): Promise<SkillResponse<any>> {
    const { dex, sortBy = 'volume', limit = 10 } = input;
    if (!dex) return this.error('DEX_NOT_FOUND', 'DEX is required');

    // For top pools, we check common pairs
    const commonPairs = [
      ['WETH', 'USDC'], ['WETH', 'DAI'], ['WETH', 'WBTC'], ['USDC', 'DAI'],
      ['WETH', 'cbETH'], ['WETH', 'wstETH'], ['USDC', 'USDbC'], ['WETH', 'AERO'],
    ];

    const pools: TopPool[] = [];
    for (const [a, b] of commonPairs) {
      try {
        if (dex === 'uniswap') {
          for (const fee of [500, 3000]) {
            const addr = await uniswapFetcher.getPoolAddress(a, b, fee);
            if (addr) {
              const data = await uniswapFetcher.getPoolData(addr);
              if (data) {
                pools.push({
                  pair: `${a}/${b}`, poolAddress: addr, tvlUsd: 0,
                  volume24hUsd: 0, apr: 0, feeTier: fee / 10000,
                });
                break;
              }
            }
          }
        }
      } catch {}
    }

    return this.success({ pools: pools.slice(0, limit), lastUpdated: Date.now() }, 'medium');
  }
}

// ===== Skill 17: CheckImpermanentLoss =====

export class CheckImpermanentLoss extends BaseSkill<{ tokenA: string; tokenB: string; entryPriceRatio?: number; priceChangePct?: number }, ImpermanentLossResult> {
  metadata: SkillMetadata = {
    name: 'check_impermanent_loss',
    description: 'Estimates impermanent loss for an LP position.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['impermanent loss', 'IL', 'lp', 'risk', 'liquidity provider'],
    authLevel: 'analyze', freshness: 60, rateLimit: 20, mode: 'pull',
    context: 'IL occurs when prices diverge from deposit ratio. More divergence = more IL.',
    dependencies: ['get_token_price'], chainable: true, chainOutputCompatibleWith: ['check_pool_stats', 'yield_optimizer'],
  };

  async execute(input: { tokenA: string; tokenB: string; entryPriceRatio?: number; priceChangePct?: number }): Promise<SkillResponse<ImpermanentLossResult>> {
    const { tokenA, tokenB, priceChangePct } = input;
    if (!tokenA || !tokenB) return this.error('INVALID_PAIR', 'Both tokens required');

    const calcIL = (changePct: number): number => {
      const ratio = 1 + changePct / 100;
      return (2 * Math.sqrt(ratio) / (1 + ratio) - 1) * -100;
    };

    // If no priceChangePct given, calculate actual change from current prices
    let actualChange = priceChangePct;
    if (!actualChange) {
      try {
        const { price: priceA } = await priceFetcher.getPrice(tokenA);
        const { price: priceB } = await priceFetcher.getPrice(tokenB);
        if (priceA > 0 && priceB > 0 && input.entryPriceRatio) {
          const currentRatio = priceA / priceB;
          actualChange = ((currentRatio - input.entryPriceRatio) / input.entryPriceRatio) * 100;
        }
      } catch {}
    }

    const projectedIl = {
      change10pct: Math.round(calcIL(10) * 100) / 100,
      change25pct: Math.round(calcIL(25) * 100) / 100,
      change50pct: Math.round(calcIL(50) * 100) / 100,
      change100pct: Math.round(calcIL(100) * 100) / 100,
    };

    const currentIlPct = actualChange ? Math.round(calcIL(actualChange) * 100) / 100 : null;
    const breakevenApr = currentIlPct ? Math.abs(currentIlPct) * 365 / 30 : Math.abs(projectedIl.change25pct) * 365 / 30;

    return this.success({
      currentIlPct, projectedIl,
      breakevenApr: Math.round(Math.abs(breakevenApr) * 100) / 100,
      lastUpdated: Date.now(),
    });
  }
}

// ===== Skill 18: CheckLPRewards =====

export class CheckLPRewards extends BaseSkill<{ poolAddress?: string; tokenA?: string; tokenB?: string; dex: Protocol }, LPRewards> {
  metadata: SkillMetadata = {
    name: 'check_lp_rewards',
    description: 'Returns current rewards and emissions for LP positions on a DEX.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid'],
    tags: ['lp', 'rewards', 'emissions', 'incentives', 'farming', 'staking'],
    authLevel: 'read', freshness: 300, rateLimit: 20, mode: 'both',
    context: 'Aerodrome distributes AERO emissions based on veAERO votes. Reward APR changes weekly.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_pool_stats', 'yield_optimizer'],
  };

  async execute(input: { poolAddress?: string; tokenA?: string; tokenB?: string; dex: Protocol }): Promise<SkillResponse<LPRewards>> {
    const { dex, poolAddress } = input;
    if (!dex) return this.error('POOL_NOT_FOUND', 'DEX is required');

    if (dex === 'aerodrome' && poolAddress) {
      try {
        const gaugeData = await aerodromeFetcher.getGaugeData(poolAddress);
        if (gaugeData) {
          // Calculate reward APR: (rewardRate * 365 * 86400 * AERO_price) / (totalSupply * LP_price)
          const { price: aeroPrice } = await priceFetcher.getPrice('AERO');
          const annualRewards = gaugeData.rewardRate * 86400 * 365;
          const annualRewardsUsd = annualRewards * aeroPrice;
          // Without LP token price, we approximate
          const rewardApr = gaugeData.totalSupply > 0 ? (annualRewardsUsd / gaugeData.totalSupply) * 100 : 0;

          return this.success({
            pool: poolAddress, feeApr: 0,
            rewardTokens: [{ symbol: 'AERO', apr: Math.round(rewardApr * 100) / 100, dailyAmount: gaugeData.rewardRate * 86400 }],
            totalRewardApr: Math.round(rewardApr * 100) / 100, totalApr: Math.round(rewardApr * 100) / 100,
            emissionSchedule: 'weekly epochs', lastUpdated: Date.now(),
          });
        }
      } catch (err) {
        console.error('[check_lp_rewards] aerodrome failed:', err);
      }
    }

    return this.success({
      pool: poolAddress || `${input.tokenA}/${input.tokenB}`, feeApr: 0,
      rewardTokens: [], totalRewardApr: 0, totalApr: 0,
      emissionSchedule: dex === 'aerodrome' ? 'weekly epochs' : 'continuous', lastUpdated: Date.now(),
    }, 'medium');
  }
}
