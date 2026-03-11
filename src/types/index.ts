// ===== SKILL TYPES =====

export type AuthLevel = 'read' | 'analyze' | 'execute';
export type Mode = 'pull' | 'subscribe' | 'both';
export type OutputFormat = 'json' | 'text' | 'both';
export type Confidence = 'high' | 'medium' | 'low';
export type Category = 'lending' | 'dex' | 'analytics' | 'cross-protocol';
export type Protocol = 'aave' | 'uniswap' | 'aerodrome' | 'morpho' | 'fluid';
export type Chain = 'base';

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  category: Category;
  chain: Chain;
  protocols: Protocol[];
  tags: string[];
  authLevel: AuthLevel;
  freshness: number; // seconds
  rateLimit: number; // calls per minute
  mode: Mode;
  context: string;
  dependencies: string[];
  chainable: boolean;
  chainOutputCompatibleWith: string[];
}

export interface SkillResponse<T = any> {
  success: boolean;
  data: T;
  confidence: Confidence;
  lastUpdated: number; // unix timestamp
  cached: boolean;
  errors?: SkillError[];
}

export interface SkillError {
  code: string;
  message: string;
}

// ===== LENDING TYPES =====

export interface SupplyAPYResult {
  protocol: Protocol;
  token: string;
  supplyApy: number;
  rewardApy: number;
  totalApy: number;
  lastUpdated: number;
}

export interface BorrowAPYResult {
  protocol: Protocol;
  token: string;
  borrowApy: number;
  rewardOffset: number;
  effectiveApy: number;
  lastUpdated: number;
}

export interface YieldComparison {
  rankings: Array<{
    protocol: Protocol;
    supplyApy: number;
    rewardApy: number;
    totalApy: number;
    riskScore: number;
    tvl: number;
  }>;
  bestProtocol: Protocol;
  bestRiskAdjusted: Protocol;
  lastUpdated: number;
}

export interface BorrowComparison {
  rankings: Array<{
    protocol: Protocol;
    borrowApy: number;
    rewardOffset: number;
    effectiveApy: number;
    availableLiquidity: number;
  }>;
  cheapestProtocol: Protocol;
  lastUpdated: number;
}

export interface HealthFactorResult {
  positions: Array<{
    protocol: Protocol;
    healthFactor: number;
    collateralValueUsd: number;
    debtValueUsd: number;
    liquidationPrice: number;
    riskLevel: 'safe' | 'warning' | 'danger' | 'critical';
  }>;
  mostAtRisk: {
    protocol: Protocol;
    healthFactor: number;
  } | null;
  lastUpdated: number;
}

export interface LiquidationParams {
  protocol: Protocol;
  token: string;
  maxLtv: number;
  liquidationThreshold: number;
  liquidationPenalty: number;
  canBeCollateral: boolean;
  isIsolated: boolean;
  lastUpdated: number;
}

export interface LiquidityResult {
  protocol: Protocol;
  token: string;
  totalSupplied: number;
  totalBorrowed: number;
  availableLiquidity: number;
  availableLiquidityUsd: number;
  lastUpdated: number;
}

export interface UtilizationResult {
  protocol: Protocol;
  token: string;
  utilizationRate: number;
  status: 'low' | 'moderate' | 'high' | 'critical';
  lastUpdated: number;
}

export interface SupportedAsset {
  symbol: string;
  address: string;
  canSupply: boolean;
  canBorrow: boolean;
  canBeCollateral: boolean;
  isIsolated: boolean;
}

export interface VaultPerformance {
  vaultAddress: string;
  name: string;
  curator: string;
  loanAsset: string;
  apy: number;
  tvlUsd: number;
  fee: number;
  allocation: any[];
  lastUpdated: number;
}

// ===== DEX TYPES =====

export interface TokenPrice {
  token: string;
  priceUsd: number;
  priceQuote?: number;
  change24h: number;
  sourcePool: string;
  liquidityUsd: number;
  lastUpdated: number;
}

export interface SwapQuote {
  bestDex: Protocol;
  amountOut: number;
  priceImpact: number;
  swapFee: number;
  effectiveRate: number;
  gasEstimateUsd: number;
  route: string[];
  lastUpdated: number;
}

export interface SwapComparison {
  rankings: Array<{
    dex: Protocol;
    amountOut: number;
    priceImpact: number;
    fee: number;
    gasEstimate: number;
    route: string[];
  }>;
  bestDex: Protocol;
  savingsVsWorst: number;
  lastUpdated: number;
}

export interface PoolStats {
  dex: Protocol;
  pair: string;
  poolAddress: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  apr: number;
  rewardApr: number;
  totalApr: number;
  feeTier: number;
  lastUpdated: number;
}

export interface LiquidityDepth {
  currentPrice: number;
  liquidityAtPriceUsd: number;
  depth1pct: number;
  depth5pct: number;
  tickRange: {
    lower: number;
    upper: number;
  };
  lastUpdated: number;
}

export interface TopPool {
  pair: string;
  poolAddress: string;
  tvlUsd: number;
  volume24hUsd: number;
  apr: number;
  feeTier: number;
}

export interface ImpermanentLossResult {
  currentIlPct: number | null;
  projectedIl: {
    change10pct: number;
    change25pct: number;
    change50pct: number;
    change100pct: number;
  };
  breakevenApr: number;
  lastUpdated: number;
}

export interface LPRewards {
  pool: string;
  feeApr: number;
  rewardTokens: Array<{
    symbol: string;
    apr: number;
    dailyAmount?: number;
  }>;
  totalRewardApr: number;
  totalApr: number;
  emissionSchedule: string;
  lastUpdated: number;
}

// ===== AERODROME TYPES =====

export interface VeAEROVoting {
  epochNumber: number;
  epochEnd: number;
  totalVotes: number;
  topPools: Array<{
    poolPair: string;
    votes: number;
    voteSharePct: number;
    projectedEmissionsUsd: number;
  }>;
  totalEmissionsUsd: number;
  lastUpdated: number;
}

export interface Bribe {
  poolPair: string;
  bribeToken: string;
  bribeAmount: number;
  bribeValueUsd: number;
  estimatedRoi: number;
}

export interface BribesResult {
  bribes: Bribe[];
  totalBribesUsd: number;
  highestRoi: Bribe | null;
  lastUpdated: number;
}

// ===== FLUID TYPES =====

export interface SmartCollateralResult {
  vaultAddress: string;
  supplyToken: string;
  borrowToken: string;
  lendingApy: number;
  tradingFeeApy: number;
  totalApy: number;
  collateralFactor: number;
  tvlUsd: number;
  lastUpdated: number;
}

export interface SmartDebtResult {
  vaultAddress: string;
  borrowToken: string;
  supplyToken: string;
  borrowApy: number;
  feeOffsetApy: number;
  effectiveApy: number;
  borrowMagnifier: number;
  totalDebtUsd: number;
  lastUpdated: number;
}

// ===== ANALYTICS TYPES =====

export interface ProtocolTVL {
  protocol: Protocol;
  tvlUsd: number;
  tvlEth: number;
  rankOnBase: number;
  lastUpdated: number;
}

export interface TVLTrend {
  protocol: Protocol;
  currentTvlUsd: number;
  change24hPct: number;
  change7dPct: number;
  change30dPct: number;
  direction: 'growing' | 'stable' | 'declining';
  lastUpdated: number;
}

export interface WhaleTransaction {
  wallet: string;
  protocol: Protocol;
  action: string;
  token: string;
  amountUsd: number;
  timestamp: number;
  txHash: string;
}

export interface WhaleTrackerResult {
  transactions: WhaleTransaction[];
  totalCount: number;
  totalValueUsd: number;
  topWallet: string;
  lastUpdated: number;
}

export interface GasEstimate {
  action: string;
  estimatedGasUnits: number;
  gasPriceGwei: number;
  costEth: number;
  costUsd: number;
  lastUpdated: number;
}

export interface TokenOverview {
  symbol: string;
  name: string;
  contractAddress: string;
  priceUsd: number;
  priceChange24h: number;
  totalLiquidityUsd: number;
  volume24hUsd: number;
  listedOn: Protocol[];
  topPools: Array<{ dex: Protocol; pair: string; tvlUsd: number }>;
  canSupply: Protocol[];
  canBorrow: Protocol[];
  lastUpdated: number;
}

export interface PortfolioPosition {
  protocol: Protocol;
  type: 'supply' | 'borrow' | 'lp';
  tokens: string[];
  valueUsd: number;
  apy: number;
  healthFactor?: number;
}

export interface PortfolioResult {
  wallet: string;
  totalValueUsd: number;
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  totalLpUsd: number;
  positions: PortfolioPosition[];
  atRisk: PortfolioPosition[];
  lastUpdated: number;
}

export interface RiskFactor {
  tvlScore: number;
  auditScore: number;
  ageScore: number;
  utilizationScore: number;
  incidentScore: number;
  governanceScore: number;
}

export interface RiskScoreResult {
  protocol: Protocol;
  overallScore: number;
  rating: 'very_safe' | 'safe' | 'moderate' | 'risky' | 'very_risky';
  factors: RiskFactor;
  audits: Array<{ firm: string; date: string }>;
  timeLive: string;
  knownIncidents: Array<{ description: string; date: string }>;
  lastUpdated: number;
}

export interface Strategy {
  strategyName: string;
  protocols: Protocol[];
  actionType: string;
  expectedApy: number;
  riskScore: number;
  gasCostUsd: number;
  ilRisk: number | null;
  complexity: 'simple' | 'moderate' | 'complex';
  steps: string[];
}

export interface YieldOptimizerResult {
  strategies: Strategy[];
  recommended: Strategy;
  comparisonNote: string;
  lastUpdated: number;
}
