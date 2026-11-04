import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './StudentManagement.css';

function StudentManagement() {
  const [classSel, setClassSel] = useState("");
  const [branchSel, setBranchSel] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  
  // Form states
  const [newStudent, setNewStudent] = useState({
    name: "",
    hallticket: "",
    branch: "",
    academicYear: "",
    class: ""
  });
  
  const [editStudent, setEditStudent] = useState({
    name: "",
    hallticket: "",
    branch: ""
  });

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

  // Load students
  const loadStudents = async () => {
    if (!classSel || !branchSel || !academicYear) {
      toast.error("Please select class, branch and academic year first!");
      return;
    }

    setLoading(true);
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.get(`${API_BASE_URL}/admin/students-with-status`, {
        params: {
          class: classSel,
          branch: branchSel,
          academicYear: graduationYear
        }
      });
      
      setStudents(response.data);
      toast.success(`✅ Loaded ${response.data.length} students successfully!`);
    } catch (error) {
      console.error('Failed to load students:', error);
      toast.error('❌ Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Add new student
  const handleAddStudent = async () => {
    // Validation
    if (!newStudent.name || !newStudent.hallticket) {
      toast.warning("⚠️ Name and hallticket are required");
      return;
    }

    if (!/^[A-Z0-9]+$/.test(newStudent.hallticket)) {
      toast.error("❌ Hallticket should contain only uppercase letters and numbers");
      return;
    }

    setLoading(true);
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.post(`${API_BASE_URL}/admin/add-student`, {
        name: newStudent.name,
        hallticket: newStudent.hallticket,
        branch: branchSel,
        academicYear: graduationYear,
        class: classSel
      });

      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`);
        setShowAddModal(false);
        setNewStudent({
          name: "",
          hallticket: "",
          branch: "",
          academicYear: "",
          class: ""
        });
        loadStudents();
      }
    } catch (error) {
      console.error('Error adding student:', error);
      toast.error(error.response?.data?.error || "❌ Failed to add student");
    } finally {
      setLoading(false);
    }
  };

  // Edit student
  const handleEditStudent = async () => {
    if (!editStudent.name || !editStudent.branch) {
      toast.warning("⚠️ Name and branch are required");
      return;
    }

    setLoading(true);
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.put(
        `${API_BASE_URL}/admin/update-student/${editStudent.hallticket}`,
        {
          name: editStudent.name,
          branch: editStudent.branch,
          academicYear: graduationYear,
          class: classSel
        }
      );

      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`);
        setShowEditModal(false);
        setSelectedStudent(null);
        loadStudents();
      }
    } catch (error) {
      console.error('Error updating student:', error);
      toast.error(error.response?.data?.error || "❌ Failed to update student");
    } finally {
      setLoading(false);
    }
  };

  // Delete single student
  const handleDeleteStudent = async (hallticket) => {
    if (!window.confirm("Are you sure you want to delete this student?")) {
      return;
    }

    setLoading(true);
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.delete(
        `${API_BASE_URL}/admin/delete-student/${hallticket}`,
        {
          params: { academicYear: graduationYear }
        }
      );

      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`);
        loadStudents();
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error(error.response?.data?.error || "❌ Failed to delete student");
    } finally {
      setLoading(false);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedStudents.length === 0) {
      toast.warning("⚠️ No students selected");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedStudents.length} selected students?`)) {
      return;
    }

    setLoading(true);
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const response = await axios.post(
        `${API_BASE_URL}/admin/bulk-delete-students`,
        {
          halltickets: selectedStudents,
          academicYear: graduationYear
        }
      );

      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`);
        setSelectedStudents([]);
        loadStudents();
      }
    } catch (error) {
      console.error('Error bulk deleting students:', error);
      toast.error(error.response?.data?.error || "❌ Failed to delete students");
    } finally {
      setLoading(false);
    }
  };

  // Toggle student selection
  const toggleSelectStudent = (hallticket) => {
    setSelectedStudents(prev =>
      prev.includes(hallticket)
        ? prev.filter(h => h !== hallticket)
        : [...prev, hallticket]
    );
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.hallticket));
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
    setSelectedStudents([]);
    toast.info("🔄 Filters cleared");
  };

  // Open edit modal
  const openEditModal = (student) => {
    setEditStudent({
      name: student.name,
      hallticket: student.hallticket,
      branch: student.branch
    });
    setSelectedStudent(student);
    setShowEditModal(true);
  };

  return (
    <div className="student-management-page">
      {/* Header */}
      <div className="page-header">
        <h2>📚 Student Management</h2>
        <p>Add, edit, and delete students in the selected class</p>
      </div>

      {/* Selection Section */}
      <div className="selection-section">
        <h3>Select Class, Branch and Academic Year</h3>
        <div className="selection-row">
          <select 
            value={classSel} 
            onChange={e => {
              setClassSel(e.target.value);
              toast.info(`📋 Selected class: ${e.target.value}`);
            }}
          >
            <option value="">Select Class</option>
            {classes.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          
          <select 
            value={branchSel} 
            onChange={e => {
              setBranchSel(e.target.value);
              toast.info(`🏢 Selected branch: ${e.target.value}`);
            }}
          >
            <option value="">Select Branch</option>
            {branches.map(branch => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>

          <select 
            value={academicYear} 
            onChange={e => {
              setAcademicYear(e.target.value);
              toast.info(`📅 Selected academic year: ${e.target.value}`);
            }}
          >
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
            {loading ? '⏳ Loading...' : '📋 Load Students'}
          </button>

          <button onClick={resetSelections} className="btn-reset">
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Students List Section */}
      {students.length > 0 && (
        <div className="students-section">
          <div className="section-header">
            <div className="header-left">
              <h3>📋 Students List - {classSel} {branchSel} ({academicYear})</h3>
              <div className="students-count">
                Total: <strong>{students.length}</strong> students | 
                Registered: <strong className="registered-count">{students.filter(s => s.registered).length}</strong> | 
                Not Registered: <strong className="not-registered-count">{students.filter(s => !s.registered).length}</strong>
              </div>
            </div>
            <div className="header-actions">
              <button 
                onClick={() => {
                  setShowAddModal(true);
                  toast.info("➕ Fill in the details to add a new student");
                }}
                className="btn-add"
                disabled={loading}
              >
                ➕ Add Student
              </button>
              {selectedStudents.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="btn-bulk-delete"
                  disabled={loading}
                >
                  🗑️ Delete Selected ({selectedStudents.length})
                </button>
              )}
            </div>
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Search by name or hallticket..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="students-table-container">
            <table className="students-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>#</th>
                  <th>Hall Ticket</th>
                  <th>Name</th>
                  <th>Branch</th>
                  <th>Academic Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => (
                  <tr key={student.hallticket}>
                    <td className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.hallticket)}
                        onChange={() => toggleSelectStudent(student.hallticket)}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td className="hallticket">{student.hallticket}</td>
                    <td className="name">{student.name}</td>
                    <td className="branch">{student.branch}</td>
                    <td className="academic-year">{student.academicYear}</td>
                    <td className="actions">
                      <button
                        onClick={() => {
                          openEditModal(student);
                          toast.info(`✏️ Editing: ${student.name}`);
                        }}
                        className="btn-icon edit"
                        title="Edit student"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student.hallticket)}
                        className="btn-icon delete"
                        title="Delete student"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredStudents.length === 0 && (
              <div className="no-results">
                <p>🔍 No students found matching your search criteria.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Students Selected Message */}
      {classSel && branchSel && academicYear && students.length === 0 && !loading && (
        <div className="no-students-message">
          <p>📭 No students found for the selected criteria.</p>
          <p>Click <strong>"Add Student"</strong> to add a new student to this class.</p>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>➕ Add New Student</h3>
              <button className="close-btn" onClick={() => {
                setShowAddModal(false);
                toast.info("❌ Addition cancelled");
              }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({...newStudent, name: e.target.value})}
                  placeholder="Enter student full name"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Hallticket *</label>
                <input
                  type="text"
                  value={newStudent.hallticket}
                  onChange={(e) => setNewStudent({...newStudent, hallticket: e.target.value.toUpperCase()})}
                  placeholder="Enter hallticket (e.g., 25C01A7301)"
                />
              </div>
              <div className="form-info">
                <p>📌 Student will be added to:</p>
                <ul>
                  <li><strong>Class:</strong> {classSel}</li>
                  <li><strong>Branch:</strong> {branchSel}</li>
                  <li><strong>Academic Year:</strong> {academicYear}</li>
                </ul>
                <p className="note">ℹ️ Default password will be the hallticket number</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowAddModal(false);
                toast.info("❌ Addition cancelled");
              }}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={handleAddStudent}
                disabled={loading}
              >
                {loading ? "⏳ Adding..." : "✅ Add Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditModal && selectedStudent && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>✏️ Edit Student</h3>
              <button className="close-btn" onClick={() => {
                setShowEditModal(false);
                toast.info("❌ Edit cancelled");
              }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Hallticket</label>
                <input
                  type="text"
                  value={editStudent.hallticket}
                  disabled
                  className="disabled"
                />
              </div>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={editStudent.name}
                  onChange={(e) => setEditStudent({...editStudent, name: e.target.value})}
                  placeholder="Enter student name"
                />
              </div>
              <div className="form-group">
                <label>Branch *</label>
                <input
                  type="text"
                  value={editStudent.branch}
                  onChange={(e) => setEditStudent({...editStudent, branch: e.target.value})}
                  placeholder="Enter branch"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowEditModal(false);
                toast.info("❌ Edit cancelled");
              }}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={handleEditStudent}
                disabled={loading}
              >
                {loading ? "⏳ Updating..." : "✅ Update Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Section */}
      <div className="instructions-section">
        <h4>📖 How to Use This Page:</h4>
        <div className="instructions-grid">
          <div className="instruction-card">
            <div className="instruction-icon">1</div>
            <h5>Select Class</h5>
            <p>Choose class, branch, and academic year to filter students</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">2</div>
            <h5>Load Students</h5>
            <p>Click "Load Students" to display all students in the selected class</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">3</div>
            <h5>Add Student</h5>
            <p>Click "Add Student" to add a new student to the current class</p>
          </div>
          <div className="instruction-card">
            <div className="instruction-icon">4</div>
            <h5>Manage Students</h5>
            <p>Use ✏️ to edit or 🗑️ to delete individual students</p>
          </div>
        </div>

        <div className="important-notes">
          <h5>📌 Important Notes:</h5>
          <ul>
            <li>✅ Add individual students for middle-of-year admissions</li>
            <li>✅ Edit student information when corrections are needed</li>
            <li>✅ Use checkboxes for bulk delete operations</li>
            <li>✅ Default password for new students is their hallticket number</li>
            <li>✅ Deleted students cannot be recovered</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default StudentManagement;