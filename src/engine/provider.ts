import { ethers } from 'ethers';
import { BASE_RPC } from '../config';

let provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(BASE_RPC);
  }
  return provider;
}

// Generic contract call helper
export async function callContract(
  address: string,
  abi: string[],
  method: string,
  args: any[] = []
): Promise<any> {
  const contract = new ethers.Contract(address, abi, getProvider());
  return contract[method](...args);
}

// Multicall for batch reads (gas efficient)
export async function multicall(
  calls: Array<{ address: string; abi: string[]; method: string; args?: any[] }>
): Promise<any[]> {
  const provider = getProvider();
  const results = await Promise.allSettled(
    calls.map((call) => {
      const contract = new ethers.Contract(call.address, call.abi, provider);
      return contract[call.method](...(call.args || []));
    })
  );

  return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
}
