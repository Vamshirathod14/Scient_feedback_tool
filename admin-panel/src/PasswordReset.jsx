import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './PasswordReset.css';

function PasswordReset() {
  const [classSel, setClassSel] = useState("");
  const [branchSel, setBranchSel] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const classes = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];
  const branches = ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSM", "AIML", "ECE", "EEE", "CSE-E"];
  const academicYears = ["2025-2026", "2026-2027", "2027-2028", "2028-2029"];

  // Convert academic year to graduation year format
  const convertToGraduationYear = (academicYear, classSel) => {
    if (!academicYear) return "";
    
    const startYear = parseInt(academicYear.split('-')[0]);
    
    if (classSel) {
      const yearPart = classSel.split('-')[0];
      const yearNumber = parseInt(yearPart);
      
      if (!isNaN(yearNumber)) {
        const graduationYear = startYear + (4 - yearNumber);
        return `${startYear}-${graduationYear}`;
      }
    }
    
    return `${startYear}-${startYear + 4}`;
  };

  // Load students with registration status
   const loadStudents = async () => {
  if (!classSel || !branchSel || !academicYear) {
    toast.error("Please select class, branch and academic year first!");
    return;
  }

  setLoading(true);
  try {
    const graduationYear = convertToGraduationYear(academicYear, classSel);
    
    // Use the new endpoint that includes registration status
    const response = await axios.get(`${API_BASE_URL}/admin/students-with-status`, {
      params: {
        class: classSel,
        branch: branchSel,
        academicYear: graduationYear
      }
    });
    
    setStudents(response.data);
    toast.success(`Loaded ${response.data.length} students`);
  } catch (error) {
    console.error('Failed to load students:', error);
    toast.error('Failed to load students');
  } finally {
    setLoading(false);
  }
};

  // Reset password for a student
  const resetStudentPassword = async (student) => {
    if (!window.confirm(`Are you sure you want to reset password for ${student.name} (${student.hallticket})? This will clear their email and password, allowing them to register again.`)) {
      return;
    }

    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.put(`${API_BASE_URL}/admin/reset-student/${student.hallticket}`, {
        academicYear: graduationYear
      });
      
      if (response.data.success) {
        toast.success(`Password reset successful for ${student.name}`);
        // Update local state
        setStudents(prevStudents => 
          prevStudents.map(s => 
            s.hallticket === student.hallticket 
              ? { ...s, registered: false, email: null }
              : s
          )
        );
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Failed to reset password');
      }
    }
  };

  // Filter students based on search term
  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.hallticket.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset all selections
  const resetSelections = () => {
    setClassSel("");
    setBranchSel("");
    setAcademicYear("");
    setStudents([]);
    setSearchTerm("");
  };

  return (
    <div className="password-reset-page">
      <ToastContainer />
      
      <div className="password-reset-header">
        <h2>Student Password Reset Management</h2>
        <p>Reset student passwords and clear registration data for students who have forgotten their credentials</p>
      </div>

      {/* Selection Section */}
      <div className="selection-section">
        <h3>Select Class, Branch and Academic Year</h3>
        <div className="selection-row">
          <select value={classSel} onChange={e => setClassSel(e.target.value)}>
            <option value="">Select Class</option>
            {classes.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          
          <select value={branchSel} onChange={e => setBranchSel(e.target.value)}>
            <option value="">Select Branch</option>
            {branches.map(branch => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>

          <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
            <option value="">Select Academic Year</option>
            {academicYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <button 
            onClick={loadStudents} 
            disabled={!classSel || !branchSel || !academicYear || loading}
            className="btn-load"
          >
            {loading ? 'Loading...' : 'Load Students'}
          </button>

          <button 
            onClick={resetSelections}
            className="btn-reset"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Students List Section */}
      {students.length > 0 && (
        <div className="students-section">
          <div className="section-header">
            <h3>Students List</h3>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name or hallticket..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
            </div>
            <div className="students-count">
              Showing {filteredStudents.length} of {students.length} students
            </div>
          </div>

          <div className="students-table-container">
            <table className="students-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hall Ticket</th>
                  <th>Name</th>
                  <th>Branch</th>
                  <th>Academic Year</th>
                  <th>Registration Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => (
                  <tr key={student.hallticket} className={student.registered ? 'registered' : 'not-registered'}>
                    <td>{index + 1}</td>
                    <td className="hallticket">{student.hallticket}</td>
                    <td className="name">{student.name}</td>
                    <td className="branch">{student.branch}</td>
                    <td className="academic-year">{student.academicYear}</td>
                    <td className="status">
                      <span className={`status-badge ${student.registered ? 'registered' : 'not-registered'}`}>
                        {student.registered ? 'Registered' : 'Not Registered'}
                      </span>
                      {student.registered && student.email && (
                        <div className="email-tooltip">
                          Email: {student.email}
                        </div>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        onClick={() => resetStudentPassword(student)}
                        disabled={!student.registered}
                        className={`btn-reset-password ${student.registered ? 'active' : 'disabled'}`}
                        title={student.registered ? "Reset password and clear registration" : "Student not registered yet"}
                      >
                        {student.registered ? 'Reset Password' : 'Not Registered'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredStudents.length === 0 && (
              <div className="no-results">
                No students found matching your search criteria.
              </div>
            )}
          </div>

          {/* Bulk Actions */}
          <div className="bulk-actions">
            <div className="bulk-info">
              <h4>Quick Actions</h4>
              <p>
                Registered students: {students.filter(s => s.registered).length} / {students.length}
              </p>
            </div>
            <button
              onClick={() => {
                const registeredStudents = students.filter(s => s.registered);
                if (registeredStudents.length === 0) {
                  toast.info('No registered students to reset');
                  return;
                }
                if (window.confirm(`Are you sure you want to reset passwords for all ${registeredStudents.length} registered students? This action cannot be undone.`)) {
                  registeredStudents.forEach(student => {
                    resetStudentPassword(student);
                  });
                }
              }}
              disabled={students.filter(s => s.registered).length === 0}
              className="btn-bulk-reset"
            >
              Reset All Registered Students
            </button>
          </div>
        </div>
      )}

      {/* Instructions Section */}
      <div className="instructions-section">
        <h4>How to Use This Page:</h4>
        <div className="instructions-grid">
          <div className="instruction-card">
            <div className="instruction-icon">1</div>
            <h5>Select Criteria</h5>
            <p>Choose the class, branch, and academic year to filter students</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">2</div>
            <h5>Load Students</h5>
            <p>Click "Load Students" to display all students in the selected criteria</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">3</div>
            <h5>Reset Passwords</h5>
            <p>Click "Reset Password" next to any registered student to clear their login credentials</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">4</div>
            <h5>Search & Filter</h5>
            <p>Use the search box to quickly find specific students by name or hallticket number</p>
          </div>
        </div>

        <div className="important-notes">
          <h5>Important Notes:</h5>
          <ul>
            <li>✅ Resetting a password will clear the student's email and password fields</li>
            <li>✅ The student will need to register again with their hallticket</li>
            <li>✅ This action cannot be undone</li>
            <li>✅ Only registered students (with email) can have their passwords reset</li>
            <li>✅ Students who haven't registered yet will show "Not Registered" status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default PasswordReset;
