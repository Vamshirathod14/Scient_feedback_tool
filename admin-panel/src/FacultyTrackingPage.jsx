import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import API_BASE_URL from './config/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FacultyTrackingPage.css';

const FacultyTrackingPage = () => {
  const [faculties, setFaculties] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultyHistory, setFacultyHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    class: '',
    branch: '',
    academicYear: ''
  });

  const tableRef = useRef();

  // Sample data for classes, branches, academic years
  const classes = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];
  const branches = ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSM", "AIML", "ECE", "EEE", "CSE-E"];
  const academicYears = ["2025-2028", "2026-2029", "2027-2030", "2028-2031"];

  // Load all faculties
  useEffect(() => {
    loadAllFaculties();
  }, []);

  const loadAllFaculties = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/all-faculties`);
      
      let facultiesData = [];
      
      if (Array.isArray(response.data)) {
        facultiesData = response.data;
      } else if (response.data && Array.isArray(response.data.faculties)) {
        facultiesData = response.data.faculties;
      } else if (response.data && typeof response.data === 'object') {
        facultiesData = Object.values(response.data);
      } else {
        facultiesData = [];
      }
      
      const cleanedFaculties = facultiesData
        .map(faculty => {
          if (typeof faculty === 'string') {
            return faculty.trim();
          }
          return String(faculty || '').trim();
        })
        .filter(faculty => faculty && faculty.length > 0)
        .sort((a, b) => a.localeCompare(b));
      
      setFaculties(cleanedFaculties);
      
    } catch (error) {
      console.error('Failed to load faculties:', error);
      toast.error('Failed to load faculty list');
      setFaculties([]);
    }
  };

  // Load faculty history when faculty is selected
  useEffect(() => {
    if (selectedFaculty) {
      loadFacultyHistory();
    }
  }, [selectedFaculty, filters]);

  const loadFacultyHistory = async () => {
    if (!selectedFaculty) return;

    setLoading(true);
    try {
      const params = {
        faculty: selectedFaculty.trim(),
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });
      
      const response = await axios.get(`${API_BASE_URL}/faculty-history`, { params });
      
      let historyData = [];
      
      if (Array.isArray(response.data)) {
        historyData = response.data;
      }
      
      // Process data to separate initial and final feedback
      const processedData = [];
      const recordMap = new Map(); // To group by subject, class, branch, academic year
      
      historyData.forEach(record => {
        const key = `${record.subject || ''}_${record.class || ''}_${record.branch || ''}_${record.academicYear || ''}`;
        
        if (!recordMap.has(key)) {
          recordMap.set(key, {
            academicYear: record.academicYear || 'N/A',
            class: record.class || record.className || 'N/A',
            branch: record.branch || record.department || 'N/A',
            subject: record.subject || 'N/A',
            studentCount: record.studentCount || record.students || 0,
            subjectsHandled: Array.isArray(record.subjectsHandled) ? record.subjectsHandled : 
                            record.subjectsHandled ? [record.subjectsHandled] : 
                            record.subject ? [record.subject] : [],
            labs: Array.isArray(record.labs) ? record.labs : 
                  record.labs ? [record.labs] : [],
            initialPercentage: 0,
            finalPercentage: 0,
            hasInitial: false,
            hasFinal: false
          });
        }
        
        const existingRecord = recordMap.get(key);
        const round = (record.round || '').toLowerCase();
        const percentage = parseFloat(record.overallPercentage) || 0;
        
        if (round.includes('initial')) {
          existingRecord.initialPercentage = percentage;
          existingRecord.hasInitial = true;
        } else if (round.includes('final')) {
          existingRecord.finalPercentage = percentage;
          existingRecord.hasFinal = true;
        } else {
          // If no round specified, use as both
          existingRecord.initialPercentage = percentage;
          existingRecord.finalPercentage = percentage;
          existingRecord.hasInitial = true;
          existingRecord.hasFinal = true;
        }
      });
      
      // Convert map to array
       const cleanedHistory = historyData
  .filter(record => record.initialPercentage > 0 || record.finalPercentage > 0)
  .map(record => ({
    ...record,
    improvement: record.hasInitial && record.hasFinal 
      ? (record.finalPercentage - record.initialPercentage).toFixed(2)
      : 'N/A',
    hasBothRounds: record.hasInitial && record.hasFinal
  }));

setFacultyHistory(cleanedHistory);
      
      setFacultyHistory(cleanedHistory);
      
    } catch (error) {
      console.error('Failed to load faculty history:', error);
      toast.error('Failed to load faculty history');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      class: '',
      branch: '',
      academicYear: ''
    });
  };

  // Manual faculty search
  const handleManualSearch = (facultyName) => {
    if (facultyName.trim()) {
      setSelectedFaculty(facultyName.trim());
      toast.info(`Searching for: ${facultyName.trim()}`);
    }
  };

  // Calculate overall performance percentage for initial and final
  const calculateOverallPerformance = (history, round = 'final') => {
    if (!history || history.length === 0) return 0;
    
    let validRecords = [];
    if (round === 'initial') {
      validRecords = history.filter(record => record.initialPercentage > 0);
    } else if (round === 'final') {
      validRecords = history.filter(record => record.finalPercentage > 0);
    } else {
      // Average of final, fallback to initial
      validRecords = history.filter(record => record.finalPercentage > 0 || record.initialPercentage > 0);
    }
    
    if (validRecords.length === 0) return 0;
    
    const totalPerformance = validRecords.reduce((sum, record) => {
      if (round === 'initial') {
        return sum + record.initialPercentage;
      } else if (round === 'final') {
        return sum + record.finalPercentage;
      } else {
        // Prefer final, fallback to initial
        return sum + (record.finalPercentage > 0 ? record.finalPercentage : record.initialPercentage);
      }
    }, 0);
    
    return (totalPerformance / validRecords.length).toFixed(2);
  };

  // Calculate average improvement
  const calculateAverageImprovement = (history) => {
    if (!history || history.length === 0) return 0;
    const validRecords = history.filter(record => record.hasBothRounds && record.improvement !== 'N/A');
    if (validRecords.length === 0) return 0;
    const totalImprovement = validRecords.reduce((sum, record) => sum + parseFloat(record.improvement), 0);
    return (totalImprovement / validRecords.length).toFixed(2);
  };

  // Get unique subjects taught by faculty
  const getUniqueSubjects = (history) => {
    if (!history) return [];
    const subjects = new Set();
    history.forEach(record => {
      if (record.subject && record.subject !== 'N/A') subjects.add(record.subject);
      if (record.subjectsHandled) {
        record.subjectsHandled.forEach(subject => {
          if (subject && subject !== 'N/A') subjects.add(subject);
        });
      }
    });
    return Array.from(subjects);
  };

  // Get unique departments taught by faculty
  const getUniqueDepartments = (history) => {
    if (!history) return [];
    const departments = new Set();
    history.forEach(record => {
      if (record.branch && record.branch !== 'N/A') departments.add(record.branch);
    });
    return Array.from(departments);
  };

  // Get performance by class
  const getPerformanceByClass = (history) => {
    if (!history) return {};
    const performanceByClass = {};
    const classCounts = {};
    history.forEach(record => {
      if (record.class && record.class !== 'N/A' && record.finalPercentage > 0) {
        if (!performanceByClass[record.class]) {
          performanceByClass[record.class] = 0;
          classCounts[record.class] = 0;
        }
        performanceByClass[record.class] += record.finalPercentage;
        classCounts[record.class]++;
      }
    });
    Object.keys(performanceByClass).forEach(className => {
      performanceByClass[className] = (performanceByClass[className] / classCounts[className]).toFixed(2);
    });
    return performanceByClass;
  };

  // Generate PDF Report
  const generatePDFReport = () => {
    if (!selectedFaculty || !facultyHistory || facultyHistory.length === 0) {
      toast.error('No data available to generate report');
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Add header with logo and institute info
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(40, 40, 150);
      doc.text("SCIENT INSTITUTE OF TECHNOLOGY", pageWidth / 2, 15, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(80, 80, 180);
      doc.text("(UGC AUTONOMOUS)", pageWidth / 2, 22, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Accredited by NAAC with A+ Grade", pageWidth / 2, 29, { align: "center" });
      doc.text("Affiliated to JNTUH & Approved by AICTE", pageWidth / 2, 36, { align: "center" });
      doc.text("Ibrahimpatnam, Rangareddy, Telangana-501506", pageWidth / 2, 43, { align: "center" });
      
      // Add line separator
      doc.setDrawColor(40, 40, 150);
      doc.setLineWidth(0.8);
      doc.line(14, 48, pageWidth - 14, 48);
      
      let startY = 60;
      
      // Report Title
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text("FACULTY PERFORMANCE TRACKING REPORT", pageWidth / 2, startY, { align: "center" });
      startY += 15;
      
      // Faculty Information
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Faculty Name: ${selectedFaculty}`, 14, startY);
      startY += 7;
      
      doc.setFont(undefined, 'normal');
      if (filters.class) {
        doc.text(`Class: ${filters.class}`, 14, startY);
        startY += 5;
      }
      if (filters.branch) {
        doc.text(`Branch: ${filters.branch}`, 14, startY);
        startY += 5;
      }
      if (filters.academicYear) {
        doc.text(`Academic Year: ${filters.academicYear}`, 14, startY);
        startY += 5;
      }
      
      doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, startY);
      startY += 10;
      
      // Summary Section
      doc.setFont(undefined, 'bold');
      doc.text("SUMMARY", 14, startY);
      startY += 8;
      
      const initialPerformance = calculateOverallPerformance(facultyHistory, 'initial');
      const finalPerformance = calculateOverallPerformance(facultyHistory, 'final');
      const averageImprovement = calculateAverageImprovement(facultyHistory);
      const uniqueSubjects = getUniqueSubjects(facultyHistory);
      const uniqueDepartments = getUniqueDepartments(facultyHistory);
      const performanceByClass = getPerformanceByClass(facultyHistory);
      
      const summaryData = [
        ['Initial Feedback Performance', `${initialPerformance}%`],
        ['Final Feedback Performance', `${finalPerformance}%`],
        ['Average Improvement', `${averageImprovement}%`],
        ['Total Subjects Handled', uniqueSubjects.length],
        ['Departments', uniqueDepartments.join(', ') || 'N/A'],
        ['Total Records', facultyHistory.length],
        ['Classes Taught', Object.keys(performanceByClass).join(', ') || 'N/A']
      ];
      
      autoTable(doc, {
        startY: startY,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 10,
          cellPadding: 3
        },
        margin: { left: 14, right: 14 }
      });
      
      startY = doc.lastAutoTable.finalY + 15;
      
      // Performance by Class Section
      if (Object.keys(performanceByClass).length > 0) {
        doc.setFont(undefined, 'bold');
        doc.text("FINAL PERFORMANCE BY CLASS", 14, startY);
        startY += 8;
        
        const classPerformanceData = Object.entries(performanceByClass).map(([className, performance]) => [
          className,
          `${performance}%`
        ]);
        
        autoTable(doc, {
          startY: startY,
          head: [['Class', 'Final Performance (%)']],
          body: classPerformanceData,
          theme: 'grid',
          headStyles: {
            fillColor: [52, 152, 219],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 10,
            cellPadding: 3
          },
          margin: { left: 14, right: 14 }
        });
        
        startY = doc.lastAutoTable.finalY + 15;
      }
      
      // Detailed History Section
      doc.setFont(undefined, 'bold');
      doc.text("DETAILED TEACHING HISTORY", 14, startY);
      startY += 8;
      
      const tableData = facultyHistory.map(record => [
        record.academicYear || 'N/A',
        record.class || 'N/A',
        record.branch || 'N/A',
        record.subject || 'N/A',
        record.initialPercentage > 0 ? `${record.initialPercentage.toFixed(2)}%` : 'N/A',
        record.finalPercentage > 0 ? `${record.finalPercentage.toFixed(2)}%` : 'N/A',
        record.hasBothRounds ? `${record.improvement}%` : 'N/A',
        record.studentCount || 'N/A'
      ]);
      
      autoTable(doc, {
        startY: startY,
        head: [['Academic Year', 'Class', 'Branch', 'Subject', 'Initial (%)', 'Final (%)', 'Improvement', 'Students']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [44, 62, 80],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        margin: { left: 14, right: 14 },
        pageBreak: 'auto'
      });
      
      // Add footer with page numbers
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
        doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: "center" });
      }
      
      // Save the PDF
      const fileName = `Faculty_Report_${selectedFaculty.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success('PDF report generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report');
    }
  };

  // Generate Detailed Performance PDF
  const generateDetailedPerformancePDF = () => {
    if (!selectedFaculty || !facultyHistory || facultyHistory.length === 0) {
      toast.error('No data available to generate report');
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(40, 40, 150);
      doc.text("DETAILED FACULTY PERFORMANCE ANALYSIS", pageWidth / 2, 15, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(80, 80, 180);
      doc.text(selectedFaculty, pageWidth / 2, 25, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("SCIENT INSTITUTE OF TECHNOLOGY", pageWidth / 2, 32, { align: "center" });
      
      // Line separator
      doc.setDrawColor(40, 40, 150);
      doc.setLineWidth(0.8);
      doc.line(14, 38, pageWidth - 14, 38);
      
      let startY = 50;
      
      // Performance Analysis by Subject
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text("PERFORMANCE ANALYSIS BY SUBJECT", 14, startY);
      startY += 10;
      
      // Group by subject and calculate averages for both rounds
      const subjectPerformance = {};
      facultyHistory.forEach(record => {
        if (!subjectPerformance[record.subject]) {
          subjectPerformance[record.subject] = {
            initialPerformances: [],
            finalPerformances: [],
            improvements: [],
            classes: new Set(),
            hasBothCount: 0
          };
        }
        
        if (record.initialPercentage > 0) {
          subjectPerformance[record.subject].initialPerformances.push(record.initialPercentage);
        }
        if (record.finalPercentage > 0) {
          subjectPerformance[record.subject].finalPerformances.push(record.finalPercentage);
        }
        if (record.hasBothRounds) {
          subjectPerformance[record.subject].improvements.push(parseFloat(record.improvement));
          subjectPerformance[record.subject].hasBothCount++;
        }
        subjectPerformance[record.subject].classes.add(record.class);
      });
      
      const subjectAnalysisData = Object.entries(subjectPerformance).map(([subject, data]) => {
        const avgInitial = data.initialPerformances.length > 0 
          ? (data.initialPerformances.reduce((a, b) => a + b, 0) / data.initialPerformances.length).toFixed(2)
          : 'N/A';
        
        const avgFinal = data.finalPerformances.length > 0 
          ? (data.finalPerformances.reduce((a, b) => a + b, 0) / data.finalPerformances.length).toFixed(2)
          : 'N/A';
        
        const avgImprovement = data.improvements.length > 0
          ? (data.improvements.reduce((a, b) => a + b, 0) / data.improvements.length).toFixed(2)
          : 'N/A';
          
        return [
          subject,
          avgInitial !== 'N/A' ? avgInitial + '%' : 'N/A',
          avgFinal !== 'N/A' ? avgFinal + '%' : 'N/A',
          avgImprovement !== 'N/A' ? avgImprovement + '%' : 'N/A',
          data.classes.size,
          data.hasBothCount
        ];
      });
      
      autoTable(doc, {
        startY: startY,
        head: [['Subject', 'Avg Initial', 'Avg Final', 'Avg Improvement', 'Classes', 'Both Rounds']],
        body: subjectAnalysisData,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        margin: { left: 14, right: 14 }
      });
      
      startY = doc.lastAutoTable.finalY + 15;
      
      // Improvement Analysis
      const recordsWithBothRounds = facultyHistory.filter(record => record.hasBothRounds);
      if (recordsWithBothRounds.length > 0) {
        doc.setFont(undefined, 'bold');
        doc.text("IMPROVEMENT ANALYSIS", 14, startY);
        startY += 8;
        
        const improvementStats = {
          'Significant Improvement (>5%)': recordsWithBothRounds.filter(r => parseFloat(r.improvement) > 5).length,
          'Moderate Improvement (1-5%)': recordsWithBothRounds.filter(r => parseFloat(r.improvement) >= 1 && parseFloat(r.improvement) <= 5).length,
          'No Significant Change (-1 to 1%)': recordsWithBothRounds.filter(r => parseFloat(r.improvement) >= -1 && parseFloat(r.improvement) < 1).length,
          'Decreased Performance (< -1%)': recordsWithBothRounds.filter(r => parseFloat(r.improvement) < -1).length,
          'Total Both Rounds': recordsWithBothRounds.length
        };
        
        const improvementData = Object.entries(improvementStats).map(([category, count]) => [
          category,
          count.toString(),
          `${((count / recordsWithBothRounds.length) * 100).toFixed(1)}%`
        ]);
        
        autoTable(doc, {
          startY: startY,
          head: [['Improvement Category', 'Count', 'Percentage']],
          body: improvementData,
          theme: 'grid',
          headStyles: {
            fillColor: [52, 152, 219],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 9,
            cellPadding: 3
          },
          margin: { left: 14, right: 14 }
        });
      }
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
      }
      
      const fileName = `Detailed_Performance_${selectedFaculty.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success('Detailed performance report generated!');
    } catch (error) {
      console.error('Error generating detailed PDF:', error);
      toast.error('Failed to generate detailed report');
    }
  };

  return (
    <div className="faculty-tracking-page">
      <div className="page-header">
        <h1>Faculty Performance Tracking</h1>
        <p>Track and analyze faculty performance across different classes and subjects with separate Initial and Final feedback</p>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Select Faculty:</label>
          <select 
            value={selectedFaculty} 
            onChange={(e) => setSelectedFaculty(e.target.value)}
            className="faculty-select"
          >
            <option value="">Choose a faculty...</option>
            {faculties.length > 0 ? (
              faculties.map((faculty, index) => (
                <option key={`${faculty}-${index}`} value={faculty}>
                  {faculty}
                </option>
              ))
            ) : (
              <option value="" disabled>No faculties loaded</option>
            )}
          </select>
        </div>

        {/* Manual Search */}
        <div className="filter-group">
          <label>Manual Faculty Search:</label>
          <div className="manual-search-container">
            <input
              type="text"
              placeholder="Enter exact faculty name..."
              id="manualSearchInput"
              className="manual-search-input"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleManualSearch(e.target.value);
                  e.target.value = '';
                }
              }}
            />
            <button 
              onClick={() => {
                const input = document.getElementById('manualSearchInput');
                handleManualSearch(input.value);
                input.value = '';
              }}
              className="manual-search-btn"
            >
              Search
            </button>
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label>Class:</label>
            <select value={filters.class} onChange={(e) => handleFilterChange('class', e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Branch:</label>
            <select value={filters.branch} onChange={(e) => handleFilterChange('branch', e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Academic Year:</label>
            <select value={filters.academicYear} onChange={(e) => handleFilterChange('academicYear', e.target.value)}>
              <option value="">All Years</option>
              {academicYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>

          <button onClick={clearFilters} className="clear-filters-btn">
            Clear Filters
          </button>
        </div>
      </div>

      {/* Report Generation Buttons */}
      {selectedFaculty && facultyHistory && facultyHistory.length > 0 && (
        <div className="report-buttons-section">
          <h3>Generate Reports</h3>
          <div className="report-buttons">
            <button onClick={generatePDFReport} className="report-btn primary">
              📊 Generate Summary PDF Report
            </button>
            <button onClick={generateDetailedPerformancePDF} className="report-btn secondary">
              📈 Generate Detailed Performance PDF
            </button>
          </div>
        </div>
      )}

      {/* Faculty Summary */}
      {selectedFaculty && facultyHistory && (
        <div className="faculty-summary">
          <h2>Faculty Summary: {selectedFaculty}</h2>
          <div className="summary-cards">
            <div className="summary-card">
              <h3>Initial Feedback</h3>
              <div className="performance-score">
                {calculateOverallPerformance(facultyHistory, 'initial')}%
              </div>
              <div className="performance-label">
                Average Initial Performance
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Final Feedback</h3>
              <div className="performance-score">
                {calculateOverallPerformance(facultyHistory, 'final')}%
              </div>
              <div className="performance-label">
                Average Final Performance
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Improvement</h3>
              <div className="performance-score improvement">
                {calculateAverageImprovement(facultyHistory)}%
              </div>
              <div className="performance-label">
                Average Improvement
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Subjects Taught</h3>
              <div className="count">{getUniqueSubjects(facultyHistory).length}</div>
              <div className="subjects-list">
                {getUniqueSubjects(facultyHistory).slice(0, 3).join(', ')}
                {getUniqueSubjects(facultyHistory).length > 3 && '...'}
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Departments</h3>
              <div className="count">{getUniqueDepartments(facultyHistory).length}</div>
              <div className="departments-list">
                {getUniqueDepartments(facultyHistory).join(', ')}
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Total Records</h3>
              <div className="count">{facultyHistory.length}</div>
              <div className="records-info">
                Across {Object.keys(getPerformanceByClass(facultyHistory)).length} classes
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance by Class */}
      {selectedFaculty && facultyHistory && Object.keys(getPerformanceByClass(facultyHistory)).length > 0 && (
        <div className="performance-by-class">
          <h3>Final Performance by Class</h3>
          <div className="class-performance-grid">
            {Object.entries(getPerformanceByClass(facultyHistory)).map(([className, performance]) => (
              <div key={className} className="class-performance-card">
                <div className="class-name">{className}</div>
                <div className="class-performance">{performance}%</div>
                <div className="performance-bar">
                  <div 
                    className="performance-fill" 
                    style={{ width: `${Math.min(performance, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed History Table */}
      {selectedFaculty && (
        <div className="history-section">
          <div className="section-header">
            <h3>Detailed Teaching History (Separate Initial & Final Feedback)</h3>
            <div className="action-buttons">
              <button onClick={loadFacultyHistory} className="refresh-btn" disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading faculty history...</div>
          ) : facultyHistory && facultyHistory.length > 0 ? (
            <div className="table-container" ref={tableRef}>
              <table className="faculty-history-table">
                <thead>
                  <tr>
                    <th>Academic Year</th>
                    <th>Class</th>
                    <th>Branch</th>
                    <th>Subject</th>
                    <th>Initial Feedback (%)</th>
                    <th>Final Feedback (%)</th>
                    <th>Improvement (%)</th>
                    <th>Student Count</th>
                    <th>Subjects Handled</th>
                    <th>Labs</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyHistory.map((record, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'even' : 'odd'}>
                      <td>{record.academicYear}</td>
                      <td>{record.class}</td>
                      <td>{record.branch}</td>
                      <td className="subject-cell">{record.subject}</td>
                      <td>
                        <div className="performance-cell initial">
                          <span className="percentage">
                            {record.initialPercentage > 0 ? `${record.initialPercentage.toFixed(2)}%` : 'N/A'}
                          </span>
                          {record.initialPercentage > 0 && (
                            <div className="performance-bar-small">
                              <div 
                                className="performance-fill-small" 
                                style={{ width: `${Math.min(record.initialPercentage, 100)}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="performance-cell final">
                          <span className="percentage">
                            {record.finalPercentage > 0 ? `${record.finalPercentage.toFixed(2)}%` : 'N/A'}
                          </span>
                          {record.finalPercentage > 0 && (
                            <div className="performance-bar-small">
                              <div 
                                className="performance-fill-small" 
                                style={{ width: `${Math.min(record.finalPercentage, 100)}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={`improvement-cell ${record.hasBothRounds ? (parseFloat(record.improvement) >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
                          {record.hasBothRounds ? `${record.improvement}%` : 'N/A'}
                        </div>
                      </td>
                      <td>{record.studentCount || 'N/A'}</td>
                      <td>
                        {record.subjectsHandled && record.subjectsHandled.length > 0 
                          ? record.subjectsHandled.join(', ')
                          : record.subject || 'N/A'
                        }
                      </td>
                      <td>
                        {record.labs && record.labs.length > 0 
                          ? record.labs.join(', ')
                          : 'No Labs'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data">
              No teaching history found for {selectedFaculty} with the current filters.
            </div>
          )}
        </div>
      )}

      {!selectedFaculty && (
        <div className="placeholder">
          <div className="placeholder-icon">👨‍🏫</div>
          <h3>Select a Faculty to View Details</h3>
          <p>Choose a faculty member from the dropdown above to see their complete teaching history and performance metrics with separate Initial and Final feedback.</p>
        </div>
      )}
    </div>
  );
};

export default FacultyTrackingPage;