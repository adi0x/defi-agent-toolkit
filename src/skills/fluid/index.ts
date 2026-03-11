// =============================================
// FLUID SKILLS (21-22) — WITH REAL VAULT RESOLVER
// =============================================

import { BaseSkill } from '../BaseSkill';
import { SkillMetadata, SkillResponse, SmartCollateralResult, SmartDebtResult } from '../../types';
import { dataEngine, DataEngine } from '../../engine/DataEngine';
import { fluidFetcher, priceFetcher } from '../../engine/fetchers';
import { BASE_TOKENS } from '../../config';

// Reverse lookup: address → symbol
const ADDR_TO_SYMBOL: Record<string, string> = {};
for (const [sym, addr] of Object.entries(BASE_TOKENS)) {
  ADDR_TO_SYMBOL[addr.toLowerCase()] = sym;
}

function symbolFor(addr: string): string {
  return ADDR_TO_SYMBOL[addr?.toLowerCase()] || addr?.slice(0, 10) || 'UNKNOWN';
}

// ===== Skill 21: CheckSmartCollateral =====

export class CheckSmartCollateral extends BaseSkill<{ vaultAddress?: string; tokenPair?: string }, SmartCollateralResult[]> {
  metadata: SkillMetadata = {
    name: 'check_smart_collateral',
    description: 'Returns yield being earned on Fluid smart collateral — collateral that also serves as DEX liquidity.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['fluid'],
    tags: ['fluid', 'smart collateral', 'yield', 'collateral', 'lp', 'dex'],
    authLevel: 'read', freshness: 60, rateLimit: 20, mode: 'both',
    context: 'Fluid smart collateral earns DEX trading fees while being used as collateral. supplyRateMagnifier > 100% indicates smart collateral.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_yields', 'yield_optimizer'],
  };

  async execute(input: { vaultAddress?: string; tokenPair?: string }): Promise<SkillResponse<SmartCollateralResult[]>> {
    const cacheKey = DataEngine.key('fluid', 'smart_collateral', input.vaultAddress || 'all');

    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const results: SmartCollateralResult[] = [];

      const vaultAddresses = await fluidFetcher.getAllVaults();
      for (const addr of vaultAddresses) {
        try {
          const vault = await fluidFetcher.getVaultData(addr);
          if (!vault) continue;

          // Smart collateral = supplyRateMagnifier > 100 (10000 in raw)
          if (vault.isSmartCollateral) {
            const supplySymbol = symbolFor(vault.supplyToken);
            const borrowSymbol = symbolFor(vault.borrowToken);

            // Get supply rate from liquidity resolver for the supply token
            let lendingApy = 0;
            try {
              const rates = await fluidFetcher.getTokenRates(supplySymbol);
              if (rates) lendingApy = rates.supplyRate;
            } catch {}

            // Trading fee APY approximation from magnifier
            // magnifier > 1 means the vault earns additional yield from DEX fees
            const tradingFeeApy = Math.max(0, (vault.supplyRateMagnifier - 100) * 0.1);

            results.push({
              vaultAddress: addr,
              supplyToken: supplySymbol,
              borrowToken: borrowSymbol,
              lendingApy: Math.round(lendingApy * 100) / 100,
              tradingFeeApy: Math.round(tradingFeeApy * 100) / 100,
              totalApy: Math.round((lendingApy + tradingFeeApy) * 100) / 100,
              collateralFactor: vault.collateralFactor,
              tvlUsd: 0, // Would need to compute from vault positions
              lastUpdated: Date.now(),
            });
          }
        } catch {}
      }

      return results;
    }, this.metadata.freshness);

    let filtered = data;
    if (input.vaultAddress) {
      filtered = data.filter((r) => r.vaultAddress?.toLowerCase() === input.vaultAddress!.toLowerCase());
    }
    if (input.tokenPair) {
      const [a, b] = input.tokenPair.split('/').map(s => s.trim().toUpperCase());
      filtered = data.filter((r) =>
        (r.supplyToken === a && r.borrowToken === b) || (r.supplyToken === b && r.borrowToken === a)
      );
    }

    return this.success(filtered, filtered.length > 0 ? 'high' : 'medium', cached);
  }
}

// ===== Skill 22: CheckSmartDebt =====

export class CheckSmartDebt extends BaseSkill<{ vaultAddress?: string; debtPair?: string }, SmartDebtResult[]> {
  metadata: SkillMetadata = {
    name: 'check_smart_debt',
    description: 'Returns fee offset on Fluid smart debt — debt that earns trading fees to reduce borrowing cost.',
    version: '1.0.0', category: 'lending', chain: 'base', protocols: ['fluid'],
    tags: ['fluid', 'smart debt', 'offset', 'borrow', 'trading fees', 'dex'],
    authLevel: 'read', freshness: 60, rateLimit: 20, mode: 'both',
    context: 'Fluid smart debt turns borrowed funds into DEX liquidity. Trading fees offset borrowing cost. borrowRateMagnifier < 100% indicates smart debt.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['compare_borrow_rates', 'yield_optimizer'],
  };

  async execute(input: { vaultAddress?: string; debtPair?: string }): Promise<SkillResponse<SmartDebtResult[]>> {
    const cacheKey = DataEngine.key('fluid', 'smart_debt', input.vaultAddress || 'all');

    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const results: SmartDebtResult[] = [];

      const vaultAddresses = await fluidFetcher.getAllVaults();
      for (const addr of vaultAddresses) {
        try {
          const vault = await fluidFetcher.getVaultData(addr);
          if (!vault) continue;

          // Smart debt = borrowRateMagnifier < 100 (means fees offset borrow cost)
          if (vault.isSmartDebt) {
            const supplySymbol = symbolFor(vault.supplyToken);
            const borrowSymbol = symbolFor(vault.borrowToken);

            // Get base borrow rate for the borrow token
            let baseBorrowApy = 0;
            try {
              const rates = await fluidFetcher.getTokenRates(borrowSymbol);
              if (rates) baseBorrowApy = rates.borrowRate;
            } catch {}

            // Fee offset: the difference between base rate and magnified rate
            const magnifier = vault.borrowRateMagnifier; // percent
            const feeOffsetApy = baseBorrowApy * (100 - magnifier) / 100;
            const effectiveApy = baseBorrowApy - feeOffsetApy;

            results.push({
              vaultAddress: addr,
              borrowToken: borrowSymbol,
              supplyToken: supplySymbol,
              borrowApy: Math.round(baseBorrowApy * 100) / 100,
              feeOffsetApy: Math.round(feeOffsetApy * 100) / 100,
              effectiveApy: Math.round(effectiveApy * 100) / 100,
              borrowMagnifier: magnifier,
              totalDebtUsd: 0,
              lastUpdated: Date.now(),
            });
          }
        } catch {}
      }

      return results;
    }, this.metadata.freshness);

    let filtered = data;
    if (input.vaultAddress) {
      filtered = data.filter((r) => r.vaultAddress?.toLowerCase() === input.vaultAddress!.toLowerCase());
    }
    if (input.debtPair) {
      const [a, b] = input.debtPair.split('/').map(s => s.trim().toUpperCase());
      filtered = data.filter((r) =>
        (r.borrowToken === a && r.supplyToken === b) || (r.borrowToken === b && r.supplyToken === a)
      );
    }

    return this.success(filtered, filtered.length > 0 ? 'high' : 'medium', cached);
  }
}
