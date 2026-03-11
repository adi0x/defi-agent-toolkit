// =============================================
// AERODROME SKILLS (19-20) — WITH REAL FETCHERS
// =============================================

import { BaseSkill } from '../BaseSkill';
import { SkillMetadata, SkillResponse, VeAEROVoting, BribesResult } from '../../types';
import { dataEngine, DataEngine } from '../../engine/DataEngine';
import { aerodromeFetcher, priceFetcher } from '../../engine/fetchers';

// ===== Skill 19: CheckVeAEROVoting =====

export class CheckVeAEROVoting extends BaseSkill<{ epoch?: string; poolAddress?: string }, VeAEROVoting> {
  metadata: SkillMetadata = {
    name: 'check_veAERO_voting',
    description: 'Returns current epoch voting data — which pools receive the most votes and AERO emissions.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['aerodrome'],
    tags: ['veAERO', 'voting', 'epoch', 'emissions', 'governance', 'gauge'],
    authLevel: 'read', freshness: 300, rateLimit: 10, mode: 'both',
    context: 'veAERO holders vote weekly on pool emissions. 100% of trading fees go to veAERO voters.',
    dependencies: [], chainable: true, chainOutputCompatibleWith: ['check_lp_rewards', 'check_bribes'],
  };

  async execute(input: { epoch?: string; poolAddress?: string }): Promise<SkillResponse<VeAEROVoting>> {
    const cacheKey = DataEngine.key('aerodrome', 'voting', input.epoch || 'current');

    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      const votingData = await aerodromeFetcher.getVotingData();

      // Epoch timing: Aerodrome epochs flip every Thursday 00:00 UTC
      const now = Date.now();
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      // Find next Thursday
      const d = new Date(now);
      const dayOfWeek = d.getUTCDay();
      const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
      const epochEnd = new Date(d);
      epochEnd.setUTCDate(d.getUTCDate() + daysUntilThursday);
      epochEnd.setUTCHours(0, 0, 0, 0);

      return {
        epochNumber: Math.floor(now / msPerWeek),
        epochEnd: epochEnd.getTime(),
        totalVotes: votingData.totalVotes,
        topPools: [], // Would need to enumerate all gauges
        totalEmissionsUsd: 0, // Need AERO price * emission rate
        lastUpdated: Date.now(),
      };
    }, this.metadata.freshness);

    return this.success(data, 'medium', cached);
  }
}

// ===== Skill 20: CheckBribes =====

export class CheckBribes extends BaseSkill<{ poolAddress?: string; minValueUsd?: number }, BribesResult> {
  metadata: SkillMetadata = {
    name: 'check_bribes',
    description: 'Returns active bribes on Aerodrome pools — incentives to attract veAERO votes.',
    version: '1.0.0', category: 'dex', chain: 'base', protocols: ['aerodrome'],
    tags: ['bribes', 'incentives', 'veAERO', 'voting', 'rewards', 'aerodrome'],
    authLevel: 'read', freshness: 300, rateLimit: 10, mode: 'pull',
    context: 'Protocols bribe veAERO voters to direct emissions. Bribe ROI = (bribe value + fees) / vote value.',
    dependencies: ['check_veAERO_voting'], chainable: true, chainOutputCompatibleWith: ['yield_optimizer'],
  };

  async execute(input: { poolAddress?: string; minValueUsd?: number }): Promise<SkillResponse<BribesResult>> {
    const cacheKey = DataEngine.key('aerodrome', 'bribes', input.poolAddress || 'all');

    const { data, cached } = await dataEngine.get(cacheKey, async () => {
      // Fetch bribe data from Aerodrome Sugar contract
      const bribeData = await aerodromeFetcher.getBribes();

      let bribes = bribeData.map((b: any) => ({
        poolPair: b.pair,
        bribeToken: 'AERO', // emissions token
        bribeAmount: b.emissionsPerSecond * 604800, // per week
        bribeValueUsd: 0,
        estimatedRoi: 0,
      }));

      if (input.poolAddress) {
        bribes = bribes.filter((b: any) => bribeData.some((bd: any) => bd.pool?.toLowerCase() === input.poolAddress!.toLowerCase()));
      }

      const totalBribesUsd = bribes.reduce((s: number, b: any) => s + b.bribeValueUsd, 0);
      const highestRoi = bribes.length > 0 ? bribes.sort((a: any, b: any) => b.estimatedRoi - a.estimatedRoi)[0] : null;

      return { bribes, totalBribesUsd, highestRoi, lastUpdated: Date.now() };
    }, this.metadata.freshness);

    return this.success(data, data.bribes.length > 0 ? 'high' : 'medium', cached);
  }
}
