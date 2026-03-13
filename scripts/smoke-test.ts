import 'dotenv/config';
import { execute } from '../src';
import { aaveFetcher, morphoFetcher, fluidFetcher, uniswapFetcher, aerodromeFetcher, priceFetcher } from '../src/engine/fetchers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<any>) {
  try {
    const result = await fn();
    if (result !== null && result !== undefined) {
      console.log(`${GREEN}✓${RESET} ${name}`);
      passed++;
    } else {
      console.log(`${YELLOW}⚠${RESET} ${name} — returned null`);
      passed++;
    }
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name} — ${err.message?.slice(0, 80)}`);
    failed++;
  }
}

async function main() {
  console.log('\n🧪 DeFi Agent Toolkit — Smoke Test\n');

  if (!process.env.BASE_RPC_URL) {
    console.log(`${RED}ERROR: BASE_RPC_URL not set. Copy .env.example to .env and add your key.${RESET}`);
    process.exit(1);
  }

  // === Prices (no RPC needed for CoinGecko/DefiLlama) ===
  console.log('\n📊 Price Fetcher');
  await test('ETH price from CoinGecko', () => priceFetcher.fromCoinGecko('ETH'));
  await test('ETH price from DefiLlama', () => priceFetcher.fromDefiLlama('ETH'));
  await test('Multi-source price', () => priceFetcher.getPrice('ETH'));

  // === Aave (on-chain) ===
  console.log('\n🏦 Aave V3');
  await test('Get all reserves', () => aaveFetcher.getAllReserves());
  await test('USDC reserve data', () => aaveFetcher.getReserveData('USDC'));
  await test('USDC reserve config', () => aaveFetcher.getReserveConfig('USDC'));

  // === Uniswap (on-chain) ===
  console.log('\n🦄 Uniswap V3');
  await test('Find ETH/USDC pool', () => uniswapFetcher.getPoolAddress('WETH', 'USDC', 500));
  await test('Swap quote 1 ETH → USDC', () => uniswapFetcher.getSwapQuote('WETH', 'USDC', 1, 500));

  // === Aerodrome (on-chain) ===
  console.log('\n✈️  Aerodrome');
  await test('Voting data', () => aerodromeFetcher.getVotingData());
  await test('Swap quote ETH → USDC', () => aerodromeFetcher.getSwapQuote('WETH', 'USDC', 1));

  // === Morpho (GraphQL API) ===
  console.log('\n🔵 Morpho Blue');
  await test('Get Base markets', () => morphoFetcher.getMarkets());
  await test('USDC supply rates', () => morphoFetcher.getSupplyRates('USDC'));
  await test('USDC borrow rates', () => morphoFetcher.getBorrowRates('USDC'));
  await test('Get vaults', () => morphoFetcher.getVaults());

  // === Fluid (on-chain resolvers) ===
  console.log('\n💧 Fluid');
  await test('Lending data (fTokens)', () => fluidFetcher.getLendingData());
  await test('Token rates (USDC)', () => fluidFetcher.getTokenRates('USDC'));
  await test('All vault addresses', () => fluidFetcher.getAllVaults());

  // === Skill execution ===
  console.log('\n⚡ Skills');
  await test('check_supply_apy', () => execute('check_supply_apy', { token: 'USDC' }));
  await test('get_token_price', () => execute('get_token_price', { token: 'ETH' }));
  await test('protocol_tvl', () => execute('protocol_tvl', { protocol: 'aave' }));
  await test('compare_yields', () => execute('compare_yields', { token: 'USDC' }));
  await test('gas_estimator', () => execute('gas_estimator', { action: 'swap' }));

  // === Summary ===
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
  console.log();

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
