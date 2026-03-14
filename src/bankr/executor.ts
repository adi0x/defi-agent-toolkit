import axios from 'axios';
const BANKR_API = 'https://api.bankr.bot';

interface BankrConfig { apiKey: string; }
interface BankrJob { jobId: string; status: string; result?: any; txHash?: string; error?: string; }

export class BankrExecutor {
  private apiKey: string;
  constructor(config: BankrConfig) { this.apiKey = config.apiKey; }

  private async submit(prompt: string): Promise<BankrJob> {
    try {
      const res = await axios.post(BANKR_API + '/agent/prompt', { prompt }, {
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      return { jobId: res.data?.jobId || '', status: 'pending', result: res.data };
    } catch (err: any) {
      return { jobId: '', status: 'failed', error: err.response?.data?.message || err.response?.data?.error || err.message };
    }
  }

  private async poll(jobId: string, maxWaitMs: number = 60000): Promise<BankrJob> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const res = await axios.get(BANKR_API + '/agent/job/' + jobId, {
          headers: { 'X-API-Key': this.apiKey }, timeout: 10000,
        });
        if (res.data?.status === 'completed') return { jobId, status: 'completed', result: res.data?.response, txHash: res.data?.txHash };
        if (res.data?.status === 'failed') return { jobId, status: 'failed', error: res.data?.error };
        await new Promise(r => setTimeout(r, 2000));
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
    return { jobId, status: 'failed', error: 'Timeout' };
  }

  private async execute(prompt: string): Promise<BankrJob> {
    const job = await this.submit(prompt);
    if (job.status === 'failed' || !job.jobId) return job;
    return this.poll(job.jobId);
  }

  async deposit(token: string, amount: number, protocol: string) { return this.execute('Deposit ' + amount + ' ' + token + ' into ' + protocol + ' on Base'); }
  async withdraw(token: string, amount: number, protocol: string) { return this.execute('Withdraw ' + amount + ' ' + token + ' from ' + protocol + ' on Base'); }
  async swap(tokenIn: string, tokenOut: string, amountIn: number) { return this.execute('Swap ' + amountIn + ' ' + tokenIn + ' for ' + tokenOut + ' on Base'); }
  async borrow(token: string, amount: number, protocol: string) { return this.execute('Borrow ' + amount + ' ' + token + ' from ' + protocol + ' on Base'); }
  async repay(token: string, amount: number, protocol: string) { return this.execute('Repay ' + amount + ' ' + token + ' on ' + protocol + ' on Base'); }
  async run(prompt: string) { return this.execute(prompt); }
  async getBalance() { return this.execute('Show my portfolio balance on Base'); }
}

import { execute as skillExecute } from '../index';

export async function optimizeAndExecute(bankr: BankrExecutor, token: string, amount: number, riskTolerance?: string) {
  const analysis = await skillExecute('yield_optimizer', { token, amount, riskTolerance: riskTolerance || 'moderate' });
  if (!analysis.success || !analysis.data?.recommended) return { analysis, execution: null, summary: 'Could not find a strategy for ' + amount + ' ' + token };
  const strategy = analysis.data.recommended;
  const execution = await bankr.deposit(token, amount, strategy.protocols[0]);
  return { analysis, execution, summary: 'Found ' + strategy.expectedApy + '% APY on ' + strategy.protocols[0] + '. ' + (execution.status === 'completed' ? 'Deposited. TX: ' + execution.txHash : 'Execution ' + execution.status) };
}

export async function smartSwap(bankr: BankrExecutor, tokenIn: string, tokenOut: string, amountIn: number) {
  const analysis = await skillExecute('compare_swap_routes', { tokenIn, tokenOut, amountIn });
  if (!analysis.success || !analysis.data) return { analysis, execution: null, summary: 'Could not find route' };
  const execution = await bankr.swap(tokenIn, tokenOut, amountIn);
  return { analysis, execution, summary: 'Best: ' + analysis.data.bestDex + '. ' + (execution.status === 'completed' ? 'Swapped. TX: ' + execution.txHash : 'Execution ' + execution.status) };
}

export async function monitorAndProtect(bankr: BankrExecutor, walletAddress: string, dangerThreshold?: number) {
  const threshold = dangerThreshold || 1.2;
  const analysis = await skillExecute('check_health_factor', { walletAddress });
  if (!analysis.success || !analysis.data) return { analysis, execution: null, summary: 'Could not check health factor' };
  const hf = analysis.data.healthFactor;
  if (hf < threshold && hf > 0) {
    const execution = await bankr.run('Repay 25% of my debt on Aave on Base');
    return { analysis, execution, summary: 'Health factor ' + hf.toFixed(2) + ' below ' + threshold + '. Auto-repaying.' };
  }
  return { analysis, execution: null, summary: 'Health factor ' + hf.toFixed(2) + ' — safe.' };
}
