import { ethers } from 'ethers';
import { Protocol } from '../types';
import { PROTOCOL_ADDRESSES, BASE_TOKENS } from '../config';
import { getProvider, callContract, multicall } from './provider';
import axios from 'axios';

// =============================================
// SHARED HELPERS
// =============================================

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6, USDbC: 6, USDT: 6, DAI: 18, WETH: 18, ETH: 18,
  cbETH: 18, wstETH: 18, WBTC: 8, AERO: 18, COMP: 18,
};

function getDecimals(token: string): number {
  return TOKEN_DECIMALS[token.toUpperCase()] || 18;
}

function resolveAddress(token: string): string {
  const addr = BASE_TOKENS[token.toUpperCase()];
  if (!addr) throw new Error(`Token ${token} not in config`);
  if (addr === '0x0000000000000000000000000000000000000000') return BASE_TOKENS['WETH'];
  return addr;
}

const RAY = BigInt(10) ** BigInt(27);
function rayToPercent(ray: bigint): number {
  return Number((ray * BigInt(10000)) / RAY) / 100;
}

// =============================================
// AAVE FETCHER (on-chain, Base)
// =============================================

const AAVE_POOL_ABI = [
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReservesList() view returns (address[])',
];

const AAVE_DATA_PROVIDER_ABI = [
  'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
  'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
];

export const aaveFetcher = {
  async getReserveData(token: string) {
    const addr = resolveAddress(token);
    const data = await callContract(PROTOCOL_ADDRESSES.aave.poolDataProvider, AAVE_DATA_PROVIDER_ABI, 'getReserveData', [addr]);
    const decimals = getDecimals(token);
    const totalSupplied = Number(data.totalAToken) / 10 ** decimals;
    const totalStableDebt = Number(data.totalStableDebt) / 10 ** decimals;
    const totalVariableDebt = Number(data.totalVariableDebt) / 10 ** decimals;
    const totalBorrowed = totalStableDebt + totalVariableDebt;
    return {
      supplyApy: rayToPercent(BigInt(data.liquidityRate.toString())),
      borrowApy: rayToPercent(BigInt(data.variableBorrowRate.toString())),
      totalSupplied, totalBorrowed,
      availableLiquidity: totalSupplied - totalBorrowed,
      utilizationRate: totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0,
    };
  },

  async getReserveConfig(token: string) {
    const addr = resolveAddress(token);
    const data = await callContract(PROTOCOL_ADDRESSES.aave.poolDataProvider, AAVE_DATA_PROVIDER_ABI, 'getReserveConfigurationData', [addr]);
    return {
      maxLtv: Number(data.ltv) / 100, liquidationThreshold: Number(data.liquidationThreshold) / 100,
      liquidationPenalty: (Number(data.liquidationBonus) - 10000) / 100,
      canBeCollateral: data.usageAsCollateralEnabled, borrowingEnabled: data.borrowingEnabled,
      isActive: data.isActive, isFrozen: data.isFrozen,
    };
  },

  async getUserData(walletAddress: string) {
    const data = await callContract(PROTOCOL_ADDRESSES.aave.pool, AAVE_POOL_ABI, 'getUserAccountData', [walletAddress]);
    return {
      totalCollateralUsd: Number(data.totalCollateralBase) / 1e8,
      totalDebtUsd: Number(data.totalDebtBase) / 1e8,
      availableBorrowsUsd: Number(data.availableBorrowsBase) / 1e8,
      healthFactor: Number(data.healthFactor) / 1e18,
      ltv: Number(data.ltv) / 100,
    };
  },

  async getAllReserves() {
    const tokens = await callContract(PROTOCOL_ADDRESSES.aave.poolDataProvider, AAVE_DATA_PROVIDER_ABI, 'getAllReservesTokens', []);
    return tokens.map((t: any) => ({ symbol: t.symbol, address: t.tokenAddress }));
  },
};

// =============================================
// UNISWAP FETCHER (on-chain, Base)
// =============================================

const UNISWAP_QUOTER_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const UNISWAP_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
];

const UNISWAP_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

export const uniswapFetcher = {
  async getPoolAddress(tokenA: string, tokenB: string, fee: number = 3000): Promise<string | null> {
    const addrA = resolveAddress(tokenA);
    const addrB = resolveAddress(tokenB);
    try {
      const pool = await callContract(PROTOCOL_ADDRESSES.uniswap.factory, UNISWAP_FACTORY_ABI, 'getPool', [addrA, addrB, fee]);
      return pool === '0x0000000000000000000000000000000000000000' ? null : pool;
    } catch { return null; }
  },

  async getPoolData(poolAddress: string) {
    const results = await multicall([
      { address: poolAddress, abi: UNISWAP_POOL_ABI, method: 'slot0' },
      { address: poolAddress, abi: UNISWAP_POOL_ABI, method: 'liquidity' },
      { address: poolAddress, abi: UNISWAP_POOL_ABI, method: 'fee' },
      { address: poolAddress, abi: UNISWAP_POOL_ABI, method: 'token0' },
      { address: poolAddress, abi: UNISWAP_POOL_ABI, method: 'token1' },
    ]);
    const [slot0, liquidity, fee, token0, token1] = results;
    if (!slot0) return null;
    const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96.toString());
    const price = Number(sqrtPriceX96 * sqrtPriceX96 * BigInt(1e18) / (BigInt(2) ** BigInt(192))) / 1e18;
    return {
      sqrtPriceX96: slot0.sqrtPriceX96.toString(), tick: Number(slot0.tick),
      liquidity: liquidity?.toString() || '0', fee: fee ? Number(fee) : 3000,
      token0: token0 || '', token1: token1 || '', price,
    };
  },

  async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: number, fee: number = 3000) {
    const addrIn = resolveAddress(tokenIn);
    const addrOut = resolveAddress(tokenOut);
    const decimalsIn = getDecimals(tokenIn);
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);
    try {
      const provider = getProvider();
      const quoter = new ethers.Contract(PROTOCOL_ADDRESSES.uniswap.quoter, UNISWAP_QUOTER_ABI, provider);
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn: addrIn, tokenOut: addrOut, amountIn: amountInWei, fee, sqrtPriceLimitX96: 0,
      });
      const decimalsOut = getDecimals(tokenOut);
      return { amountOut: Number(ethers.formatUnits(result.amountOut, decimalsOut)), gasEstimate: Number(result.gasEstimate), priceImpact: 0 };
    } catch (err) { throw new Error(`Uniswap quote failed: ${err}`); }
  },
};

// =============================================
// AERODROME FETCHER (on-chain + Sugar, Base)
// =============================================

const AERO_ROUTER_ABI = [
  'function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) view returns (uint256 amount, bool stable)',
];

const AERO_VOTER_ABI = [
  'function totalWeight() view returns (uint256)',
  'function weights(address pool) view returns (uint256)',
  'function gauges(address pool) view returns (address)',
  'function isAlive(address gauge) view returns (bool)',
  'function poolForGauge(address gauge) view returns (address)',
  'function length() view returns (uint256)', // total number of pools with gauges
];

const AERO_GAUGE_ABI = [
  'function rewardRate() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function earned(address account) view returns (uint256)',
  'function rewardToken() view returns (address)',
];

// Aerodrome Sugar contract — on-chain aggregator for pool data
// Deployed on Base at 0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b
const AERO_SUGAR_ABI = [
  'function all(uint256 _limit, uint256 _offset) view returns (tuple(address lp, string symbol, uint8 decimals, bool stable, uint256 total_supply, address token0, uint256 reserve0, uint256 claimable0, address token1, uint256 reserve1, uint256 claimable1, address gauge, uint256 gauge_total_supply, address fee, address bribe, address factory, uint256 emissions, address emissions_token, uint256 pool_fee, uint256 unstaked_fee, uint256 token0_fees, uint256 token1_fees)[])',
];

const AERO_SUGAR_ADDRESS = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';

export const aerodromeFetcher = {
  async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: number) {
    const addrIn = resolveAddress(tokenIn);
    const addrOut = resolveAddress(tokenOut);
    const decimalsIn = getDecimals(tokenIn);
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);
    try {
      const result = await callContract(PROTOCOL_ADDRESSES.aerodrome.router, AERO_ROUTER_ABI, 'getAmountOut', [amountInWei, addrIn, addrOut]);
      const decimalsOut = getDecimals(tokenOut);
      return { amountOut: Number(ethers.formatUnits(result.amount, decimalsOut)), stable: result.stable };
    } catch (err) { throw new Error(`Aerodrome quote failed: ${err}`); }
  },

  async getVotingData() {
    try {
      const totalWeight = await callContract(PROTOCOL_ADDRESSES.aerodrome.voter, AERO_VOTER_ABI, 'totalWeight', []);
      return { totalVotes: Number(ethers.formatEther(totalWeight)) };
    } catch (err) { throw new Error(`Aerodrome voting data failed: ${err}`); }
  },

  async getGaugeData(poolAddress: string) {
    try {
      const gaugeAddress = await callContract(PROTOCOL_ADDRESSES.aerodrome.voter, AERO_VOTER_ABI, 'gauges', [poolAddress]);
      if (gaugeAddress === '0x0000000000000000000000000000000000000000') return null;
      const [rewardRate, totalSupply] = await multicall([
        { address: gaugeAddress, abi: AERO_GAUGE_ABI, method: 'rewardRate' },
        { address: gaugeAddress, abi: AERO_GAUGE_ABI, method: 'totalSupply' },
      ]);
      return {
        gaugeAddress, rewardRate: rewardRate ? Number(ethers.formatEther(rewardRate)) : 0,
        totalSupply: totalSupply ? Number(ethers.formatEther(totalSupply)) : 0,
      };
    } catch { return null; }
  },

  // Use Sugar contract to get all pools with their bribes, emissions, and fees
  async getAllPools(limit: number = 100, offset: number = 0) {
    try {
      const pools = await callContract(AERO_SUGAR_ADDRESS, AERO_SUGAR_ABI, 'all', [limit, offset]);
      return pools.map((p: any) => ({
        address: p.lp, symbol: p.symbol, stable: p.stable,
        token0: p.token0, token1: p.token1,
        reserve0: Number(p.reserve0), reserve1: Number(p.reserve1),
        gauge: p.gauge, bribe: p.bribe,
        gaugeSupply: Number(ethers.formatEther(p.gauge_total_supply || '0')),
        emissions: Number(ethers.formatEther(p.emissions || '0')),
        token0Fees: Number(p.token0_fees), token1Fees: Number(p.token1_fees),
        poolFee: Number(p.pool_fee),
      }));
    } catch (err) {
      console.error('[aerodrome] Sugar.all failed:', err);
      return [];
    }
  },

  // Get bribes for all pools — from Sugar data
  async getBribes() {
    try {
      const pools = await this.getAllPools(200, 0);
      // Pools with non-zero bribe addresses that have emissions
      const withBribes = pools.filter((p: any) =>
        p.bribe !== '0x0000000000000000000000000000000000000000' && p.emissions > 0
      );
      return withBribes.map((p: any) => ({
        pool: p.address, pair: p.symbol, bribeContract: p.bribe,
        emissionsPerSecond: p.emissions, token0Fees: p.token0Fees, token1Fees: p.token1Fees,
      }));
    } catch { return []; }
  },
};

// =============================================
// MORPHO FETCHER (GraphQL API — no subgraph needed!)
// =============================================

const MORPHO_API = 'https://blue-api.morpho.org/graphql';

export const morphoFetcher = {
  // Get all markets on Base with borrow/supply APYs
  async getMarkets(token?: string) {
    try {
      const query = `{
        markets(first: 100, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: { chainId_in: [8453] }) {
          items {
            uniqueKey
            loanAsset { symbol address }
            collateralAsset { symbol address }
            lltv
            state {
              borrowApy supplyApy
              borrowAssetsUsd supplyAssetsUsd
              liquidityAssetsUsd utilization
              rewards { asset { symbol } supplyApr borrowApr }
            }
          }
        }
      }`;
      const res = await axios.post(MORPHO_API, { query }, { timeout: 10000 });
      let markets = res.data?.data?.markets?.items || [];
      if (token) {
        markets = markets.filter((m: any) =>
          m.loanAsset?.symbol?.toUpperCase() === token.toUpperCase() ||
          m.collateralAsset?.symbol?.toUpperCase() === token.toUpperCase()
        );
      }
      return markets.map((m: any) => ({
        id: m.uniqueKey,
        loanAsset: m.loanAsset?.symbol || 'unknown',
        collateralAsset: m.collateralAsset?.symbol || 'unknown',
        lltv: Number(m.lltv) / 1e18 * 100,
        borrowApy: (m.state?.borrowApy || 0) * 100,
        supplyApy: (m.state?.supplyApy || 0) * 100,
        borrowUsd: m.state?.borrowAssetsUsd || 0,
        supplyUsd: m.state?.supplyAssetsUsd || 0,
        liquidityUsd: m.state?.liquidityAssetsUsd || 0,
        utilization: (m.state?.utilization || 0) * 100,
        rewards: m.state?.rewards || [],
      }));
    } catch (err) {
      console.error('[morpho] getMarkets failed:', err);
      return [];
    }
  },

  // Get vault data from Morpho API
  async getVaults(loanAsset?: string) {
    try {
      const query = `{
        vaults(first: 100, orderBy: TotalAssetsUsd, orderDirection: Desc, where: { chainId_in: [8453] }) {
          items {
            address name
            asset { symbol address }
            state { totalAssetsUsd netApy apy fee curator { address } }
          }
        }
      }`;
      const res = await axios.post(MORPHO_API, { query }, { timeout: 10000 });
      let vaults = res.data?.data?.vaults?.items || [];
      if (loanAsset) {
        vaults = vaults.filter((v: any) => v.asset?.symbol?.toUpperCase() === loanAsset.toUpperCase());
      }
      return vaults;
    } catch (err) {
      console.error('[morpho] getVaults failed:', err);
      return [];
    }
  },

  // Get borrow APY for a specific token (loan asset)
  async getBorrowRates(token: string) {
    const markets = await this.getMarkets(token);
    // Filter to markets where this token is the loan asset
    const borrowMarkets = markets.filter((m: any) => m.loanAsset?.toUpperCase() === token.toUpperCase());
    if (borrowMarkets.length === 0) return null;
    // Return weighted average or best rate
    const sorted = borrowMarkets.sort((a: any, b: any) => a.borrowApy - b.borrowApy);
    return {
      bestBorrowApy: sorted[0].borrowApy,
      bestMarket: sorted[0],
      allMarkets: sorted,
    };
  },

  // Get supply APY for a specific token
  async getSupplyRates(token: string) {
    const markets = await this.getMarkets(token);
    const supplyMarkets = markets.filter((m: any) => m.loanAsset?.toUpperCase() === token.toUpperCase());
    if (supplyMarkets.length === 0) return null;
    const sorted = supplyMarkets.sort((a: any, b: any) => b.supplyApy - a.supplyApy);
    return {
      bestSupplyApy: sorted[0].supplyApy,
      bestMarket: sorted[0],
      allMarkets: sorted,
    };
  },
};

// =============================================
// FLUID FETCHER (on-chain resolvers, Base)
// =============================================

// Verified Fluid resolver ABIs on Base
// LendingResolver: provides fToken data (supply rates, total assets)
// VaultResolver: provides vault data (borrow rates, collateral factors)

const FLUID_LENDING_RESOLVER_ABI = [
  'function getAllFTokensData() view returns (tuple(address tokenAddress, bool isNativeUnderlying, string name, string symbol, uint256 decimals, address asset, uint256 totalAssets, uint256 totalSupply, uint256 convertToShares, uint256 convertToAssets, uint16 rewardRate, bool rewardsActive)[])',
  'function getFTokenData(address fToken) view returns (tuple(address tokenAddress, bool isNativeUnderlying, string name, string symbol, uint256 decimals, address asset, uint256 totalAssets, uint256 totalSupply, uint256 convertToShares, uint256 convertToAssets, uint16 rewardRate, bool rewardsActive))',
];

const FLUID_VAULT_RESOLVER_ABI = [
  'function getAllVaultsAddresses() view returns (address[])',
  'function getVaultEntireData(address vault_) view returns (tuple(address vault, tuple(address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, tuple(uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePrice, address rebalancer) configs) vaultData_)',
  'function getVaultsEntireData(address[] memory vaults_) view returns (tuple(address vault, tuple(address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, tuple(uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePrice, address rebalancer) configs)[])',
  'function positionsByUser(address user_) view returns (tuple(uint256 nftId, address vault, uint256 tickId, uint256 colRaw, uint256 debtRaw, uint256 col, uint256 debt, bool isLiquidated, bool isSupplyPosition)[] userPositions_)',
];

// Fluid Liquidity Resolver — for supply/borrow exchange prices
const FLUID_LIQUIDITY_RESOLVER_ABI = [
  'function getOverallTokenData(address token_) view returns (tuple(uint256 borrowRate, uint256 supplyRate, uint256 fee, uint256 lastStoredUtilization, uint256 storageUpdateThreshold, uint256 lastUpdateTimestamp, uint256 supplyExchangePrice, uint256 borrowExchangePrice, uint256 supplyRawInterest, uint256 supplyInterestFree, uint256 borrowRawInterest, uint256 borrowInterestFree, uint256 totalSupply, uint256 totalBorrow, uint256 revenue, uint256 maxUtilization))',
];

export const fluidFetcher = {
  async getLendingData() {
    try {
      const fTokens = await callContract(PROTOCOL_ADDRESSES.fluid.lendingResolver, FLUID_LENDING_RESOLVER_ABI, 'getAllFTokensData', []);
      return fTokens.map((t: any) => ({
        tokenAddress: t.tokenAddress, name: t.name, symbol: t.symbol,
        asset: t.asset, decimals: Number(t.decimals),
        totalAssets: Number(t.totalAssets), totalSupply: Number(t.totalSupply),
        rewardRate: Number(t.rewardRate), rewardsActive: t.rewardsActive,
        // Supply APY: convertToAssets shows how much 1 share is worth in assets
        // Growth of this value = supply yield
        convertToAssets: Number(t.convertToAssets),
        convertToShares: Number(t.convertToShares),
      }));
    } catch (err) {
      console.error('[fluid] getLendingData failed:', err);
      return [];
    }
  },

  // Get token-level supply and borrow rates from Liquidity Resolver
  async getTokenRates(token: string) {
    try {
      const addr = resolveAddress(token);
      const data = await callContract(
        PROTOCOL_ADDRESSES.fluid.liquidityResolver,
        FLUID_LIQUIDITY_RESOLVER_ABI,
        'getOverallTokenData',
        [addr]
      );
      return {
        supplyRate: Number(data.supplyRate) / 1e4, // basis points to percent
        borrowRate: Number(data.borrowRate) / 1e4,
        utilization: Number(data.lastStoredUtilization) / 1e4,
        totalSupply: Number(data.totalSupply),
        totalBorrow: Number(data.totalBorrow),
        supplyExchangePrice: Number(data.supplyExchangePrice),
        borrowExchangePrice: Number(data.borrowExchangePrice),
      };
    } catch (err) {
      console.error('[fluid] getTokenRates failed:', err);
      return null;
    }
  },

  async getAllVaults() {
    try {
      const addresses = await callContract(PROTOCOL_ADDRESSES.fluid.vaultResolver, FLUID_VAULT_RESOLVER_ABI, 'getAllVaultsAddresses', []);
      return addresses;
    } catch (err) {
      console.error('[fluid] getAllVaults failed:', err);
      return [];
    }
  },

  async getVaultData(vaultAddress: string) {
    try {
      const data = await callContract(PROTOCOL_ADDRESSES.fluid.vaultResolver, FLUID_VAULT_RESOLVER_ABI, 'getVaultEntireData', [vaultAddress]);
      const constants = data.constantVariables || data[1];
      const configs = data.configs || data[2];
      return {
        vault: data.vault || vaultAddress,
        supplyToken: constants?.supplyToken,
        borrowToken: constants?.borrowToken,
        supplyDecimals: Number(constants?.supplyDecimals || 18),
        borrowDecimals: Number(constants?.borrowDecimals || 18),
        vaultId: Number(constants?.vaultId || 0),
        // Configs
        supplyRateMagnifier: Number(configs?.supplyRateMagnifier || 0) / 100,
        borrowRateMagnifier: Number(configs?.borrowRateMagnifier || 0) / 100,
        collateralFactor: Number(configs?.collateralFactor || 0) / 100,
        liquidationThreshold: Number(configs?.liquidationThreshold || 0) / 100,
        liquidationPenalty: Number(configs?.liquidationPenalty || 0) / 100,
        oraclePrice: Number(configs?.oraclePrice || 0),
        // Vault type: magnifier > 100 suggests smart collateral/debt
        isSmartCollateral: Number(configs?.supplyRateMagnifier || 0) > 10000,
        isSmartDebt: Number(configs?.borrowRateMagnifier || 0) > 0 && Number(configs?.borrowRateMagnifier || 0) < 10000,
      };
    } catch (err) {
      console.error('[fluid] getVaultData failed:', err);
      return null;
    }
  },

  // Get all vaults with full data in one call
  async getAllVaultsData() {
    try {
      const addresses = await this.getAllVaults();
      if (addresses.length === 0) return [];

      // Batch fetch — process in chunks to avoid gas limits
      const results = [];
      for (const addr of addresses) {
        try {
          const data = await this.getVaultData(addr);
          if (data) results.push(data);
        } catch {}
      }
      return results;
    } catch { return []; }
  },

  // Get user positions across all vaults
  async getUserPositions(walletAddress: string) {
    try {
      const positions = await callContract(
        PROTOCOL_ADDRESSES.fluid.vaultResolver,
        FLUID_VAULT_RESOLVER_ABI,
        'positionsByUser',
        [walletAddress]
      );
      return positions.map((p: any) => ({
        nftId: Number(p.nftId), vault: p.vault,
        collateral: Number(p.col), debt: Number(p.debt),
        isLiquidated: p.isLiquidated, isSupplyPosition: p.isSupplyPosition,
      }));
    } catch { return []; }
  },
};

// =============================================
// PRICE FETCHER (multi-source with fallback)
// =============================================

export const priceFetcher = {
  async fromCoinGecko(token: string): Promise<{ price: number; change24h: number } | null> {
    const cgIds: Record<string, string> = {
      ETH: 'ethereum', WETH: 'ethereum', USDC: 'usd-coin', DAI: 'dai',
      WBTC: 'wrapped-bitcoin', AERO: 'aerodrome-finance', COMP: 'compound-governance-token',
      cbETH: 'coinbase-wrapped-staked-eth', wstETH: 'wrapped-steth', USDbC: 'bridged-usd-coin-base',
    };
    const id = cgIds[token.toUpperCase()];
    if (!id) return null;
    try {
      const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`, { timeout: 5000 });
      const data = res.data[id];
      return data ? { price: data.usd, change24h: data.usd_24h_change || 0 } : null;
    } catch { return null; }
  },

  async fromDefiLlama(token: string): Promise<number | null> {
    try {
      const addr = resolveAddress(token);
      const res = await axios.get(`https://coins.llama.fi/prices/current/base:${addr}`, { timeout: 5000 });
      const key = `base:${addr}`.toLowerCase();
      return res.data?.coins?.[key]?.price || null;
    } catch { return null; }
  },

  async fromUniswapPool(token: string, quoteToken: string = 'USDC'): Promise<number | null> {
    try {
      for (const fee of [500, 3000, 10000]) {
        const pool = await uniswapFetcher.getPoolAddress(token, quoteToken, fee);
        if (pool) {
          const data = await uniswapFetcher.getPoolData(pool);
          if (data) return data.price;
        }
      }
      return null;
    } catch { return null; }
  },

  async getPrice(token: string): Promise<{ price: number; change24h: number; source: string }> {
    const cg = await this.fromCoinGecko(token);
    if (cg && cg.price > 0) return { ...cg, source: 'coingecko' };
    const ll = await this.fromDefiLlama(token);
    if (ll && ll > 0) return { price: ll, change24h: 0, source: 'defillama' };
    const onchain = await this.fromUniswapPool(token);
    if (onchain && onchain > 0) return { price: onchain, change24h: 0, source: 'uniswap-onchain' };
    return { price: 0, change24h: 0, source: 'none' };
  },
};

// =============================================
// TVL FETCHER (DefiLlama)
// =============================================

export const tvlFetcher = {
  async getProtocolTVL(protocol: Protocol): Promise<number> {
    const slugs: Record<Protocol, string> = {
      aave: 'aave', uniswap: 'uniswap', aerodrome: 'aerodrome-finance', morpho: 'morpho', fluid: 'fluid',
    };
    try {
      const res = await axios.get(`https://api.llama.fi/tvl/${slugs[protocol]}`, { timeout: 5000 });
      return typeof res.data === 'number' ? res.data : 0;
    } catch { return 0; }
  },

  async getProtocolHistory(protocol: Protocol) {
    const slugs: Record<Protocol, string> = {
      aave: 'aave', uniswap: 'uniswap', aerodrome: 'aerodrome-finance', morpho: 'morpho', fluid: 'fluid',
    };
    try {
      const res = await axios.get(`https://api.llama.fi/protocol/${slugs[protocol]}`, { timeout: 10000 });
      return res.data?.tvl || [];
    } catch { return []; }
  },
};

// =============================================
// WHALE TRACKER (on-chain event monitoring)
// =============================================

// Event signatures for whale tracking
const WHALE_EVENT_SIGS = {
  // Aave V3 events
  aaveSupply: 'Supply(address,address,address,uint256,uint16)',
  aaveBorrow: 'Borrow(address,address,address,uint256,uint8,uint256,uint16)',
  aaveRepay: 'Repay(address,address,address,uint256,bool)',
  aaveWithdraw: 'Withdraw(address,address,address,uint256)',
  // ERC20 Transfer for large moves
  transfer: 'Transfer(address,address,uint256)',
};

export const whaleFetcher = {
  // Monitor recent large transactions by scanning recent blocks
  async getRecentWhaleActivity(minValueUsd: number = 100000, blocksBack: number = 100) {
    try {
      const provider = getProvider();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock - blocksBack;

      // Get Aave pool events for large supply/borrow
      const aavePoolAddress = PROTOCOL_ADDRESSES.aave.pool;
      const supplyTopic = ethers.id('Supply(address,address,address,uint256,uint16)');
      const borrowTopic = ethers.id('Borrow(address,address,address,uint256,uint8,uint256,uint16)');

      const logs = await provider.getLogs({
        address: aavePoolAddress,
        topics: [[supplyTopic, borrowTopic]],
        fromBlock, toBlock: currentBlock,
      });

      const transactions = [];
      for (const log of logs) {
        try {
          // Decode the amount from the log data
          const amount = BigInt('0x' + log.data.slice(2, 66));
          // Very rough USD estimate — would need price feed for accuracy
          const amountNum = Number(amount) / 1e6; // Assuming USDC-scale
          if (amountNum >= minValueUsd) {
            transactions.push({
              wallet: '0x' + log.topics[2]?.slice(26),
              protocol: 'aave' as Protocol,
              action: log.topics[0] === supplyTopic ? 'supply' : 'borrow',
              token: 'UNKNOWN',
              amountUsd: amountNum,
              timestamp: Date.now(), // Would need block timestamp
              txHash: log.transactionHash,
            });
          }
        } catch {}
      }

      return transactions.slice(0, 50); // Cap at 50
    } catch (err) {
      console.error('[whale] getRecentWhaleActivity failed:', err);
      return [];
    }
  },
};
