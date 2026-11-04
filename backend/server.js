require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Refuse to start with a missing or weak signing key. A predictable JWT secret
// would let anyone mint admin/student tokens.
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET must be set to at least 16 characters. Refusing to start.');
  process.exit(1);
}

const STUDENT_DEFAULT_PASSWORD = process.env.STUDENT_COMMON_PASSWORD || 'Scient@123';
const BCRYPT_ROUNDS = 12;

// CORS configuration
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((value) => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://scient-feedback.onrender.com',
  'http://scient-feedback.onrender.com',
  'https://scient-feedback-tool.onrender.com',
  'http://scient-feedback-tool.onrender.com',
  'https://feedback-student-panel.onrender.com',
  'http://feedback-student-panel.onrender.com',
  'https://feedback-mlan.onrender.com',
  'http://feedback-mlan.onrender.com',
  'https://feedback-2-backend.onrender.com',
  'http://feedback-2-backend.onrender.com',
  'https://feedback-2-student.onrender.com',
  'http://feedback-2-student.onrender.com',
  'https://feedback-2-admin.onrender.com',
  'http://feedback-2-admin.onrender.com',
  'https://feedback-2-principal.onrender.com',
  'http://feedback-2-principal.onrender.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  ...configuredOrigins
]);

const corsOptions = {
  origin: function (origin, callback) {
    // Same-origin/curl requests have no Origin header.
    if (!origin) return callback(null, true);

    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    // Allow the project's own Render frontends (admin/student/principal) without
    // requiring every service name to be listed manually.
    const isProjectOrigin = /^https:\/\/scient-feedback(?:-[a-z0-9-]+)?\.onrender\.com$/.test(origin);
    if (allowedOrigins.has(origin.replace(/\/+$/, '')) || isLocalDevOrigin || isProjectOrigin) {
      return callback(null, true);
    }

    console.warn('Blocked by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 600
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// MongoDB connection
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/feedbackSystem';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Models
const AdminSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String, unique: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', AdminSchema);

// Student Schema with Class Field
const StudentSchema = new mongoose.Schema({
  name: String,
  hallticket: { type: String },
  class: String,
  branch: String,
  academicYear: String,
  email: String,
  password: String
});

// Make hallticket + academicYear + class unique
StudentSchema.index({ hallticket: 1, academicYear: 1, class: 1 }, { unique: true });

const SubjectSchema = new mongoose.Schema({
  subject: String,
  subjectCode: String,
  faculty: String,
  facultyId: String,
  class: String,
  branch: String,
  academicYear: String,
});

const RoundControlSchema = new mongoose.Schema({
  class: String,
  branch: String,
  academicYear: String,
  initialEnabled: { type: Boolean, default: true },
  finalEnabled: { type: Boolean, default: false },
  initialEndDate: Date,
  finalEndDate: Date
});

const FeedbackSchema = new mongoose.Schema({
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
});

const FeedbackSubmissionSchema = new mongoose.Schema({
  hallticket: String,
  class: String,
  branch: String,
  academicYear: String,
  initial: { type: Boolean, default: false },
  final: { type: Boolean, default: false },
  initialDate: Date,
  finalDate: Date
});

const Student = mongoose.model('Student', StudentSchema);
const Subject = mongoose.model('Subject', SubjectSchema);
const Feedback = mongoose.model('Feedback', FeedbackSchema);
const FeedbackSubmission = mongoose.model('FeedbackSubmission', FeedbackSubmissionSchema);
const RoundControl = mongoose.model('RoundControl', RoundControlSchema);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 1024
  },
  fileFilter: (req, file, cb) => {
    const name = typeof file.originalname === 'string' ? file.originalname : '';
    if (/\.csv$/i.test(name)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Login endpoints are rate-limited to slow down credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again later.' }
});

// Helper: Standardize academic year format
function formatAcademicYear(year) {
  if (!year) return year;
  const cleanYear = year.toString().trim();
  if (/^\d{4}-\d{4}$/.test(cleanYear)) {
    return cleanYear;
  }
  if (/^\d{4}$/.test(cleanYear)) {
    const startYear = parseInt(cleanYear);
    return `${startYear}-${startYear + 1}`;
  }
  return cleanYear;
}

// ---------- Input validation helpers ----------
// These reject objects/arrays (NoSQL operator injection), control characters
// and oversized values before anything reaches MongoDB.
function text(value, maxLength = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function optionalText(value, maxLength = 200) {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, maxLength);
}

function bodyText(req, field, maxLength = 200) {
  return text(req.body?.[field], maxLength);
}

function queryText(req, field, maxLength = 200) {
  return text(req.query?.[field], maxLength);
}

function normalizeHallticket(value) {
  const cleaned = text(value, 30);
  return cleaned ? cleaned.toUpperCase() : null;
}

function isValidHallticket(value) {
  return typeof value === 'string' && /^[A-Z0-9]{4,30}$/.test(value);
}

function isValidAcademicYear(value) {
  return typeof value === 'string' && /^\d{4}-\d{4}$/.test(value);
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function publicStudent(student) {
  return {
    name: student.name,
    hallticket: student.hallticket,
    class: student.class,
    branch: student.branch,
    academicYear: student.academicYear,
    email: student.email || null
  };
}

function safeRound(value) {
  return value === 'initial' || value === 'final' ? value : null;
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;

  if (!match) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(match[1], JWT_SECRET, (err, user) => {
    if (err || !user || typeof user !== 'object') {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};

const requireStudent = (req, res, next) => {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ error: 'Student access required' });
  }
  next();
};

// Simple, bounded CSV parser. We intentionally limit line length and row count
// so a crafted upload cannot consume unbounded CPU/memory.
function parseCSV(csvString, isSubjects = false) {
  const MAX_ROWS = 5000;
  const MAX_LINE_LENGTH = 2000;
  const result = [];

  try {
    const lines = csvString.replace(/^\uFEFF/, '').split(/\r?\n/);

    for (let i = 0; i < lines.length && result.length < MAX_ROWS; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.length > MAX_LINE_LENGTH) continue;

      const values = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const firstValue = values[0] ? values[0].toLowerCase() : '';
      if (i === 0 && (
        firstValue === 'name' ||
        firstValue === 'subject' ||
        firstValue === 'hallticket' ||
        firstValue === 'faculty id' ||
        firstValue === 'facultyid' ||
        firstValue === 'faculty_id'
      )) {
        continue;
      }

      if (isSubjects && values.length >= 4) {
        const facultyId = text(values[0], 40);
        const facultyName = text(values[1], 120);
        const subjectCode = text(values[2], 40);
        const subjectName = text(values[3], 160);

        if (facultyId && facultyName && subjectCode && subjectName) {
          result.push({ facultyId, facultyName, subjectCode, subjectName });
        }
      } else if (!isSubjects && values.length >= 3) {
        const name = text(values[0], 120);
        const hallticket = normalizeHallticket(values[1]);
        const branch = text(values[2], 40);

        if (name && hallticket && isValidHallticket(hallticket) && branch) {
          result.push({ name, hallticket, branch });
        }
      }
    }

    return result;
  } catch (error) {
    console.error('CSV parsing error:', error);
    return [];
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// =============================================
// FACULTY MASTER & TIMETABLE MANAGEMENT
// =============================================

// Faculty Master Schema
const FacultyMasterSchema = new mongoose.Schema({
  facultyId: { type: String, unique: true, required: true },
  facultyName: { type: String, required: true },
  email: String,
  phone: String,
  department: String,
  designation: String,
  createdAt: { type: Date, default: Date.now }
});

const FacultyMaster = mongoose.model('FacultyMaster', FacultyMasterSchema);

// Subject Master Schema
const SubjectMasterSchema = new mongoose.Schema({
  subjectCode: { type: String, unique: true, required: true },
  subjectName: { type: String, required: true },
  credits: Number,
  type: { type: String, enum: ['theory', 'lab', 'elective'] }
});

const SubjectMaster = mongoose.model('SubjectMaster', SubjectMasterSchema);

// Timetable Schema
const TimetableSchema = new mongoose.Schema({
  class: { type: String, required: true },
  branch: { type: String, required: true },
  academicYear: { type: String, required: true },
  semester: { type: String, required: true },
  entries: [{
    subjectCode: { type: String, required: true },
    subjectName: String,
    facultyId: { type: String, required: true },
    facultyName: String,
    section: String,
    theoryHours: Number,
    labHours: Number,
    tutorialHours: Number,
    totalHours: Number
  }],
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Timetable = mongoose.model('Timetable', TimetableSchema);

// Faculty Master Endpoints (admin only)
app.get('/api/faculty-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const faculties = await FacultyMaster.find().sort({ facultyName: 1 });
    res.json(faculties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
});

app.post('/api/faculty-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const facultyId = bodyText(req, 'facultyId', 40);
    const facultyName = bodyText(req, 'facultyName', 120);
    const email = optionalText(req.body?.email, 254);
    const phone = optionalText(req.body?.phone, 20);
    const department = optionalText(req.body?.department, 80);
    const designation = optionalText(req.body?.designation, 80);

    if (!facultyId || !facultyName) {
      return res.status(400).json({ error: 'Faculty ID and Name are required' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = await FacultyMaster.findOne({ facultyId });
    if (existing) {
      return res.status(400).json({ error: 'Faculty ID already exists' });
    }

    const faculty = await FacultyMaster.create({
      facultyId,
      facultyName,
      email,
      phone,
      department,
      designation
    });

    res.json({ success: true, message: 'Faculty added successfully', faculty });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add faculty' });
  }
});

app.put('/api/faculty-master/:facultyId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const facultyId = text(req.params.facultyId, 40);
    if (!facultyId) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const updates = {};
    const facultyName = optionalText(req.body?.facultyName, 120);
    const email = optionalText(req.body?.email, 254);
    const phone = optionalText(req.body?.phone, 20);
    const department = optionalText(req.body?.department, 80);
    const designation = optionalText(req.body?.designation, 80);

    if (facultyName !== undefined) updates.facultyName = facultyName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (department !== undefined) updates.department = department;
    if (designation !== undefined) updates.designation = designation;

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const faculty = await FacultyMaster.findOneAndUpdate(
      { facultyId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    res.json({ success: true, message: 'Faculty updated successfully', faculty });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update faculty' });
  }
});

app.delete('/api/faculty-master/:facultyId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const facultyId = text(req.params.facultyId, 40);
    if (!facultyId) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const timetableExists = await Timetable.findOne({ 'entries.facultyId': facultyId });
    if (timetableExists) {
      return res.status(400).json({ error: 'Cannot delete faculty assigned to timetable' });
    }

    const faculty = await FacultyMaster.findOneAndDelete({ facultyId });
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    res.json({ success: true, message: 'Faculty deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete faculty' });
  }
});

// Subject Master Endpoints (admin only)
app.get('/api/subject-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subjects = await SubjectMaster.find().sort({ subjectCode: 1 });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

app.post('/api/subject-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subjectCode = bodyText(req, 'subjectCode', 40);
    const subjectName = bodyText(req, 'subjectName', 160);
    const credits = req.body?.credits;
    const type = req.body?.type;

    if (!subjectCode || !subjectName) {
      return res.status(400).json({ error: 'Subject Code and Name are required' });
    }
    if (credits !== undefined && (!Number.isFinite(credits) || credits < 0 || credits > 30)) {
      return res.status(400).json({ error: 'Credits must be a number between 0 and 30' });
    }
    if (type !== undefined && !['theory', 'lab', 'elective'].includes(type)) {
      return res.status(400).json({ error: 'Invalid subject type' });
    }

    const existing = await SubjectMaster.findOne({ subjectCode });
    if (existing) {
      return res.status(400).json({ error: 'Subject Code already exists' });
    }

    const subject = await SubjectMaster.create({
      subjectCode,
      subjectName,
      credits,
      type
    });

    res.json({ success: true, message: 'Subject added successfully', subject });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add subject' });
  }
});

app.put('/api/subject-master/:subjectCode', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subjectCode = text(req.params.subjectCode, 40);
    if (!subjectCode) {
      return res.status(400).json({ error: 'Invalid subject code' });
    }

    const updates = {};
    const subjectName = optionalText(req.body?.subjectName, 160);
    const credits = req.body?.credits;
    const type = req.body?.type;

    if (subjectName !== undefined) updates.subjectName = subjectName;
    if (credits !== undefined) {
      if (!Number.isFinite(credits) || credits < 0 || credits > 30) {
        return res.status(400).json({ error: 'Credits must be a number between 0 and 30' });
      }
      updates.credits = credits;
    }
    if (type !== undefined) {
      if (!['theory', 'lab', 'elective'].includes(type)) {
        return res.status(400).json({ error: 'Invalid subject type' });
      }
      updates.type = type;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const subject = await SubjectMaster.findOneAndUpdate(
      { subjectCode },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json({ success: true, message: 'Subject updated successfully', subject });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subject' });
  }
});

app.delete('/api/subject-master/:subjectCode', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subjectCode = text(req.params.subjectCode, 40);
    if (!subjectCode) {
      return res.status(400).json({ error: 'Invalid subject code' });
    }

    const timetableExists = await Timetable.findOne({ 'entries.subjectCode': subjectCode });
    if (timetableExists) {
      return res.status(400).json({ error: 'Cannot delete subject assigned to timetable' });
    }

    const subject = await SubjectMaster.findOneAndDelete({ subjectCode });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

// Validate and enrich timetable entries from trusted master data.
async function buildTimetableEntries(rawEntries) {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0 || rawEntries.length > 100) {
    return { error: 'Entries must be a non-empty array with at most 100 items' };
  }

  const seenSubjects = new Set();
  const entries = [];

  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'Each timetable entry must be an object' };
    }

    const subjectCode = text(raw.subjectCode, 40);
    const facultyId = text(raw.facultyId, 40);
    const section = optionalText(raw.section, 20) || '';

    if (!subjectCode || !facultyId) {
      return { error: 'Each entry needs a valid subject code and faculty ID' };
    }
    if (seenSubjects.has(subjectCode)) {
      return { error: `Duplicate subject code in timetable: ${subjectCode}` };
    }
    seenSubjects.add(subjectCode);

    const numbers = {};
    for (const field of ['theoryHours', 'labHours', 'tutorialHours', 'totalHours']) {
      if (raw[field] === undefined || raw[field] === null || raw[field] === '') continue;
      if (!Number.isFinite(raw[field]) || raw[field] < 0 || raw[field] > 100) {
        return { error: `${field} must be a number between 0 and 100` };
      }
      numbers[field] = raw[field];
    }

    const faculty = await FacultyMaster.findOne({ facultyId });
    if (!faculty) {
      return { error: `Faculty ID ${facultyId} not found` };
    }

    const subject = await SubjectMaster.findOne({ subjectCode });
    if (!subject) {
      return { error: `Subject Code ${subjectCode} not found` };
    }

    entries.push({
      subjectCode,
      subjectName: subject.subjectName,
      facultyId,
      facultyName: faculty.facultyName,
      section,
      ...numbers
    });
  }

  return { entries };
}

// Timetable Endpoints (admin only)
app.get('/api/timetable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const query = {};
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);
    const semester = queryText(req, 'semester', 20);

    if (cls) query.class = cls;
    if (branch) query.branch = branch;
    if (academicYear) query.academicYear = academicYear;
    if (semester) query.semester = semester;

    const timetables = await Timetable.find(query).sort({ updatedAt: -1 });
    res.json(timetables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timetables' });
  }
});

app.get('/api/timetable/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid timetable ID' });
    }

    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }
    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timetable' });
  }
});

app.post('/api/timetable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = bodyText(req, 'class', 20);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = bodyText(req, 'academicYear', 20);
    const semester = bodyText(req, 'semester', 20);

    if (!cls || !branch || !academicYear || !semester) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const { entries, error } = await buildTimetableEntries(req.body?.entries);
    if (error) {
      return res.status(400).json({ error });
    }

    const existing = await Timetable.findOne({ class: cls, branch, academicYear, semester });
    if (existing) {
      return res.status(400).json({ error: 'Timetable already exists for this combination' });
    }

    const timetable = await Timetable.create({
      class: cls,
      branch,
      academicYear,
      semester,
      entries,
      createdBy: req.user?.username || 'admin'
    });

    for (const entry of entries) {
      await Subject.findOneAndUpdate(
        {
          subject: entry.subjectName,
          class: cls,
          branch,
          academicYear
        },
        {
          $set: {
            subject: entry.subjectName,
            subjectCode: entry.subjectCode,
            faculty: entry.facultyName,
            facultyId: entry.facultyId,
            class: cls,
            branch,
            academicYear
          }
        },
        { upsert: true }
      );
    }

    res.json({ success: true, message: 'Timetable created successfully', timetable });
  } catch (error) {
    console.error('Error creating timetable:', error);
    res.status(500).json({ error: 'Failed to create timetable' });
  }
});

app.put('/api/timetable/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid timetable ID' });
    }

    const { entries, error } = await buildTimetableEntries(req.body?.entries);
    if (error) {
      return res.status(400).json({ error });
    }

    const timetable = await Timetable.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          entries,
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    await Subject.deleteMany({
      class: timetable.class,
      branch: timetable.branch,
      academicYear: timetable.academicYear
    });

    for (const entry of entries) {
      await Subject.create({
        subject: entry.subjectName,
        subjectCode: entry.subjectCode,
        faculty: entry.facultyName,
        facultyId: entry.facultyId,
        class: timetable.class,
        branch: timetable.branch,
        academicYear: timetable.academicYear
      });
    }

    res.json({ success: true, message: 'Timetable updated successfully', timetable });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update timetable' });
  }
});

app.delete('/api/timetable/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid timetable ID' });
    }

    const timetable = await Timetable.findByIdAndDelete(req.params.id);
    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    await Subject.deleteMany({
      class: timetable.class,
      branch: timetable.branch,
      academicYear: timetable.academicYear
    });

    res.json({ success: true, message: 'Timetable deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete timetable' });
  }
});

// Import from existing data (migration helper, admin only)
app.post('/api/migrate-subjects-to-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const uniqueFaculties = await Subject.distinct('faculty');
    const uniqueSubjects = await Subject.distinct('subject');
    
    let facultyCount = 0;
    let subjectCount = 0;
    
    for (const faculty of uniqueFaculties) {
      if (faculty && faculty.trim() && !faculty.match(/^[0-9A-Z]{10,}$/)) {
        const existing = await FacultyMaster.findOne({ facultyName: faculty });
        if (!existing) {
          await FacultyMaster.create({
            facultyId: `FAC${String(++facultyCount).padStart(3, '0')}`,
            facultyName: faculty
          });
        }
      }
    }
    
    for (const subject of uniqueSubjects) {
      if (subject && subject.trim()) {
        const existing = await SubjectMaster.findOne({ subjectName: subject });
        if (!existing) {
          await SubjectMaster.create({
            subjectCode: `SUB${String(++subjectCount).padStart(3, '0')}`,
            subjectName: subject
          });
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Migrated ${facultyCount} faculties and ${subjectCount} subjects`,
      facultyCount,
      subjectCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Migration failed' });
  }
});

// =============================================
// FILE UPLOAD ENDPOINTS
// =============================================

// Upload students CSV (admin only)
app.post('/upload-students', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const cls = bodyText(req, 'class', 20);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = bodyText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    if (!isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const csvString = req.file.buffer.toString('utf8');
    const students = parseCSV(csvString, false);

    if (!students || students.length === 0) {
      return res.status(400).json({ error: 'No valid student data found in CSV' });
    }

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let newCount = 0;
    const defaultPasswordHash = bcrypt.hashSync(STUDENT_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
    const batchSize = 25;

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);

      for (const student of batch) {
        try {
          const existingStudent = await Student.findOne({
            hallticket: student.hallticket,
            academicYear,
            class: cls
          });

          if (existingStudent) {
            await Student.updateOne(
              {
                hallticket: student.hallticket,
                academicYear,
                class: cls
              },
              {
                $set: {
                  name: student.name,
                  class: cls,
                  branch,
                  academicYear
                }
              }
            );
            successCount++;
            duplicateCount++;
          } else {
            await Student.create({
              name: student.name,
              hallticket: student.hallticket,
              class: cls,
              branch,
              academicYear,
              password: defaultPasswordHash
            });
            successCount++;
            newCount++;
          }

          await FeedbackSubmission.findOneAndUpdate(
            {
              hallticket: student.hallticket,
              class: cls,
              branch,
              academicYear
            },
            {
              $setOnInsert: {
                hallticket: student.hallticket,
                class: cls,
                branch,
                academicYear,
                initial: false,
                final: false
              }
            },
            { upsert: true, new: true }
          );
        } catch (error) {
          errorCount++;
          console.error('Error processing student:', error.message);
        }
      }

      if (i + batchSize < students.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    res.json({
      success: true,
      message: `Students uploaded successfully! ${successCount} records processed (${newCount} new, ${duplicateCount} updated), ${errorCount} errors.`,
      fileName: req.file.originalname,
      stats: {
        total: students.length,
        successful: successCount,
        errors: errorCount,
        new: newCount,
        duplicates: duplicateCount
      }
    });
  } catch (error) {
    console.error('Error uploading students:', error);
    res.status(500).json({ error: 'Failed to upload students' });
  }
});

// Upload subjects CSV (admin only)
app.post('/upload-subjects', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const cls = bodyText(req, 'class', 20);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = bodyText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    if (!isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const csvString = req.file.buffer.toString('utf8');
    const subjects = parseCSV(csvString, true);

    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ error: 'No valid subject data found in CSV' });
    }

    const subjectsToInsert = [];
    const seenCodes = new Set();

    for (const subject of subjects) {
      if (seenCodes.has(subject.subjectCode)) {
        return res.status(400).json({ error: `Duplicate subject code in CSV: ${subject.subjectCode}` });
      }
      seenCodes.add(subject.subjectCode);

      await FacultyMaster.findOneAndUpdate(
        { facultyId: subject.facultyId },
        {
          $set: {
            facultyId: subject.facultyId,
            facultyName: subject.facultyName
          }
        },
        { upsert: true, new: true, runValidators: true }
      );

      subjectsToInsert.push({
        subject: subject.subjectName,
        subjectCode: subject.subjectCode,
        faculty: subject.facultyName,
        facultyId: subject.facultyId,
        class: cls,
        branch,
        academicYear
      });
    }

    await Subject.deleteMany({
      class: cls,
      branch,
      academicYear
    });

    let insertedCount = 0;
    try {
      const result = await Subject.insertMany(subjectsToInsert, { ordered: false });
      insertedCount = result.length;
    } catch (error) {
      if (error.writeErrors) {
        insertedCount = subjectsToInsert.length - error.writeErrors.length;
      } else {
        insertedCount = subjectsToInsert.length;
      }
    }

    res.json({
      success: true,
      message: `Subjects uploaded successfully! ${insertedCount} subjects processed.`,
      fileName: req.file.originalname,
      stats: {
        total: subjects.length,
        inserted: insertedCount
      }
    });
  } catch (error) {
    console.error('Error uploading subjects:', error);
    res.status(500).json({ error: 'Failed to upload subjects' });
  }
});

// =============================================
// AUTHENTICATION ENDPOINTS
// =============================================

// Admin registration (requires an existing admin; seed.js creates the first one)
app.post('/admin/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const username = bodyText(req, 'username', 50);
    const email = bodyText(req, 'email', 254);
    const password = typeof req.body?.password === 'string' ? req.body.password : null;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-50 characters (letters, numbers, dot, underscore, hyphen)' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be between 8 and 72 characters' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existingAdmin = await Admin.findOne({
      $or: [{ username }, { email }]
    });

    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin username or email already exists' });
    }

    const admin = await Admin.create({
      username,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      email,
      role: 'admin'
    });

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ error: 'Failed to register admin' });
  }
});

// Admin Login
app.post('/admin/login', authLimiter, async (req, res) => {
  try {
    const username = bodyText(req, 'username', 50);
    const password = typeof req.body?.password === 'string' ? req.body.password : null;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username });
    if (!admin || !admin.password || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: admin._id.toString(),
        username: admin.username,
        email: admin.email || null,
        role: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Student login
app.post('/login', authLimiter, async (req, res) => {
  try {
    const normalizedHallticket = normalizeHallticket(req.body?.hallticket);
    const password = typeof req.body?.password === 'string' ? req.body.password : null;

    if (!normalizedHallticket || !password) {
      return res.status(400).json({ error: 'Hallticket and password are required' });
    }
    if (!isValidHallticket(normalizedHallticket) || password.length > 72) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const student = await Student.findOne({ hallticket: normalizedHallticket });
    if (!student) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let authenticated = false;

    if (typeof student.password === 'string' && student.password.startsWith('$2')) {
      authenticated = await bcrypt.compare(password, student.password);

      // Backward compatibility: older imports hashed the hall ticket instead of
      // the shared default password. Upgrade those records on first login.
      if (!authenticated && password === STUDENT_DEFAULT_PASSWORD) {
        authenticated = await bcrypt.compare(student.hallticket, student.password);
        if (authenticated) {
          student.password = await bcrypt.hash(STUDENT_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
          await student.save();
        }
      }
    }

    // Accounts created before passwords were introduced get the default
    // password once; an individual password can then overwrite it.
    if (!authenticated && !student.password && password === STUDENT_DEFAULT_PASSWORD) {
      authenticated = true;
      student.password = await bcrypt.hash(STUDENT_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
      await student.save();
    }

    if (!authenticated) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        hallticket: student.hallticket,
        email: student.email || null,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear,
        role: 'student'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      student: publicStudent(student)
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// =============================================
// FACULTY MANAGEMENT ENDPOINTS
// =============================================

app.get('/all-faculties', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const faculties = await Subject.distinct('faculty');
    
    console.log(`🔍 Raw faculties found: ${faculties.length}`);
    
    const filteredFaculties = faculties
      .filter(faculty => {
        if (!faculty || typeof faculty !== 'string') return false;
        
        const cleanFaculty = faculty.trim();
        if (cleanFaculty === '') return false;
        
        if (cleanFaculty.match(/^25C01A73\d{2}$/)) return false;
        if (cleanFaculty.match(/^2[0-9][A-Z0-9]{8,10}$/)) return false;
        
        const invalidPatterns = [
          'unknown', 'not assigned', 'not available', 'tba', 'to be announced', 
          'pending', 'null', 'undefined', 'test', 'demo'
        ];
        
        const lowerFaculty = cleanFaculty.toLowerCase();
        if (invalidPatterns.some(pattern => lowerFaculty === pattern)) return false;
        
        return true;
      })
      .map(faculty => faculty.trim())
      .filter((faculty, index, self) => self.indexOf(faculty) === index)
      .sort((a, b) => a.localeCompare(b));
    
    console.log(`✅ Filtered faculties: ${filteredFaculties.length}`);
    console.log('📋 Sample faculties:', filteredFaculties.slice(0, 10));
    
    res.json(filteredFaculties);
  } catch (error) {
    console.error('Failed to fetch faculties:', error);
    res.status(500).json({ 
      error: 'Failed to fetch faculties'
    });
  }
});

// Get faculty name variations for correction
app.get('/faculty-variations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const faculties = await Subject.distinct('faculty');
    
    const filteredFaculties = faculties
      .filter(faculty => 
        faculty && 
        typeof faculty === 'string' && 
        faculty.trim() !== '' &&
        !faculty.match(/^\d+$/)
      )
      .sort((a, b) => a.localeCompare(b));
    
    const groups = {};
    
    filteredFaculties.forEach(faculty => {
      const normalized = faculty
        .toLowerCase()
        .replace(/[.\s]/g, '')
        .replace(/dr\.?/g, '')
        .replace(/prof\.?/g, '')
        .replace(/\s+/g, '')
        .trim();
      
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      
      if (!groups[normalized].some(f => f.name === faculty)) {
        groups[normalized].push({
          name: faculty,
          original: faculty
        });
      }
    });
    
    const groupedArray = Object.entries(groups)
      .filter(([key, variations]) => variations.length > 1)
      .map(([key, variations]) => ({
        key,
        variations: variations.sort((a, b) => a.name.localeCompare(b.name))
      }));
    
    res.json(groupedArray);
  } catch (error) {
    console.error('Failed to get faculty variations:', error);
    res.status(500).json({ error: 'Failed to get faculty variations' });
  }
});

// Update faculty name across all records
app.put('/update-faculty-name', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const originalName = bodyText(req, 'originalName', 120);
    const newName = bodyText(req, 'newName', 120);
    const cls = optionalText(req.body?.class, 20);
    const branch = optionalText(req.body?.branch, 40);
    const academicYear = optionalText(req.body?.academicYear, 20);

    if (!originalName || !newName) {
      return res.status(400).json({ error: 'Original name and new name are required' });
    }

    if (originalName === newName) {
      return res.status(400).json({ error: 'Original and new names are the same' });
    }
    if (academicYear && !isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const updateCriteria = { faculty: originalName };
    if (cls) updateCriteria.class = cls;
    if (branch) updateCriteria.branch = branch;
    if (academicYear) updateCriteria.academicYear = academicYear;

    const subjectsResult = await Subject.updateMany(
      updateCriteria,
      { $set: { faculty: newName } }
    );

    const feedbackResult = await Feedback.updateMany(
      updateCriteria,
      { $set: { faculty: newName } }
    );

    res.json({
      success: true,
      message: `Successfully renamed "${originalName}" to "${newName}"`,
      stats: {
        subjectsUpdated: subjectsResult.modifiedCount,
        feedbacksUpdated: feedbackResult.modifiedCount,
        totalUpdated: subjectsResult.modifiedCount + feedbackResult.modifiedCount
      }
    });

  } catch (error) {
    console.error('Failed to update faculty name:', error);
    res.status(500).json({ error: 'Failed to update faculty name' });
  }
});

// Get complete faculty history with performance data
app.get('/faculty-history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const faculty = queryText(req, 'faculty', 120);
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!faculty) return res.status(400).json({ error: 'Faculty name is required' });

    const subjectMatchCriteria = { faculty };
    if (cls) subjectMatchCriteria.class = cls;
    if (branch) subjectMatchCriteria.branch = branch;
    if (academicYear) subjectMatchCriteria.academicYear = academicYear;

    const subjects = await Subject.find(subjectMatchCriteria);
    if (subjects.length === 0) return res.json([]);

    const facultyHistory = [];
    for (const subject of subjects) {
      try {
        const feedbacks = await Feedback.find({
          faculty: subject.faculty,
          subject: subject.subject,
          class: subject.class,
          branch: subject.branch,
          academicYear: subject.academicYear
        });

        if (feedbacks.length === 0) {
          facultyHistory.push({
            faculty: subject.faculty,
            subject: subject.subject,
            class: subject.class,
            branch: subject.branch,
            academicYear: subject.academicYear,
            overallPercentage: 0,
            studentCount: 0,
            round: 'no-data',
            subjectsHandled: [subject.subject],
            labs: subject.subject.toLowerCase().includes('lab') ? [subject.subject] : []
          });
          continue;
        }

        const initialFeedbacks = feedbacks.filter(f => (f.round || '').toLowerCase().includes('initial'));
        const finalFeedbacks = feedbacks.filter(f => (f.round || '').toLowerCase().includes('final'));

        let initialPercentage = 0;
        if (initialFeedbacks.length > 0) {
          const totalScore = initialFeedbacks.reduce((sum, fb) => 
            sum + fb.answers.reduce((scoreSum, answer) => scoreSum + answer.score, 0), 0);
          const totalQuestions = initialFeedbacks.reduce((sum, fb) => sum + fb.answers.length, 0);
          initialPercentage = totalQuestions > 0 ? (totalScore / totalQuestions * 100 / 5) : 0;
        }

        let finalPercentage = 0;
        if (finalFeedbacks.length > 0) {
          const totalScore = finalFeedbacks.reduce((sum, fb) => 
            sum + fb.answers.reduce((scoreSum, answer) => scoreSum + answer.score, 0), 0);
          const totalQuestions = finalFeedbacks.reduce((sum, fb) => sum + fb.answers.length, 0);
          finalPercentage = totalQuestions > 0 ? (totalScore / totalQuestions * 100 / 5) : 0;
        }

        const studentCount = new Set([...initialFeedbacks, ...finalFeedbacks].map(f => f.hallticket)).size;
        const totalSuggestions = feedbacks.filter(f => f.suggestion && f.suggestion.trim()).length;

        facultyHistory.push({
          faculty: subject.faculty,
          subject: subject.subject,
          class: subject.class || subject.className,
          branch: subject.branch || subject.department,
          academicYear: subject.academicYear,
          studentCount,
          subjectsHandled: [subject.subject],
          labs: subject.subject.toLowerCase().includes('lab') ? [subject.subject] : [],
          overallPercentage: finalPercentage || initialPercentage,
          round: finalFeedbacks.length > 0 ? 'final' : initialFeedbacks.length > 0 ? 'initial' : 'no-data',
          initialPercentage: parseFloat(initialPercentage.toFixed(2)),
          finalPercentage: parseFloat(finalPercentage.toFixed(2)),
          hasInitial: initialFeedbacks.length > 0,
          hasFinal: finalFeedbacks.length > 0,
          totalSuggestions
        });
      } catch (error) {
        console.error('Subject processing error:', error);
        facultyHistory.push({
          faculty: subject.faculty,
          subject: subject.subject,
          class: subject.class,
          branch: subject.branch,
          academicYear: subject.academicYear,
          overallPercentage: 0,
          studentCount: 0,
          round: 'error',
          initialPercentage: 0,
          finalPercentage: 0,
          hasInitial: false,
          hasFinal: false,
          subjectsHandled: [subject.subject]
        });
      }
    }

    facultyHistory.sort((a, b) => {
      if (a.academicYear !== b.academicYear) {
        return b.academicYear.localeCompare(a.academicYear);
      }
      return a.class.localeCompare(b.class);
    });

    res.json(facultyHistory);
  } catch (error) {
    console.error('Failed to fetch faculty history:', error);
    res.status(500).json({ error: 'Failed to fetch faculty history' });
  }
});

// Clean up faculty data
app.delete('/cleanup-faculty-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hallticketPattern = /^25C01A73\d{2}$/;
    
    const deleteResult = await Subject.deleteMany({
      faculty: { $regex: hallticketPattern }
    });
    
    const feedbackDeleteResult = await Feedback.deleteMany({
      faculty: { $regex: hallticketPattern }
    });
    
    const updatedFaculties = await Subject.distinct('faculty');
    const cleanedFaculties = updatedFaculties
      .filter(faculty => 
        faculty && 
        typeof faculty === 'string' && 
        faculty.trim() !== '' &&
        !faculty.match(/^\d+$/) &&
        !faculty.match(/^25C01A73\d{2}$/)
      )
      .sort((a, b) => a.localeCompare(b));
    
    res.json({
      success: true,
      message: `Cleaned up ${deleteResult.deletedCount} subject records and ${feedbackDeleteResult.deletedCount} feedback records`,
      deletedSubjects: deleteResult.deletedCount,
      deletedFeedbacks: feedbackDeleteResult.deletedCount,
      remainingFaculties: cleanedFaculties.length,
      sampleFaculties: cleanedFaculties.slice(0, 10)
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      error: 'Cleanup failed'
    });
  }
});

// Admin: Get all faculties for a class and branch
app.get('/faculties', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const faculties = await Subject.distinct('faculty', { class: cls, branch, academicYear });
    res.json(faculties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
});

// =============================================
// FEEDBACK & REPORTING ENDPOINTS
// =============================================

// Admin: Get feedback submission count for a class (both rounds)
app.get('/feedback-counts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const initialCount = await FeedbackSubmission.countDocuments({
      class: cls,
      branch,
      academicYear,
      initial: true
    });

    const finalCount = await FeedbackSubmission.countDocuments({
      class: cls,
      branch,
      academicYear,
      final: true
    });

    const totalStudents = await Student.countDocuments({
      class: cls,
      branch,
      academicYear
    });
    
    res.json({ 
      initial: { submitted: initialCount, total: totalStudents },
      final: { submitted: finalCount, total: totalStudents }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feedback counts' });
  }
});

// Aggregate feedback for faculty
app.get('/full-performance/:faculty', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const faculty = text(req.params.faculty, 120);
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);
    const round = req.query.round ? safeRound(req.query.round) : null;

    if (!faculty || !cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Faculty, class, branch, and academic year are required' });
    }
    if (req.query.round && !round) {
      return res.status(400).json({ error: 'Round must be initial or final' });
    }

    const matchCriteria = {
      faculty,
      class: cls,
      branch,
      academicYear
    };
    if (round) matchCriteria.round = round;

    const agg = await Feedback.aggregate([
      { $match: matchCriteria },
      { $unwind: "$answers" },
      {
        $group: {
          _id: {
            subject: "$subject",
            faculty: "$faculty",
            class: "$class",
            branch: "$branch",
            academicYear: "$academicYear",
            round: "$round",
            question: "$answers.question"
          },
          totalScore: { $sum: "$answers.score" },
          totalResponses: { $sum: 1 },
          studentCount: { $addToSet: "$hallticket" }
        }
      },
      {
        $group: {
          _id: "$_id.subject",
          faculty: { $first: "$_id.faculty" },
          class: { $first: "$_id.class" },
          branch: { $first: "$_id.branch" },
          academicYear: { $first: "$_id.academicYear" },
          round: { $first: "$_id.round" },
          avgScores: {
            $push: {
              k: "$_id.question",
              v: { $divide: ["$totalScore", "$totalResponses"] }
            }
          },
          studentCount: { $first: { $size: "$studentCount" } }
        }
      },
      {
        $project: {
          faculty: 1,
          subject: "$_id",
          class: 1,
          branch: 1,
          academicYear: 1,
          round: 1,
          studentCount: 1,
          avgScores: { $arrayToObject: "$avgScores" }
        }
      }
    ]);

    res.json(agg);
  } catch (error) {
    console.error('Performance aggregation ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// Get class-wise report
app.get('/class-report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);
    const round = req.query.round ? safeRound(req.query.round) : null;

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    if (req.query.round && !round) {
      return res.status(400).json({ error: 'Round must be initial or final' });
    }

    const matchCriteria = {
      class: cls,
      branch,
      academicYear
    };

    if (round) {
      matchCriteria.round = round;
    }

    const agg = await Feedback.aggregate([
      {
        $match: matchCriteria
      },
      { $unwind: "$answers" },
      { $group: {
        _id: {
          subject: "$subject",
          faculty: "$faculty"
        },
        totalScore: { $sum: "$answers.score" },
        totalResponses: { $sum: 1 },
        studentCount: { $addToSet: "$hallticket" }
      }},
      { $project: {
        subject: "$_id.subject",
        faculty: "$_id.faculty",
        avgScore: { $divide: ["$totalScore", "$totalResponses"] },
        studentCount: { $size: "$studentCount" }
      }},
      { $project: {
        subject: 1,
        faculty: 1,
        studentCount: 1,
        overallPercentage: { $multiply: [{ $divide: ["$avgScore", 5] }, 100] }
      }}
    ]);
    
    res.json(agg);
  } catch (error) {
    console.error('Failed to fetch class report:', error);
    res.status(500).json({ error: 'Failed to fetch class report' });
  }
});

// Get department-wise report
app.get('/department-report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);
    const round = req.query.round ? safeRound(req.query.round) : null;

    if (!branch || !academicYear) {
      return res.status(400).json({ error: 'Branch and academic year are required' });
    }
    if (req.query.round && !round) {
      return res.status(400).json({ error: 'Round must be initial or final' });
    }

    const matchCriteria = {
      branch,
      academicYear
    };

    if (round) {
      matchCriteria.round = round;
    }

    const agg = await Feedback.aggregate([
      {
        $match: matchCriteria
      },
      { $unwind: "$answers" },
      { $group: {
        _id: {
          class: "$class"
        },
        totalScore: { $sum: "$answers.score" },
        totalResponses: { $sum: 1 },
        studentCount: { $addToSet: "$hallticket" }
      }},
      { $project: {
        class: "$_id.class",
        avgScore: { $divide: ["$totalScore", "$totalResponses"] },
        studentCount: { $size: "$studentCount" }
      }},
      { $project: {
        class: 1,
        studentCount: 1,
        overallPercentage: { $multiply: [{ $divide: ["$avgScore", 5] }, 100] }
      }}
    ]);
    
    res.json(agg);
  } catch (error) {
    console.error('Failed to fetch department report:', error);
    res.status(500).json({ error: 'Failed to fetch department report' });
  }
});

// =============================================
// STUDENT ENDPOINTS
// =============================================

// Get available semesters for a student
app.get('/student-semesters', authenticateToken, requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const semesters = await Subject.distinct('class', { 
      class: student.class,
      branch: student.branch,
      academicYear: student.academicYear 
    });
    // Always expose the student's own semester so the dashboard remains usable
    // even before an admin uploads the subject list.
    if (semesters.length === 0 && student.class) {
      return res.json([student.class]);
    }
    res.json(semesters);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch semesters' });
  }
});

// Get subjects for a class/branch
app.get('/subjects', authenticateToken, requireStudent, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Verify the student has access to these subjects
    if (student.branch !== branch || student.academicYear !== academicYear || student.class !== cls) {
      return res.status(403).json({ error: 'Unauthorized to access these subjects' });
    }

    const subjects = await Subject.find({
      class: cls,
      branch,
      academicYear
    });
    res.json(subjects);
  } catch (error) {
    console.error('Failed to fetch subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Subject list used by the principal panel for reporting (admin token required)
app.get('/subjects-public', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const subjects = await Subject.find(
      { class: cls, branch, academicYear },
      { subject: 1, subjectCode: 1, faculty: 1, facultyId: 1, class: 1, branch: 1, academicYear: 1, _id: 0 }
    );
    res.json(subjects);
  } catch (error) {
    console.error('Failed to fetch public subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Get student's branch and academic year
app.get('/student-info', authenticateToken, requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json({ 
      class: student.class,
      branch: student.branch, 
      academicYear: student.academicYear 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student info' });
  }
});

// Check if feedback already submitted
app.get('/feedbackcheck', authenticateToken, requireStudent, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const round = safeRound(req.query.round);

    if (!cls || !round) {
      return res.status(400).json({ error: 'Valid class and round are required' });
    }

    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student || student.class !== cls) {
      return res.status(403).json({ error: 'Unauthorized to check feedback for this class' });
    }

    const feedback = await FeedbackSubmission.findOne({
      hallticket: student.hallticket,
      class: cls,
      branch: student.branch,
      academicYear: student.academicYear
    });

    res.json({ submitted: round === 'initial' ? !!feedback?.initial : !!feedback?.final });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check feedback status' });
  }
});

// Submit feedback
app.post('/feedback', authenticateToken, requireStudent, async (req, res) => {
  try {
    const cls = bodyText(req, 'class', 20);
    const round = safeRound(req.body?.round);
    const feedbacks = req.body?.feedbacks;
    const suggestion = optionalText(req.body?.suggestion, 2000) || '';

    if (!cls || !round || !Array.isArray(feedbacks) || feedbacks.length === 0) {
      return res.status(400).json({ error: 'Class, feedbacks, and round are required' });
    }
    if (feedbacks.length > 50) {
      return res.status(400).json({ error: 'Too many subjects in a single submission' });
    }

    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    if (student.class !== cls) {
      return res.status(403).json({ error: 'Unauthorized to submit feedback for this class' });
    }

    const roundControl = await RoundControl.findOne({
      class: student.class,
      branch: student.branch,
      academicYear: student.academicYear
    });
    // Initial feedback is open by default until an admin explicitly closes it.
    // Final feedback stays closed by default until an admin enables it.
    const initialEnabled = roundControl ? roundControl.initialEnabled : true;
    const finalEnabled = roundControl ? roundControl.finalEnabled : false;
    if ((round === 'initial' && !initialEnabled) ||
        (round === 'final' && !finalEnabled)) {
      return res.status(400).json({ error: `${round} feedback is not currently accepted` });
    }

    const submission = await FeedbackSubmission.findOne({
      hallticket: student.hallticket,
      class: student.class,
      branch: student.branch,
      academicYear: student.academicYear
    });

    if ((round === 'initial' && submission?.initial) ||
        (round === 'final' && submission?.final)) {
      return res.status(400).json({ error: `Feedback already submitted for ${round} round this semester` });
    }

    // Never trust subject/faculty data from the browser. Resolve every entry
    // against the official subject list for this student's class.
    const officialSubjects = await Subject.find({
      class: student.class,
      branch: student.branch,
      academicYear: student.academicYear
    });

    if (officialSubjects.length === 0) {
      return res.status(400).json({ error: 'No subjects are available for this class' });
    }

    const byCode = new Map();
    const bySubjectFaculty = new Map();
    for (const subject of officialSubjects) {
      if (subject.subjectCode) byCode.set(subject.subjectCode, subject);
      bySubjectFaculty.set(
        `${String(subject.subject).toLowerCase()}\u0000${String(subject.faculty).toLowerCase()}`,
        subject
      );
    }

    const seen = new Set();
    const cleanFeedbacks = [];

    for (const raw of feedbacks) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return res.status(400).json({ error: 'Each feedback entry must be an object' });
      }

      const subjectName = text(raw.subject, 160);
      const facultyName = text(raw.faculty, 120);
      const subjectCode = optionalText(raw.subjectCode, 40);
      const facultyId = optionalText(raw.facultyId, 40);

      if (!subjectName || !facultyName) {
        return res.status(400).json({ error: 'Each feedback entry needs a subject and faculty' });
      }

      const official = (subjectCode && byCode.get(subjectCode)) ||
        bySubjectFaculty.get(`${subjectName.toLowerCase()}\u0000${facultyName.toLowerCase()}`);

      if (!official) {
        return res.status(400).json({ error: `Unknown subject/faculty: ${subjectName}` });
      }
      if (
        official.subject !== subjectName ||
        official.faculty !== facultyName ||
        (facultyId && official.facultyId !== facultyId)
      ) {
        return res.status(400).json({ error: `Subject/faculty details do not match records: ${subjectName}` });
      }

      const identity = official.subjectCode || `${official.subject}\u0000${official.faculty}`;
      if (seen.has(identity)) {
        return res.status(400).json({ error: `Duplicate feedback entry for ${subjectName}` });
      }
      seen.add(identity);

      if (!Array.isArray(raw.answers) || raw.answers.length === 0 || raw.answers.length > 50) {
        return res.status(400).json({ error: `Invalid answers for ${subjectName}` });
      }

      const answers = [];
      for (const answer of raw.answers) {
        if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
          return res.status(400).json({ error: `Invalid answer for ${subjectName}` });
        }
        const question = text(answer.question, 200);
        const score = answer.score;
        if (!question || !Number.isInteger(score) || score < 1 || score > 5) {
          return res.status(400).json({ error: `Answer scores must be whole numbers from 1 to 5 for ${subjectName}` });
        }
        answers.push({ question, score });
      }

      cleanFeedbacks.push({
        subject: official.subject,
        subjectCode: official.subjectCode,
        faculty: official.faculty,
        facultyId: official.facultyId,
        answers
      });
    }

    if (cleanFeedbacks.length === 0) {
      return res.status(400).json({ error: 'No valid feedback entries submitted' });
    }

    for (const fb of cleanFeedbacks) {
      await Feedback.create({
        hallticket: student.hallticket,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear,
        subject: fb.subject,
        subjectCode: fb.subjectCode,
        faculty: fb.faculty,
        facultyId: fb.facultyId,
        answers: fb.answers,
        suggestion,
        round
      });
    }

    const updateData = round === 'initial'
      ? { initial: true, initialDate: new Date() }
      : { final: true, finalDate: new Date() };

    await FeedbackSubmission.findOneAndUpdate(
      {
        hallticket: student.hallticket,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear
      },
      { $set: updateData, $setOnInsert: { hallticket: student.hallticket, class: student.class, branch: student.branch, academicYear: student.academicYear } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: `Feedback for ${round} round submitted successfully` });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// =============================================
// ADMIN MANAGEMENT ENDPOINTS
// =============================================

// Get all classes and branches for admin
app.get('/classes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const classes = await Subject.distinct('class');
    const branches = await Subject.distinct('branch');
    const academicYears = await Subject.distinct('academicYear');
    res.json({ classes, branches, academicYears });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classes and branches' });
  }
});

// Enable/disable rounds
app.post('/round-control', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = bodyText(req, 'class', 20);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = bodyText(req, 'academicYear', 20);
    const round = safeRound(req.body?.round);
    const enabled = req.body?.enabled;

    if (!cls || !branch || !academicYear || !round) {
      return res.status(400).json({ error: 'Class, branch, academic year, and round are required' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be true or false' });
    }

    const updateData = {};
    if (round === 'initial') {
      updateData.initialEnabled = enabled;
      if (!enabled) updateData.initialEndDate = new Date();
    } else {
      updateData.finalEnabled = enabled;
      if (enabled) updateData.finalEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const control = await RoundControl.findOneAndUpdate(
      { class: cls, branch, academicYear },
      { $set: updateData, $setOnInsert: { class: cls, branch, academicYear } },
      { upsert: true, new: true, runValidators: true }
    );
    
    res.json({ success: true, control });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update round control' });
  }
});

// Get round status
app.get('/round-status', authenticateToken, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    if (req.user.role === 'student') {
      const student = await Student.findOne({ hallticket: req.user.hallticket });
      if (!student ||
          student.class !== cls ||
          student.branch !== branch ||
          student.academicYear !== academicYear) {
        return res.status(403).json({ error: 'Unauthorized to view this round status' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const control = await RoundControl.findOne({ class: cls, branch, academicYear });
    
    const response = {
      initialEnabled: control ? control.initialEnabled : true,
      finalEnabled: control ? control.finalEnabled : false,
      initialEndDate: control ? control.initialEndDate : null,
      finalEndDate: control ? control.finalEndDate : null
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch round status' });
  }
});

// Get all students for a class, branch, and academic year
app.get('/admin/students', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const students = await Student.find({
      class: cls,
      branch,
      academicYear
    }).select('name hallticket class branch academicYear -_id');
    
    res.json(students);
  } catch (error) {
    console.error('Failed to fetch students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get all students with registration status
app.get('/admin/students-with-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const students = await Student.find({
      class: cls,
      branch,
      academicYear
    }).select('name hallticket class branch academicYear email -_id');
    
    const studentsWithStatus = students.map(student => ({
      name: student.name,
      hallticket: student.hallticket,
      class: student.class,
      branch: student.branch,
      academicYear: student.academicYear,
      registered: !!student.email,
      email: student.email || null
    }));
    
    res.json(studentsWithStatus);
  } catch (error) {
    console.error('Failed to fetch students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Admin: Reset student password
app.put('/admin/reset-student/:hallticket', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hallticket = normalizeHallticket(req.params.hallticket);
    const academicYear = bodyText(req, 'academicYear', 20);

    if (!hallticket || !academicYear) {
      return res.status(400).json({ error: 'Hallticket and academic year are required' });
    }
    if (!isValidHallticket(hallticket) || !isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Invalid hallticket or academic year' });
    }

    const student = await Student.findOne({
      hallticket,
      academicYear
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!student.email) {
      return res.status(400).json({ error: 'Student is not registered yet' });
    }

    student.email = undefined;
    student.password = undefined;
    await student.save();

    res.json({
      success: true,
      message: 'Password reset successfully. Student can now register again.',
      student: publicStudent(student)
    });
  } catch (error) {
    console.error('Error resetting student password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// =============================================
// ADMIN STUDENT MANAGEMENT (single + bulk)
// =============================================

// Add a single student
app.post('/admin/add-student', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const name = bodyText(req, 'name', 120);
    const normalizedHallticket = normalizeHallticket(req.body?.hallticket);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = bodyText(req, 'academicYear', 20);
    const cls = bodyText(req, 'class', 20);

    if (!name || !normalizedHallticket || !branch || !academicYear || !cls) {
      return res.status(400).json({ error: 'Name, hallticket, branch, academic year, and class are required' });
    }
    if (!isValidHallticket(normalizedHallticket)) {
      return res.status(400).json({ error: 'Hallticket must be 4-30 uppercase letters/numbers' });
    }
    if (!isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const existing = await Student.findOne({
      hallticket: normalizedHallticket,
      academicYear,
      class: cls
    });

    if (existing) {
      return res.status(400).json({ error: 'Student already exists for this class and academic year' });
    }

    const student = await Student.create({
      name,
      hallticket: normalizedHallticket,
      branch,
      academicYear,
      class: cls,
      password: await bcrypt.hash(STUDENT_DEFAULT_PASSWORD, BCRYPT_ROUNDS)
    });

    await FeedbackSubmission.findOneAndUpdate(
      { hallticket: normalizedHallticket, class: cls, branch, academicYear },
      { $setOnInsert: { hallticket: normalizedHallticket, class: cls, branch, academicYear, initial: false, final: false } },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: `Student ${student.name} added successfully`,
      student: publicStudent(student)
    });
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// Update a single student
app.put('/admin/update-student/:hallticket', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hallticket = normalizeHallticket(req.params.hallticket);
    const name = bodyText(req, 'name', 120);
    const branch = bodyText(req, 'branch', 40);
    const academicYear = optionalText(req.body?.academicYear, 20);
    const cls = optionalText(req.body?.class, 20);

    if (!hallticket || !name || !branch) {
      return res.status(400).json({ error: 'Valid hallticket, name, and branch are required' });
    }
    if (academicYear && !isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const query = { hallticket };
    if (academicYear) query.academicYear = academicYear;
    if (cls) query.class = cls;

    let student = await Student.findOne(query);
    if (!student && academicYear) {
      // Be forgiving if the class changed or was not sent
      student = await Student.findOne({ hallticket, academicYear });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const oldClass = student.class;
    const oldBranch = student.branch;
    const oldAcademicYear = student.academicYear;

    student.name = name;
    student.branch = branch;
    if (academicYear) student.academicYear = academicYear;
    if (cls) student.class = cls;
    await student.save();

    // Keep submission tracking aligned when class/branch/year changes
    await FeedbackSubmission.updateMany(
      {
        hallticket: student.hallticket,
        class: oldClass,
        branch: oldBranch,
        academicYear: oldAcademicYear
      },
      { $set: { class: student.class, branch: student.branch, academicYear: student.academicYear } }
    );

    res.json({
      success: true,
      message: `Student ${student.name} updated successfully`,
      student: publicStudent(student)
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete a single student
app.delete('/admin/delete-student/:hallticket', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const normalizedHallticket = normalizeHallticket(req.params.hallticket);
    const academicYear = queryText(req, 'academicYear', 20);
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);

    if (!normalizedHallticket || !isValidHallticket(normalizedHallticket)) {
      return res.status(400).json({ error: 'Invalid hallticket' });
    }
    if (academicYear && !isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const query = { hallticket: normalizedHallticket };
    if (academicYear) query.academicYear = academicYear;
    if (cls) query.class = cls;
    if (branch) query.branch = branch;

    const student = await Student.findOne(query);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await Student.deleteMany(query);
    await FeedbackSubmission.deleteMany(query);
    await Feedback.deleteMany({
      hallticket: normalizedHallticket,
      ...(academicYear && { academicYear }),
      ...(cls && { class: cls }),
      ...(branch && { branch })
    });

    res.json({
      success: true,
      message: `Student ${student.name} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Bulk delete students
app.post('/admin/bulk-delete-students', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const halltickets = req.body?.halltickets;
    const academicYear = bodyText(req, 'academicYear', 20);
    const cls = optionalText(req.body?.class, 20);
    const branch = optionalText(req.body?.branch, 40);

    if (!Array.isArray(halltickets) || halltickets.length === 0) {
      return res.status(400).json({ error: 'No students selected' });
    }
    if (halltickets.length > 500) {
      return res.status(400).json({ error: 'Too many students selected (maximum 500)' });
    }

    if (!academicYear) {
      return res.status(400).json({ error: 'Academic year is required' });
    }
    if (!isValidAcademicYear(academicYear)) {
      return res.status(400).json({ error: 'Academic year must use the format YYYY-YYYY' });
    }

    const normalizedHalltickets = [];
    for (const value of halltickets) {
      const normalized = normalizeHallticket(value);
      if (!normalized || !isValidHallticket(normalized)) {
        return res.status(400).json({ error: 'One or more halltickets are invalid' });
      }
      normalizedHalltickets.push(normalized);
    }

    const query = { hallticket: { $in: normalizedHalltickets }, academicYear };
    if (cls) query.class = cls;
    if (branch) query.branch = branch;

    const result = await Student.deleteMany(query);
    await FeedbackSubmission.deleteMany(query);
    await Feedback.deleteMany({
      hallticket: { $in: normalizedHalltickets },
      academicYear,
      ...(cls && { class: cls }),
      ...(branch && { branch })
    });

    res.json({
      success: true,
      message: `${result.deletedCount} student(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error bulk deleting students:', error);
    res.status(500).json({ error: 'Failed to delete students' });
  }
});

// Get all feedback submissions
app.get('/feedback-submissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cls = queryText(req, 'class', 20);
    const branch = queryText(req, 'branch', 40);
    const academicYear = queryText(req, 'academicYear', 20);

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const submissions = await FeedbackSubmission.find({
      class: cls,
      branch,
      academicYear
    }).select('hallticket initial final initialDate finalDate -_id');
    
    res.json(submissions);
  } catch (error) {
    console.error('Failed to fetch feedback submissions:', error);
    res.status(500).json({ error: 'Failed to fetch feedback submissions' });
  }
});

// =============================================
// ERROR HANDLING
// =============================================

// Error handling middleware. Never leak stack traces or driver internals.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ error: 'Invalid file upload' });
  }

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (error?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (/^Only CSV files are allowed$/.test(error?.message || '')) {
    return res.status(400).json({ error: 'Only CSV files are allowed' });
  }

  console.error('Unhandled error:', error?.message || error);
  return res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}...`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});