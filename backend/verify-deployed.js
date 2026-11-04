/**
 * Post-deployment security check.
 *
 * Usage:
 *   npm run verify:deployed
 *   API_BASE_URL=https://your-service.onrender.com npm run verify:deployed
 *
 * This only performs unauthenticated requests and verifies that the deployed
 * build has the security hardening from this repository. It exits non-zero if
 * any check fails, so it can be used in CI or after a Render deploy.
 */

const BASE_URL = (process.env.API_BASE_URL || 'https://scient-feedback-tool.onrender.com').replace(/\/+$/, '');
const SUBJECTS_QUERY = '/subjects-public?class=3-1&branch=CSE-A&academicYear=2025-2026';
const STUDENTS_QUERY = '/admin/students?class=3-1&branch=CSE-A&academicYear=2025-2026';

let passed = 0;
let failed = 0;

function check(name, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${details ? ` — ${details}` : ''}`);
  }
}

async function main() {
  console.log(`\nChecking deployed backend: ${BASE_URL}\n`);

  // Health + response headers
  const health = await fetch(`${BASE_URL}/health`);
  const healthBody = await health.json().catch(() => null);
  check('GET /health returns 200', health.status === 200, String(health.status));
  check('Health payload is OK', healthBody?.status === 'OK', JSON.stringify(healthBody));
  check('x-powered-by header is removed', !health.headers.get('x-powered-by'));
  check('Helmet nosniff header is present', health.headers.get('x-content-type-options') === 'nosniff');
  check('Express version is not leaked', !health.headers.get('server')?.toLowerCase().includes('express'));

  // Admin routes must reject anonymous callers
  const adminStudents = await fetch(`${BASE_URL}${STUDENTS_QUERY}`);
  check('Anonymous GET /admin/students is rejected (401)', adminStudents.status === 401, String(adminStudents.status));

  const facultyMaster = await fetch(`${BASE_URL}/api/faculty-master`);
  check('Anonymous GET /api/faculty-master is rejected (401)', facultyMaster.status === 401, String(facultyMaster.status));

  const subjectsPublic = await fetch(`${BASE_URL}${SUBJECTS_QUERY}`);
  check('Anonymous GET /subjects-public is rejected (401)', subjectsPublic.status === 401, String(subjectsPublic.status));

  // The old PII-disclosing endpoint must be gone
  const removedLookup = await fetch(`${BASE_URL}/student-by-hallticket/DEMO0003`);
  const removedLookupBody = await removedLookup.json().catch(() => null);
  check('GET /student-by-hallticket is removed (404 endpoint)',
    removedLookup.status === 404 && removedLookupBody?.error === 'Endpoint not found',
    `${removedLookup.status} ${JSON.stringify(removedLookupBody)}`);

  // CORS: localhost should be allowed, unknown origins should not receive ACAO
  const allowedPreflight = await fetch(`${BASE_URL}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET'
    }
  });
  check('CORS allows localhost:5173',
    allowedPreflight.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    allowedPreflight.headers.get('access-control-allow-origin') || 'missing');

  const blockedPreflight = await fetch(`${BASE_URL}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example.com',
      'Access-Control-Request-Method': 'GET'
    }
  });
  check('CORS blocks unknown origins', !blockedPreflight.headers.get('access-control-allow-origin'));

  const projectPreflight = await fetch(`${BASE_URL}/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://scient-feedback.onrender.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });
  check('CORS allows the deployed student origin',
    projectPreflight.status === 200 &&
      projectPreflight.headers.get('access-control-allow-origin') === 'https://scient-feedback.onrender.com',
    `${projectPreflight.status} ${projectPreflight.headers.get('access-control-allow-origin') || 'missing'}`);

  // Malformed JSON should be handled without a stack trace
  const malformed = await fetch(`${BASE_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not-json'
  });
  check('Malformed JSON is rejected (400)', malformed.status === 400, String(malformed.status));

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log('The deployed service is not running the hardened backend yet. Redeploy the latest commit and retry.\n');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nDeployment check crashed:', error);
  process.exitCode = 1;
});
