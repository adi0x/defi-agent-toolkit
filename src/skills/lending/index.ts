// =============================================
// ALL LENDING SKILLS (1-10) — WITH REAL FETCHERS
// =============================================

import { BaseSkill } from '../BaseSkill';
import { SkillMetadata, SkillResponse, SupplyAPYResult, BorrowAPYResult, YieldComparison, BorrowComparison, HealthFactorResult, LiquidationParams, LiquidityResult, UtilizationResult, SupportedAsset, VaultPerformance, Protocol } from '../../types';
import { dataEngine, DataEngine } from '../../engine/DataEngine';
import { PROTOCOL_ADDRESSES, BASE_TOKENS, DEFAULTS } from '../../config';
import { aaveFetcher, morphoFetcher, fluidFetcher, priceFetcher } from '../../engine/fetchers';

// ===== Skill 1: CheckSupplyAPY =====

export class CheckSupplyAPY extends BaseSkill<{ token: string; protocol?: Protocol }, SupplyAPYResult[]> {
  metadata: SkillMetadata = {
    name: 'check_supply_apy',
    description: 'Returns the current annual percentage yield for supplying a specific token to a lending protocol on Base.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['supply', 'apy', 'yield', 'earn', 'interest', 'lend', 'deposit'],
    authLevel: 'read', freshness: 60, rateLimit: 30, mode: 'both',
    context: 'Supply APY is the annualized return a lender earns. Higher utilization = higher APY. Agents should check this before recommending deposits.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_yields', 'yield_optimizer'],
  };

  async execute(input: { token: string; protocol?: Protocol }): Promise<SkillResponse<SupplyAPYResult[]>> {
    const { token, protocol } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const protocols: Protocol[] = protocol ? [protocol] : ['aave', 'morpho', 'fluid'];
    const results: SupplyAPYResult[] = [];

    for (const proto of protocols) {
      try {
        const cacheKey = DataEngine.key(proto, 'supply_apy', token);
        const { data } = await dataEngine.get(cacheKey, () => this.fetch(proto, token), this.metadata.freshness);
        if (data.supplyApy > 0) results.push(data);
      } catch (err) {
        console.error(`[check_supply_apy] ${proto} failed:`, err);
      }
    }

    if (results.length === 0) return this.error('TOKEN_NOT_FOUND', `Token ${token} not found on any lending protocol`);
    return this.success(results);
  }

  private async fetch(protocol: Protocol, token: string): Promise<SupplyAPYResult> {
    switch (protocol) {
      case 'aave': {
        const data = await aaveFetcher.getReserveData(token);
        return {
          protocol: 'aave', token, supplyApy: Math.round(data.supplyApy * 100) / 100,
          rewardApy: 0, totalApy: Math.round(data.supplyApy * 100) / 100, lastUpdated: Date.now(),
        };
      }
      case 'morpho': {
        const rates = await morphoFetcher.getSupplyRates(token);
        if (!rates) return { protocol: 'morpho', token, supplyApy: 0, rewardApy: 0, totalApy: 0, lastUpdated: Date.now() };
        // Best supply APY from Morpho markets where this is the loan asset
        const rewardApr = rates.bestMarket.rewards?.reduce((sum: number, r: any) => sum + (r.supplyApr || 0), 0) * 100 || 0;
        return {
          protocol: 'morpho', token,
          supplyApy: Math.round(rates.bestSupplyApy * 100) / 100,
          rewardApy: Math.round(rewardApr * 100) / 100,
          totalApy: Math.round((rates.bestSupplyApy + rewardApr) * 100) / 100,
          lastUpdated: Date.now(),
        };
      }
      case 'fluid': {
        const rates = await fluidFetcher.getTokenRates(token);
        if (!rates) return { protocol: 'fluid', token, supplyApy: 0, rewardApy: 0, totalApy: 0, lastUpdated: Date.now() };
        const supplyApy = rates.supplyRate;
        // Check for reward incentives from fToken data
        let rewardApy = 0;
        try {
          const fTokens = await fluidFetcher.getLendingData();
          const match = fTokens.find((f: any) => f.symbol?.toUpperCase().includes(token.toUpperCase()));
          if (match?.rewardsActive) rewardApy = match.rewardRate / 100;
        } catch {}
        return {
          protocol: 'fluid', token, supplyApy: Math.round(supplyApy * 100) / 100,
          rewardApy, totalApy: Math.round((supplyApy + rewardApy) * 100) / 100, lastUpdated: Date.now(),
        };
      }
      default:
        throw new Error(`Protocol ${protocol} not supported`);
    }
  }
}

// ===== Skill 2: CheckBorrowAPY =====

export class CheckBorrowAPY extends BaseSkill<{ token: string; protocol?: Protocol }, BorrowAPYResult[]> {
  metadata: SkillMetadata = {
    name: 'check_borrow_apy',
    description: 'Returns the current annual percentage rate for borrowing a specific token from a lending protocol on Base.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['borrow', 'apy', 'rate', 'interest', 'loan', 'debt'],
    authLevel: 'read', freshness: 60, rateLimit: 30, mode: 'both',
    context: 'Borrow APY is the annualized cost of a loan. Fluid may offer lower effective rates due to smart debt fee offsets.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_borrow_rates', 'yield_optimizer'],
  };

  async execute(input: { token: string; protocol?: Protocol }): Promise<SkillResponse<BorrowAPYResult[]>> {
    const { token, protocol } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const protocols: Protocol[] = protocol ? [protocol] : ['aave', 'morpho', 'fluid'];
    const results: BorrowAPYResult[] = [];

    for (const proto of protocols) {
      try {
        const cacheKey = DataEngine.key(proto, 'borrow_apy', token);
        const { data } = await dataEngine.get(cacheKey, () => this.fetch(proto, token), this.metadata.freshness);
        results.push(data);
      } catch (err) {
        console.error(`[check_borrow_apy] ${proto} failed:`, err);
      }
    }

    if (results.length === 0) return this.error('TOKEN_NOT_FOUND', `Token ${token} not found on any protocol`);
    return this.success(results);
  }

  private async fetch(protocol: Protocol, token: string): Promise<BorrowAPYResult> {
    switch (protocol) {
      case 'aave': {
        const data = await aaveFetcher.getReserveData(token);
        return {
          protocol: 'aave', token, borrowApy: Math.round(data.borrowApy * 100) / 100,
          rewardOffset: 0, effectiveApy: Math.round(data.borrowApy * 100) / 100, lastUpdated: Date.now(),
        };
      }
      case 'morpho': {
        const rates = await morphoFetcher.getBorrowRates(token);
        if (!rates) return { protocol: 'morpho', token, borrowApy: 0, rewardOffset: 0, effectiveApy: 0, lastUpdated: Date.now() };
        const rewardOffset = rates.bestMarket.rewards?.reduce((sum: number, r: any) => sum + (r.borrowApr || 0), 0) * 100 || 0;
        return {
          protocol: 'morpho', token, borrowApy: Math.round(rates.bestBorrowApy * 100) / 100,
          rewardOffset: Math.round(rewardOffset * 100) / 100,
          effectiveApy: Math.round((rates.bestBorrowApy - rewardOffset) * 100) / 100,
          lastUpdated: Date.now(),
        };
      }
      case 'fluid': {
        const rates = await fluidFetcher.getTokenRates(token);
        if (!rates) return { protocol: 'fluid', token, borrowApy: 0, rewardOffset: 0, effectiveApy: 0, lastUpdated: Date.now() };
        return {
          protocol: 'fluid', token, borrowApy: Math.round(rates.borrowRate * 100) / 100,
          rewardOffset: 0, effectiveApy: Math.round(rates.borrowRate * 100) / 100, lastUpdated: Date.now(),
        };
      }
      default:
        throw new Error(`Protocol ${protocol} not supported`);
    }
  }
}

// ===== Skill 3: CompareYields =====

export class CompareYields extends BaseSkill<{ token: string }, YieldComparison> {
  metadata: SkillMetadata = {
    name: 'compare_yields',
    description: 'Compares supply APYs for a token across all lending protocols on Base, ranked best to worst.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['compare', 'yield', 'best', 'ranking', 'supply', 'apy', 'earn'],
    authLevel: 'analyze', freshness: 120, rateLimit: 20, mode: 'pull',
    context: 'Find where a user gets the best return. Higher APY does not always mean better — check risk_score too.',
    dependencies: ['check_supply_apy', 'risk_score'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer'],
  };

  private supplySkill = new CheckSupplyAPY();

  async execute(input: { token: string }): Promise<SkillResponse<YieldComparison>> {
    const { token } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const cacheKey = DataEngine.key('all', 'compare_yields', token);
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const supplyResult = await this.supplySkill.execute({ token });
      if (!supplyResult.success || !supplyResult.data.length) throw new Error('No supply data');

      const riskScores: Record<Protocol, number> = { aave: 9, uniswap: 8, aerodrome: 7, morpho: 8, fluid: 7 };

      const rankings = supplyResult.data
        .map((r) => ({
          protocol: r.protocol, supplyApy: r.supplyApy, rewardApy: r.rewardApy,
          totalApy: r.totalApy, riskScore: riskScores[r.protocol] || 5, tvl: 0,
        }))
        .sort((a, b) => b.totalApy - a.totalApy);

      const bestRiskAdj = [...rankings].sort((a, b) => {
        return (b.totalApy * b.riskScore / 10) - (a.totalApy * a.riskScore / 10);
      });

      return {
        rankings, bestProtocol: rankings[0].protocol,
        bestRiskAdjusted: bestRiskAdj[0].protocol, lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, 'high', cached);
  }
}

// ===== Skill 4: CompareBorrowRates =====

export class CompareBorrowRates extends BaseSkill<{ token: string }, BorrowComparison> {
  metadata: SkillMetadata = {
    name: 'compare_borrow_rates',
    description: 'Compares borrow rates for a token across all lending protocols on Base.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['compare', 'borrow', 'rate', 'cheapest', 'loan', 'debt'],
    authLevel: 'analyze', freshness: 120, rateLimit: 20, mode: 'pull',
    context: 'Finds cheapest place to borrow. Includes effective rates after reward offsets.',
    dependencies: ['check_borrow_apy'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer'],
  };

  private borrowSkill = new CheckBorrowAPY();

  async execute(input: { token: string }): Promise<SkillResponse<BorrowComparison>> {
    const { token } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const cacheKey = DataEngine.key('all', 'compare_borrow', token);
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const borrowResult = await this.borrowSkill.execute({ token });
      if (!borrowResult.success) throw new Error('No borrow data');

      const rankings = borrowResult.data
        .map((r) => ({
          protocol: r.protocol, borrowApy: r.borrowApy, rewardOffset: r.rewardOffset,
          effectiveApy: r.effectiveApy, availableLiquidity: 0,
        }))
        .sort((a, b) => a.effectiveApy - b.effectiveApy);

      return { rankings, cheapestProtocol: rankings[0].protocol, lastUpdated: Date.now() };
    }, this.metadata.freshness);

    return this.success(data, 'high', cached);
  }
}

// ===== Skill 5: CheckHealthFactor =====

export class CheckHealthFactor extends BaseSkill<{ walletAddress: string; protocol?: Protocol }, HealthFactorResult> {
  metadata: SkillMetadata = {
    name: 'check_health_factor',
    description: 'Checks a wallet liquidation risk across lending protocols on Base.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['health', 'liquidation', 'risk', 'position', 'safety', 'collateral'],
    authLevel: 'read', freshness: 30, rateLimit: 30, mode: 'both',
    context: 'Health factor above 1.0 = safe. Below 1.0 = liquidatable. Alert users below 1.5.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['portfolio_check', 'risk_score'],
  };

  async execute(input: { walletAddress: string; protocol?: Protocol }): Promise<SkillResponse<HealthFactorResult>> {
    const { walletAddress, protocol } = input;
    if (!walletAddress) return this.error('WALLET_NOT_FOUND', 'Wallet address is required');

    const positions: HealthFactorResult['positions'] = [];

    // Aave health factor
    if (!protocol || protocol === 'aave') {
      try {
        const data = await aaveFetcher.getUserData(walletAddress);
        if (data.totalDebtUsd > 0) {
          const hf = data.healthFactor;
          positions.push({
            protocol: 'aave', healthFactor: Math.round(hf * 100) / 100,
            collateralValueUsd: data.totalCollateralUsd, debtValueUsd: data.totalDebtUsd,
            liquidationPrice: 0,
            riskLevel: hf > DEFAULTS.healthFactorWarning ? 'safe' : hf > DEFAULTS.healthFactorDanger ? 'warning' : hf > DEFAULTS.healthFactorCritical ? 'danger' : 'critical',
          });
        }
      } catch (err) {
        console.error('[check_health_factor] aave failed:', err);
      }
    }

    // Morpho — check positions via Morpho Blue
    if (!protocol || protocol === 'morpho') {
      // Morpho health factor requires knowing specific market IDs the user is in
      // Would need to iterate known markets — skipping for now without indexer
    }

    // Fluid — similar, needs vault iteration
    if (!protocol || protocol === 'fluid') {
      // Would query each vault for user position
    }

    const mostAtRisk = positions.length > 0
      ? { protocol: positions.sort((a, b) => a.healthFactor - b.healthFactor)[0].protocol, healthFactor: positions[0].healthFactor }
      : null;

    return this.success({ positions, mostAtRisk, lastUpdated: Date.now() });
  }
}

// ===== Skill 6: CheckLiquidationThreshold =====

export class CheckLiquidationThreshold extends BaseSkill<{ token: string; protocol?: Protocol }, LiquidationParams[]> {
  metadata: SkillMetadata = {
    name: 'check_liquidation_threshold',
    description: 'Returns liquidation parameters for an asset on a lending protocol.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['liquidation', 'ltv', 'threshold', 'penalty', 'collateral', 'parameters'],
    authLevel: 'read', freshness: 300, rateLimit: 20, mode: 'pull',
    context: 'Max LTV is the max you can borrow against collateral. Liquidation threshold is where liquidation triggers.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_health_factor', 'risk_score'],
  };

  async execute(input: { token: string; protocol?: Protocol }): Promise<SkillResponse<LiquidationParams[]>> {
    const { token, protocol } = input;
    if (!token) return this.error('TOKEN_NOT_SUPPORTED', 'Token symbol is required');

    const results: LiquidationParams[] = [];

    if (!protocol || protocol === 'aave') {
      try {
        const config = await aaveFetcher.getReserveConfig(token);
        results.push({
          protocol: 'aave', token, maxLtv: config.maxLtv,
          liquidationThreshold: config.liquidationThreshold,
          liquidationPenalty: config.liquidationPenalty,
          canBeCollateral: config.canBeCollateral, isIsolated: false, lastUpdated: Date.now(),
        });
      } catch (err) {
        console.error('[check_liquidation_threshold] aave failed:', err);
      }
    }

    // Fluid has per-vault liquidation params
    if (!protocol || protocol === 'fluid') {
      try {
        const vaults = await fluidFetcher.getAllVaults();
        // Each vault has its own config — would need to find vaults with this token
      } catch (err) {
        console.error('[check_liquidation_threshold] fluid failed:', err);
      }
    }

    if (results.length === 0) return this.error('TOKEN_NOT_SUPPORTED', `No liquidation data for ${token}`);
    return this.success(results);
  }
}

// ===== Skill 7: CheckAvailableLiquidity =====

export class CheckAvailableLiquidity extends BaseSkill<{ token: string; protocol?: Protocol }, LiquidityResult[]> {
  metadata: SkillMetadata = {
    name: 'check_available_liquidity',
    description: 'Returns how much of a token is available to borrow right now.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['liquidity', 'available', 'borrow', 'capacity', 'supply'],
    authLevel: 'read', freshness: 60, rateLimit: 30, mode: 'both',
    context: 'Available liquidity = total supplied minus total borrowed. If low, new borrows may fail.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_borrow_rates', 'protocol_tvl'],
  };

  async execute(input: { token: string; protocol?: Protocol }): Promise<SkillResponse<LiquidityResult[]>> {
    const { token, protocol } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const results: LiquidityResult[] = [];

    if (!protocol || protocol === 'aave') {
      try {
        const data = await aaveFetcher.getReserveData(token);
        // Get price to compute USD values
        const { price } = await priceFetcher.getPrice(token);
        results.push({
          protocol: 'aave', token, totalSupplied: data.totalSupplied, totalBorrowed: data.totalBorrowed,
          availableLiquidity: data.availableLiquidity,
          availableLiquidityUsd: data.availableLiquidity * (price || 1),
          lastUpdated: Date.now(),
        });
      } catch (err) {
        console.error('[check_available_liquidity] aave failed:', err);
      }
    }

    if (!protocol || protocol === 'fluid') {
      try {
        const fTokens = await fluidFetcher.getLendingData();
        const match = fTokens.find((f: any) => f.symbol?.toUpperCase().includes(token.toUpperCase()));
        if (match) {
          const available = match.totalAssets - match.totalSupply;
          results.push({
            protocol: 'fluid', token, totalSupplied: match.totalAssets, totalBorrowed: match.totalSupply,
            availableLiquidity: Math.max(0, available), availableLiquidityUsd: 0, lastUpdated: Date.now(),
          });
        }
      } catch (err) {
        console.error('[check_available_liquidity] fluid failed:', err);
      }
    }

    if (results.length === 0) return this.error('TOKEN_NOT_FOUND', `No liquidity data for ${token}`);
    return this.success(results);
  }
}

// ===== Skill 8: CheckUtilizationRate =====

export class CheckUtilizationRate extends BaseSkill<{ token: string; protocol?: Protocol }, UtilizationResult[]> {
  metadata: SkillMetadata = {
    name: 'check_utilization_rate',
    description: 'Returns what percentage of a lending pool supply is being borrowed.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid'],
    tags: ['utilization', 'usage', 'pool', 'capacity', 'rates'],
    authLevel: 'read', freshness: 60, rateLimit: 30, mode: 'pull',
    context: 'High utilization (>80%) means high rates and slow withdrawals. Critical (>95%) means pool is almost full.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['risk_score', 'check_supply_apy'],
  };

  async execute(input: { token: string; protocol?: Protocol }): Promise<SkillResponse<UtilizationResult[]>> {
    const { token, protocol } = input;
    if (!token) return this.error('TOKEN_NOT_FOUND', 'Token symbol is required');

    const results: UtilizationResult[] = [];

    if (!protocol || protocol === 'aave') {
      try {
        const data = await aaveFetcher.getReserveData(token);
        const rate = data.utilizationRate;
        const status = rate < 50 ? 'low' : rate < 80 ? 'moderate' : rate < 95 ? 'high' : 'critical';
        results.push({
          protocol: 'aave', token, utilizationRate: Math.round(rate * 100) / 100,
          status: status as any, lastUpdated: Date.now(),
        });
      } catch (err) {
        console.error('[check_utilization_rate] aave failed:', err);
      }
    }

    if (results.length === 0) return this.error('TOKEN_NOT_FOUND', `No utilization data for ${token}`);
    return this.success(results);
  }
}

// ===== Skill 9: ListSupportedAssets =====

export class ListSupportedAssets extends BaseSkill<{ protocol: Protocol }, { protocol: Protocol; assets: SupportedAsset[]; totalAssets: number; lastUpdated: number }> {
  metadata: SkillMetadata = {
    name: 'list_supported_assets',
    description: 'Returns all tokens supported by a protocol on Base.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['aave', 'morpho', 'fluid', 'uniswap', 'aerodrome'],
    tags: ['tokens', 'assets', 'supported', 'list', 'markets'],
    authLevel: 'read', freshness: 3600, rateLimit: 10, mode: 'pull',
    context: 'Before doing anything, an agent needs to know what tokens are available.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_supply_apy', 'check_borrow_apy', 'get_token_price'],
  };

  async execute(input: { protocol: Protocol }): Promise<SkillResponse<any>> {
    const { protocol } = input;
    if (!protocol) return this.error('PROTOCOL_NOT_FOUND', 'Protocol is required');

    const cacheKey = DataEngine.key(protocol, 'supported_assets');
    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      if (protocol === 'aave') {
        try {
          const reserves = await aaveFetcher.getAllReserves();
          const assets: SupportedAsset[] = reserves.map((r: any) => ({
            symbol: r.symbol, address: r.address,
            canSupply: true, canBorrow: true, canBeCollateral: true, isIsolated: false,
          }));
          return { protocol, assets, totalAssets: assets.length, lastUpdated: Date.now() };
        } catch {
          // fallback
        }
      }

      if (protocol === 'fluid') {
        try {
          const fTokens = await fluidFetcher.getLendingData();
          const assets: SupportedAsset[] = fTokens.map((f: any) => ({
            symbol: f.symbol?.replace('f', '') || 'UNKNOWN', address: f.asset || f.tokenAddress,
            canSupply: true, canBorrow: true, canBeCollateral: true, isIsolated: false,
          }));
          return { protocol, assets, totalAssets: assets.length, lastUpdated: Date.now() };
        } catch {
          // fallback
        }
      }

      // Fallback: return known Base tokens
      const assets: SupportedAsset[] = Object.entries(BASE_TOKENS).map(([symbol, address]) => ({
        symbol, address, canSupply: true, canBorrow: true, canBeCollateral: true, isIsolated: false,
      }));
      return { protocol, assets, totalAssets: assets.length, lastUpdated: Date.now() };
    }, this.metadata.freshness);

    return this.success(data, 'high', cached);
  }
}

// ===== Skill 10: CheckVaultPerformance =====

export class CheckVaultPerformance extends BaseSkill<{ vaultAddress?: string; loanAsset?: string }, VaultPerformance[]> {
  metadata: SkillMetadata = {
    name: 'check_vault_performance',
    description: 'Returns Morpho vault performance — APY, curator, risk exposure, TVL.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['morpho'],
    tags: ['vault', 'morpho', 'performance', 'curator', 'yield', 'allocation'],
    authLevel: 'read', freshness: 300, rateLimit: 20, mode: 'pull',
    context: 'Morpho vaults are managed by curators who allocate across isolated markets.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_yields', 'risk_score'],
  };

  async execute(input: { vaultAddress?: string; loanAsset?: string }): Promise<SkillResponse<VaultPerformance[]>> {
    const cacheKey = DataEngine.key('morpho', 'vault_perf', input.vaultAddress || 'all', input.loanAsset || 'all');

    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const vaults = await morphoFetcher.getVaults(input.loanAsset);

      const results: VaultPerformance[] = vaults.map((v: any) => ({
        vaultAddress: v.address,
        name: v.name,
        curator: v.state?.curator?.address || 'unknown',
        loanAsset: v.asset?.symbol || 'unknown',
        apy: (v.state?.netApy || 0) * 100,
        tvlUsd: v.state?.totalAssets || 0,
        fee: v.state?.fee || 0,
        allocation: [],
        lastUpdated: Date.now(),
      }));

      if (input.vaultAddress) {
        return results.filter((r) => r.vaultAddress?.toLowerCase() === input.vaultAddress!.toLowerCase());
      }
      return results;
    }, this.metadata.freshness);

    if (data.length === 0 && input.vaultAddress) {
      return this.error('VAULT_NOT_FOUND', `Vault ${input.vaultAddress} not found`);
    }
    return this.success(data, 'high', cached);
  }
}
