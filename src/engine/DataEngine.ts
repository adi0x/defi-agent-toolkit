import { Protocol } from '../types';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // milliseconds
}

export class DataEngine {
  private cache: Map<string, CacheEntry> = new Map();
  private fetchIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Get data from cache, fetch if stale or missing
  async get<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<{ data: T; cached: boolean }> {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return { data: cached.data as T, cached: true };
    }

    try {
      const data = await fetcher();
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl: ttlSeconds * 1000,
      });
      return { data, cached: false };
    } catch (error) {
      // Return stale cache if fetch fails
      if (cached) {
        return { data: cached.data as T, cached: true };
      }
      throw error;
    }
  }

  // Start a recurring fetch job
  startJob(key: string, fetcher: () => Promise<any>, intervalSeconds: number): void {
    // Run immediately
    fetcher()
      .then((data) => {
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl: intervalSeconds * 1000,
        });
      })
      .catch((err) => console.error(`[DataEngine] Job ${key} failed:`, err));

    // Then schedule recurring
    const interval = setInterval(async () => {
      try {
        const data = await fetcher();
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl: intervalSeconds * 1000,
        });
      } catch (err) {
        console.error(`[DataEngine] Job ${key} failed:`, err);
      }
    }, intervalSeconds * 1000);

    this.fetchIntervals.set(key, interval);
  }

  // Stop a recurring job
  stopJob(key: string): void {
    const interval = this.fetchIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.fetchIntervals.delete(key);
    }
  }

  // Stop all jobs
  stopAll(): void {
    for (const [key, interval] of this.fetchIntervals) {
      clearInterval(interval);
    }
    this.fetchIntervals.clear();
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache stats
  getStats(): { entries: number; jobs: number; keys: string[] } {
    return {
      entries: this.cache.size,
      jobs: this.fetchIntervals.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // Build cache key
  static key(protocol: Protocol, skill: string, ...params: string[]): string {
    return [protocol, skill, ...params].join(':');
  }
}

// Singleton instance
export const dataEngine = new DataEngine();
