import fs from 'fs';

// Remove a pasta temporária do agente usado nos testes.
export default async function teardown() {
  const sandbox = process.env.DASHBOARD_E2E_DIR;
  if (!sandbox) return;
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    // No Windows o agente pode ainda segurar o banco SQLite; a pasta é temporária.
  }
}
