import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Pie, Bar } from "react-chartjs-2";
import FeedbackSubmissionTracker from './FeedbackSubmissionTracker';
import PasswordReset from './PasswordReset';
import AdminLogin from './AdminLogin';
import FacultyTrackingPage from './FacultyTrackingPage';
import FacultyNameCorrection from "./FacultyNameCorrection";
import StudentManagement from './StudentManagement';
import FacultyMaster from './FacultyMaster';
import SubjectMaster from './SubjectMaster';
import TimetableManagement from './TimetableManagement';

import './App.css'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from "chart.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import reportLogo from './vamshi.PNG';
import API_BASE_URL from './config/api';

// Register ChartJS components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminInfo, setAdminInfo] = useState(null);
  const [studentsFileName, setStudentsFileName] = useState("");
  const [subjectsFileName, setSubjectsFileName] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [currentView, setCurrentView] = useState('admin');
  const [studentsFile, setStudentsFile] = useState(null);
  const [subjectsFile, setSubjectsFile] = useState(null);
  
  // =============================================
  // NEW: Upload Progress State
  // =============================================
  const [uploadProgress, setUploadProgress] = useState({
    show: false,
    current: 0,
    total: 0,
    message: '',
    status: 'idle' // idle, uploading, complete, error
  });
  
  // =============================================
  // NEW: Track uploaded files to prevent duplicates
  // =============================================
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  const [classSel, setClassSel] = useState("");
  const [branchSel, setBranchSel] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [facultyName, setFacultyName] = useState("");
  const [performance, setPerformance] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [facultyData, setFacultyData] = useState(null);
  const [classes] = useState(["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"]);
  const [branches] = useState(["CSE-A", "CSE-B", "CSE-C","CSE-D","CSM","AIML","ECE","EEE","CSE-E"]);
  const [academicYears] = useState(["2025-2026", "2026-2027", "2027-2028", "2028-2029"]);
  const [feedbackCounts, setFeedbackCounts] = useState({
    initial: { submitted: 0, total: 0 },
    final: { submitted: 0, total: 0 }
  });
  const [selectedRound, setSelectedRound] = useState("initial");
  const [roundStatus, setRoundStatus] = useState({
    initialEnabled: true,
    finalEnabled: false,
    initialEndDate: null,
    finalEndDate: null
  });
  const [reportType, setReportType] = useState("faculty");
  const [classReportData, setClassReportData] = useState(null);
  const [departmentReportData, setDepartmentReportData] = useState(null);

  // Check if admin is already logged in on component mount
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const savedAdminInfo = localStorage.getItem('adminInfo');
    
    if (token && savedAdminInfo) {
      setAdminInfo(JSON.parse(savedAdminInfo));
      setIsAuthenticated(true);
      
      // Set authorization header for all requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  const handleLogin = (admin) => {
    setAdminInfo(admin);
    setIsAuthenticated(true);
    
    // Set authorization header for all requests
    axios.defaults.headers.common['Authorization'] = `Bearer ${localStorage.getItem('adminToken')}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminInfo');
    setIsAuthenticated(false);
    setAdminInfo(null);
    delete axios.defaults.headers.common['Authorization'];
    toast.info('Logged out successfully');
  };

  // Function to convert academic year to graduation year format for database
  const convertToGraduationYear = (academicYear, classSel) => {
    if (!academicYear) return "";
    
    if (/^\d{4}-\d{4}$/.test(academicYear)) {
      return academicYear;
    }
    
    const startYear = parseInt(academicYear.split('-')[0]);
    
    if (classSel) {
      const yearPart = classSel.split('-')[0];
      const yearNumber = parseInt(yearPart);
      
      if (!isNaN(yearNumber)) {
        const graduationYear = startYear + (4 - yearNumber);
        return `${startYear}-${graduationYear}`;
      }
    }
    
    return academicYear;
  };

  // Load feedback counts and round status when class, branch and academic year are selected
  useEffect(() => {
    if (classSel && branchSel && academicYear) {
      loadFeedbackCounts();
      loadRoundStatus();
      loadFacultyList();
    }
  }, [classSel, branchSel, academicYear]);

  // =============================================
  // NEW: Check if file already uploaded
  // =============================================
  const isFileAlreadyUploaded = (fileName, classSel, branchSel, academicYear) => {
    return uploadedFiles.some(file => 
      file.name === fileName && 
      file.class === classSel && 
      file.branch === branchSel && 
      file.academicYear === academicYear
    );
  };

  // =============================================
  // NEW: Add file to uploaded list
  // =============================================
  const addToUploadedFiles = (fileName, classSel, branchSel, academicYear) => {
    setUploadedFiles(prev => [...prev, {
      name: fileName,
      class: classSel,
      branch: branchSel,
      academicYear: academicYear,
      uploadedAt: new Date().toLocaleString()
    }]);
  };

  const handleStudentsFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setStudentsFile(file);
      setStudentsFileName(file.name);
      toast.info(`Selected: ${file.name}`);
    }
  };

  const handleSubjectsFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSubjectsFile(file);
      setSubjectsFileName(file.name);
      toast.info(`Selected: ${file.name}`);
    }
  };

  // Upload students csv - WITH PROGRESS BAR
  const uploadStudents = async () => {
    if (!studentsFile) {
      toast.error("Please select a file first!");
      return;
    }
    if (!classSel || !branchSel || !academicYear) {
      toast.error("Please select class, branch and academic year first!");
      return;
    }

    // =============================================
    // NEW: Check for duplicate upload
    // =============================================
    if (isFileAlreadyUploaded(studentsFile.name, classSel, branchSel, academicYear)) {
      toast.error(`⚠️ File "${studentsFile.name}" has already been uploaded for ${classSel} ${branchSel} ${academicYear}!`);
      return;
    }

    setUploadLoading(true);
    
    // =============================================
    // NEW: Show progress bar
    // =============================================
    setUploadProgress({
      show: true,
      current: 0,
      total: 100,
      message: 'Preparing to upload students...',
      status: 'uploading'
    });

    const graduationYear = convertToGraduationYear(academicYear, classSel);
    
    const formData = new FormData();
    formData.append("file", studentsFile);
    formData.append("class", classSel);
    formData.append("branch", branchSel);
    formData.append("academicYear", graduationYear);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/upload-students`, formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress({
            show: true,
            current: progress,
            total: 100,
            message: `Uploading students... ${progress}%`,
            status: 'uploading'
          });
        }
      });
      
      // =============================================
      // NEW: Mark as uploaded
      // =============================================
      addToUploadedFiles(studentsFile.name, classSel, branchSel, academicYear);
      
      setUploadProgress({
        show: true,
        current: 100,
        total: 100,
        message: `✅ ${response.data.message}`,
        status: 'complete'
      });
      
      toast.success(`✅ ${response.data.message}`);
      console.log('Upload response:', response.data);
      
      // Clear file after successful upload
      setStudentsFile(null);
      setStudentsFileName("");
      document.querySelector('input[type="file"][accept=".csv"]').value = "";
      
      loadFeedbackCounts();
      
      // =============================================
      // NEW: Hide progress after 5 seconds
      // =============================================
      setTimeout(() => {
        setUploadProgress({ show: false, current: 0, total: 0, message: '', status: 'idle' });
      }, 5000);
      
    } catch (error) {
      console.error('Upload error:', error);
      
      setUploadProgress({
        show: true,
        current: 0,
        total: 0,
        message: `❌ Failed: ${error.response?.data?.error || error.message}`,
        status: 'error'
      });
      
      toast.error(`❌ Failed to upload students: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // Upload subjects+faculties csv - WITH PROGRESS BAR
  const uploadSubjects = async () => {
    if (!subjectsFile) {
      toast.error("Please select a file first!");
      return;
    }
    if (!classSel || !branchSel || !academicYear) {
      toast.error("Please select class, branch and academic year first!");
      return;
    }

    // =============================================
    // NEW: Check for duplicate upload
    // =============================================
    if (isFileAlreadyUploaded(subjectsFile.name, classSel, branchSel, academicYear)) {
      toast.error(`⚠️ File "${subjectsFile.name}" has already been uploaded for ${classSel} ${branchSel} ${academicYear}!`);
      return;
    }

    setUploadLoading(true);
    
    // =============================================
    // NEW: Show progress bar
    // =============================================
    setUploadProgress({
      show: true,
      current: 0,
      total: 100,
      message: 'Preparing to upload subjects...',
      status: 'uploading'
    });

    const graduationYear = convertToGraduationYear(academicYear, classSel);
    
    const formData = new FormData();
    formData.append("file", subjectsFile);
    formData.append("class", classSel);
    formData.append("branch", branchSel);
    formData.append("academicYear", graduationYear);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/upload-subjects`, formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress({
            show: true,
            current: progress,
            total: 100,
            message: `Uploading subjects... ${progress}%`,
            status: 'uploading'
          });
        }
      });
      
      // =============================================
      // NEW: Mark as uploaded
      // =============================================
      addToUploadedFiles(subjectsFile.name, classSel, branchSel, academicYear);
      
      setUploadProgress({
        show: true,
        current: 100,
        total: 100,
        message: `✅ ${response.data.message}`,
        status: 'complete'
      });
      
      toast.success(`✅ ${response.data.message}`);
      console.log('Upload response:', response.data);
      
      // Clear file after successful upload
      setSubjectsFile(null);
      setSubjectsFileName("");
      document.querySelectorAll('input[type="file"][accept=".csv"]')[1].value = "";
      
      loadFacultyList();
      enableRound('initial', true);
      
      // =============================================
      // NEW: Hide progress after 5 seconds
      // =============================================
      setTimeout(() => {
        setUploadProgress({ show: false, current: 0, total: 0, message: '', status: 'idle' });
      }, 5000);
      
    } catch (error) {
      console.error('Upload error:', error);
      
      setUploadProgress({
        show: true,
        current: 0,
        total: 0,
        message: `❌ Failed: ${error.response?.data?.error || error.message}`,
        status: 'error'
      });
      
      toast.error(`❌ Failed to upload subjects: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // Load list of all faculties
  const loadFacultyList = async () => {
    if (!classSel || !branchSel || !academicYear) {
      return;
    }
    
    const graduationYear = convertToGraduationYear(academicYear, classSel);
    
    try {
      const res = await axios.get(`${API_BASE_URL}/faculties?class=${classSel}&branch=${branchSel}&academicYear=${graduationYear}`);
      setFacultyList(res.data);
    } catch (error) {
      console.error("Failed to load faculty list:", error);
    }
  };

  // Load feedback submission counts for both rounds
  const loadFeedbackCounts = async () => {
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.get(`${API_BASE_URL}/feedback-counts?class=${classSel}&branch=${branchSel}&academicYear=${graduationYear}`);
      setFeedbackCounts(res.data);
    } catch (error) {
      console.error("Failed to load feedback counts:", error);
    }
  };

  // Load round status
  const loadRoundStatus = async () => {
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.get(`${API_BASE_URL}/round-status?class=${classSel}&branch=${branchSel}&academicYear=${graduationYear}`);
      setRoundStatus(res.data);
    } catch (error) {
      console.error("Failed to load round status:", error);
    }
  };

  // Enable/disable rounds
  const enableRound = async (round, enabled) => {
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.post(`${API_BASE_URL}/round-control`, {
        class: classSel,
        branch: branchSel,
        academicYear: graduationYear,
        round: round,
        enabled: enabled
      });
      
      setRoundStatus(prev => ({
        ...prev,
        [`${round}Enabled`]: enabled
      }));
      
      toast.success(`${round === 'initial' ? 'Initial' : 'Final'} round ${enabled ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      toast.error("Failed to update round status: " + error.message);
    }
  };

  // =============================================
  // NEW: Upload Progress Component
  // =============================================
  const UploadProgressBar = () => {
    if (!uploadProgress.show) return null;
    
    const isComplete = uploadProgress.status === 'complete';
    const isError = uploadProgress.status === 'error';
    const barColor = isError ? '#dc3545' : isComplete ? '#28a745' : '#2c7be5';
    const progress = uploadProgress.current || 0;
    
    return (
      <div className="upload-progress-container" style={{
        margin: '15px 0',
        padding: '15px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f8f9fa'
      }}>
        <div className="upload-progress-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <span style={{ fontWeight: 'bold' }}>{uploadProgress.message}</span>
          <span>{isComplete ? '✅' : isError ? '❌' : `${progress}%`}</span>
        </div>
        <div className="upload-progress-track" style={{
          width: '100%',
          height: '10px',
          backgroundColor: '#e9ecef',
          borderRadius: '5px',
          overflow: 'hidden'
        }}>
          <div className="upload-progress-fill" style={{
            width: `${isComplete ? 100 : isError ? 100 : progress}%`,
            height: '100%',
            backgroundColor: barColor,
            transition: 'width 0.3s ease',
            borderRadius: '5px'
          }}></div>
        </div>
        {isComplete && (
          <div style={{ marginTop: '8px', color: '#28a745', fontSize: '14px' }}>
            ✅ Upload completed successfully!
          </div>
        )}
        {isError && (
          <div style={{ marginTop: '8px', color: '#dc3545', fontSize: '14px' }}>
            ❌ Upload failed. Please try again.
          </div>
        )}
      </div>
    );
  };

  // =============================================
  // NEW: Uploaded Files List Component
  // =============================================
  const UploadedFilesList = () => {
    if (uploadedFiles.length === 0) return null;
    
    return (
      <div className="uploaded-files-container" style={{
        margin: '15px 0',
        padding: '15px',
        border: '1px solid #28a745',
        borderRadius: '8px',
        backgroundColor: '#f0fff4'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#28a745' }}>✅ Successfully Uploaded Files</h4>
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#d4edda' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>File Name</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Class</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Branch</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Academic Year</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              {uploadedFiles.slice(-5).reverse().map((file, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={{ padding: '4px 6px' }}>📄 {file.name}</td>
                  <td style={{ padding: '4px 6px' }}>{file.class}</td>
                  <td style={{ padding: '4px 6px' }}>{file.branch}</td>
                  <td style={{ padding: '4px 6px' }}>{file.academicYear}</td>
                  <td style={{ padding: '4px 6px', fontSize: '11px' }}>{file.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {uploadedFiles.length > 5 && (
          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
            Showing last 5 of {uploadedFiles.length} uploaded files
          </div>
        )}
      </div>
    );
  };

  // ... rest of your code remains the same ...

  // View faculty feedback aggregation with round support
  const loadPerformance = async (round = "initial") => {
    if (!facultyName && !selectedFaculty) {
      toast.error("Please enter or select a faculty name!");
      return;
    }
    
    const facultyToUse = facultyName || selectedFaculty;
    
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      console.log('Calling API:', `full-performance/${facultyToUse}`, { class: classSel, branch: branchSel, academicYear: graduationYear, round });
      
      const res = await axios.get(`${API_BASE_URL}/full-performance/${facultyToUse}`, {
        params: { class: classSel, branch: branchSel, academicYear: graduationYear, round }
      });
      
      console.log('API Response:', res.data);
      
      setPerformance(res.data);
      
      if (res.data.length === 0) {
        toast.warning('No feedback data found for this faculty.');
        setFacultyData(null);
        return;
      }
      
      const percentages = calculateFacultyPercentage(res.data);
      setFacultyData({
        name: facultyToUse,
        percentages,
        performance: res.data,
        studentCount: res.data[0]?.studentCount || 0,
        round
      });
      
    } catch (error) {
      console.error('Full error:', error.response?.data || error);
      toast.error(`Failed: ${error.response?.status || 500} - ${error.response?.data?.error || error.message}`);
    }
  };

  // Load performance for selected faculty from dropdown
  const loadSelectedFacultyPerformance = async (round = "initial") => {
    if (!selectedFaculty) {
      toast.error("Please select a faculty!");
      return;
    }
    
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.get(`${API_BASE_URL}/full-performance/${selectedFaculty}`, {
        params: { 
          class: classSel, 
          branch: branchSel, 
          academicYear: graduationYear,
          round: round
        }
      });
      
      setPerformance(res.data);
      
      if (res.data.length > 0) {
        const percentages = calculateFacultyPercentage(res.data);
        setFacultyData({
          name: selectedFaculty,
          percentages: percentages,
          performance: res.data,
          studentCount: res.data[0]?.studentCount || 0,
          round: round
        });
      }
    } catch (error) {
      toast.error("Failed to load performance data: " + error.message);
    }
  };

  // Load class-wise report
  const loadClassReport = async (round = "initial") => {
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.get(`${API_BASE_URL}/class-report`, {
        params: { 
          class: classSel, 
          branch: branchSel, 
          academicYear: graduationYear,
          round: round
        }
      });
      
      setClassReportData({
        data: res.data,
        round: round
      });
    } catch (error) {
      toast.error("Failed to load class report: " + error.message);
    }
  };

  // Load department-wise report
  const loadDepartmentReport = async (round = "initial") => {
    try {
      const graduationYear = convertToGraduationYear(academicYear, classSel);
      
      const res = await axios.get(`${API_BASE_URL}/department-report`, {
        params: { 
          branch: branchSel, 
          academicYear: graduationYear,
          round: round
        }
      });
      
      setDepartmentReportData({
        data: res.data,
        round: round
      });
    } catch (error) {
      toast.error("Failed to load department report: " + error.message);
    }
  };

  // Calculate percentage for each question category
  const calculateFacultyPercentage = (performanceData) => {
    const percentages = {};
    
    performanceData.forEach(subjectData => {
      Object.entries(subjectData.avgScores).forEach(([question, score]) => {
        if (!percentages[question]) {
          percentages[question] = {
            total: 0,
            count: 0
          };
        }
        percentages[question].total += score;
        percentages[question].count += 1;
      });
    });
    
    const result = {};
    Object.entries(percentages).forEach(([question, data]) => {
      result[question] = (data.total / data.count) * 20;
    });
    
    return result;
  };

  // Prepare data for pie chart
  const getPieChartData = () => {
    if (!facultyData || !facultyData.percentages || Object.keys(facultyData.percentages).length === 0) {
      return null;
    }
    
    const labels = Object.keys(facultyData.percentages);
    const data = Object.values(facultyData.percentages).map(val => Number(val) || 0);
    
    if (labels.length === 0 || data.every(d => d === 0)) {
      return null;
    }

    const backgroundColors = [
      'rgba(255, 99, 132, 0.6)',
      'rgba(54, 162, 235, 0.6)',
      'rgba(255, 206, 86, 0.6)',
      'rgba(75, 192, 192, 0.6)',
      'rgba(153, 102, 255, 0.6)',
      'rgba(255, 159, 64, 0.6)',
      'rgba(199, 199, 199, 0.6)',
      'rgba(83, 102, 255, 0.6)',
      'rgba(40, 159, 64, 0.6)',
      'rgba(210, 99, 132, 0.6)',
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)'
    ];

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderColor: backgroundColors.slice(0, labels.length).map(color => 
          color.replace('0.6', '1').replace('0.8', '1')
        ),
        borderWidth: 2,
      }],
    };
  };

  // Prepare data for bar chart
  const getBarChartData = () => {
    if (!facultyData || !facultyData.percentages || Object.keys(facultyData.percentages).length === 0) {
      return null;
    }
    
    const labels = Object.keys(facultyData.percentages);
    const data = Object.values(facultyData.percentages).map(val => Number(val) || 0);

    if (labels.length === 0 || data.every(d => d === 0)) {
      return null;
    }

    return {
      labels,
      datasets: [{
        label: 'Performance (%)',
        data,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      }],
    };
  };

  // Calculate overall faculty performance percentage
  const getOverallPercentage = () => {
    if (!facultyData) return 0;
    
    const values = Object.values(facultyData.percentages);
    if (values.length === 0) return 0;
    
    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
  };

  // Get performance title based on round
  const getPerformanceTitle = () => {
    if (!facultyData) return "Performance Results";
    
    return `Performance Results for ${facultyData.name} - ${facultyData.round === 'initial' ? 'Initial' : 'Final'} Round`;
  };

  // Download report as PDF
  const downloadPDFReport = () => {
    if (!facultyData && !classReportData && !departmentReportData) {
      toast.error("No data to download!");
      return;
    }

    try {
      const doc = new jsPDF();
      
      doc.addImage(reportLogo, 'PNG', 14, 10, 40, 40);
      
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(40, 40, 150);
      doc.text("SCIENT INSTITUTE OF TECHNOLOGY", 105, 15, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(80, 80, 180);
      doc.text("(UGC AUTONOMOUS)", 105, 22, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Accredited by NAAC with A+ Grade", 105, 29, { align: "center" });
      doc.text("Affiliated to JNTUH & Approved by AICTE", 105, 36, { align: "center" });
      doc.text("Ibrahimpatnam, Rangareddy, Telangana-501506", 105, 43, { align: "center" });
      doc.text("www.scient.ac.in | scient_insteng@yahoo.co.in", 105, 50, { align: "center" });
      
      doc.setDrawColor(40, 40, 150);
      doc.setLineWidth(0.8);
      doc.line(14, 55, 196, 55);
      
      let startY = 65;
      
      if (reportType === "faculty" && facultyData) {
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text("FACULTY PERFORMANCE REPORT", 105, startY, { align: "center" });
        startY += 10;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Faculty Name: ${facultyData.name}`, 14, startY);
        doc.text(`Class: ${classSel}, Branch: ${branchSel}`, 14, startY + 7);
        doc.text(`Academic Year: ${academicYear}`, 14, startY + 14);
        doc.text(`Round: ${facultyData.round === 'initial' ? 'Initial' : 'Final'}`, 14, startY + 21);
        doc.text(`Students Submitted: ${facultyData.studentCount}`, 14, startY + 28);
        doc.text(`Overall Performance: ${getOverallPercentage()}%`, 14, startY + 35);
        
        startY += 45;
        
        autoTable(doc, {
          startY: startY,
          head: [['Evaluation Parameter', 'Performance (%)']],
          body: Object.entries(facultyData.percentages).map(([category, percentage]) => [
            category,
            `${percentage.toFixed(2)}%`
          ]),
          theme: 'grid',
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [240, 240, 240]
          }
        });
        
      } else if (reportType === "class" && classReportData) {
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text("CLASS PERFORMANCE REPORT", 105, startY, { align: "center" });
        startY += 10;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Class: ${classSel}, Branch: ${branchSel}`, 14, startY);
        doc.text(`Academic Year: ${academicYear}`, 14, startY + 7);
        doc.text(`Round: ${classReportData.round === 'initial' ? 'Initial' : 'Final'}`, 14, startY + 14);
        
        startY += 20;
        
        autoTable(doc, {
          startY: startY,
          head: [['Subject', 'Faculty', 'Performance (%)']],
          body: classReportData.data.map(item => [
            item.subject,
            item.faculty,
            `${item.overallPercentage.toFixed(2)}%`
          ]),
          theme: 'grid',
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [240, 240, 240]
          }
        });
      } else if (reportType === "department" && departmentReportData) {
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text("DEPARTMENT PERFORMANCE REPORT", 105, startY, { align: "center" });
        startY += 10;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Branch: ${branchSel}`, 14, startY);
        doc.text(`Academic Year: ${academicYear}`, 14, startY + 7);
        doc.text(`Round: ${departmentReportData.round === 'initial' ? 'Initial' : 'Final'}`, 14, startY + 14);
        
        startY += 20;
        
        autoTable(doc, {
          startY: startY,
          head: [['Class', 'Average Performance (%)']],
          body: departmentReportData.data.map(item => [
            item.class,
            `${item.overallPercentage.toFixed(2)}%`
          ]),
          theme: 'grid',
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [240, 240, 240]
          }
        });
      }
      
      const now = new Date();
      const date = now.toLocaleDateString();
      const time = now.toLocaleTimeString();
      
      const finalY = doc.lastAutoTable.finalY + 20;
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Report generated on: ${date} at ${time}`, 14, finalY);
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text("Principal's Signature:", 140, finalY);
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(140, finalY + 5, 190, finalY + 5);
      
      let filename = "";
      if (reportType === "faculty") {
        filename = `${facultyData.name}_${classSel}_${branchSel}_${academicYear}_${facultyData.round}_performance_report.pdf`;
      } else if (reportType === "class") {
        filename = `${classSel}_${branchSel}_${academicYear}_${classReportData.round}_class_report.pdf`;
      } else if (reportType === "department") {
        filename = `${branchSel}_${academicYear}_${departmentReportData.round}_department_report.pdf`;
      }
      
      doc.save(filename);
      toast.success("PDF report downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF report. Please try again.");
    }
  };

  // Admin Panel Component
  const AdminPanel = () => (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-welcome">
          <h2>Admin Panel - Feedback Management System</h2>
          <p>Welcome back, {adminInfo?.username}!</p>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          🚪 Logout
        </button>
      </div>
      
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
        </div>
        
        {classSel && branchSel && academicYear && (
          <div className="feedback-controls">
            <div className="feedback-counts">
              <h4>Feedback Submissions</h4>
              <div className="round-count">
                <h5>Initial Round: {feedbackCounts.initial.submitted} / {feedbackCounts.initial.total} students</h5>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(feedbackCounts.initial.submitted / feedbackCounts.initial.total) * 100}%` }}
                  ></div>
                </div>
                <div className="round-control">
                  <span>Status: {roundStatus.initialEnabled ? 'Enabled' : 'Disabled'}</span>
                  {roundStatus.initialEnabled ? (
                    <button onClick={() => enableRound('initial', false)} className="btn-disable">
                      Disable Initial Round
                    </button>
                  ) : (
                    <button onClick={() => enableRound('initial', true)} className="btn-enable">
                      Enable Initial Round
                    </button>
                  )}
                </div>
              </div>
              <div className="round-count">
                <h5>Final Round: {feedbackCounts.final.submitted} / {feedbackCounts.final.total} students</h5>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(feedbackCounts.final.submitted / feedbackCounts.final.total) * 100}%` }}
                  ></div>
                </div>
                <div className="round-control">
                  <span>Status: {roundStatus.finalEnabled ? 'Enabled' : 'Disabled'}</span>
                  {roundStatus.finalEnabled ? (
                    <button onClick={() => enableRound('final', false)} className="btn-disable">
                      Disable Final Round
                    </button>
                  ) : (
                    <button onClick={() => enableRound('final', true)} className="btn-enable">
                      Enable Final Round
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="App">
        <FeedbackSubmissionTracker />
      </div>

      {classSel && branchSel && academicYear && (
        <>
          <div className="upload-section">
            <h3>Upload Data</h3>
            
            {/* ============================================= */}
            {/* NEW: Upload Progress Bar */}
            {/* ============================================= */}
            <UploadProgressBar />
            
            {/* ============================================= */}
            {/* NEW: Uploaded Files List */}
            {/* ============================================= */}
            <UploadedFilesList />
            
            <div className="upload-row">
              <div className="upload-item">
                <h4>Upload Students</h4>
                <div className="file-input-container">
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleStudentsFileChange}
                    id="students-file"
                    disabled={uploadLoading}
                  />
                  <label htmlFor="students-file" className="file-input-label">
                    📁 Choose Students CSV
                  </label>
                  {studentsFileName && (
                    <div className="file-selected">
                      ✅ Selected: <strong>{studentsFileName}</strong>
                    </div>
                  )}
                </div>
                <button 
                  onClick={uploadStudents} 
                  disabled={uploadLoading || !studentsFile}
                  className={uploadLoading ? 'loading' : ''}
                >
                  {uploadLoading ? '⏳ Uploading...' : '📤 Upload Students'}
                </button>
                <p>CSV format: name, hallticket, branch</p>
                <p style={{ fontSize: '12px', color: '#6c757d' }}>
                  {uploadedFiles.filter(f => f.class === classSel && f.branch === branchSel && f.academicYear === academicYear && f.name.includes('students')).length > 0 && (
                    <span style={{ color: '#28a745' }}>✅ Students already uploaded for this class</span>
                  )}
                </p>
              </div>
              
              <div className="upload-item">
                <h4>Upload Subjects & Faculties</h4>
                <div className="file-input-container">
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleSubjectsFileChange}
                    id="subjects-file"
                    disabled={uploadLoading}
                  />
                  <label htmlFor="subjects-file" className="file-input-label">
                    📁 Choose Subjects CSV
                  </label>
                  {subjectsFileName && (
                    <div className="file-selected">
                      ✅ Selected: <strong>{subjectsFileName}</strong>
                    </div>
                  )}
                </div>
                <button 
                  onClick={uploadSubjects} 
                  disabled={uploadLoading || !subjectsFile}
                  className={uploadLoading ? 'loading' : ''}
                >
                  {uploadLoading ? '⏳ Uploading...' : '📤 Upload Subjects'}
                </button>
                <p>CSV format: Faculty ID,Faculty Name,Subject Code,Subject Name</p>
                <p className="note">Note: Initial Round will be automatically enabled after uploading subjects</p>
                <p style={{ fontSize: '12px', color: '#6c757d' }}>
                  {uploadedFiles.filter(f => f.class === classSel && f.branch === branchSel && f.academicYear === academicYear && f.name.includes('subjects')).length > 0 && (
                    <span style={{ color: '#28a745' }}>✅ Subjects already uploaded for this class</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="performance-section">
            <h3>Reports</h3>
            
            <div className="report-type-selector">
              <label>
                <input 
                  type="radio" 
                  value="faculty" 
                  checked={reportType === "faculty"} 
                  onChange={() => setReportType("faculty")} 
                />
                Faculty-wise Report
              </label>
              <label>
                <input 
                  type="radio" 
                  value="class" 
                  checked={reportType === "class"} 
                  onChange={() => setReportType("class")} 
                />
                Class-wise Report
              </label>
              <label>
                <input 
                  type="radio" 
                  value="department" 
                  checked={reportType === "department"} 
                  onChange={() => setReportType("department")} 
                />
                Department-wise Report
              </label>
            </div>

            {reportType === "faculty" && (
              <div className="faculty-selection">
                <div className="selection-method">
                  <h4>Search by Name</h4>
                  <input 
                    placeholder="Enter faculty name" 
                    value={facultyName} 
                    onChange={e => setFacultyName(e.target.value)}
                  />
                  <div className="round-buttons">
                    <button onClick={() => loadPerformance('initial')}>Initial Round</button>
                    <button onClick={() => loadPerformance('final')}>Final Round</button>
                  </div>
                </div>
                
                <div className="selection-method">
                  <h4>Select from List</h4>
                  <select 
                    value={selectedFaculty} 
                    onChange={e => setSelectedFaculty(e.target.value)}
                  >
                    <option value="">Select Faculty</option>
                    {facultyList.map((faculty, index) => (
                      <option key={index} value={faculty}>{faculty}</option>
                    ))}
                  </select>
                  <div className="round-buttons">
                    <button onClick={() => loadSelectedFacultyPerformance('initial')}>Initial Round</button>
                    <button onClick={() => loadSelectedFacultyPerformance('final')}>Final Round</button>
                  </div>
                </div>
              </div>
            )}

            {reportType === "class" && (
              <div className="class-report-controls">
                <h4>Class-wise Report</h4>
                <div className="round-buttons">
                  <button onClick={() => loadClassReport('initial')}>Initial Round</button>
                  <button onClick={() => loadClassReport('final')}>Final Round</button>
                </div>
              </div>
            )}

            {reportType === "department" && (
              <div className="department-report-controls">
                <h4>Department-wise Report</h4>
                <div className="round-buttons">
                  <button onClick={() => loadDepartmentReport('initial')}>Initial Round</button>
                  <button onClick={() => loadDepartmentReport('final')}>Final Round</button>
                </div>
              </div>
            )}

            {facultyData && reportType === "faculty" && (
              <div className="performance-results">
                <h4>{getPerformanceTitle()}</h4>
                <div className="overall-score">
                  <h5>Overall Performance: {getOverallPercentage()}%</h5>
                  <p>Based on feedback from {facultyData.studentCount} students</p>
                </div>
                
                <div className="charts-container">
                  <div className="chart">
                    <h5>Performance Distribution</h5>
                    <Pie data={getPieChartData()} />
                  </div>
                  
                  <div className="chart">
                    <h5>Performance by Category</h5>
                    <Bar 
                      data={getBarChartData()} 
                      options={{
                        indexAxis: 'y',
                        scales: {
                          x: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                              callback: function(value) {
                                return value + '%';
                              }
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                </div>
                
                <div className="detailed-results">
                  <h5>Detailed Results</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        {Object.keys(facultyData.percentages).map((question, idx) => (
                          <th key={idx}>{question}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facultyData.performance.map((subjectData, idx) => (
                        <tr key={idx}>
                          <td>{subjectData.subject}</td>
                          {Object.values(subjectData.avgScores).map((score, scoreIdx) => (
                            <td key={scoreIdx}>{(score * 20).toFixed(2)}%</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {classReportData && reportType === "class" && (
              <div className="class-report-results">
                <h4>Class Performance Report - {classReportData.round === 'initial' ? 'Initial' : 'Final'} Round</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Faculty</th>
                      <th>Performance (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classReportData.data.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.subject}</td>
                        <td>{item.faculty}</td>
                        <td>{item.overallPercentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {departmentReportData && reportType === "department" && (
              <div className="department-report-results">
                <h4>Department Performance Report - {departmentReportData.round === 'initial' ? 'Initial' : 'Final'} Round</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Average Performance (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentReportData.data.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.class}</td>
                        <td>{item.overallPercentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(facultyData || classReportData || departmentReportData) && (
              <div className="download-buttons">
                <button onClick={downloadPDFReport} className="download-btn pdf">
                  Download PDF Report
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  // If not authenticated, show login page
  if (!isAuthenticated) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  // If authenticated, show the main app
  return (
    <div className="App">
      <ToastContainer />
      
      {/* Navigation Header */}
      <div className="app-navigation">
        <div className="nav-header">
          <h1>Feedback Management System</h1>
          <p>Welcome, {adminInfo?.username}</p>
        </div>
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${currentView === 'admin' ? 'active' : ''}`}
            onClick={() => setCurrentView('admin')}
          >
            📊 Admin Dashboard
          </button>
          <button 
            className={`nav-tab ${currentView === 'faculty-tracking' ? 'active' : ''}`}
            onClick={() => setCurrentView('faculty-tracking')}
          >
            👨‍🏫 Faculty Tracking
          </button>
          <button 
            className={`nav-tab ${currentView === 'password-reset' ? 'active' : ''}`}
            onClick={() => setCurrentView('password-reset')}
          >
            🔑 Password Reset
          </button>

          <button 
            className={`nav-tab ${currentView === 'faculty-correction' ? 'active' : ''}`}
            onClick={() => setCurrentView('faculty-correction')}
          >
            🔧 Faculty Name Correction
          </button>
          <button 
            className={`nav-tab ${currentView === 'student-management' ? 'active' : ''}`}
            onClick={() => setCurrentView('student-management')}
          >
            👥 Student Management
          </button>
          <button 
            className={`nav-tab ${currentView === 'faculty-master' ? 'active' : ''}`}
            onClick={() => setCurrentView('faculty-master')}
          >
            👨‍🏫 Faculty Master
          </button>

          <button 
            className={`nav-tab ${currentView === 'subject-master' ? 'active' : ''}`}
            onClick={() => setCurrentView('subject-master')}
          >
            📚 Subject Master
          </button>

          <button 
            className={`nav-tab ${currentView === 'timetable' ? 'active' : ''}`}
            onClick={() => setCurrentView('timetable')}
          >
            📅 Timetable
          </button>

          <button onClick={handleLogout} className="logout-btn-nav">
            🚪 Logout
          </button>
          
        </div>
      </div>

      {/* Main Content */}
      <main className="main-content">
        {currentView === 'admin' && <AdminPanel />}
        {currentView === 'password-reset' && <PasswordReset />}
        {currentView === 'faculty-tracking' && <FacultyTrackingPage />}
        {currentView === 'faculty-correction' && <FacultyNameCorrection />}
        {currentView === 'faculty-master' && <FacultyMaster />}
        {currentView === 'subject-master' && <SubjectMaster />}
        {currentView === 'timetable' && <TimetableManagement />}

        {currentView === 'student-management' && (
          <StudentManagement 
            classSel={classSel}
            branchSel={branchSel}
            academicYear={academicYear}
          />
        )}

      </main>
    </div>
  );
}

export default App;