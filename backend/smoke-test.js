/**
 * End-to-end smoke test for the local backend.
 *
 * Start the server first (npm start), then run:
 *   npm run test:api
 *
 * The test creates a temporary student / faculty / subject / timetable and
 * removes them afterwards, so it can be re-run safely. It also verifies that
 * admin-only endpoints reject anonymous and student tokens.
 */
require('dotenv').config();

const BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const COMMON_PASSWORD = process.env.STUDENT_COMMON_PASSWORD || 'Scient@123';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const CLASS = '3-1';
const BRANCH = 'CSE-A';
const YEAR = '2025-2026';
const TEST_HALLTICKET = 'SMOKE001';
const TEST_FACULTY_ID = 'FAC999';
const TEST_SUBJECT_CODE = 'SUB999';

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

async function request(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let data = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

async function main() {
  console.log(`\nRunning API smoke tests against ${BASE_URL}\n`);

  const health = await request('GET', '/health');
  check('GET /health', health.status === 200 && health.data?.status === 'OK');
  if (health.status !== 200) {
    throw new Error('Backend is not running. Start it with: npm start');
  }

  // ---------------- Unauthenticated access ----------------
  console.log('\nUnauthenticated access is rejected');
  const anonymousStudents = await request('GET', `/admin/students?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`);
  check('GET /admin/students without token → 401', anonymousStudents.status === 401, String(anonymousStudents.status));

  const anonymousFaculty = await request('GET', '/api/faculty-master');
  check('GET /api/faculty-master without token → 401', anonymousFaculty.status === 401, String(anonymousFaculty.status));

  const removedLookup = await request('GET', '/student-by-hallticket/DEMO0003');
  check('GET /student-by-hallticket is removed → 404', removedLookup.status === 404, String(removedLookup.status));

  // ---------------- Admin auth ----------------
  console.log('\nAdmin authentication');
  const badLogin = await request('POST', '/admin/login', {
    body: { username: ADMIN_USERNAME, password: 'definitely-wrong' }
  });
  check('POST /admin/login rejects bad password → 401', badLogin.status === 401, String(badLogin.status));

  const adminLogin = await request('POST', '/admin/login', {
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
  });
  check('POST /admin/login', adminLogin.status === 200 && !!adminLogin.data?.token, JSON.stringify(adminLogin.data));
  const adminToken = adminLogin.data?.token;

  // ---------------- Read-only admin endpoints ----------------
  console.log('\nAdmin read endpoints');
  const readEndpoints = [
    ['GET /classes', '/classes'],
    [`GET /faculties`, `/faculties?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /feedback-counts`, `/feedback-counts?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /round-status`, `/round-status?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /admin/students`, `/admin/students?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /admin/students-with-status`, `/admin/students-with-status?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /feedback-submissions`, `/feedback-submissions?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /class-report`, `/class-report?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /department-report`, `/department-report?branch=${BRANCH}&academicYear=${YEAR}`],
    ['GET /all-faculties', '/all-faculties'],
    ['GET /faculty-variations', '/faculty-variations'],
    ['GET /faculty-history', `/faculty-history?faculty=${encodeURIComponent('Dr. A. Sharma')}`],
    [`GET /full-performance/:faculty`, `/full-performance/${encodeURIComponent('Dr. A. Sharma')}?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    [`GET /subjects-public`, `/subjects-public?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`],
    ['GET /api/faculty-master', '/api/faculty-master'],
    ['GET /api/subject-master', '/api/subject-master'],
    ['GET /api/timetable', '/api/timetable']
  ];

  for (const [name, path] of readEndpoints) {
    const result = await request('GET', path, { token: adminToken });
    check(name, result.status === 200, `${result.status} ${JSON.stringify(result.data).slice(0, 120)}`);
  }

  // ---------------- Round control ----------------
  console.log('\nRound control');
  const disableInitial = await request('POST', '/round-control', {
    token: adminToken,
    body: { class: CLASS, branch: BRANCH, academicYear: YEAR, round: 'initial', enabled: false }
  });
  check('POST /round-control (disable initial)',
    disableInitial.status === 200 && disableInitial.data?.control?.initialEnabled === false,
    JSON.stringify(disableInitial.data));

  const enableInitial = await request('POST', '/round-control', {
    token: adminToken,
    body: { class: CLASS, branch: BRANCH, academicYear: YEAR, round: 'initial', enabled: true }
  });
  check('POST /round-control (enable initial)',
    enableInitial.status === 200 && enableInitial.data?.control?.initialEnabled === true,
    JSON.stringify(enableInitial.data));

  const invalidRound = await request('POST', '/round-control', {
    token: adminToken,
    body: { class: CLASS, branch: BRANCH, academicYear: YEAR, round: 'bogus', enabled: true }
  });
  check('POST /round-control rejects invalid round → 400', invalidRound.status === 400, String(invalidRound.status));

  // ---------------- Student management CRUD ----------------
  console.log('\nStudent management CRUD');
  const addStudent = await request('POST', '/admin/add-student', {
    token: adminToken,
    body: { name: 'Smoke Test Student', hallticket: TEST_HALLTICKET, class: CLASS, branch: BRANCH, academicYear: YEAR }
  });
  check('POST /admin/add-student', addStudent.status === 201 && addStudent.data?.success, JSON.stringify(addStudent.data));
  check('POST /admin/add-student does not leak password', !('password' in (addStudent.data?.student || {})), JSON.stringify(addStudent.data?.student));

  const updateStudent = await request('PUT', `/admin/update-student/${TEST_HALLTICKET}`, {
    token: adminToken,
    body: { name: 'Smoke Test Student Updated', class: CLASS, branch: BRANCH, academicYear: YEAR }
  });
  check('PUT /admin/update-student/:hallticket', updateStudent.status === 200 && updateStudent.data?.success, JSON.stringify(updateStudent.data));

  // ---------------- Student flow ----------------
  console.log('\nStudent login + feedback flow');
  const badStudentLogin = await request('POST', '/login', {
    body: { hallticket: TEST_HALLTICKET, password: 'wrong-password' }
  });
  check('POST /login rejects bad password → 401', badStudentLogin.status === 401, String(badStudentLogin.status));

  const studentLogin = await request('POST', '/login', {
    body: { hallticket: TEST_HALLTICKET, password: COMMON_PASSWORD }
  });
  check('POST /login', studentLogin.status === 200 && !!studentLogin.data?.token, JSON.stringify(studentLogin.data));
  const studentToken = studentLogin.data?.token;

  const studentOnAdminRoute = await request('GET', '/admin/students-with-status?class=' + CLASS + '&branch=' + BRANCH + '&academicYear=' + YEAR, { token: studentToken });
  check('Student token on admin route → 403', studentOnAdminRoute.status === 403, String(studentOnAdminRoute.status));

  const adminOnStudentRoute = await request('GET', '/student-info', { token: adminToken });
  check('Admin token on student route → 403', adminOnStudentRoute.status === 403, String(adminOnStudentRoute.status));

  const semesters = await request('GET', '/student-semesters', { token: studentToken });
  check('GET /student-semesters', semesters.status === 200 && Array.isArray(semesters.data), JSON.stringify(semesters.data));

  const studentInfo = await request('GET', '/student-info', { token: studentToken });
  check('GET /student-info', studentInfo.status === 200 && studentInfo.data?.class === CLASS, JSON.stringify(studentInfo.data));

  const subjects = await request('GET', `/subjects?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`, { token: studentToken });
  check('GET /subjects', subjects.status === 200 && Array.isArray(subjects.data) && subjects.data.length > 0, JSON.stringify(subjects.data));

  const feedbackcheckBefore = await request('GET', `/feedbackcheck?class=${CLASS}&round=initial`, { token: studentToken });
  check('GET /feedbackcheck (before)', feedbackcheckBefore.status === 200 && feedbackcheckBefore.data?.submitted === false, JSON.stringify(feedbackcheckBefore.data));

  const questions = [
    'Punctuality of teacher',
    'Explanation of the topic/concepts',
    'Clarification of doubts',
    'Utilization of time',
    'Completion of syllabus in time',
    'Communication skills',
    "Teacher's commands and control of the class",
    'Attitude of the teacher towards the students',
    'Use of board & audio visual aids by the teacher',
    'Accesibility of Teacher after class hours'
  ];

  const feedbacks = (subjects.data || []).map((subject) => ({
    subject: subject.subject,
    subjectCode: subject.subjectCode,
    faculty: subject.faculty,
    facultyId: subject.facultyId,
    answers: questions.map((question) => ({ question, score: 5 }))
  }));

  // Client-supplied scores outside 1-5 must be rejected.
  const invalidFeedback = await request('POST', '/feedback', {
    token: studentToken,
    body: {
      class: CLASS,
      round: 'initial',
      feedbacks: [{ ...feedbacks[0], answers: [{ question: 'Punctuality of teacher', score: 99 }] }]
    }
  });
  check('POST /feedback rejects out-of-range score → 400', invalidFeedback.status === 400, String(invalidFeedback.status));

  for (const round of ['initial', 'final']) {
    const submit = await request('POST', '/feedback', {
      token: studentToken,
      body: { class: CLASS, feedbacks, suggestion: 'Smoke test', round }
    });
    check(`POST /feedback (${round})`, submit.status === 200 && submit.data?.success, JSON.stringify(submit.data));

    const status = await request('GET', `/feedbackcheck?class=${CLASS}&round=${round}`, { token: studentToken });
    check(`GET /feedbackcheck (${round} after submit)`, status.status === 200 && status.data?.submitted === true, JSON.stringify(status.data));
  }

  const duplicateFeedback = await request('POST', '/feedback', {
    token: studentToken,
    body: { class: CLASS, feedbacks, suggestion: 'Again', round: 'initial' }
  });
  check('POST /feedback rejects duplicate round → 400', duplicateFeedback.status === 400, String(duplicateFeedback.status));

  const reportsAfter = await request('GET', `/class-report?class=${CLASS}&branch=${BRANCH}&academicYear=${YEAR}`, { token: adminToken });
  check('GET /class-report (has data)', reportsAfter.status === 200 && Array.isArray(reportsAfter.data) && reportsAfter.data.length > 0);

  // ---------------- Faculty / subject / timetable CRUD ----------------
  console.log('\nFaculty, subject and timetable CRUD');
  const addFaculty = await request('POST', '/api/faculty-master', {
    token: adminToken,
    body: { facultyId: TEST_FACULTY_ID, facultyName: 'Smoke Test Faculty', department: 'CSE' }
  });
  check('POST /api/faculty-master', addFaculty.status === 200 && addFaculty.data?.success, JSON.stringify(addFaculty.data));

  const updateFaculty = await request('PUT', `/api/faculty-master/${TEST_FACULTY_ID}`, {
    token: adminToken,
    body: { facultyName: 'Smoke Test Faculty Updated' }
  });
  check('PUT /api/faculty-master/:facultyId', updateFaculty.status === 200 && updateFaculty.data?.success, JSON.stringify(updateFaculty.data));

  const addSubject = await request('POST', '/api/subject-master', {
    token: adminToken,
    body: { subjectCode: TEST_SUBJECT_CODE, subjectName: 'Smoke Test Subject', credits: 3, type: 'theory' }
  });
  check('POST /api/subject-master', addSubject.status === 200 && addSubject.data?.success, JSON.stringify(addSubject.data));

  const updateSubject = await request('PUT', `/api/subject-master/${TEST_SUBJECT_CODE}`, {
    token: adminToken,
    body: { subjectName: 'Smoke Test Subject Updated' }
  });
  check('PUT /api/subject-master/:subjectCode', updateSubject.status === 200 && updateSubject.data?.success, JSON.stringify(updateSubject.data));

  const createTimetable = await request('POST', '/api/timetable', {
    token: adminToken,
    body: {
      class: '4-2',
      branch: 'CSE-B',
      academicYear: YEAR,
      semester: '4-2',
      entries: [{
        subjectCode: TEST_SUBJECT_CODE,
        facultyId: TEST_FACULTY_ID,
        section: 'A',
        theoryHours: 3,
        labHours: 0,
        tutorialHours: 0,
        totalHours: 3
      }]
    }
  });
  check('POST /api/timetable', createTimetable.status === 200 && createTimetable.data?.success, JSON.stringify(createTimetable.data));
  const timetableId = createTimetable.data?.timetable?._id;

  if (timetableId) {
    const updateTimetable = await request('PUT', `/api/timetable/${timetableId}`, {
      token: adminToken,
      body: {
        entries: [{
          subjectCode: TEST_SUBJECT_CODE,
          facultyId: TEST_FACULTY_ID,
          section: 'B',
          theoryHours: 3,
          labHours: 0,
          tutorialHours: 0,
          totalHours: 3
        }]
      }
    });
    check('PUT /api/timetable/:id', updateTimetable.status === 200 && updateTimetable.data?.success, JSON.stringify(updateTimetable.data));

    const deleteTimetable = await request('DELETE', `/api/timetable/${timetableId}`, { token: adminToken });
    check('DELETE /api/timetable/:id', deleteTimetable.status === 200 && deleteTimetable.data?.success, JSON.stringify(deleteTimetable.data));
  }

  // ---------------- Cleanup ----------------
  console.log('\nCleanup');
  const deleteStudent = await request('DELETE', `/admin/delete-student/${TEST_HALLTICKET}?academicYear=${YEAR}&class=${CLASS}&branch=${BRANCH}`, { token: adminToken });
  check('DELETE /admin/delete-student/:hallticket', deleteStudent.status === 200 && deleteStudent.data?.success, JSON.stringify(deleteStudent.data));

  const deleteFaculty = await request('DELETE', `/api/faculty-master/${TEST_FACULTY_ID}`, { token: adminToken });
  check('DELETE /api/faculty-master/:facultyId', deleteFaculty.status === 200 && deleteFaculty.data?.success, JSON.stringify(deleteFaculty.data));

  const deleteSubject = await request('DELETE', `/api/subject-master/${TEST_SUBJECT_CODE}`, { token: adminToken });
  check('DELETE /api/subject-master/:subjectCode', deleteSubject.status === 200 && deleteSubject.data?.success, JSON.stringify(deleteSubject.data));

  // ---------------- CORS ----------------
  console.log('\nCORS');
  for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']) {
    const preflight = await fetch(`${BASE_URL}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET'
      }
    });
    check(`CORS preflight ${origin}`, preflight.status === 200 && preflight.headers.get('access-control-allow-origin') === origin);
  }

  const blockedPreflight = await fetch(`${BASE_URL}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example.com',
      'Access-Control-Request-Method': 'GET'
    }
  });
  check('CORS preflight blocks unknown origin', !blockedPreflight.headers.get('access-control-allow-origin'));

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exitCode = 1;
});
