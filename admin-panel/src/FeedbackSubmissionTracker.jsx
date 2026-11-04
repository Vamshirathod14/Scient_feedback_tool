import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FeedbackSubmissionTracker.css'; // We'll create this CSS file

function FeedbackSubmissionTracker() {
  const [classes, setClasses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [submissionData, setSubmissionData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load available classes, branches, and academic years
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/classes`);
      setClasses(response.data.classes || []);
      setBranches(response.data.branches || []);
      setAcademicYears(response.data.academicYears || []);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast.error('Failed to load classes and branches');
    }
  };

  // Convert academic year to graduation year format for database
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

  // Load submission data for selected class and academic year
  const loadSubmissionData = async () => {
    if (!selectedClass || !selectedBranch || !selectedAcademicYear) {
      toast.error('Please select class, branch, and academic year');
      return;
    }

    setLoading(true);
    try {
      // Convert academic year to graduation year format for database
      const graduationYear = convertToGraduationYear(selectedAcademicYear, selectedClass);
      
      // Get all students for the selected class, branch, and academic year
      const studentsResponse = await axios.get(`${API_BASE_URL}/admin/students`, {
        params: {
          class: selectedClass,
          branch: selectedBranch,
          academicYear: graduationYear
        }
      });

      // Get feedback submission records
      const submissionResponse = await axios.get(`${API_BASE_URL}/feedback-submissions`, {
        params: {
          class: selectedClass,
          branch: selectedBranch,
          academicYear: graduationYear
        }
      });

      const students = studentsResponse.data;
      const submissions = submissionResponse.data;

      // Map students with their submission status
      const studentStatus = students.map(student => {
        const submission = submissions.find(sub => sub.hallticket === student.hallticket);
        return {
          ...student,
          initialSubmitted: submission ? submission.initial : false,
          finalSubmitted: submission ? submission.final : false,
          initialDate: submission ? submission.initialDate : null,
          finalDate: submission ? submission.finalDate : null
        };
      });

      // Calculate counts
      const initialSubmitted = studentStatus.filter(s => s.initialSubmitted).length;
      const finalSubmitted = studentStatus.filter(s => s.finalSubmitted).length;
      const totalStudents = studentStatus.length;

      setSubmissionData({
        students: studentStatus,
        counts: {
          total: totalStudents,
          initial: {
            submitted: initialSubmitted,
            notSubmitted: totalStudents - initialSubmitted,
            percentage: totalStudents > 0 ? ((initialSubmitted / totalStudents) * 100).toFixed(1) : 0
          },
          final: {
            submitted: finalSubmitted,
            notSubmitted: totalStudents - finalSubmitted,
            percentage: totalStudents > 0 ? ((finalSubmitted / totalStudents) * 100).toFixed(1) : 0
          }
        }
      });

    } catch (error) {
      console.error('Failed to load submission data:', error);
      toast.error('Failed to load submission data');
    } finally {
      setLoading(false);
    }
  };

  // Download PDF report
  const downloadPDFReport = (round = 'both') => {
    if (!submissionData) {
      toast.error('No data to download');
      return;
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('FEEDBACK SUBMISSION REPORT', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Class: ${selectedClass} | Branch: ${selectedBranch} | Academic Year: ${selectedAcademicYear}`, 105, 25, { align: 'center' });
    
    // Summary
    let startY = 35;
    doc.setFont(undefined, 'bold');
    doc.text('SUMMARY', 14, startY);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Total Students: ${submissionData.counts.total}`, 14, startY + 10);
    
    if (round === 'initial' || round === 'both') {
      doc.text(`Initial Round Submitted: ${submissionData.counts.initial.submitted} (${submissionData.counts.initial.percentage}%)`, 14, startY + 17);
      doc.text(`Initial Round Not Submitted: ${submissionData.counts.initial.notSubmitted}`, 14, startY + 24);
    }
    
    if (round === 'final' || round === 'both') {
      doc.text(`Final Round Submitted: ${submissionData.counts.final.submitted} (${submissionData.counts.final.percentage}%)`, 14, startY + 31);
      doc.text(`Final Round Not Submitted: ${submissionData.counts.final.notSubmitted}`, 14, startY + 38);
    }
    
    // Student details table
    startY += 50;
    
    const tableData = submissionData.students.map(student => {
      const row = [
        student.hallticket,
        student.name,
        student.branch
      ];
      
      if (round === 'initial' || round === 'both') {
        row.push(student.initialSubmitted ? 'Yes' : 'No');
        row.push(student.initialDate ? new Date(student.initialDate).toLocaleDateString() : '-');
      }
      
      if (round === 'final' || round === 'both') {
        row.push(student.finalSubmitted ? 'Yes' : 'No');
        row.push(student.finalDate ? new Date(student.finalDate).toLocaleDateString() : '-');
      }
      
      return row;
    });
    
    const headers = ['Hallticket', 'Name', 'Branch'];
    if (round === 'initial' || round === 'both') {
      headers.push('Initial Submitted', 'Initial Date');
    }
    if (round === 'final' || round === 'both') {
      headers.push('Final Submitted', 'Final Date');
    }
    
    autoTable(doc, {
      startY: startY,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [240, 240, 240]
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      }
    });
    
    // Footer
    const finalY = doc.lastAutoTable.finalY + 10;
    const now = new Date();
    doc.setFontSize(10);
    doc.text(`Report generated on: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`, 14, finalY);
    
    // Save PDF
    let filename = `feedback_submission_${selectedClass}_${selectedBranch}_${selectedAcademicYear}`;
    if (round !== 'both') {
      filename += `_${round}_round`;
    }
    filename += '.pdf';
    
    doc.save(filename);
    toast.success('PDF report downloaded successfully!');
  };

  return (
    <div className="feedback-tracker">
      <ToastContainer />
      <h2>Feedback Submission Tracker</h2>
      
      <div className="selection-section">
        <h3>Select Class, Branch and Academic Year</h3>
        <div className="selection-row">
          <select 
            value={selectedClass} 
            onChange={e => setSelectedClass(e.target.value)}
            className="form-select"
          >
            <option value="">Select Class</option>
            {classes.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          
          <select 
            value={selectedBranch} 
            onChange={e => setSelectedBranch(e.target.value)}
            className="form-select"
          >
            <option value="">Select Branch</option>
            {branches.map(branch => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>

          <select 
            value={selectedAcademicYear} 
            onChange={e => setSelectedAcademicYear(e.target.value)}
            className="form-select"
          >
            <option value="">Select Academic Year</option>
            {academicYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <button 
            onClick={loadSubmissionData} 
            disabled={loading || !selectedClass || !selectedBranch || !selectedAcademicYear}
            className="btn-primary"
          >
            {loading ? 'Loading...' : 'Load Data'}
          </button>
        </div>
      </div>

      {submissionData && (
        <div className="submission-results">
          <div className="summary-cards">
            <div className="summary-card">
              <h4>Total Students</h4>
              <div className="count">{submissionData.counts.total}</div>
            </div>
            
            <div className="summary-card">
              <h4>Initial Round</h4>
              <div className="submitted">{submissionData.counts.initial.submitted} Submitted</div>
              <div className="not-submitted">{submissionData.counts.initial.notSubmitted} Not Submitted</div>
              <div className="percentage">{submissionData.counts.initial.percentage}% Completion</div>
            </div>
            
            <div className="summary-card">
              <h4>Final Round</h4>
              <div className="submitted">{submissionData.counts.final.submitted} Submitted</div>
              <div className="not-submitted">{submissionData.counts.final.notSubmitted} Not Submitted</div>
              <div className="percentage">{submissionData.counts.final.percentage}% Completion</div>
            </div>
          </div>

          <div className="download-options">
            <h4>Download Reports</h4>
            <div className="download-buttons">
              <button onClick={() => downloadPDFReport('both')} className="btn-download">
                Download Complete Report (PDF)
              </button>
              <button onClick={() => downloadPDFReport('initial')} className="btn-download">
                Download Initial Round Report (PDF)
              </button>
              <button onClick={() => downloadPDFReport('final')} className="btn-download">
                Download Final Round Report (PDF)
              </button>
            </div>
          </div>

          <div className="student-details">
            <h4>Student Submission Details</h4>
            <div className="round-tabs">
              <button className="tab-active">All Students</button>
            </div>

            <div className="student-table">
              <table>
                <thead>
                  <tr>
                    <th>Hallticket</th>
                    <th>Name</th>
                    <th>Branch</th>
                    <th>Initial Round</th>
                    <th>Initial Date</th>
                    <th>Final Round</th>
                    <th>Final Date</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionData.students.map((student, index) => (
                    <tr key={student.hallticket} className={index % 2 === 0 ? 'even' : 'odd'}>
                      <td>{student.hallticket}</td>
                      <td>{student.name}</td>
                      <td>{student.branch}</td>
                      <td className={student.initialSubmitted ? 'submitted' : 'not-submitted'}>
                        {student.initialSubmitted ? '✓ Submitted' : '✗ Not Submitted'}
                      </td>
                      <td>{student.initialDate ? new Date(student.initialDate).toLocaleDateString() : '-'}</td>
                      <td className={student.finalSubmitted ? 'submitted' : 'not-submitted'}>
                        {student.finalSubmitted ? '✓ Submitted' : '✗ Not Submitted'}
                      </td>
                      <td>{student.finalDate ? new Date(student.finalDate).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .feedback-tracker {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .selection-row {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          align-items: end;
        }

        .form-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          min-width: 150px;
        }

        .btn-primary {
          padding: 8px 16px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-primary:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }

        .summary-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background-color: #f8f9fa;
        }

        .summary-card h4 {
          margin: 0 0 10px 0;
          color: #495057;
        }

        .count {
          font-size: 2em;
          font-weight: bold;
          color: #007bff;
        }

        .submitted {
          color: #28a745;
          font-weight: bold;
        }

        .not-submitted {
          color: #dc3545;
          font-weight: bold;
        }

        .percentage {
          color: #6c757d;
          font-size: 0.9em;
        }

        .download-options {
          margin: 30px 0;
          padding: 20px;
          border: 1px solid #dee2e6;
          border-radius: 8px;
        }

        .download-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn-download {
          padding: 10px 15px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .student-table {
          overflow-x: auto;
          margin-top: 20px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #dee2e6;
        }

        th {
          background-color: #343a40;
          color: white;
          font-weight: bold;
        }

        tr.even {
          background-color: #f8f9fa;
        }

        tr:hover {
          background-color: #e9ecef;
        }

        @media (max-width: 768px) {
          .selection-row {
            flex-direction: column;
          }
          
          .form-select {
            width: 100%;
          }
          
          .download-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

export default FeedbackSubmissionTracker;
