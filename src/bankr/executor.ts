// =============================================
// BANKR EXECUTION LAYER
// =============================================
// Integrates Bankr's Agent API for on-chain execution.
// Think (your toolkit) + Act (Bankr) in one call.

import axios from 'axios';

const BANKR_API = 'https://api.bankr.bot';

interface BankrConfig {
  apiKey: string;        // Bankr API key (bk_...)
  waitForConfirmation?: boolean;  // Wait for tx confirmation
}

interface BankrJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  txHash?: string;
  error?: string;
}

export class BankrExecutor {
  private apiKey: string;
  private waitForConfirmation: boolean;

  constructor(config: BankrConfig) {
    this.apiKey = config.apiKey;
    this.waitForConfirmation = config.waitForConfirmation ?? true;
  }

  // Submit a natural language command to Bankr
  private async submit(prompt: string): Promise<BankrJob> {
    try {
      const res = await axios.post(`${BANKR_API}/agent/submit`, {
        prompt,
        waitForConfirmation: this.waitForConfirmation,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return {
        jobId: res.data?.jobId || res.data?.id || '',
        status: 'pending',
        result: res.data,
      };
    } catch (err: any) {
      return {
        jobId: '',
        status: 'failed',
        error: err.response?.data?.message || err.message,
      };
    }
  }

  // Poll a job until it completes
  private async poll(jobId: string, maxWaitMs: number = 60000): Promise<BankrJob> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const res = await axios.get(`${BANKR_API}/agent/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
          timeout: 10000,
        });
        const status = res.data?.status;
        if (status === 'completed') {
          return {
            jobId,
            status: 'completed',
            result: res.data?.result,
            txHash: res.data?.txHash,
          };
        }
        if (status === 'failed') {
          return { jobId, status: 'failed', error: res.data?.error };
        }
        // Still processing — wait 2 seconds
        await new Promise(r => setTimeout(r, 2000));
      } catch {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    return { jobId, status: 'failed', error: 'Timeout waiting for execution' };
  }

  // Execute and wait for result
  private async execute(prompt: string): Promise<BankrJob> {
    const job = await this.submit(prompt);
    if (job.status === 'failed') return job;
    if (!job.jobId) return job;
    return this.poll(job.jobId);
  }

  // ===== HIGH-LEVEL ACTIONS =====

  // Deposit into a lending protocol
  async deposit(token: string, amount: number, protocol: string): Promise<BankrJob> {
    return this.execute(`Deposit ${amount} ${token} into ${protocol} on Base`);
  }

  // Withdraw from a lending protocol
  async withdraw(token: string, amount: number, protocol: string): Promise<BankrJob> {
    return this.execute(`Withdraw ${amount} ${token} from ${protocol} on Base`);
  }

  // Swap tokens
  async swap(tokenIn: string, tokenOut: string, amountIn: number): Promise<BankrJob> {
    return this.execute(`Swap ${amountIn} ${tokenIn} for ${tokenOut} on Base`);
  }

  // Borrow from a lending protocol
  async borrow(token: string, amount: number, protocol: string): Promise<BankrJob> {
    return this.execute(`Borrow ${amount} ${token} from ${protocol} on Base`);
  }

  // Repay a loan
  async repay(token: string, amount: number, protocol: string): Promise<BankrJob> {
    return this.execute(`Repay ${amount} ${token} on ${protocol} on Base`);
  }

  // Add liquidity to a pool
  async addLiquidity(tokenA: string, tokenB: string, amountA: number, dex: string): Promise<BankrJob> {
    return this.execute(`Add liquidity ${amountA} ${tokenA} and ${tokenB} to ${dex} pool on Base`);
  }

  // Generic — any natural language command
  async run(prompt: string): Promise<BankrJob> {
    return this.execute(prompt);
  }

  // Check wallet balance
  async getBalance(): Promise<BankrJob> {
    return this.execute('Show my portfolio balance on Base');
  }
}

// ===== THINK + ACT COMBINED =====
// These functions use the toolkit for analysis THEN Bankr for execution

import { execute as skillExecute } from '../index';

export async function optimizeAndExecute(
  bankr: BankrExecutor,
  token: string,
  amount: number,
  riskTolerance: string = 'moderate'
): Promise<{
  analysis: any;
  execution: BankrJob | null;
  summary: string;
}> {
  // THINK: Find the best strategy
  const analysis = await skillExecute('yield_optimizer', { token, amount, riskTolerance });

  if (!analysis.success || !analysis.data?.recommended) {
    return {
      analysis,
      execution: null,
      summary: `Could not find a strategy for ${amount} ${token}`,
    };
  }

  const strategy = analysis.data.recommended;

  // ACT: Execute through Bankr
  const execution = await bankr.deposit(token, amount, strategy.protocol);

  return {
    analysis,
    execution,
    summary: `Found ${strategy.apy}% APY on ${strategy.protocol}. ${execution.status === 'completed' ? 'Deposited successfully. TX: ' + execution.txHash : 'Execution ' + execution.status}`,
  };
}

export async function smartSwap(
  bankr: BankrExecutor,
  tokenIn: string,
  tokenOut: string,
  amountIn: number
): Promise<{
  analysis: any;
  execution: BankrJob | null;
  summary: string;
}> {
  // THINK: Find the best route
  const analysis = await skillExecute('compare_swap_routes', { tokenIn, tokenOut, amountIn });

  if (!analysis.success || !analysis.data) {
    return {
      analysis,
      execution: null,
      summary: `Could not find swap route for ${amountIn} ${tokenIn} → ${tokenOut}`,
    };
  }

  // ACT: Execute the swap
  const execution = await bankr.swap(tokenIn, tokenOut, amountIn);

  return {
    analysis,
    execution,
    summary: `Best route: ${analysis.data.bestDex} for ${analysis.data.bestAmountOut} ${tokenOut}. ${execution.status === 'completed' ? 'Swapped. TX: ' + execution.txHash : 'Execution ' + execution.status}`,
  };
}

export async function monitorAndProtect(
  bankr: BankrExecutor,
  walletAddress: string,
  dangerThreshold: number = 1.2
): Promise<{
  analysis: any;
  execution: BankrJob | null;
  summary: string;
}> {
  // THINK: Check health factor
  const analysis = await skillExecute('check_health_factor', { walletAddress });

  if (!analysis.success || !analysis.data) {
    return {
      analysis,
      execution: null,
      summary: 'Could not check health factor',
    };
  }

  const healthFactor = analysis.data.healthFactor;

  // ACT: If in danger, repay some debt
  if (healthFactor < dangerThreshold && healthFactor > 0) {
    const execution = await bankr.run(
      `Repay 25% of my debt on Aave on Base to improve health factor`
    );
    return {
      analysis,
      execution,
      summary: `Health factor ${healthFactor.toFixed(2)} is below ${dangerThreshold}. Auto-repaying to protect position. ${execution.status}`,
    };
  }

  return {
    analysis,
    execution: null,
    summary: `Health factor ${healthFactor.toFixed(2)} — position is safe.`,
  };
}
