import { SkillMetadata, SkillResponse, SkillError, Confidence } from '../types';

export abstract class BaseSkill<TInput, TOutput> {
  abstract metadata: SkillMetadata;

  // Every skill implements this
  abstract execute(input: TInput): Promise<SkillResponse<TOutput>>;

  // Helper to build successful response
  protected success(data: TOutput, confidence: Confidence = 'high', cached = false): SkillResponse<TOutput> {
    return {
      success: true,
      data,
      confidence,
      lastUpdated: Date.now(),
      cached,
    };
  }

  // Helper to build error response
  protected error(code: string, message: string): SkillResponse<TOutput> {
    return {
      success: false,
      data: null as any,
      confidence: 'low',
      lastUpdated: Date.now(),
      cached: false,
      errors: [{ code, message }],
    };
  }

  // Get skill info for agent discovery
  getInfo(): SkillMetadata {
    return this.metadata;
  }
}
