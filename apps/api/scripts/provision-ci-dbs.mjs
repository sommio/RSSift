import pg from "pg";

const { Client } = pg;

const adminConnectionString =
  process.env.CI_ADMIN_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const databases = ["rssift_ci", "rssift_test_ci"];

const admin = new Client({ connectionString: adminConnectionString });

try {
  await admin.connect();

  for (const databaseName of databases) {
    const result = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (result.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`CI DB provisioning failed: ${message}`);
} finally {
  await admin.end();
}
