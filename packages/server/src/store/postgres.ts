import pg from 'pg';
import type { Store, LastSeen, ObservationInput, DriftEventInput } from './types.js';

const { Pool } = pg;

/**
 * Postgres-backed Store. Requires the schema in migrations/0001_init.sql.
 * Not exercised by the unit tests (those use MemoryStore via Fastify inject);
 * integration-test this against a live Postgres.
 */
export class PgStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async resolveOrg(apiKeyHash: string): Promise<string | null> {
    const res = await this.pool.query<{ org_id: string }>(
      `SELECT org_id FROM api_keys WHERE hash = $1 AND revoked_at IS NULL LIMIT 1`,
      [apiKeyHash],
    );
    return res.rows[0]?.org_id ?? null;
  }

  async getLastSeen(orgId: string, serverUrl: string, toolName: string): Promise<LastSeen | null> {
    const res = await this.pool.query<{ fingerprint: string; description: string; input_schema: string }>(
      `SELECT fingerprint, description, input_schema
         FROM current_fingerprints
        WHERE org_id = $1 AND server_url = $2 AND tool_name = $3`,
      [orgId, serverUrl, toolName],
    );
    const row = res.rows[0];
    return row ? { fingerprint: row.fingerprint, description: row.description, inputSchema: row.input_schema } : null;
  }

  async saveObservation(input: ObservationInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query<{ id: string }>(
        `INSERT INTO agents (org_id, external_id, last_seen)
           VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (org_id, external_id)
           DO UPDATE SET last_seen = EXCLUDED.last_seen
         RETURNING id`,
        [input.orgId, input.agentExternalId, input.observedAt],
      );
      const agentId = agent.rows[0]!.id;
      await client.query(
        `INSERT INTO observations
           (org_id, agent_id, server_url, tool_name, fingerprint, canonical, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0))`,
        [input.orgId, agentId, input.serverUrl, input.toolName, input.fingerprint, input.canonicalPayload, input.observedAt],
      );
      await client.query(
        `INSERT INTO current_fingerprints
           (org_id, server_url, tool_name, fingerprint, description, input_schema, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
         ON CONFLICT (org_id, server_url, tool_name) DO UPDATE SET
           fingerprint = EXCLUDED.fingerprint,
           description = EXCLUDED.description,
           input_schema = EXCLUDED.input_schema,
           updated_at = EXCLUDED.updated_at`,
        [input.orgId, input.serverUrl, input.toolName, input.fingerprint, input.description, input.inputSchema, input.observedAt],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async saveDriftEvent(input: DriftEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO drift_events
         (org_id, server_url, tool_name, verdict, old_fp, new_fp, diff_summary, detected_at,
          agent_id)
       SELECT $1, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0), a.id
         FROM agents a
        WHERE a.org_id = $1 AND a.external_id = $2`,
      [
        input.orgId,
        input.agentExternalId,
        input.serverUrl,
        input.toolName,
        input.verdict,
        input.oldFingerprint,
        input.newFingerprint,
        input.diffSummary,
        input.detectedAt,
      ],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
