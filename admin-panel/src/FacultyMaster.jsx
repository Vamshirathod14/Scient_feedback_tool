import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import './MasterManagement.css';

function FacultyMaster() {
  const [faculties, setFaculties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    facultyId: '',
    facultyName: '',
    email: '',
    phone: '',
    department: '',
    designation: ''
  });

  useEffect(() => {
    loadFaculties();
  }, []);

  const loadFaculties = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/faculty-master`);
      setFaculties(response.data);
      toast.success(`✅ Loaded ${response.data.length} faculties`);
    } catch (error) {
      toast.error('❌ Failed to load faculties');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.facultyId || !formData.facultyName) {
      toast.warning('⚠️ Faculty ID and Name are required');
      return;
    }

    setLoading(true);
    try {
      if (editingFaculty) {
        const response = await axios.put(
          `${API_BASE_URL}/api/faculty-master/${editingFaculty.facultyId}`,
          formData
        );
        if (response.data.success) {
          toast.success('✅ Faculty updated successfully');
        }
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/faculty-master`, formData);
        if (response.data.success) {
          toast.success('✅ Faculty added successfully');
        }
      }
      setShowModal(false);
      resetForm();
      loadFaculties();
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (facultyId) => {
    if (!window.confirm('Are you sure you want to delete this faculty?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.delete(`${API_BASE_URL}/api/faculty-master/${facultyId}`);
      if (response.data.success) {
        toast.success('✅ Faculty deleted successfully');
        loadFaculties();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Failed to delete faculty');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (faculty) => {
    setEditingFaculty(faculty);
    setFormData(faculty);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      facultyId: '',
      facultyName: '',
      email: '',
      phone: '',
      department: '',
      designation: ''
    });
    setEditingFaculty(null);
  };

  const filteredFaculties = faculties.filter(f =>
    f.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.facultyId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.department && f.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="master-management">
      <div className="master-header">
        <h2>👨‍🏫 Faculty Master</h2>
        <button 
          className="btn-add"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
        >
          ➕ Add Faculty
        </button>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder="🔍 Search by name, ID, or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && !faculties.length ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading faculties...</p>
        </div>
      ) : (
        <div className="master-table-container">
          <table className="master-table">
            <thead>
              <tr>
                <th>Faculty ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFaculties.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">No faculties found</td>
                </tr>
              ) : (
                filteredFaculties.map(faculty => (
                  <tr key={faculty.facultyId}>
                    <td className="code">{faculty.facultyId}</td>
                    <td className="name">{faculty.facultyName}</td>
                    <td>{faculty.department || '—'}</td>
                    <td>{faculty.designation || '—'}</td>
                    <td>{faculty.email || '—'}</td>
                    <td>{faculty.phone || '—'}</td>
                    <td className="actions">
                      <button onClick={() => openEditModal(faculty)} className="btn-icon edit" title="Edit">✏️</button>
                      <button onClick={() => handleDelete(faculty.facultyId)} className="btn-icon delete" title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingFaculty ? '✏️ Edit Faculty' : '➕ Add Faculty'}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Faculty ID *</label>
                <input
                  type="text"
                  value={formData.facultyId}
                  onChange={(e) => setFormData({...formData, facultyId: e.target.value.toUpperCase()})}
                  disabled={editingFaculty}
                  placeholder="e.g., FAC001"
                />
              </div>
              <div className="form-group">
                <label>Faculty Name *</label>
                <input
                  type="text"
                  value={formData.facultyName}
                  onChange={(e) => setFormData({...formData, facultyName: e.target.value})}
                  placeholder="Enter full name"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                    placeholder="e.g., CSE"
                  />
                </div>
                <div className="form-group">
                  <label>Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({...formData, designation: e.target.value})}
                    placeholder="e.g., Professor"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? '⏳ Saving...' : '✅ Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FacultyMaster;