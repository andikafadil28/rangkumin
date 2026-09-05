export async function purgeExpiredTransactions(
  database: D1Database,
  now = new Date(),
): Promise<number> {
  const result = await database
    .prepare(
      `DELETE FROM transactions
       WHERE deleted_at IS NOT NULL
         AND purge_after IS NOT NULL
         AND purge_after <= ?1`,
    )
    .bind(now.toISOString())
    .run();

  return result.meta.changes;
}
