import type { AdmittedBatch } from '@/lib/waiting-room';

export interface AdmitQueueDeps {
  /** Admits the next batch from every waiting room (`admitFromAllQueues`, bound to Redis). */
  admit: (options: { batchSize: number; passTtlMs: number }) => Promise<AdmittedBatch[]>;
  batchSize: number;
  passTtlMs: number;
  /** Called once per event that admitted someone, e.g. to broadcast the new queue numbers. */
  onAdmitted?: (batch: AdmittedBatch) => void;
}

/**
 * Worker-side processor for the waiting room's repeating job (SCRUM-35). Each tick lets
 * the next `batchSize` fans of every queue through. Admission is atomic in Redis, so a
 * tick that runs late, or twice, only ever admits fans in order.
 */
export function createAdmitQueueProcessor({
  admit,
  batchSize,
  passTtlMs,
  onAdmitted,
}: AdmitQueueDeps) {
  return async (): Promise<AdmittedBatch[]> => {
    const batches = await admit({ batchSize, passTtlMs });
    batches.forEach((batch) => onAdmitted?.(batch));
    return batches;
  };
}
