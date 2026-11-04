import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import './FacultyNameCorrection.css';

const FacultyNameCorrection = () => {
  const [faculties, setFaculties] = useState([]);
  const [groupedFaculties, setGroupedFaculties] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [correctName, setCorrectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [classFilter, setClassFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [academicYearFilter, setAcademicYearFilter] = useState('');

  const classes = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];
  const branches = ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSM", "AIML", "ECE", "EEE", "CSE-E"];
  const academicYears = ["2025-2026", "2026-2027", "2027-2028", "2028-2029"];

  // Load all faculties
  useEffect(() => {
    loadAllFaculties();
  }, []);

  const loadAllFaculties = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/all-faculties`);
      
      // Filter and sort faculties
      const filteredFaculties = response.data
        .filter(faculty => faculty && typeof faculty === 'string' && faculty.trim() !== '')
        .sort((a, b) => a.localeCompare(b));
      
      setFaculties(filteredFaculties);
      
      // Auto-group similar faculty names
      groupSimilarFaculties(filteredFaculties);
      
    } catch (error) {
      console.error('Failed to load faculties:', error);
      toast.error('Failed to load faculty data');
    } finally {
      setLoading(false);
    }
  };

  // Group similar faculty names
  const groupSimilarFaculties = (facultyList) => {
    const groups = {};
    
    facultyList.forEach(faculty => {
      if (!faculty || typeof faculty !== 'string') return;
      
      // Create a normalized key for grouping
      const normalized = faculty
        .toLowerCase()
        .replace(/[.\s]/g, '') // Remove dots and spaces
        .replace(/dr/g, '') // Remove titles
        .replace(/prof/g, '')
        .trim();
      
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      
      // Avoid duplicates in the same group
      if (!groups[normalized].some(f => f.name === faculty)) {
        groups[normalized].push({
          name: faculty,
          original: faculty
        });
      }
    });
    
    // Convert to array and filter groups with variations
    const groupedArray = Object.entries(groups)
      .filter(([key, variations]) => variations.length > 1)
      .map(([key, variations]) => ({
        key,
        variations: variations.sort((a, b) => a.name.localeCompare(b.name))
      }));
    
    setGroupedFaculties(groupedArray);
  };

  // Get faculty details by class, branch, and academic year
  const getFacultyDetails = async (facultyName) => {
    try {
      const params = {
        faculty: facultyName
      };
      
      if (classFilter) params.class = classFilter;
      if (branchFilter) params.branch = branchFilter;
      if (academicYearFilter) params.academicYear = academicYearFilter;

      const response = await axios.get(`${API_BASE_URL}/faculty-history`, { params });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching faculty details:', error);
      return [];
    }
  };

  // Preview changes
  const getPreview = async (originalName, newName) => {
    if (!originalName || !newName) {
      toast.error('Please select original faculty name and enter correct name');
      return;
    }

    if (originalName === newName) {
      toast.error('Original and new names are the same');
      return;
    }

    try {
      setLoading(true);
      
      // Get current records for the original name
      const originalRecords = await getFacultyDetails(originalName);
      
      setPreview({
        originalName,
        newName,
        subjectsCount: originalRecords.length,
        feedbacksCount: originalRecords.reduce((sum, record) => sum + (record.studentCount || 0), 0),
        affectedRecords: originalRecords
      });
      
    } catch (error) {
      console.error('Failed to get preview:', error);
      toast.error('Failed to get preview');
    } finally {
      setLoading(false);
    }
  };

  // Apply name correction
  const applyCorrection = async (originalName, newName) => {
    if (!originalName || !newName) {
      toast.error('Please select original faculty name and enter correct name');
      return;
    }

    if (originalName === newName) {
      toast.error('Original and new names are the same');
      return;
    }

    if (!window.confirm(`Are you sure you want to rename "${originalName}" to "${newName}"? This will affect all related records.`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Update subjects
      await axios.put(`${API_BASE_URL}/update-faculty-name`, {
        originalName,
        newName,
        class: classFilter,
        branch: branchFilter,
        academicYear: academicYearFilter
      });

      toast.success(`Successfully renamed "${originalName}" to "${newName}"`);
      setPreview(null);
      setCorrectName('');
      setSelectedFaculty('');
      
      // Reload data
      loadAllFaculties();
      
    } catch (error) {
      console.error('Failed to correct faculty name:', error);
      if (error.response?.data?.error) {
        toast.error(`Failed: ${error.response.data.error}`);
      } else {
        toast.error('Failed to correct faculty name');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-suggest correct name
  const suggestCorrectName = (variations) => {
    if (!variations || variations.length === 0) return '';
    
    // Find the most complete version
    const sorted = [...variations].sort((a, b) => {
      const scoreA = getNameScore(a.name);
      const scoreB = getNameScore(b.name);
      return scoreB - scoreA;
    });
    
    return sorted[0].name;
  };

  const getNameScore = (name) => {
    if (!name) return 0;
    
    let score = 0;
    if (name.includes('.')) score += 2; // Prefer names with dots
    if (name === name.toUpperCase()) score -= 1; // Penalize all caps
    if (name.match(/^[A-Z][a-z]+/)) score += 1; // Prefer proper case
    if (name.includes('Dr.')) score += 3; // Prefer titles
    if (name.includes('Prof.')) score += 3; // Prefer titles
    if (name.length > 3) score += 1; // Prefer longer names
    return score;
  };

  // Clear all filters
  const clearFilters = () => {
    setClassFilter('');
    setBranchFilter('');
    setAcademicYearFilter('');
  };

  return (
    <div className="faculty-correction-page">
      <div className="page-header">
        <h1>Faculty Name Correction</h1>
        <p>Fix spelling variations and merge duplicate faculty records</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <h3>Filter by Class/Branch/Year</h3>
        <div className="filter-row">
          <div className="filter-group">
            <label>Class:</label>
            <select 
              value={classFilter} 
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All Classes</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Branch:</label>
            <select 
              value={branchFilter} 
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Academic Year:</label>
            <select 
              value={academicYearFilter} 
              onChange={(e) => setAcademicYearFilter(e.target.value)}
            >
              <option value="">All Years</option>
              {academicYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <button onClick={clearFilters} className="clear-filters-btn">
            Clear Filters
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-section">
        <div className="stat-card">
          <h3>Total Faculties</h3>
          <div className="stat-number">{faculties.length}</div>
        </div>
        <div className="stat-card">
          <h3>Groups with Variations</h3>
          <div className="stat-number">{groupedFaculties.length}</div>
        </div>
        <div className="stat-card">
          <h3>Total Variations</h3>
          <div className="stat-number">
            {groupedFaculties.reduce((sum, group) => sum + group.variations.length, 0)}
          </div>
        </div>
      </div>

      {/* Faculty Groups with Variations */}
      <div className="faculty-groups">
        <h2>Faculty Name Variations</h2>
        
        {groupedFaculties.length === 0 && !loading && (
          <div className="no-variations">
            🎉 No name variations found! All faculty names are consistent.
          </div>
        )}

        {groupedFaculties.map((group, index) => (
          <div key={group.key} className="faculty-group">
            <div className="group-header">
              <h3>Similar Names Group {index + 1}</h3>
              <span className="variation-count">{group.variations.length} variations</span>
            </div>
            
            <div className="variations-list">
              {group.variations.map((variation, idx) => (
                <div key={idx} className="variation-item">
                  <span className="faculty-name">{variation.name}</span>
                  <span className="variation-index">Variation {idx + 1}</span>
                </div>
              ))}
            </div>

            <div className="correction-controls">
              <div className="suggestion">
                <strong>Suggested name:</strong> 
                <span className="suggested-name">
                  {suggestCorrectName(group.variations)}
                </span>
              </div>
              
              <div className="action-buttons">
                <input
                  type="text"
                  placeholder="Enter correct faculty name..."
                  value={correctName}
                  onChange={(e) => setCorrectName(e.target.value)}
                  className="name-input"
                />
                
                <button
                  onClick={() => getPreview(group.variations[0].name, correctName || suggestCorrectName(group.variations))}
                  className="preview-btn"
                  disabled={!correctName && group.variations.length === 0}
                >
                  Preview Changes
                </button>
                
                <button
                  onClick={() => applyCorrection(group.variations[0].name, correctName || suggestCorrectName(group.variations))}
                  className="apply-btn"
                  disabled={!correctName && group.variations.length === 0}
                >
                  Apply Correction
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="quick-actions">
              <strong>Quick merge to "{suggestCorrectName(group.variations)}":</strong>
              {group.variations.slice(1).map((variation, idx) => (
                <button
                  key={idx}
                  onClick={() => applyCorrection(variation.name, suggestCorrectName(group.variations))}
                  className="quick-merge-btn"
                >
                  Merge "{variation.name}"
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Preview Section */}
      {preview && (
        <div className="preview-section">
          <h3>Preview Changes</h3>
          <div className="preview-content">
            <div className="preview-stats">
              <div><strong>Changing:</strong> "{preview.originalName}" → "{preview.newName}"</div>
              <div><strong>Subjects affected:</strong> {preview.subjectsCount}</div>
              <div><strong>Feedback records affected:</strong> {preview.feedbacksCount}</div>
              <div><strong>Total records to update:</strong> {preview.subjectsCount + preview.feedbacksCount}</div>
            </div>
            
            {preview.affectedRecords && preview.affectedRecords.length > 0 && (
              <div className="affected-records">
                <h4>Affected Records:</h4>
                <div className="records-list">
                  {preview.affectedRecords.slice(0, 5).map((record, idx) => (
                    <div key={idx} className="record-item">
                      {record.class} - {record.branch} - {record.subject}
                    </div>
                  ))}
                  {preview.affectedRecords.length > 5 && (
                    <div className="more-records">... and {preview.affectedRecords.length - 5} more</div>
                  )}
                </div>
              </div>
            )}
            
            <div className="preview-actions">
              <button
                onClick={() => applyCorrection(preview.originalName, preview.newName)}
                className="confirm-btn"
              >
                Confirm Changes
              </button>
              <button
                onClick={() => setPreview(null)}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Processing...</div>
        </div>
      )}
    </div>
  );
};

export default FacultyNameCorrection;
