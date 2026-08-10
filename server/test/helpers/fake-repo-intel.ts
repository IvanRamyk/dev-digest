import type { RepoIntel, BlastResult, IndexResult, IndexState, RepoMapResult } from '../../src/modules/repo-intel/types.js';

/**
 * A minimal `RepoIntel` stub for conventions integration tests: everything
 * degrades except `getConventionSamples`/`getTopFilesByRank`, which return a
 * caller-controlled fixed list. Mirrors RepoIntelService's own degraded
 * defaults so callers never need a `degraded`-branch here.
 */
export class FakeRepoIntel implements RepoIntel {
  constructor(private samples: string[] = []) {}

  async indexRepo(): Promise<IndexResult> {
    return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0, reason: 'no_data' };
  }
  async refreshIndex(): Promise<IndexResult> {
    return this.indexRepo();
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: '',
      indexerVersion: 1,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    };
  }
  async getBlastRadius(): Promise<BlastResult> {
    return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' };
  }
  async getRepoMap(): Promise<RepoMapResult> {
    return { text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' };
  }
  async getFileRank() {
    return [];
  }
  async getSymbolsInFiles() {
    return [];
  }
  async getCallerSignatures() {
    return [];
  }
  async getUnresolvedReferences() {
    return [];
  }
  async getConventionSamples(): Promise<string[]> {
    return this.samples;
  }
  async getTopFilesByRank(): Promise<string[]> {
    return this.samples;
  }
  async getCriticalPaths() {
    return [];
  }
}
