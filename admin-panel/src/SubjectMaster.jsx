import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import './MasterManagement.css';

function SubjectMaster() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    subjectCode: '',
    subjectName: '',
    credits: '',
    type: 'theory'
  });

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/subject-master`);
      setSubjects(response.data);
      toast.success(`✅ Loaded ${response.data.length} subjects`);
    } catch (error) {
      toast.error('❌ Failed to load subjects');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.subjectCode || !formData.subjectName) {
      toast.warning('⚠️ Subject Code and Name are required');
      return;
    }

    setLoading(true);
    try {
      if (editingSubject) {
        const response = await axios.put(
          `${API_BASE_URL}/api/subject-master/${editingSubject.subjectCode}`,
          formData
        );
        if (response.data.success) {
          toast.success('✅ Subject updated successfully');
        }
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/subject-master`, formData);
        if (response.data.success) {
          toast.success('✅ Subject added successfully');
        }
      }
      setShowModal(false);
      resetForm();
      loadSubjects();
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (subjectCode) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.delete(`${API_BASE_URL}/api/subject-master/${subjectCode}`);
      if (response.data.success) {
        toast.success('✅ Subject deleted successfully');
        loadSubjects();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Failed to delete subject');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (subject) => {
    setEditingSubject(subject);
    setFormData(subject);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      subjectCode: '',
      subjectName: '',
      credits: '',
      type: 'theory'
    });
    setEditingSubject(null);
  };

  const filteredSubjects = subjects.filter(s =>
    s.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.subjectCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="master-management">
      <div className="master-header">
        <h2>📚 Subject Master</h2>
        <button 
          className="btn-add"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
        >
          ➕ Add Subject
        </button>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder="🔍 Search by code or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && !subjects.length ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading subjects...</p>
        </div>
      ) : (
        <div className="master-table-container">
          <table className="master-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Credits</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan="5" className="no-data">No subjects found</td>
                </tr>
              ) : (
                filteredSubjects.map(subject => (
                  <tr key={subject.subjectCode}>
                    <td className="code">{subject.subjectCode}</td>
                    <td className="name">{subject.subjectName}</td>
                    <td>{subject.credits || '—'}</td>
                    <td>
                      <span className={`type-badge ${subject.type || 'theory'}`}>
                        {subject.type || 'theory'}
                      </span>
                    </td>
                    <td className="actions">
                      <button onClick={() => openEditModal(subject)} className="btn-icon edit" title="Edit">✏️</button>
                      <button onClick={() => handleDelete(subject.subjectCode)} className="btn-icon delete" title="Delete">🗑️</button>
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
              <h3>{editingSubject ? '✏️ Edit Subject' : '➕ Add Subject'}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Subject Code *</label>
                <input
                  type="text"
                  value={formData.subjectCode}
                  onChange={(e) => setFormData({...formData, subjectCode: e.target.value.toUpperCase()})}
                  disabled={editingSubject}
                  placeholder="e.g., CS101"
                />
              </div>
              <div className="form-group">
                <label>Subject Name *</label>
                <input
                  type="text"
                  value={formData.subjectName}
                  onChange={(e) => setFormData({...formData, subjectName: e.target.value})}
                  placeholder="Enter subject name"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Credits</label>
                  <input
                    type="number"
                    value={formData.credits}
                    onChange={(e) => setFormData({...formData, credits: e.target.value})}
                    placeholder="e.g., 3"
                    min="0"
                    max="10"
                  />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="theory">Theory</option>
                    <option value="lab">Lab</option>
                    <option value="elective">Elective</option>
                  </select>
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

export default SubjectMaster;