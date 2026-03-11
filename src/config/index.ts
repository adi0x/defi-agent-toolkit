import { Protocol } from '../types';

// Base chain ID
export const BASE_CHAIN_ID = 8453;

// Base RPC
export const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Protocol contract addresses on Base
export const PROTOCOL_ADDRESSES: Record<Protocol, Record<string, string>> = {
  aave: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
  },
  uniswap: {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  },
  aerodrome: {
    router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
  },
  morpho: {
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    bundler: '0x23055618898e202386e6c13955a58D3C68200BFB',
  },
  fluid: {
    liquidity: '0x52Aa899454998Be5b000Ad077a46Bbe360F4e497',
    vaultFactory: '0x324c5Dc1fC42c7a4D43d92df1eBA58a54d13Bf2d',
    dexFactory: '0x91716C4EDA1Fb55e84Bf8b4c7085f84285c19085',
    lendingFactory: '0x54B91A0D94cb471F37f949c60F7Fa7935b551b03',
    lendingResolver: '0x3E42e4b78e92a151D287E16BF3F29Ab9DaCf5461',
    vaultResolver: '0x93CAB6529aD849b2583EBAe32D13817A2F38cEb0',
    liquidityResolver: '0x741c2Cd25f053a55fd94afF1afAEf146523E1249',
  },
};

// Data source URLs
export const DATA_SOURCES = {
  defiLlama: 'https://api.llama.fi',
  coingecko: 'https://api.coingecko.com/api/v3',
  dune: 'https://api.dune.com/api/v1',
};

// Default settings
export const DEFAULTS = {
  whaleMinUsd: 100_000,
  topPoolsLimit: 10,
  healthFactorWarning: 1.5,
  healthFactorDanger: 1.2,
  healthFactorCritical: 1.05,
  maxPriceImpactWarning: 0.01, // 1%
  maxPriceImpactDanger: 0.05, // 5%
  staleDataThresholdMs: 300_000, // 5 minutes
};

// Supported tokens on Base (common ones)
export const BASE_TOKENS: Record<string, string> = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
  AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  COMP: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
  WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
};
