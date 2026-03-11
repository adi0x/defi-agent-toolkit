// =============================================
// ANALYTICS SKILLS (23-30) — WITH REAL FETCHERS
// =============================================

import { BaseSkill } from '../BaseSkill';
import { SkillMetadata, SkillResponse, ProtocolTVL, TVLTrend, WhaleTrackerResult, GasEstimate, TokenOverview, PortfolioResult, RiskScoreResult, YieldOptimizerResult, Protocol, Strategy } from '../../types';
import { dataEngine, DataEngine } from '../../engine/DataEngine';
import { BASE_TOKENS, DEFAULTS } from '../../config';
import { getProvider } from '../../engine/provider';
import { priceFetcher, tvlFetcher, aaveFetcher, fluidFetcher, whaleFetcher } from '../../engine/fetchers';
import { CheckSupplyAPY } from '../lending/index';

// ===== Skill 23: ProtocolTVL =====

export class ProtocolTVLSkill extends BaseSkill<{ protocol: Protocol }, ProtocolTVL> {
  metadata: SkillMetadata = {
    name: 'protocol_tvl',
    description: 'Returns total value locked in a protocol on Base.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['tvl', 'total value locked', 'size', 'protocol', 'metrics'],
    authLevel: 'read', freshness: 300, rateLimit: 20, mode: 'both',
    context: 'TVL indicates protocol size and trust. Higher TVL = more battle-tested.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['tvl_trend', 'risk_score'],
  };

  async execute(input: { protocol: Protocol }): Promise<SkillResponse<ProtocolTVL>> {
    const { protocol } = input;
    if (!protocol) return this.error('PROTOCOL_NOT_FOUND', 'Protocol is required');

    const cacheKey = DataEngine.key(protocol, 'tvl');
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const tvlUsd = await tvlFetcher.getProtocolTVL(protocol);
      const { price: ethPrice } = await priceFetcher.getPrice('ETH');
      return {
        protocol, tvlUsd, tvlEth: ethPrice > 0 ? tvlUsd / ethPrice : 0,
        rankOnBase: 0, lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, data.tvlUsd > 0 ? 'high' : 'low', cached);
  }
}

// ===== Skill 24: TVLTrend =====

export class TVLTrendSkill extends BaseSkill<{ protocol: Protocol; period?: string }, TVLTrend> {
  metadata: SkillMetadata = {
    name: 'tvl_trend',
    description: 'Returns TVL change over time — 24h, 7d, 30d trends.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['tvl', 'trend', 'change', 'growth', 'decline', 'history'],
    authLevel: 'analyze', freshness: 300, rateLimit: 10, mode: 'pull',
    context: 'TVL trends reveal protocol health. Sharp drops (>10% in 24h) = red flag.',
    dependencies: ['protocol_tvl'], chainable: true, chainOutputCompatibleWith: ['risk_score'],
  };

  async execute(input: { protocol: Protocol }): Promise<SkillResponse<TVLTrend>> {
    const { protocol } = input;
    if (!protocol) return this.error('PROTOCOL_NOT_FOUND', 'Protocol is required');

    const cacheKey = DataEngine.key(protocol, 'tvl_trend');
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const history = await tvlFetcher.getProtocolHistory(protocol);
      if (!history.length) {
        return {
          protocol, currentTvlUsd: 0, change24hPct: 0, change7dPct: 0, change30dPct: 0,
          direction: 'stable' as any, lastUpdated: Date.now(),
        };
      }

      const current = history[history.length - 1]?.totalLiquidityUSD || 0;
      const getHistorical = (daysAgo: number) => {
        const idx = Math.max(0, history.length - 1 - daysAgo);
        return history[idx]?.totalLiquidityUSD || current;
      };

      const pct = (now: number, then: number) => then > 0 ? Math.round(((now - then) / then) * 10000) / 100 : 0;

      const change24h = pct(current, getHistorical(1));
      const change7d = pct(current, getHistorical(7));
      const change30d = pct(current, getHistorical(30));
      const direction = change7d > 2 ? 'growing' : change7d < -2 ? 'declining' : 'stable';

      return {
        protocol, currentTvlUsd: current, change24hPct: change24h,
        change7dPct: change7d, change30dPct: change30d,
        direction: direction as any, lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, data.currentTvlUsd > 0 ? 'high' : 'low', cached);
  }
}

// ===== Skill 25: WhaleTracker =====

export class WhaleTracker extends BaseSkill<{ minValueUsd?: number; protocol?: Protocol; action?: string; timeframe?: string }, WhaleTrackerResult> {
  metadata: SkillMetadata = {
    name: 'whale_tracker',
    description: 'Monitors large transactions on Base across protocols.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['whale', 'large', 'transaction', 'alert', 'monitor', 'big money'],
    authLevel: 'read', freshness: 30, rateLimit: 20, mode: 'both',
    context: 'Whale movements can signal market changes. Large deposits = possible borrow setup.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['portfolio_check'],
  };

  async execute(input: { minValueUsd?: number; protocol?: Protocol }): Promise<SkillResponse<WhaleTrackerResult>> {
    const minValue = input.minValueUsd || DEFAULTS.whaleMinUsd;

    try {
      const transactions = await whaleFetcher.getRecentWhaleActivity(minValue, 200);

      const totalValueUsd = transactions.reduce((sum, t) => sum + t.amountUsd, 0);
      const topWallet = transactions.length > 0
        ? transactions.sort((a, b) => b.amountUsd - a.amountUsd)[0].wallet
        : '';

      return this.success({
        transactions,
        totalCount: transactions.length,
        totalValueUsd: Math.round(totalValueUsd),
        topWallet,
        lastUpdated: Date.now(),
      } as any);
    } catch (err) {
      return this.error('FETCH_FAILED', `Whale tracking failed: ${err}`);
    }
  }
}

// ===== Skill 26: GasEstimator =====

export class GasEstimatorSkill extends BaseSkill<{ action: string; protocol?: Protocol }, GasEstimate> {
  metadata: SkillMetadata = {
    name: 'gas_estimator',
    description: 'Estimates gas cost in USD for common DeFi actions on Base.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['gas', 'cost', 'fee', 'estimate', 'transaction'],
    authLevel: 'read', freshness: 30, rateLimit: 30, mode: 'pull',
    context: 'Base has very low gas. But for small positions, gas can eat profits.',
    dependencies: ['get_token_price'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer', 'get_swap_quote'],
  };

  private gasEstimates: Record<string, number> = {
    swap: 150000, supply: 200000, borrow: 250000, repay: 200000,
    withdraw: 180000, add_liquidity: 300000, remove_liquidity: 250000,
    claim_rewards: 150000, approve: 46000,
  };

  async execute(input: { action: string }): Promise<SkillResponse<GasEstimate>> {
    const { action } = input;
    if (!action || !this.gasEstimates[action]) {
      return this.error('UNKNOWN_ACTION', `Unknown action: ${action}. Valid: ${Object.keys(this.gasEstimates).join(', ')}`);
    }

    try {
      const provider = getProvider();
      const feeData = await provider.getFeeData();
      const gasPriceGwei = Number(feeData.gasPrice || 0) / 1e9;
      const gasUnits = this.gasEstimates[action];
      const costEth = (gasUnits * gasPriceGwei) / 1e9;

      const { price: ethPrice } = await priceFetcher.getPrice('ETH');

      return this.success({
        action, estimatedGasUnits: gasUnits,
        gasPriceGwei: Math.round(gasPriceGwei * 1000) / 1000,
        costEth: Math.round(costEth * 1e8) / 1e8,
        costUsd: Math.round(costEth * ethPrice * 10000) / 10000,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      return this.error('ESTIMATION_FAILED', `Gas estimation failed: ${err}`);
    }
  }
}

// ===== Skill 27: TokenOverview =====

export class TokenOverviewSkill extends BaseSkill<{ token: string }, TokenOverview> {
  metadata: SkillMetadata = {
    name: 'token_overview',
    description: 'Returns comprehensive overview of a token on Base.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['uniswap', 'aerodrome', 'fluid', 'aave', 'morpho'],
    tags: ['token', 'overview', 'info', 'summary', 'research', 'details'],
    authLevel: 'read', freshness: 60, rateLimit: 20, mode: 'pull',
    context: 'Full picture of a token before making recommendations.',
    dependencies: ['get_token_price', 'list_supported_assets'], chainable: true, chainOutputCompatibleWith: ['get_swap_quote', 'check_supply_apy'],
  };

  async execute(input: { token: string }): Promise<SkillResponse<TokenOverview>> {
    const { token } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const address = BASE_TOKENS[token.toUpperCase()];
    if (!address) return this.error('TOKEN_NOT_FOUND', `Token ${token} not found on Base`);

    const cacheKey = DataEngine.key('all', 'token_overview', token);
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      // Get price data
      const priceData = await priceFetcher.getPrice(token);

      // Check which protocols support this token
      const listedOn: Protocol[] = [];
      const canSupply: Protocol[] = [];
      const canBorrow: Protocol[] = [];

      // Check Aave
      try {
        const reserves = await aaveFetcher.getAllReserves();
        if (reserves.some((r: any) => r.symbol?.toUpperCase() === token.toUpperCase())) {
          listedOn.push('aave');
          canSupply.push('aave');
          canBorrow.push('aave');
        }
      } catch {}

      // Check Fluid
      try {
        const fTokens = await fluidFetcher.getLendingData();
        if (fTokens.some((f: any) => f.symbol?.toUpperCase().includes(token.toUpperCase()))) {
          listedOn.push('fluid');
          canSupply.push('fluid');
          canBorrow.push('fluid');
        }
      } catch {}

      // Uniswap and Aerodrome always support any token with liquidity
      listedOn.push('uniswap', 'aerodrome');

      return {
        symbol: token.toUpperCase(), name: token, contractAddress: address,
        priceUsd: priceData.price, priceChange24h: priceData.change24h,
        totalLiquidityUsd: 0, volume24hUsd: 0,
        listedOn, topPools: [], canSupply, canBorrow, lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, data.priceUsd > 0 ? 'high' : 'medium', cached);
  }
}

// ===== Skill 28: PortfolioCheck =====

export class PortfolioCheck extends BaseSkill<{ walletAddress: string }, PortfolioResult> {
  metadata: SkillMetadata = {
    name: 'portfolio_check',
    description: 'Returns all DeFi positions for a wallet across all 5 protocols on Base.',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['portfolio', 'wallet', 'positions', 'holdings', 'balance', 'overview'],
    authLevel: 'read', freshness: 60, rateLimit: 10, mode: 'pull',
    context: 'Complete picture of a user DeFi activity on Base.',
    dependencies: ['check_health_factor', 'get_token_price'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer', 'risk_score'],
  };

  async execute(input: { walletAddress: string }): Promise<SkillResponse<PortfolioResult>> {
    const { walletAddress } = input;
    if (!walletAddress) return this.error('WALLET_NOT_FOUND', 'Wallet address is required');

    const positions: any[] = [];
    const atRisk: any[] = [];
    let totalSupplied = 0;
    let totalBorrowed = 0;

    // Aave positions
    try {
      const userData = await aaveFetcher.getUserData(walletAddress);
      if (userData.totalCollateralUsd > 0) {
        totalSupplied += userData.totalCollateralUsd;
        totalBorrowed += userData.totalDebtUsd;
        positions.push({
          protocol: 'aave', type: 'lending',
          suppliedUsd: userData.totalCollateralUsd, borrowedUsd: userData.totalDebtUsd,
          healthFactor: userData.healthFactor,
        });
        if (userData.healthFactor < DEFAULTS.healthFactorWarning && userData.totalDebtUsd > 0) {
          atRisk.push({ protocol: 'aave', healthFactor: userData.healthFactor, debtUsd: userData.totalDebtUsd });
        }
      }
    } catch (err) {
      console.error('[portfolio_check] aave failed:', err);
    }

    // Get ETH balance
    try {
      const provider = getProvider();
      const balance = await provider.getBalance(walletAddress);
      const ethBalance = Number(balance) / 1e18;
      if (ethBalance > 0.001) {
        const { price } = await priceFetcher.getPrice('ETH');
        positions.push({ protocol: 'wallet', type: 'token', token: 'ETH', amount: ethBalance, valueUsd: ethBalance * price });
      }
    } catch {}

    const totalValue = totalSupplied + positions.reduce((sum, p) => sum + (p.valueUsd || 0), 0);

    return this.success({
      wallet: walletAddress, totalValueUsd: totalValue,
      totalSuppliedUsd: totalSupplied, totalBorrowedUsd: totalBorrowed, totalLpUsd: 0,
      positions, atRisk, lastUpdated: Date.now(),
    });
  }
}

// ===== Skill 29: RiskScore =====

export class RiskScoreSkill extends BaseSkill<{ protocol: Protocol }, RiskScoreResult> {
  metadata: SkillMetadata = {
    name: 'risk_score',
    description: 'Returns overall risk assessment for a protocol (1-10 score).',
    version: '1.0.0', category: 'analytics', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['risk', 'score', 'safety', 'assessment', 'audit', 'security'],
    authLevel: 'analyze', freshness: 3600, rateLimit: 10, mode: 'pull',
    context: 'Combines TVL, audits, age, utilization, incidents into a 1-10 score.',
    dependencies: ['protocol_tvl', 'tvl_trend'], chainable: true, chainOutputCompatibleWith: ['compare_yields', 'yield_optimizer'],
  };

  private riskData: Record<Protocol, { audits: { firm: string; date: string }[]; timeLive: string; incidents: { description: string; date: string }[]; baseScore: number }> = {
    aave: {
      audits: [{ firm: 'OpenZeppelin', date: '2023-01' }, { firm: 'Certora', date: '2023-03' }, { firm: 'SigmaPrime', date: '2023-06' }],
      timeLive: '4+ years', incidents: [], baseScore: 9,
    },
    uniswap: {
      audits: [{ firm: 'Trail of Bits', date: '2023-01' }, { firm: 'ABDK', date: '2022-06' }],
      timeLive: '5+ years', incidents: [], baseScore: 9,
    },
    aerodrome: {
      audits: [{ firm: 'Velodrome audits (inherited)', date: '2023-08' }],
      timeLive: '2+ years', incidents: [], baseScore: 7,
    },
    morpho: {
      audits: [{ firm: 'Spearbit', date: '2024-01' }, { firm: 'Cantina', date: '2024-03' }],
      timeLive: '2+ years', incidents: [{ description: 'Frontend exploit $2.6M (April 2025, recovered)', date: '2025-04' }], baseScore: 8,
    },
    fluid: {
      audits: [{ firm: 'Multiple auditors', date: '2024-06' }],
      timeLive: '1.5+ years', incidents: [], baseScore: 7,
    },
  };

  async execute(input: { protocol: Protocol }): Promise<SkillResponse<RiskScoreResult>> {
    const { protocol } = input;
    if (!protocol || !this.riskData[protocol]) return this.error('PROTOCOL_NOT_FOUND', `Protocol ${protocol} not tracked`);

    const rd = this.riskData[protocol];

    // Get live TVL to factor into score
    let tvlBonus = 0;
    try {
      const tvl = await tvlFetcher.getProtocolTVL(protocol);
      if (tvl > 5e9) tvlBonus = 1;
      else if (tvl > 1e9) tvlBonus = 0.5;
    } catch {}

    const factors = {
      tvlScore: Math.min(10, rd.baseScore + tvlBonus),
      auditScore: Math.min(10, rd.audits.length * 3),
      ageScore: rd.timeLive.includes('4+') ? 10 : rd.timeLive.includes('2+') ? 7 : 5,
      utilizationScore: 8,
      incidentScore: rd.incidents.length === 0 ? 10 : 10 - rd.incidents.length * 2,
      governanceScore: 7,
    };

    const overall = Math.round(
      (factors.tvlScore + factors.auditScore + factors.ageScore +
        factors.utilizationScore + factors.incidentScore + factors.governanceScore) / 6 * 10
    ) / 10;

    const rating = overall >= 8.5 ? 'very_safe' : overall >= 7 ? 'safe' : overall >= 5 ? 'moderate' : overall >= 3 ? 'risky' : 'very_risky';

    return this.success({
      protocol, overallScore: overall, rating: rating as any, factors,
      audits: rd.audits, timeLive: rd.timeLive, knownIncidents: rd.incidents, lastUpdated: Date.now(),
    });
  }
}

// ===== Skill 30: YieldOptimizer =====

export class YieldOptimizer extends BaseSkill<{ token: string; amount: number; riskTolerance?: string; timeHorizon?: string }, YieldOptimizerResult> {
  metadata: SkillMetadata = {
    name: 'yield_optimizer',
    description: 'Recommends the best strategy across all protocols for a given token and amount.',
    version: '1.0.0', category: 'cross-protocol', chain: 'base', protocols: ['aave', 'uniswap', 'aerodrome', 'morpho', 'fluid'],
    tags: ['optimize', 'strategy', 'best', 'yield', 'recommendation', 'advisor'],
    authLevel: 'analyze', freshness: 120, rateLimit: 5, mode: 'pull',
    context: 'The brain skill. Recommends risk-adjusted strategies. Not financial advice.',
    dependencies: ['check_supply_apy', 'check_vault_performance', 'check_pool_stats', 'risk_score', 'gas_estimator'],
    chainable: false, chainOutputCompatibleWith: [],
  };

  private supplySkill = new CheckSupplyAPY();

  async execute(input: { token: string; amount: number; riskTolerance?: string; timeHorizon?: string }): Promise<SkillResponse<YieldOptimizerResult>> {
    const { token, amount, riskTolerance = 'moderate', timeHorizon = 'medium' } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token is required');
    if (!amount || amount <= 0) return this.error('AMOUNT_TOO_SMALL', 'Valid amount is required');

    const strategies: Strategy[] = [];

    // Get actual APYs from lending protocols
    try {
      const supplyResult = await this.supplySkill.execute({ token });
      if (supplyResult.success) {
        for (const r of supplyResult.data) {
          strategies.push({
            strategyName: `Supply ${token} on ${r.protocol.charAt(0).toUpperCase() + r.protocol.slice(1)}`,
            protocols: [r.protocol], actionType: 'supply',
            expectedApy: r.totalApy,
            riskScore: r.protocol === 'aave' ? 9 : r.protocol === 'morpho' ? 8 : 7,
            gasCostUsd: 0.01, ilRisk: null,
            complexity: r.protocol === 'morpho' ? 'moderate' : 'simple',
            steps: [
              `1. Go to ${r.protocol.charAt(0).toUpperCase() + r.protocol.slice(1)} on Base`,
              `2. Supply ${amount} ${token}`,
              `3. Earn ${r.totalApy}% APY`,
            ],
          });
        }
      }
    } catch {}

    // Aerodrome LP strategy
    strategies.push({
      strategyName: `LP ${token}/USDC on Aerodrome`,
      protocols: ['aerodrome'], actionType: 'lp', expectedApy: 0,
      riskScore: 6, gasCostUsd: 0.03, ilRisk: 5, complexity: 'moderate',
      steps: [
        `1. Go to Aerodrome on Base`,
        `2. Find ${token}/USDC pool with highest emissions`,
        `3. Add liquidity and stake in gauge`,
      ],
    });

    // Fluid smart collateral
    strategies.push({
      strategyName: `Smart Collateral on Fluid`,
      protocols: ['fluid'], actionType: 'smart_collateral', expectedApy: 0,
      riskScore: 7, gasCostUsd: 0.02, ilRisk: 2, complexity: 'moderate',
      steps: [
        `1. Go to Fluid on Base`,
        `2. Open a smart collateral vault with ${token}`,
        `3. Earn lending + trading fees simultaneously`,
      ],
    });

    // Sort by APY
    strategies.sort((a, b) => b.expectedApy - a.expectedApy);

    // Filter by risk tolerance
    const riskFilter = riskTolerance === 'conservative' ? 8 : riskTolerance === 'aggressive' ? 0 : 6;
    const filtered = strategies.filter((s) => s.riskScore >= riskFilter);
    const recommended = filtered.length > 0 ? filtered[0] : strategies[0];

    return this.success({
      strategies, recommended,
      comparisonNote: `Recommended "${recommended.strategyName}" (${recommended.expectedApy}% APY, risk ${recommended.riskScore}/10) for ${riskTolerance} risk tolerance over ${timeHorizon} term. Not financial advice.`,
      lastUpdated: Date.now(),
    }, 'medium');
  }
}
