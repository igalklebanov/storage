import type {
  PoolClient,
  QueryResult,
  QueryResultRow,
} from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';
import type { VercelPoolClient, VercelPostgresPoolConfig } from './types';
import {
  isLocalhostConnectionString,
  isPooledConnectionString,
  postgresConnectionString,
} from './postgres-connection-string';
import { VercelPostgresError } from './error';
import type { Primitive } from './sql-template';
import { sqlTemplate } from './sql-template';
import { VercelClient } from './create-client';

export class VercelPool extends Pool {
  Client = VercelClient;
  /**
   * A template literal tag providing safe, easy to use SQL parameterization.
   * Parameters are substituted using the underlying Postgres database, and so must follow
   * the rules of Postgres parameterization.
   * @example
   * ```ts
   * const pool = createPool();
   * const userId = 123;
   * const result = await pool.sql`SELECT * FROM users WHERE id = ${userId}`;
   * // Equivalent to: await pool.query('SELECT * FROM users WHERE id = $1', [id]);
   * ```
   * @returns A promise that resolves to the query result.
   */
  async sql<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): Promise<QueryResult<O>> {
    const [query, params] = sqlTemplate(strings, ...values);
    return this.query(query, params);
  }

  connect(): Promise<VercelPoolClient>;
  connect(
    callback: (
      err: Error,
      client: VercelPoolClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      done: (release?: any) => void,
    ) => void,
  ): void;
  connect(
    callback?: (
      err: Error,
      client: VercelPoolClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      done: (release?: any) => void,
    ) => void,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): void | Promise<VercelPoolClient> {
    return super.connect(
      callback as (
        err: Error,
        client: PoolClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        done: (release?: any) => void,
      ) => void,
    );
  }
}

export function createPool(config?: VercelPostgresPoolConfig): VercelPool {
  const connectionString =
    config?.connectionString ?? postgresConnectionString('pool');
  if (!connectionString)
    throw new VercelPostgresError(
      'missing_connection_string',
      "You did not supply a 'connectionString' and no 'POSTGRES_URL' env var was found.",
    );

  if (
    !isLocalhostConnectionString(connectionString) &&
    !isPooledConnectionString(connectionString)
  )
    throw new VercelPostgresError(
      'invalid_connection_string',
      'This connection string is meant to be used with a direct connection. Make sure to use a pooled connection string or try `createClient()` instead.',
    );

  let maxUses = config?.maxUses;
  if (typeof EdgeRuntime !== 'undefined') {
    if (maxUses && maxUses !== 1) {
      // eslint-disable-next-line no-console
      console.warn(
        '@vercel/postgres: Overriding `maxUses` to 1 because the EdgeRuntime does not support client reuse.',
      );
    }
    // Client reuse is not supported in the EdgeRuntime because it does not support IO across requests.
    maxUses = 1;
  }

  return new VercelPool({
    ...config,
    connectionString,
    maxUses,
  });
}
