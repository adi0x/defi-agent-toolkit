// DeFi Agent Toolkit — Live DeFi skills for AI agents on Base

// Core exports
export { registry } from './engine/SkillRegistry';
export { dataEngine } from './engine/DataEngine';
export { getProvider } from './engine/provider';

// Fetchers (direct protocol access)
export { aaveFetcher, uniswapFetcher, aerodromeFetcher, morphoFetcher, fluidFetcher, priceFetcher, tvlFetcher, whaleFetcher } from './engine/fetchers';

// Types
export * from './types';

// Base class for custom skills
export { BaseSkill } from './skills/BaseSkill';

// Config
export { PROTOCOL_ADDRESSES, BASE_TOKENS, DEFAULTS, DATA_SOURCES } from './config';

// All skills
export { CheckSupplyAPY, CheckBorrowAPY, CompareYields, CompareBorrowRates, CheckHealthFactor, CheckLiquidationThreshold, CheckAvailableLiquidity, CheckUtilizationRate, ListSupportedAssets, CheckVaultPerformance } from './skills/lending/index';
export { GetTokenPrice, GetSwapQuote, CompareSwapRoutes, CheckPoolStats, CheckLiquidityDepth, GetTopPools, CheckImpermanentLoss, CheckLPRewards } from './skills/dex/index';
export { CheckVeAEROVoting, CheckBribes } from './skills/aerodrome/index';
export { CheckSmartCollateral, CheckSmartDebt } from './skills/fluid/index';
export { ProtocolTVLSkill, TVLTrendSkill, WhaleTracker, GasEstimatorSkill, TokenOverviewSkill, PortfolioCheck, RiskScoreSkill, YieldOptimizer } from './skills/analytics/index';

// Quick access functions
import { registry } from './engine/SkillRegistry';

/** Execute any skill by name: await execute('check_supply_apy', { token: 'USDC' }) */
export const execute = (skill: string, input: any) => registry.execute(skill, input);

/** List all 30 available skills */
export const listSkills = () => registry.listSkills();

/** Search skills by keyword: searchSkills('yield') */
export const searchSkills = (query: string) => registry.searchSkills(query);
