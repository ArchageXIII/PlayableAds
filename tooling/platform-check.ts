import type { BuildReport } from './build';
import type { TargetOs } from '../src/runtime/types';

export function platformCheckEvidence(report: BuildReport, platform: 'unity' | 'google', os: TargetOs, tester: string, result: 'pass' | 'fail', notes: string) {
  if (report.mode !== 'release') throw new Error('Platform checks require a release build and completed campaign/destination preflight.');
  const artifact = report.artifacts.find(item => item.platform === platform && (item.platform === 'google' || item.os === os));
  if (!artifact) throw new Error('Build the selected artifact first.');
  return { checkedAt: new Date().toISOString(), tester, ...artifact, ...(artifact.platform === 'google' ? { campaignOs: os } : {}), result, notes };
}
