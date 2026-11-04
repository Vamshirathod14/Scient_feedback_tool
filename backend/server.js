require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
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
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];
    
    if (!origin) return callback(null, true);
    
    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (allowedOrigins.indexOf(origin) !== -1 || isLocalDevOrigin) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
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

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Simple CSV parser function
function parseCSV(csvString, isSubjects = false) {
  try {
    const lines = csvString.split('\n').filter(line => line.trim());
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
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
        const facultyId = values[0] || '';
        const facultyName = values[1] || '';
        const subjectCode = values[2] || '';
        const subjectName = values[3] || '';
        
        if (facultyId && facultyName && subjectCode && subjectName) {
          result.push({
            facultyId: facultyId.trim(),
            facultyName: facultyName.trim(),
            subjectCode: subjectCode.trim(),
            subjectName: subjectName.trim()
          });
        }
      } else if (!isSubjects && values.length >= 3) {
        const name = values[0] || '';
        const hallticket = values[1] || '';
        const branch = values[2] || '';
        
        if (name && hallticket && branch) {
          result.push({
            name: name.trim(),
            hallticket: hallticket.trim(),
            branch: branch.trim()
          });
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

// GET STUDENT BY HALLTICKET (for student login)
app.get('/student-by-hallticket/:hallticket', async (req, res) => {
  try {
    const { hallticket } = req.params;
    
    if (!hallticket) {
      return res.status(400).json({ 
        success: false, 
        error: 'Hallticket is required' 
      });
    }
    
    const normalizedHallticket = hallticket.trim();
    const student = await Student.findOne({ hallticket: normalizedHallticket });
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    res.json({
      success: true,
      student: {
        name: student.name,
        hallticket: student.hallticket,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear,
        email: student.email || null
      }
    });
  } catch (error) {
    console.error('Error fetching student by hallticket:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
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

// Faculty Master Endpoints
app.get('/api/faculty-master', async (req, res) => {
  try {
    const faculties = await FacultyMaster.find().sort({ facultyName: 1 });
    res.json(faculties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
});

app.post('/api/faculty-master', async (req, res) => {
  try {
    const { facultyId, facultyName, email, phone, department, designation } = req.body;
    
    if (!facultyId || !facultyName) {
      return res.status(400).json({ error: 'Faculty ID and Name are required' });
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

app.put('/api/faculty-master/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
    const updates = req.body;
    
    const faculty = await FacultyMaster.findOneAndUpdate(
      { facultyId },
      updates,
      { new: true }
    );
    
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }
    
    res.json({ success: true, message: 'Faculty updated successfully', faculty });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update faculty' });
  }
});

app.delete('/api/faculty-master/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
    
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

// Subject Master Endpoints
app.get('/api/subject-master', async (req, res) => {
  try {
    const subjects = await SubjectMaster.find().sort({ subjectCode: 1 });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

app.post('/api/subject-master', async (req, res) => {
  try {
    const { subjectCode, subjectName, credits, type } = req.body;
    
    if (!subjectCode || !subjectName) {
      return res.status(400).json({ error: 'Subject Code and Name are required' });
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

app.put('/api/subject-master/:subjectCode', async (req, res) => {
  try {
    const { subjectCode } = req.params;
    const updates = req.body;
    
    const subject = await SubjectMaster.findOneAndUpdate(
      { subjectCode },
      updates,
      { new: true }
    );
    
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    res.json({ success: true, message: 'Subject updated successfully', subject });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subject' });
  }
});

app.delete('/api/subject-master/:subjectCode', async (req, res) => {
  try {
    const { subjectCode } = req.params;
    
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

// Timetable Endpoints
app.get('/api/timetable', async (req, res) => {
  try {
    const { class: cls, branch, academicYear, semester } = req.query;
    
    const query = {};
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

app.get('/api/timetable/:id', async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }
    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timetable' });
  }
});

app.post('/api/timetable', async (req, res) => {
  try {
    const { class: cls, branch, academicYear, semester, entries } = req.body;
    
    if (!cls || !branch || !academicYear || !semester) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const existing = await Timetable.findOne({ class: cls, branch, academicYear, semester });
    if (existing) {
      return res.status(400).json({ error: 'Timetable already exists for this combination' });
    }
    
    for (const entry of entries) {
      const faculty = await FacultyMaster.findOne({ facultyId: entry.facultyId });
      if (!faculty) {
        return res.status(400).json({ error: `Faculty ID ${entry.facultyId} not found` });
      }
      
      const subject = await SubjectMaster.findOne({ subjectCode: entry.subjectCode });
      if (!subject) {
        return res.status(400).json({ error: `Subject Code ${entry.subjectCode} not found` });
      }
      
      entry.facultyName = faculty.facultyName;
      entry.subjectName = subject.subjectName;
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
          subject: entry.subjectCode,
          class: cls,
          branch,
          academicYear 
        },
        {
          subject: entry.subjectCode,
          subjectCode: entry.subjectCode,
          faculty: entry.facultyId,
          facultyId: entry.facultyId,
          class: cls,
          branch,
          academicYear
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

app.put('/api/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { entries } = req.body;
    
    for (const entry of entries) {
      const faculty = await FacultyMaster.findOne({ facultyId: entry.facultyId });
      if (!faculty) {
        return res.status(400).json({ error: `Faculty ID ${entry.facultyId} not found` });
      }
      
      const subject = await SubjectMaster.findOne({ subjectCode: entry.subjectCode });
      if (!subject) {
        return res.status(400).json({ error: `Subject Code ${entry.subjectCode} not found` });
      }
      
      entry.facultyName = faculty.facultyName;
      entry.subjectName = subject.subjectName;
    }
    
    const timetable = await Timetable.findByIdAndUpdate(
      id,
      { 
        entries,
        updatedAt: new Date()
      },
      { new: true }
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
        subject: entry.subjectCode,
        subjectCode: entry.subjectCode,
        faculty: entry.facultyId,
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

app.delete('/api/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const timetable = await Timetable.findByIdAndDelete(id);
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

// Import from existing data (migration helper)
app.post('/api/migrate-subjects-to-master', async (req, res) => {
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
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// =============================================
// FILE UPLOAD ENDPOINTS
// =============================================

// Upload students CSV
app.post('/upload-students', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { class: cls, branch, academicYear } = req.body;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
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
    
    const batchSize = 25;
    
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      
      for (const student of batch) {
        try {
          const existingStudent = await Student.findOne({ 
            hallticket: student.hallticket,
            academicYear: academicYear,
            class: cls
          });
          
          if (existingStudent) {
            await Student.updateOne(
              { 
                hallticket: student.hallticket,
                academicYear: academicYear,
                class: cls
              },
              { 
                $set: { 
                  name: student.name, 
                  class: cls,
                  branch: student.branch,
                  academicYear: academicYear,
                  ...(existingStudent.email && { email: existingStudent.email }),
                  ...(existingStudent.password && { password: existingStudent.password })
                } 
              }
            );
            successCount++;
            duplicateCount++;
          } else {
            const studentInOtherClass = await Student.findOne({ 
              hallticket: student.hallticket,
              academicYear: academicYear
            });
            
            if (studentInOtherClass) {
              await Student.create({
                name: student.name,
                hallticket: student.hallticket,
                class: cls,
                branch: student.branch,
                academicYear: academicYear,
                password: bcrypt.hashSync(student.hallticket, 10)
              });
              successCount++;
              newCount++;
            } else {
              await Student.create({
                name: student.name,
                hallticket: student.hallticket,
                class: cls,
                branch: student.branch,
                academicYear: academicYear,
                password: bcrypt.hashSync(student.hallticket, 10)
              });
              successCount++;
              newCount++;
            }
          }
          
          await FeedbackSubmission.findOneAndUpdate(
            {
              hallticket: student.hallticket,
              class: cls,
              branch: branch,
              academicYear: academicYear
            },
            {
              hallticket: student.hallticket,
              class: cls,
              branch: branch,
              academicYear: academicYear,
              initial: false,
              final: false
            },
            { upsert: true, new: true }
          );
          
        } catch (error) {
          errorCount++;
          console.error('Error processing student:', error);
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
    res.status(500).json({ 
      error: 'Failed to upload students: ' + error.message
    });
  }
});

// Upload subjects CSV
app.post('/upload-subjects', upload.single('file'), async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const csvString = req.file.buffer.toString('utf8');
    const subjects = parseCSV(csvString, true);

    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ error: 'No valid subject data found in CSV' });
    }

    await Subject.deleteMany({ 
      class: cls, 
      branch: branch, 
      academicYear: academicYear 
    });
    
    const subjectsToInsert = [];
    for (const subject of subjects) {
      await FacultyMaster.findOneAndUpdate(
        { facultyId: subject.facultyId },
        { 
          facultyId: subject.facultyId,
          facultyName: subject.facultyName
        },
        { upsert: true, new: true }
      );
      
      subjectsToInsert.push({
        subject: subject.subjectName,
        subjectCode: subject.subjectCode,
        faculty: subject.facultyName,
        facultyId: subject.facultyId,
        class: cls,
        branch: branch,
        academicYear: academicYear
      });
    }

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
    res.status(500).json({ 
      error: 'Failed to upload subjects: ' + error.message
    });
  }
});

// =============================================
// AUTHENTICATION ENDPOINTS
// =============================================

// Admin registration
app.post('/admin/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }
    
    const existingAdmin = await Admin.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin username or email already exists' });
    }
    
    const admin = await Admin.create({
      username,
      password: bcrypt.hashSync(password, 10),
      email
    });
    
    res.json({ 
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
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    if (!bcrypt.compareSync(password, admin.password)) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { 
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }, 
      process.env.JWT_SECRET || 'fallback-secret-key', 
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
app.post('/login', async (req, res) => {
  try {
    const { hallticket, password } = req.body;
    
    if (!hallticket || !password) {
      return res.status(400).json({ error: 'Hallticket and password are required' });
    }
    
    const normalizedHallticket = hallticket.trim();
    const student = await Student.findOne({ hallticket: normalizedHallticket });
    if (!student) {
      return res.status(400).json({ error: 'Invalid Hall Ticket Number' });
    }
    
    const commonPassword = process.env.STUDENT_COMMON_PASSWORD || 'Scient@123';
    if (password !== commonPassword) {
      return res.status(400).json({ error: 'Invalid Password' });
    }
    
    const token = jwt.sign(
      { 
        hallticket: student.hallticket, 
        email: student.email, 
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear 
      }, 
      process.env.JWT_SECRET || 'fallback-secret-key', 
      { expiresIn: '7d' }
    );
    
    res.json({ 
      success: true, 
      token,
      student: {
        name: student.name,
        hallticket: student.hallticket,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear,
        email: student.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// =============================================
// FACULTY MANAGEMENT ENDPOINTS
// =============================================

app.get('/all-faculties', async (req, res) => {
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
      error: 'Failed to fetch faculties: ' + error.message 
    });
  }
});

// Get faculty name variations for correction
app.get('/faculty-variations', async (req, res) => {
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
app.put('/update-faculty-name', async (req, res) => {
  try {
    const { originalName, newName, class: cls, branch, academicYear } = req.body;
    
    if (!originalName || !newName) {
      return res.status(400).json({ error: 'Original name and new name are required' });
    }

    if (originalName === newName) {
      return res.status(400).json({ error: 'Original and new names are the same' });
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
    res.status(500).json({ error: 'Failed to update faculty name: ' + error.message });
  }
});

// Get complete faculty history with performance data
app.get('/faculty-history', async (req, res) => {
  try {
    const { faculty, class: cls, branch, academicYear } = req.query;
    if (!faculty) return res.status(400).json({ error: 'Faculty name is required' });

    const subjectMatchCriteria = { faculty: faculty.trim() };
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
app.delete('/cleanup-faculty-data', async (req, res) => {
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
      error: 'Cleanup failed: ' + error.message 
    });
  }
});

// Admin: Get all faculties for a class and branch
app.get('/faculties', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const faculties = await Subject.distinct('faculty', { class: cls, branch: branch, academicYear: academicYear });
    res.json(faculties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
});

// =============================================
// FEEDBACK & REPORTING ENDPOINTS
// =============================================

// Admin: Get feedback submission count for a class (both rounds)
app.get('/feedback-counts', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const initialCount = await FeedbackSubmission.countDocuments({ 
      class: cls, 
      branch: branch, 
      academicYear: academicYear,
      initial: true 
    });
    
    const finalCount = await FeedbackSubmission.countDocuments({ 
      class: cls, 
      branch: branch, 
      academicYear: academicYear,
      final: true 
    });
    
    const totalStudents = await Student.countDocuments({ 
      class: cls,
      branch: branch, 
      academicYear: academicYear 
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
app.get('/full-performance/:faculty', async (req, res) => {
  try {
    const { class: cls, branch, academicYear, round } = req.query;
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const matchCriteria = {
      faculty: req.params.faculty,
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
    res.status(500).json({ error: 'Failed to fetch performance data', details: error.message });
  }
});

// Get class-wise report
app.get('/class-report', async (req, res) => {
  try {
    const { class: cls, branch, academicYear, round } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const matchCriteria = { 
      class: cls,
      branch: branch,
      academicYear: academicYear
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
app.get('/department-report', async (req, res) => {
  try {
    const { branch, academicYear, round } = req.query;
    
    if (!branch || !academicYear) {
      return res.status(400).json({ error: 'Branch and academic year are required' });
    }
    
    const matchCriteria = { 
      branch: branch,
      academicYear: academicYear
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
app.get('/student-semesters', authenticateToken, async (req, res) => {
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
app.get('/subjects', authenticateToken, async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Verify the student has access to these subjects
    if (student.branch !== branch || student.academicYear !== academicYear || student.class !== cls) {
      return res.status(403).json({ 
        error: 'Unauthorized to access these subjects. Your class: ' + student.class + ', Requested: ' + cls 
      });
    }
    
    const subjects = await Subject.find({ 
      class: cls, 
      branch: branch, 
      academicYear: academicYear 
    });
    res.json(subjects);
  } catch (error) {
    console.error('Failed to fetch subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Public subject list (read-only) used by the principal panel for reporting
app.get('/subjects-public', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;

    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }

    const subjects = await Subject.find({ class: cls, branch, academicYear });
    res.json(subjects);
  } catch (error) {
    console.error('Failed to fetch public subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Get student's branch and academic year
app.get('/student-info', authenticateToken, async (req, res) => {
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
app.get('/feedbackcheck', authenticateToken, async (req, res) => {
  try {
    const { class: cls, round } = req.query;
    
    if (!cls || !round) {
      return res.status(400).json({ error: 'Class and round are required' });
    }
    
    const feedback = await FeedbackSubmission.findOne({ 
      hallticket: req.user.hallticket, 
      class: cls, 
      branch: req.user.branch,
      academicYear: req.user.academicYear
    });
    
    if (round === 'initial') {
      res.json({ submitted: !!feedback && feedback.initial });
    } else if (round === 'final') {
      res.json({ submitted: !!feedback && feedback.final });
    } else {
      res.status(400).json({ error: 'Invalid round specified' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to check feedback status' });
  }
});

// Submit feedback
app.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { class: cls, feedbacks, suggestion, round } = req.body;
    
    if (!cls || !feedbacks || !round) {
      return res.status(400).json({ error: 'Class, feedbacks, and round are required' });
    }
    
    const roundControl = await RoundControl.findOne({ 
      class: cls, 
      branch: req.user.branch,
      academicYear: req.user.academicYear
    });
    // Initial feedback is open by default until an admin explicitly closes it.
    // Final feedback stays closed by default until an admin enables it.
    const initialEnabled = roundControl ? roundControl.initialEnabled : true;
    const finalEnabled = roundControl ? roundControl.finalEnabled : false;
    if ((round === 'initial' && !initialEnabled) ||
        (round === 'final' && !finalEnabled)) {
      return res.status(400).json({ error: `${round} feedback is not currently accepted` });
    }
    
    const student = await Student.findOne({ hallticket: req.user.hallticket });
    if (!student || student.branch !== req.user.branch || student.academicYear !== req.user.academicYear) {
      return res.status(403).json({ error: 'Unauthorized to submit feedback for this branch/academic year' });
    }
    
    const submission = await FeedbackSubmission.findOne({ 
      hallticket: req.user.hallticket, 
      class: cls, 
      branch: req.user.branch,
      academicYear: req.user.academicYear
    });
    
    if ((round === 'initial' && submission && submission.initial) || 
        (round === 'final' && submission && submission.final)) {
      return res.status(400).json({ error: `Feedback already submitted for ${round} round this semester` });
    }
    
    for (let fb of feedbacks) {
      await Feedback.create({
        hallticket: req.user.hallticket,
        class: cls,
        branch: req.user.branch,
        academicYear: req.user.academicYear,
        subject: fb.subject,
        subjectCode: fb.subjectCode,
        faculty: fb.faculty,
        facultyId: fb.facultyId,
        answers: fb.answers,
        suggestion,
        round: round
      });
    }
    
    const updateData = round === 'initial' 
      ? { initial: true, initialDate: new Date() } 
      : { final: true, finalDate: new Date() };
    
    await FeedbackSubmission.findOneAndUpdate(
      { 
        hallticket: req.user.hallticket, 
        class: cls, 
        branch: req.user.branch,
        academicYear: req.user.academicYear
      },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json({ success: true, message: `Feedback for ${round} round submitted successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// =============================================
// ADMIN MANAGEMENT ENDPOINTS
// =============================================

// Get all classes and branches for admin
app.get('/classes', async (req, res) => {
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
app.post('/round-control', async (req, res) => {
  try {
    const { class: cls, branch, academicYear, round, enabled } = req.body;
    
    if (!cls || !branch || !academicYear || !round) {
      return res.status(400).json({ error: 'Class, branch, academic year, and round are required' });
    }
    
    const updateData = {};
    if (round === 'initial') {
      updateData.initialEnabled = enabled;
      if (!enabled) updateData.initialEndDate = new Date();
    } else if (round === 'final') {
      updateData.finalEnabled = enabled;
      if (enabled) updateData.finalEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else {
      return res.status(400).json({ error: 'Invalid round specified' });
    }
    
    const control = await RoundControl.findOneAndUpdate(
      { class: cls, branch: branch, academicYear: academicYear },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json({ success: true, control });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update round control' });
  }
});

// Get round status
app.get('/round-status', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const control = await RoundControl.findOne({ class: cls, branch: branch, academicYear: academicYear });
    
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
app.get('/admin/students', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const students = await Student.find({ 
      class: cls,
      branch: branch, 
      academicYear: academicYear 
    }).select('name hallticket class branch academicYear -_id');
    
    res.json(students);
  } catch (error) {
    console.error('Failed to fetch students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get all students with registration status
app.get('/admin/students-with-status', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const students = await Student.find({ 
      class: cls,
      branch: branch, 
      academicYear: academicYear 
    }).select('name hallticket class branch academicYear email password -_id');
    
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
app.put('/admin/reset-student/:hallticket', async (req, res) => {
  try {
    const { hallticket } = req.params;
    const { academicYear } = req.body;
    
    if (!hallticket || !academicYear) {
      return res.status(400).json({ error: 'Hallticket and academic year are required' });
    }
    
    const student = await Student.findOne({ 
      hallticket: hallticket,
      academicYear: academicYear 
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
      student: {
        name: student.name,
        hallticket: student.hallticket,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear
      }
    });
  } catch (error) {
    console.error('Error resetting student password:', error);
    res.status(500).json({ error: 'Failed to reset password: ' + error.message });
  }
});

// =============================================
// ADMIN STUDENT MANAGEMENT (single + bulk)
// =============================================

// Add a single student
app.post('/admin/add-student', async (req, res) => {
  try {
    const { name, hallticket, branch, academicYear, class: cls } = req.body;

    if (!name || !hallticket) {
      return res.status(400).json({ error: 'Name and hallticket are required' });
    }

    const normalizedHallticket = hallticket.toString().trim().toUpperCase();

    if (!/^[A-Z0-9]+$/.test(normalizedHallticket)) {
      return res.status(400).json({ error: 'Hallticket should contain only uppercase letters and numbers' });
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
      name: name.trim(),
      hallticket: normalizedHallticket,
      branch,
      academicYear,
      class: cls,
      password: bcrypt.hashSync(normalizedHallticket, 10)
    });

    await FeedbackSubmission.findOneAndUpdate(
      { hallticket: normalizedHallticket, class: cls, branch, academicYear },
      { hallticket: normalizedHallticket, class: cls, branch, academicYear, initial: false, final: false },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Student ${student.name} added successfully`,
      student
    });
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ error: 'Failed to add student: ' + error.message });
  }
});

// Update a single student
app.put('/admin/update-student/:hallticket', async (req, res) => {
  try {
    const { hallticket } = req.params;
    const { name, branch, academicYear, class: cls } = req.body;

    if (!name || !branch) {
      return res.status(400).json({ error: 'Name and branch are required' });
    }

    const query = { hallticket: hallticket.trim().toUpperCase() };
    if (academicYear) query.academicYear = academicYear;
    if (cls) query.class = cls;

    let student = await Student.findOne(query);
    if (!student && academicYear) {
      // Be forgiving if the class changed or was not sent
      student = await Student.findOne({
        hallticket: hallticket.trim().toUpperCase(),
        academicYear
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const oldClass = student.class;
    const oldBranch = student.branch;
    const oldAcademicYear = student.academicYear;

    student.name = name.trim();
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
      student
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student: ' + error.message });
  }
});

// Delete a single student
app.delete('/admin/delete-student/:hallticket', async (req, res) => {
  try {
    const { hallticket } = req.params;
    const { academicYear, class: cls, branch } = req.query;

    const normalizedHallticket = hallticket.trim().toUpperCase();
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
    res.status(500).json({ error: 'Failed to delete student: ' + error.message });
  }
});

// Bulk delete students
app.post('/admin/bulk-delete-students', async (req, res) => {
  try {
    const { halltickets, academicYear, class: cls, branch } = req.body;

    if (!Array.isArray(halltickets) || halltickets.length === 0) {
      return res.status(400).json({ error: 'No students selected' });
    }

    if (!academicYear) {
      return res.status(400).json({ error: 'Academic year is required' });
    }

    const normalizedHalltickets = halltickets.map(h => h.toString().trim().toUpperCase());

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
    res.status(500).json({ error: 'Failed to delete students: ' + error.message });
  }
});

// Get all feedback submissions
app.get('/feedback-submissions', async (req, res) => {
  try {
    const { class: cls, branch, academicYear } = req.query;
    
    if (!cls || !branch || !academicYear) {
      return res.status(400).json({ error: 'Class, branch, and academic year are required' });
    }
    
    const submissions = await FeedbackSubmission.find({ 
      class: cls, 
      branch: branch, 
      academicYear: academicYear 
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

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  res.status(500).json({ error: 'Internal server error' });
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