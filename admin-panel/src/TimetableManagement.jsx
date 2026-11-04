import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import './TimetableManagement.css';

function TimetableManagement() {
  const [classSel, setClassSel] = useState('');
  const [branchSel, setBranchSel] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState('');
  
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [timetables, setTimetables] = useState([]);
  const [currentTimetable, setCurrentTimetable] = useState(null);
  
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const classes = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];
  const branches = ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSM", "AIML", "ECE", "EEE", "CSE-E"];
  const academicYears = ["2025-2026", "2026-2027", "2027-2028", "2028-2029"];

  useEffect(() => {
    loadMasterData();
    loadTimetables();
  }, []);

  useEffect(() => {
    if (classSel && branchSel && academicYear && semester) {
      checkExistingTimetable();
    }
  }, [classSel, branchSel, academicYear, semester]);

  const loadMasterData = async () => {
    try {
      const [facultiesRes, subjectsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/faculty-master`),
        axios.get(`${API_BASE_URL}/api/subject-master`)
      ]);
      setFaculties(facultiesRes.data);
      setSubjects(subjectsRes.data);
    } catch (error) {
      toast.error('Failed to load master data');
    }
  };

  const loadTimetables = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/timetable`);
      setTimetables(response.data);
    } catch (error) {
      toast.error('Failed to load timetables');
    }
  };

  const checkExistingTimetable = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/timetable`, {
        params: { class: classSel, branch: branchSel, academicYear, semester }
      });
      if (response.data.length > 0) {
        setCurrentTimetable(response.data[0]);
        setEntries(response.data[0].entries);
      } else {
        setCurrentTimetable(null);
        setEntries([]);
      }
    } catch (error) {
      console.error('Error checking timetable:', error);
    }
  };

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        subjectCode: '',
        facultyId: '',
        section: 'A',
        theoryHours: 0,
        labHours: 0,
        tutorialHours: 0,
        totalHours: 0
      }
    ]);
  };

  const removeEntry = (index) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
  };

  const updateEntry = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    
    // Calculate total hours
    if (field === 'theoryHours' || field === 'labHours' || field === 'tutorialHours') {
      const entry = newEntries[index];
      entry.totalHours = (parseInt(entry.theoryHours) || 0) + 
                        (parseInt(entry.labHours) || 0) + 
                        (parseInt(entry.tutorialHours) || 0);
    }
    
    setEntries(newEntries);
  };

  const handleSubmit = async () => {
    if (!classSel || !branchSel || !academicYear || !semester) {
      toast.warning('Please select all class details');
      return;
    }

    if (entries.length === 0) {
      toast.warning('Please add at least one entry');
      return;
    }

    // Validate entries
    for (const entry of entries) {
      if (!entry.subjectCode || !entry.facultyId) {
        toast.warning('Please fill all required fields in entries');
        return;
      }
    }

    setLoading(true);
    try {
      let response;
      if (currentTimetable) {
        response = await axios.put(
          `${API_BASE_URL}/api/timetable/${currentTimetable._id}`,
          { entries }
        );
      } else {
        response = await axios.post(`${API_BASE_URL}/api/timetable`, {
          class: classSel,
          branch: branchSel,
          academicYear,
          semester,
          entries
        });
      }

      if (response.data.success) {
        toast.success(response.data.message);
        setShowForm(false);
        loadTimetables();
        checkExistingTimetable();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this timetable?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.delete(`${API_BASE_URL}/api/timetable/${id}`);
      if (response.data.success) {
        toast.success('Timetable deleted successfully');
        loadTimetables();
        if (currentTimetable?._id === id) {
          setCurrentTimetable(null);
          setEntries([]);
        }
      }
    } catch (error) {
      toast.error('Failed to delete timetable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="timetable-management">
      <div className="timetable-header">
        <h2>📅 Timetable Management</h2>
        <button 
          className="btn-add"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '📋 View Timetables' : '➕ Create New Timetable'}
        </button>
      </div>

      {!showForm ? (
        // List view
        <div className="timetable-list">
          <h3>Existing Timetables</h3>
          <div className="timetable-grid">
            {timetables.map(tt => (
              <div key={tt._id} className="timetable-card">
                <div className="card-header">
                  <h4>{tt.class} - {tt.branch}</h4>
                  <span className="semester-badge">{tt.semester}</span>
                </div>
                <p className="academic-year">{tt.academicYear}</p>
                <p className="entry-count">{tt.entries.length} subjects assigned</p>
                <div className="card-actions">
                  <button 
                    onClick={() => {
                      setClassSel(tt.class);
                      setBranchSel(tt.branch);
                      setAcademicYear(tt.academicYear);
                      setSemester(tt.semester);
                      setCurrentTimetable(tt);
                      setEntries(tt.entries);
                      setShowForm(true);
                    }}
                    className="btn-view"
                  >
                    👁️ View/Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(tt._id)}
                    className="btn-delete"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Form view
        <div className="timetable-form">
          <h3>{currentTimetable ? 'Edit Timetable' : 'Create New Timetable'}</h3>
          
          <div className="selection-row">
            <select value={classSel} onChange={e => setClassSel(e.target.value)}>
              <option value="">Select Class</option>
              {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
            
            <select value={branchSel} onChange={e => setBranchSel(e.target.value)}>
              <option value="">Select Branch</option>
              {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
            </select>

            <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
              <option value="">Select Academic Year</option>
              {academicYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>

            <select value={semester} onChange={e => setSemester(e.target.value)}>
              <option value="">Select Semester</option>
              {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
          </div>

          <div className="entries-section">
            <div className="entries-header">
              <h4>Subject Allocations</h4>
              <button onClick={addEntry} className="btn-add-entry">➕ Add Subject</button>
            </div>

            {entries.map((entry, index) => (
              <div key={index} className="entry-row">
                <select
                  value={entry.subjectCode}
                  onChange={(e) => updateEntry(index, 'subjectCode', e.target.value)}
                  className="subject-select"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(subj => (
                    <option key={subj.subjectCode} value={subj.subjectCode}>
                      {subj.subjectCode} - {subj.subjectName}
                    </option>
                  ))}
                </select>

                <select
                  value={entry.facultyId}
                  onChange={(e) => updateEntry(index, 'facultyId', e.target.value)}
                  className="faculty-select"
                >
                  <option value="">Select Faculty</option>
                  {faculties.map(fac => (
                    <option key={fac.facultyId} value={fac.facultyId}>
                      {fac.facultyId} - {fac.facultyName}
                    </option>
                  ))}
                </select>

                <select
                  value={entry.section}
                  onChange={(e) => updateEntry(index, 'section', e.target.value)}
                  className="section-select"
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>

                <input
                  type="number"
                  placeholder="Theory"
                  value={entry.theoryHours}
                  onChange={(e) => updateEntry(index, 'theoryHours', e.target.value)}
                  className="hours-input"
                  min="0"
                />

                <input
                  type="number"
                  placeholder="Lab"
                  value={entry.labHours}
                  onChange={(e) => updateEntry(index, 'labHours', e.target.value)}
                  className="hours-input"
                  min="0"
                />

                <input
                  type="number"
                  placeholder="Tutorial"
                  value={entry.tutorialHours}
                  onChange={(e) => updateEntry(index, 'tutorialHours', e.target.value)}
                  className="hours-input"
                  min="0"
                />

                <span className="total-hours">Total: {entry.totalHours}</span>

                <button onClick={() => removeEntry(index)} className="btn-remove">🗑️</button>
              </div>
            ))}

            {entries.length === 0 && (
              <div className="no-entries">
                <p>No subjects added yet. Click "Add Subject" to start.</p>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? '⏳ Saving...' : '✅ Save Timetable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimetableManagement;