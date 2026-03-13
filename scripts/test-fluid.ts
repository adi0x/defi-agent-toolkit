import 'dotenv/config';
import { fluidFetcher } from '../src/engine/fetchers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

async function main() {
  console.log('\n💧 Fluid ABI Verification Test\n');

  if (!process.env.BASE_RPC_URL) {
    console.log(`${RED}ERROR: BASE_RPC_URL not set${RESET}`);
    process.exit(1);
  }

  // Test 1: Lending Resolver
  console.log('1. LendingResolver.getAllFTokensData()');
  try {
    const fTokens = await fluidFetcher.getLendingData();
    console.log(`   ${GREEN}✓${RESET} Found ${fTokens.length} fTokens`);
    if (fTokens[0]) {
      console.log(`   First fToken: ${fTokens[0].name} (${fTokens[0].symbol})`);
      console.log(`   Asset: ${fTokens[0].asset}`);
      console.log(`   Total Assets: ${fTokens[0].totalAssets}`);
      console.log(`   Rewards Active: ${fTokens[0].rewardsActive}`);
    }
  } catch (err: any) {
    console.log(`   ${RED}✗ FAILED${RESET}: ${err.message}`);
    console.log(`   → Check LendingResolver ABI at 0x3E42e4b78e92a151D287E16BF3F29Ab9DaCf5461`);
  }

  // Test 2: Liquidity Resolver
  console.log('\n2. LiquidityResolver.getOverallTokenData(USDC)');
  try {
    const rates = await fluidFetcher.getTokenRates('USDC');
    console.log(`   ${GREEN}✓${RESET} Got rates`);
    console.log(`   Supply Rate: ${rates?.supplyRate}%`);
    console.log(`   Borrow Rate: ${rates?.borrowRate}%`);
    console.log(`   Utilization: ${rates?.utilization}%`);
  } catch (err: any) {
    console.log(`   ${RED}✗ FAILED${RESET}: ${err.message}`);
    console.log(`   → Check LiquidityResolver ABI at 0x741c2Cd25f053a55fd94afF1afAEf146523E1249`);
  }

  // Test 3: Vault Resolver
  console.log('\n3. VaultResolver.getAllVaultsAddresses()');
  try {
    const vaults = await fluidFetcher.getAllVaults();
    console.log(`   ${GREEN}✓${RESET} Found ${vaults.length} vaults`);

    if (vaults.length > 0) {
      console.log(`\n4. VaultResolver.getVaultEntireData(${vaults[0].slice(0, 10)}...)`);
      try {
        const data = await fluidFetcher.getVaultData(vaults[0]);
        console.log(`   ${GREEN}✓${RESET} Got vault data`);
        console.log(`   Supply Token: ${data?.supplyToken}`);
        console.log(`   Borrow Token: ${data?.borrowToken}`);
        console.log(`   Collateral Factor: ${data?.collateralFactor}%`);
        console.log(`   Supply Rate Magnifier: ${data?.supplyRateMagnifier}%`);
        console.log(`   Borrow Rate Magnifier: ${data?.borrowRateMagnifier}%`);
        console.log(`   Is Smart Collateral: ${data?.isSmartCollateral}`);
        console.log(`   Is Smart Debt: ${data?.isSmartDebt}`);
      } catch (err: any) {
        console.log(`   ${RED}✗ FAILED${RESET}: ${err.message}`);
        console.log(`   → The VaultEntireData struct might not match. Check the ABI in fetchers.ts line ~300`);
      }
    }
  } catch (err: any) {
    console.log(`   ${RED}✗ FAILED${RESET}: ${err.message}`);
    console.log(`   → Check VaultResolver ABI at 0x93CAB6529aD849b2583EBAe32D13817A2F38cEb0`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('If any tests failed, the ABI in src/engine/fetchers.ts');
  console.log('needs to match the actual deployed contract. Check on Basescan.\n');
}

main().catch(console.error);
