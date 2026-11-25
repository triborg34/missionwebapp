import type { Request } from 'express';
import { prisma } from '../db.js';

type Client = Pick<typeof prisma, 'auditLog'>;

export interface AuditEntry {
  actor?: { id: number; fullName: string };
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}

/** Records an audit event. Pass a transaction client to make it atomic with the change. */
export async function audit(
  req: Request | null,
  entry: AuditEntry,
  client: Client = prisma,
): Promise<void> {
  const actor = entry.actor ?? (req?.user ? { id: req.user.id, fullName: req.user.fullName } : null);
  await client.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.fullName ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId !== undefined ? String(entry.entityId) : null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ip: req?.ip ?? null,
    },
  });
}
