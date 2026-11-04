/**
 * Local demo data seeder.
 *
 * Usage:  npm run seed
 *
 * Creates an admin account plus one demo class so every panel can be explored
 * immediately:
 *   Admin login     : admin / admin123
 *   Student login   : DEMO0003 / Scient@123 (any seeded hallticket works)
 *
 * Student passwords are stored as bcrypt hashes of STUDENT_COMMON_PASSWORD.
 * Change that value (and JWT_SECRET) in backend/.env before deploying.
 *   Class / Branch  : 3-1 / CSE-A
 *   Academic year   : 2025-2026
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/feedbackSystem';
const COMMON_PASSWORD = process.env.STUDENT_COMMON_PASSWORD || 'Scient@123';
const BCRYPT_ROUNDS = 12;

const Admin = mongoose.model('Admin', new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  email: { type: String, unique: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
}));

const Student = mongoose.model('Student', new mongoose.Schema({
  name: String,
  hallticket: String,
  class: String,
  branch: String,
  academicYear: String,
  email: String,
  password: String
}));

const Subject = mongoose.model('Subject', new mongoose.Schema({
  subject: String,
  subjectCode: String,
  faculty: String,
  facultyId: String,
  class: String,
  branch: String,
  academicYear: String
}));

const Feedback = mongoose.model('Feedback', new mongoose.Schema({
  hallticket: String,
  class: String,
  branch: String,
  academicYear: String,
  subject: String,
  subjectCode: String,
  faculty: String,
  facultyId: String,
  answers: [{ question: String, score: Number }],
  suggestion: String,
  round: { type: String, enum: ['initial', 'final'], default: 'initial' },
  date: { type: Date, default: Date.now }
}));

const FeedbackSubmission = mongoose.model('FeedbackSubmission', new mongoose.Schema({
  hallticket: String,
  class: String,
  branch: String,
  academicYear: String,
  initial: { type: Boolean, default: false },
  final: { type: Boolean, default: false },
  initialDate: Date,
  finalDate: Date
}));

const RoundControl = mongoose.model('RoundControl', new mongoose.Schema({
  class: String,
  branch: String,
  academicYear: String,
  initialEnabled: { type: Boolean, default: true },
  finalEnabled: { type: Boolean, default: false },
  initialEndDate: Date,
  finalEndDate: Date
}));

const FacultyMaster = mongoose.model('FacultyMaster', new mongoose.Schema({
  facultyId: { type: String, unique: true },
  facultyName: String,
  email: String,
  phone: String,
  department: String,
  designation: String,
  createdAt: { type: Date, default: Date.now }
}));

const SubjectMaster = mongoose.model('SubjectMaster', new mongoose.Schema({
  subjectCode: { type: String, unique: true },
  subjectName: String,
  credits: Number,
  type: { type: String, enum: ['theory', 'lab', 'elective'] }
}));

const Timetable = mongoose.model('Timetable', new mongoose.Schema({
  class: String,
  branch: String,
  academicYear: String,
  semester: String,
  entries: [{
    subjectCode: String,
    subjectName: String,
    facultyId: String,
    facultyName: String,
    section: String,
    theoryHours: Number,
    labHours: Number,
    tutorialHours: Number,
    totalHours: Number
  }],
  createdBy: String,
  createdAt: Date,
  updatedAt: Date
}));

const QUESTIONS = [
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

const CLASS = '3-1';
const BRANCH = 'CSE-A';
const YEAR = '2025-2026';

const facultySeed = [
  { facultyId: 'FAC001', facultyName: 'Dr. A. Sharma', department: 'CSE', designation: 'Professor', email: 'sharma@example.com' },
  { facultyId: 'FAC002', facultyName: 'Prof. K. Rao', department: 'CSE', designation: 'Associate Professor', email: 'rao@example.com' },
  { facultyId: 'FAC003', facultyName: 'Dr. S. Mehta', department: 'CSE', designation: 'Assistant Professor', email: 'mehta@example.com' }
];

const subjectSeed = [
  { subjectCode: 'CS301', subjectName: 'Database Management Systems', credits: 4, type: 'theory' },
  { subjectCode: 'CS302', subjectName: 'Operating Systems', credits: 4, type: 'theory' },
  { subjectCode: 'CS303', subjectName: 'Computer Networks', credits: 4, type: 'theory' }
];

const studentSeed = [
  { name: 'Aarav Kumar', hallticket: 'DEMO0001' },
  { name: 'Diya Reddy', hallticket: 'DEMO0002' },
  { name: 'Ishaan Verma', hallticket: 'DEMO0003' },
  { name: 'Meera Nair', hallticket: 'DEMO0004' },
  { name: 'Rohan Gupta', hallticket: 'DEMO0005' }
];

function makeAnswers(base) {
  return QUESTIONS.map((question, index) => ({
    question,
    score: Math.max(1, Math.min(5, base + ((index % 3) - 1)))
  }));
}

async function seed() {
  await mongoose.connect(MONGODB_URI);

  // Admin
  await Admin.updateOne(
    { username: 'admin' },
    {
      $setOnInsert: {
        username: 'admin',
        password: bcrypt.hashSync('admin123', BCRYPT_ROUNDS),
        email: 'admin@example.com',
        role: 'admin'
      }
    },
    { upsert: true }
  );

  // Faculty master + subject master
  for (const faculty of facultySeed) {
    await FacultyMaster.updateOne({ facultyId: faculty.facultyId }, { $set: faculty }, { upsert: true });
  }
  for (const subject of subjectSeed) {
    await SubjectMaster.updateOne({ subjectCode: subject.subjectCode }, { $set: subject }, { upsert: true });
  }

  // Students
  const defaultPasswordHash = bcrypt.hashSync(COMMON_PASSWORD, BCRYPT_ROUNDS);
  for (const student of studentSeed) {
    await Student.updateOne(
      { hallticket: student.hallticket, class: CLASS, branch: BRANCH, academicYear: YEAR },
      {
        $set: {
          name: student.name,
          class: CLASS,
          branch: BRANCH,
          academicYear: YEAR
        },
        $setOnInsert: {
          password: defaultPasswordHash
        }
      },
      { upsert: true }
    );

    await FeedbackSubmission.updateOne(
      { hallticket: student.hallticket, class: CLASS, branch: BRANCH, academicYear: YEAR },
      {
        $setOnInsert: {
          hallticket: student.hallticket,
          class: CLASS,
          branch: BRANCH,
          academicYear: YEAR,
          initial: false,
          final: false
        }
      },
      { upsert: true }
    );
  }

  // Class subjects (used by the student dashboard + reporting)
  await Subject.deleteMany({ class: CLASS, branch: BRANCH, academicYear: YEAR });
  const subjectDocs = subjectSeed.map((subject, index) => ({
    subject: subject.subjectName,
    subjectCode: subject.subjectCode,
    faculty: facultySeed[index].facultyName,
    facultyId: facultySeed[index].facultyId,
    class: CLASS,
    branch: BRANCH,
    academicYear: YEAR
  }));
  await Subject.insertMany(subjectDocs);

  // Timetable
  await Timetable.updateOne(
    { class: CLASS, branch: BRANCH, academicYear: YEAR, semester: CLASS },
    {
      $set: {
        class: CLASS,
        branch: BRANCH,
        academicYear: YEAR,
        semester: CLASS,
        entries: subjectSeed.map((subject, index) => ({
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          facultyId: facultySeed[index].facultyId,
          facultyName: facultySeed[index].facultyName,
          section: 'A',
          theoryHours: 4,
          labHours: 0,
          tutorialHours: 1,
          totalHours: 5
        })),
        createdBy: 'admin',
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  // Both feedback rounds open
  await RoundControl.updateOne(
    { class: CLASS, branch: BRANCH, academicYear: YEAR },
    {
      $set: {
        class: CLASS,
        branch: BRANCH,
        academicYear: YEAR,
        initialEnabled: true,
        finalEnabled: true
      }
    },
    { upsert: true }
  );

  // Demo feedback: first two students submitted initial feedback.
  const feedbackStudents = studentSeed.slice(0, 2);
  for (let s = 0; s < feedbackStudents.length; s++) {
    const student = feedbackStudents[s];
    const existingInitial = await Feedback.findOne({
      hallticket: student.hallticket,
      class: CLASS,
      branch: BRANCH,
      academicYear: YEAR,
      round: 'initial'
    });

    if (!existingInitial) {
      for (let i = 0; i < subjectDocs.length; i++) {
        const subject = subjectDocs[i];
        const base = 4 + (i % 2) - (s % 2);
        await Feedback.create({
          hallticket: student.hallticket,
          class: CLASS,
          branch: BRANCH,
          academicYear: YEAR,
          subject: subject.subject,
          subjectCode: subject.subjectCode,
          faculty: subject.faculty,
          facultyId: subject.facultyId,
          answers: makeAnswers(base),
          suggestion: 'Overall a good learning experience.',
          round: 'initial'
        });
      }

      await FeedbackSubmission.updateOne(
        { hallticket: student.hallticket, class: CLASS, branch: BRANCH, academicYear: YEAR },
        { $set: { initial: true, initialDate: new Date() } }
      );
    }
  }

  console.log('✅ Demo data seeded successfully');
  console.log('   Admin login   : admin / admin123');
  console.log(`   Student login : DEMO0003 / ${COMMON_PASSWORD}`);
  console.log(`   Class/Branch  : ${CLASS} / ${BRANCH}`);
  console.log(`   Academic year : ${YEAR}`);
}

seed()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
