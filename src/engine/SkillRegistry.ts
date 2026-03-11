import { BaseSkill } from '../skills/BaseSkill';
import { SkillMetadata } from '../types';

// ALL skills now exported from index files
import { CheckSupplyAPY, CheckBorrowAPY, CompareYields, CompareBorrowRates, CheckHealthFactor, CheckLiquidationThreshold, CheckAvailableLiquidity, CheckUtilizationRate, ListSupportedAssets, CheckVaultPerformance } from '../skills/lending/index';
import { GetTokenPrice, GetSwapQuote, CompareSwapRoutes, CheckPoolStats, CheckLiquidityDepth, GetTopPools, CheckImpermanentLoss, CheckLPRewards } from '../skills/dex/index';
import { CheckVeAEROVoting, CheckBribes } from '../skills/aerodrome/index';
import { CheckSmartCollateral, CheckSmartDebt } from '../skills/fluid/index';
import { ProtocolTVLSkill, TVLTrendSkill, WhaleTracker, GasEstimatorSkill, TokenOverviewSkill, PortfolioCheck, RiskScoreSkill, YieldOptimizer } from '../skills/analytics/index';

class SkillRegistry {
  private skills: Map<string, BaseSkill<any, any>> = new Map();

  constructor() {
    this.registerAll();
  }

  private registerAll(): void {
    // Lending (1-10)
    this.register(new CheckSupplyAPY());
    this.register(new CheckBorrowAPY());
    this.register(new CompareYields());
    this.register(new CompareBorrowRates());
    this.register(new CheckHealthFactor());
    this.register(new CheckLiquidationThreshold());
    this.register(new CheckAvailableLiquidity());
    this.register(new CheckUtilizationRate());
    this.register(new ListSupportedAssets());
    this.register(new CheckVaultPerformance());

    // DEX (11-18)
    this.register(new GetTokenPrice());
    this.register(new GetSwapQuote());
    this.register(new CompareSwapRoutes());
    this.register(new CheckPoolStats());
    this.register(new CheckLiquidityDepth());
    this.register(new GetTopPools());
    this.register(new CheckImpermanentLoss());
    this.register(new CheckLPRewards());

    // Aerodrome (19-20)
    this.register(new CheckVeAEROVoting());
    this.register(new CheckBribes());

    // Fluid (21-22)
    this.register(new CheckSmartCollateral());
    this.register(new CheckSmartDebt());

    // Analytics (23-30)
    this.register(new ProtocolTVLSkill());
    this.register(new TVLTrendSkill());
    this.register(new WhaleTracker());
    this.register(new GasEstimatorSkill());
    this.register(new TokenOverviewSkill());
    this.register(new PortfolioCheck());
    this.register(new RiskScoreSkill());
    this.register(new YieldOptimizer());
  }

  private register(skill: BaseSkill<any, any>): void {
    this.skills.set(skill.metadata.name, skill);
  }

  listSkills(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((s) => s.getInfo());
  }

  searchSkills(query: string): SkillMetadata[] {
    const q = query.toLowerCase();
    return this.listSkills().filter(
      (s) => s.name.includes(q) || s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.includes(q)) || s.category.includes(q)
    );
  }

  skillsForProtocol(protocol: string): SkillMetadata[] {
    return this.listSkills().filter((s) => s.protocols.includes(protocol as any));
  }

  skillsForCategory(category: string): SkillMetadata[] {
    return this.listSkills().filter((s) => s.category === category);
  }

  async execute(skillName: string, input: any): Promise<any> {
    const skill = this.skills.get(skillName);
    if (!skill) return { success: false, errors: [{ code: 'SKILL_NOT_FOUND', message: `Skill "${skillName}" not found` }] };
    return skill.execute(input);
  }

  get count(): number {
    return this.skills.size;
  }
}

export const registry = new SkillRegistry();
