import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Pie, Bar, Doughnut } from "react-chartjs-2";
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
import './App.css';
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

function PrincipalPanel() {
  const [activeTab, setActiveTab] = useState("overview");
  const [branches] = useState(["CSE-A", "CSE-B", "CSE", "ECE", "EEE", "MECH", "CIVIL"]);
  const [academicYears] = useState(["2025-2026", "2026-2027", "2027-2028", "2028-2029"]);
  const [classes] = useState(["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"]);
  
  // College Overview State
  const [overallCollegePerformance, setOverallCollegePerformance] = useState(null);
  const [departmentPerformance, setDepartmentPerformance] = useState([]);
  const [topPerformers, setTopPerformers] = useState([]);
  const [needImprovement, setNeedImprovement] = useState([]);
  
  // Faculty Analysis State
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [facultyList, setFacultyList] = useState([]);
  const [facultyPerformance, setFacultyPerformance] = useState(null);
  const [facultyClasses, setFacultyClasses] = useState([]);
  
  // Department Analysis State
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departmentFaculties, setDepartmentFaculties] = useState([]);
  const [departmentDetails, setDepartmentDetails] = useState(null);

  // Load all data on component mount
  useEffect(() => {
    loadAllFaculties();
    loadOverallCollegePerformance();
  }, []);

  // Load faculty details when selected
  useEffect(() => {
    if (selectedFaculty) {
      loadFacultyPerformance();
      loadFacultyClasses();
    }
  }, [selectedFaculty]);

  // Load department details when selected
  useEffect(() => {
    if (selectedDepartment) {
      loadDepartmentDetails();
    }
  }, [selectedDepartment]);

  // Load all faculties from all branches
  const loadAllFaculties = async () => {
    try {
      const facultiesSet = new Set();
      
      // Check all branches and classes to get all faculties
      for (const branch of branches) {
        for (const cls of classes) {
          for (const year of academicYears) {
            try {
              const graduationYear = convertToGraduationYear(year, cls);
              const res = await axios.get(`${API_BASE_URL}/faculties`, {
                params: {
                  class: cls,
                  branch: branch,
                  academicYear: graduationYear
                }
              });
              
              res.data.forEach(faculty => facultiesSet.add(faculty));
            } catch (error) {
              console.error(`Error loading faculties for ${branch}-${cls}:`, error);
            }
          }
        }
      }
      
      setFacultyList(Array.from(facultiesSet));
    } catch (error) {
      console.error("Failed to load faculties:", error);
      toast.error("Failed to load faculty list");
    }
  };

  // Load overall college performance
  const loadOverallCollegePerformance = async () => {
    try {
      let allPerformanceData = [];
      let departmentPerformanceMap = {};
      
      // Initialize department performance map
      branches.forEach(branch => {
        departmentPerformanceMap[branch] = {
          total: 0,
          count: 0,
          faculties: new Set()
        };
      });

      // Collect data from all branches and classes
      for (const branch of branches) {
        for (const cls of classes) {
          for (const year of academicYears) {
            try {
              const graduationYear = convertToGraduationYear(year, cls);
              const res = await axios.get(`${API_BASE_URL}/class-report`, {
                params: {
                  class: cls,
                  branch: branch,
                  academicYear: graduationYear
                }
              });
              
              if (res.data && res.data.length > 0) {
                allPerformanceData = allPerformanceData.concat(res.data);
                
                // Update department performance
                res.data.forEach(item => {
                  departmentPerformanceMap[branch].total += item.overallPercentage;
                  departmentPerformanceMap[branch].count += 1;
                  if (item.faculty) departmentPerformanceMap[branch].faculties.add(item.faculty);
                });
              }
            } catch (error) {
              console.error(`Error loading data for ${branch}-${cls}:`, error);
            }
          }
        }
      }
      
      if (allPerformanceData.length === 0) {
        return;
      }
      
      // Calculate overall college average
      const collegeAvg = allPerformanceData.reduce((sum, item) => sum + item.overallPercentage, 0) / allPerformanceData.length;
      
      // Group by faculty for all faculties performance
      const facultyPerformanceMap = {};
      allPerformanceData.forEach(item => {
        if (!facultyPerformanceMap[item.faculty]) {
          facultyPerformanceMap[item.faculty] = {
            total: 0,
            count: 0,
            subjects: []
          };
        }
        
        facultyPerformanceMap[item.faculty].total += item.overallPercentage;
        facultyPerformanceMap[item.faculty].count += 1;
        // Store the class information correctly
        facultyPerformanceMap[item.faculty].subjects.push({
          subject: item.subject,
          class: item.class || "N/A",
          performance: item.overallPercentage
        });
      });
      
      // Calculate average for each faculty
      const facultyAverages = Object.keys(facultyPerformanceMap).map(faculty => ({
        faculty,
        average: facultyPerformanceMap[faculty].total / facultyPerformanceMap[faculty].count,
        subjectCount: facultyPerformanceMap[faculty].count
      }));
      
      // Calculate department averages
      const departmentAverages = Object.keys(departmentPerformanceMap).map(dept => ({
        department: dept,
        average: departmentPerformanceMap[dept].total / departmentPerformanceMap[dept].count,
        facultyCount: departmentPerformanceMap[dept].faculties.size,
        subjectCount: departmentPerformanceMap[dept].count
      }));
      
      // Identify top performers and those needing improvement
      const sortedFaculty = facultyAverages.sort((a, b) => b.average - a.average);
      const topPerformersList = sortedFaculty.slice(0, 5);
      const needImprovementList = sortedFaculty.slice(-5).reverse();
      
      setOverallCollegePerformance({
        collegeAverage: collegeAvg,
        totalSubjects: allPerformanceData.length,
        totalFaculties: facultyAverages.length
      });
      
      setDepartmentPerformance(departmentAverages);
      setTopPerformers(topPerformersList);
      setNeedImprovement(needImprovementList);
    } catch (error) {
      console.error("Failed to load overall college performance:", error);
    }
  };

  // Load performance data for a specific faculty
  const loadFacultyPerformance = async () => {
    try {
      let allPerformanceData = [];
      let classesTaught = new Set();
      
      // Check all classes and branches to get comprehensive faculty data
      for (const branch of branches) {
        for (const cls of classes) {
          for (const year of academicYears) {
            try {
              const graduationYear = convertToGraduationYear(year, cls);
              const res = await axios.get(`${API_BASE_URL}/full-performance/${selectedFaculty}`, {
                params: {
                  class: cls,
                  branch: branch,
                  academicYear: graduationYear
                }
              });
              
              if (res.data && res.data.length > 0) {
                allPerformanceData = allPerformanceData.concat(res.data);
                res.data.forEach(item => classesTaught.add(`${item.class} (${item.branch})`));
              }
            } catch (error) {
              console.error(`Error loading performance for ${branch}-${cls}:`, error);
            }
          }
        }
      }
      
      if (allPerformanceData.length === 0) {
        toast.info("No performance data found for this faculty");
        setFacultyPerformance(null);
        return;
      }
      
      // Calculate overall performance
      const performanceSummary = calculateFacultyPerformance(allPerformanceData);
      setFacultyPerformance(performanceSummary);
    } catch (error) {
      console.error("Failed to load faculty performance:", error);
      toast.error("Failed to load faculty performance data");
    }
  };

  // Load classes taught by a faculty
  const loadFacultyClasses = async () => {
    try {
      let classesSet = new Set();
      
      // Check all classes and branches
      for (const branch of branches) {
        for (const cls of classes) {
          for (const year of academicYears) {
            try {
              const graduationYear = convertToGraduationYear(year, cls);
              const res = await axios.get(`${API_BASE_URL}/subjects-public`, {
                params: {
                  class: cls,
                  branch: branch,
                  academicYear: graduationYear
                }
              });
              
              if (res.data && res.data.length > 0) {
                res.data.forEach(subject => {
                  if (subject.faculty === selectedFaculty) {
                    classesSet.add(`${cls} (${branch})`);
                  }
                });
              }
            } catch (error) {
              console.error(`Error loading classes for ${branch}-${cls}:`, error);
            }
          }
        }
      }
      
      setFacultyClasses(Array.from(classesSet));
    } catch (error) {
      console.error("Failed to load faculty classes:", error);
    }
  };

  // Load department details
  const loadDepartmentDetails = async () => {
    try {
      let allClassData = [];
      let facultiesSet = new Set();
      
      for (const cls of classes) {
        for (const year of academicYears) {
          try {
            const graduationYear = convertToGraduationYear(year, cls);
            const res = await axios.get(`${API_BASE_URL}/class-report`, {
              params: {
                class: cls,
                branch: selectedDepartment,
                academicYear: graduationYear
              }
            });
            
            if (res.data && res.data.length > 0) {
              allClassData = allClassData.concat(res.data.map(item => ({
                ...item,
                class: cls
              })));
              
              // Add faculties to set
              res.data.forEach(item => {
                if (item.faculty) facultiesSet.add(item.faculty);
              });
            }
          } catch (error) {
            console.error(`Error loading class report for ${cls}:`, error);
          }
        }
      }
      
      if (allClassData.length === 0) {
        setDepartmentDetails(null);
        return;
      }
      
      // Calculate department average
      const deptAvg = allClassData.reduce((sum, item) => sum + item.overallPercentage, 0) / allClassData.length;
      
      // Group by faculty for comparison
      const facultyPerformanceMap = {};
      allClassData.forEach(item => {
        if (!facultyPerformanceMap[item.faculty]) {
          facultyPerformanceMap[item.faculty] = {
            total: 0,
            count: 0,
            subjects: []
          };
        }
        
        facultyPerformanceMap[item.faculty].total += item.overallPercentage;
        facultyPerformanceMap[item.faculty].count += 1;
        facultyPerformanceMap[item.faculty].subjects.push({
          subject: item.subject,
          class: item.class,
          performance: item.overallPercentage
        });
      });
      
      // Calculate average for each faculty
      const facultyAverages = Object.keys(facultyPerformanceMap).map(faculty => ({
        faculty,
        average: facultyPerformanceMap[faculty].total / facultyPerformanceMap[faculty].count,
        subjects: facultyPerformanceMap[faculty].subjects
      }));
      
      setDepartmentFaculties(Array.from(facultiesSet));
      setDepartmentDetails({
        departmentAverage: deptAvg,
        facultyAverages,
        classData: allClassData,
        totalSubjects: allClassData.length
      });
    } catch (error) {
      console.error("Failed to load department details:", error);
      toast.error("Failed to load department performance data");
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

  // Calculate faculty performance from raw data
  const calculateFacultyPerformance = (performanceData) => {
    const performanceSummary = {
      faculty: performanceData[0]?.faculty || selectedFaculty,
      subjects: [],
      overallAverage: 0,
      byParameter: {}
    };
    
    // Group by subject and calculate averages
    const subjectMap = {};
    performanceData.forEach(item => {
      if (!subjectMap[item.subject]) {
        subjectMap[item.subject] = {
          subject: item.subject,
          class: item.class,
          branch: item.branch,
          parameters: {},
          average: 0
        };
      }
      
      // Calculate average for each parameter
      Object.entries(item.avgScores).forEach(([param, score]) => {
        if (!subjectMap[item.subject].parameters[param]) {
          subjectMap[item.subject].parameters[param] = {
            total: 0,
            count: 0,
            average: 0
          };
        }
        
        const percentage = score * 20; // Convert to percentage (5 = 100%)
        subjectMap[item.subject].parameters[param].total += percentage;
        subjectMap[item.subject].parameters[param].count += 1;
        subjectMap[item.subject].parameters[param].average = 
          subjectMap[item.subject].parameters[param].total / 
          subjectMap[item.subject].parameters[param].count;
      });
    });
    
    // Calculate subject averages and overall average
    let totalAverage = 0;
    let subjectCount = 0;
    
    Object.values(subjectMap).forEach(subject => {
      const paramValues = Object.values(subject.parameters);
      subject.average = paramValues.reduce((sum, param) => sum + param.average, 0) / paramValues.length;
      totalAverage += subject.average;
      subjectCount += 1;
      
      performanceSummary.subjects.push(subject);
    });
    
    performanceSummary.overallAverage = totalAverage / subjectCount;
    
    // Calculate averages by parameter across all subjects
    const parameterMap = {};
    performanceSummary.subjects.forEach(subject => {
      Object.entries(subject.parameters).forEach(([param, data]) => {
        if (!parameterMap[param]) {
          parameterMap[param] = {
            total: 0,
            count: 0,
            average: 0
          };
        }
        
        parameterMap[param].total += data.average;
        parameterMap[param].count += 1;
        parameterMap[param].average = parameterMap[param].total / parameterMap[param].count;
      });
    });
    
    performanceSummary.byParameter = parameterMap;
    
    return performanceSummary;
  };

  // Prepare data for college performance chart
  const getCollegePerformanceChartData = () => {
    if (!departmentPerformance || departmentPerformance.length === 0) return null;
    
    const departments = departmentPerformance.map(d => d.department);
    const averages = departmentPerformance.map(d => d.average);
    
    return {
      labels: departments,
      datasets: [
        {
          label: 'Performance (%)',
          data: averages,
          backgroundColor: [
            'rgba(255, 99, 132, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)',
            'rgba(199, 199, 199, 0.6)'
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)',
            'rgba(199, 199, 199, 1)'
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  // Prepare data for faculty performance chart
  const getFacultyPerformanceChartData = () => {
    if (!facultyPerformance) return null;
    
    const parameters = Object.keys(facultyPerformance.byParameter);
    const averages = parameters.map(param => facultyPerformance.byParameter[param].average);
    
    return {
      labels: parameters,
      datasets: [
        {
          label: 'Performance (%)',
          data: averages,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        },
      ],
    };
  };

  // Prepare data for performance distribution pie chart
  const getPerformanceDistributionData = () => {
    if (!facultyPerformance) return null;
    
    const excellent = facultyPerformance.subjects.filter(s => s.average >= 80).length;
    const good = facultyPerformance.subjects.filter(s => s.average >= 65 && s.average < 80).length;
    const average = facultyPerformance.subjects.filter(s => s.average >= 50 && s.average < 65).length;
    const poor = facultyPerformance.subjects.filter(s => s.average < 50).length;
    
    return {
      labels: ['Excellent (80-100%)', 'Good (65-79%)', 'Average (50-64%)', 'Poor (<50%)'],
      datasets: [
        {
          data: [excellent, good, average, poor],
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(255, 99, 132, 1)'
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  // Prepare data for department faculty performance chart
  const getDepartmentFacultyChartData = () => {
    if (!departmentDetails) return null;
    
    const facultyNames = departmentDetails.facultyAverages.map(f => f.faculty);
    const facultyAvgs = departmentDetails.facultyAverages.map(f => f.average);
    
    return {
      labels: facultyNames,
      datasets: [
        {
          label: 'Performance (%)',
          data: facultyAvgs,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
        },
      ],
    };
  };

  // Generate professional letter for faculty with different formats based on performance
  const generateFacultyLetter = () => {
    if (!facultyPerformance) {
      toast.error("No faculty data to generate letter");
      return;
    }
    
    const doc = new jsPDF();
    const performance = facultyPerformance.overallAverage;
    
    // Add letterhead
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40, 40, 150);
    doc.text("SCIENT INSTITUTE OF TECHNOLOGY", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 180);
    doc.text("(UGC AUTONOMOUS)", 105, 27, { align: "center" });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Accredited by NAAC with A+ Grade", 105, 34, { align: "center" });
    doc.text("Ibrahimpatnam, Rangareddy, Telangana-501506", 105, 41, { align: "center" });
    
    // Add date
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Date: ${dateStr}`, 20, 60);
    
    // Add recipient
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`To,`, 20, 75);
    doc.text(`Prof. ${facultyPerformance.faculty}`, 20, 85);
    doc.text(`Faculty Member`, 20, 95);
    doc.text(`Scient Institute of Technology`, 20, 105);
    
    let yPos = 125;
    
    // Different letter formats based on performance
    if (performance < 60) {
      // Below 60% - Warning Letter
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Subject: Warning Letter Regarding Poor Student Feedback`, 20, yPos);
      
      yPos += 20;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`Dear Prof. ${facultyPerformance.faculty},`, 20, yPos);
      
      yPos += 10;
      doc.text(`This is to bring to your notice that the recent student feedback regarding your teaching`, 20, yPos);
      yPos += 7;
      doc.text(`performance has been unsatisfactory. Your overall performance rating of ${performance.toFixed(2)}%`, 20, yPos);
      yPos += 7;
      doc.text(`indicates significant areas requiring immediate attention.`, 20, yPos);
      
      yPos += 12;
      doc.text(`Several students have reported concerns about your teaching methods, including:`, 20, yPos);
      
      yPos += 10;
      // Identify specific areas of concern from parameters
      const poorAreas = Object.entries(facultyPerformance.byParameter)
        .filter(([param, data]) => data.average < 60)
        .map(([param]) => param);
      
      if (poorAreas.length > 0) {
        poorAreas.forEach(area => {
          doc.text(`• ${area}`, 25, yPos);
          yPos += 7;
        });
      } else {
        doc.text(`• Explanation clarity and teaching methodology`, 25, yPos);
        yPos += 7;
        doc.text(`• Syllabus completion and pace of teaching`, 25, yPos);
        yPos += 7;
        doc.text(`• Student engagement and interaction`, 25, yPos);
        yPos += 7;
      }
      
      yPos += 10;
      doc.text(`Such feedback is a matter of serious concern as it directly affects the academic standards`, 20, yPos);
      yPos += 7;
      doc.text(`of our institution.`, 20, yPos);
      
      yPos += 12;
      doc.text(`You are hereby issued a strict warning to take immediate corrective measures to improve`, 20, yPos);
      yPos += 7;
      doc.text(`your teaching practices.`, 20, yPos);
      
      yPos += 12;
      doc.text(`You are advised to treat this matter with utmost seriousness and work on the areas of`, 20, yPos);
      yPos += 7;
      doc.text(`concern without delay. We expect to see significant improvement in the next feedback cycle.`, 20, yPos);
      
    } else if (performance >= 60 && performance < 80) {
      // Between 60-80% - Improvement Suggestions
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Subject: Suggestions for Improvement based on Student Feedback`, 20, yPos);
      
      yPos += 20;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`Dear Prof. ${facultyPerformance.faculty},`, 20, yPos);
      
      yPos += 10;
      doc.text(`As part of our continuous process of quality enhancement, we carefully review the`, 20, yPos);
      yPos += 7;
      doc.text(`feedback given by students regarding their learning experiences.`, 20, yPos);
      
      yPos += 12;
      doc.text(`Based on the recent feedback received (Overall Rating: ${performance.toFixed(2)}%), a few areas`, 20, yPos);
      yPos += 7;
      doc.text(`have been identified where improvement is suggested:`, 20, yPos);
      
      yPos += 12;
      // Identify areas needing improvement
      const improvementAreas = Object.entries(facultyPerformance.byParameter)
        .filter(([param, data]) => data.average < 75)
        .map(([param, data]) => ({ param, score: data.average }));
      
      if (improvementAreas.length > 0) {
        improvementAreas.forEach((area, index) => {
          const suggestions = {
            'Teaching Methodology': 'Consider incorporating more interactive teaching methods',
            'Explanation Clarity': 'Focus on simplifying complex concepts with practical examples',
            'Syllabus Coverage': 'Ensure timely completion of syllabus with proper planning',
            'Student Interaction': 'Increase student engagement through discussions and Q&A sessions',
            'Time Management': 'Better time management during lectures',
            'Subject Knowledge': 'Continue updating subject knowledge with latest developments',
            'Completion of syllabus in time': 'Need for improved planning and timely syllabus coverage',
            'Communication skills': 'Need for improved clarity and effective communication',
            'Teacher\'s commands and control of the class': 'Need for improved classroom management',
            'Attitude of the teacher towards the students': 'Need for improved student-teacher rapport',
            'Use of board & audio visual aids by the teacher': 'Need for improved utilization of teaching aids',
            'Accessibility of teacher after class hours': 'Need for improved availability for student queries'
          };
          
          const suggestionText = suggestions[area.param] || 'Needs to be improved';
          doc.text(`${index + 1}. ${area.param}: ${suggestionText}`, 25, yPos);
          yPos += 7;
        });
      } else {
        doc.text(`1. Teaching Methodology: Need for improved teaching techniques`, 25, yPos);
        yPos += 7;
        doc.text(`2. Student Engagement: Need for improved interaction with students`, 25, yPos);
        yPos += 7;
        doc.text(`3. Time Management: Need for improved lecture timing and pace`, 25, yPos);
        yPos += 7;
      }
      
      yPos += 10;
      doc.text(`I encourage you to take these suggestions positively & consider them as an opportunity`, 20, yPos);
      yPos += 7;
      doc.text(`for professional growth. We look forward to seeing the positive outcomes of these`, 20, yPos);
      yPos += 7;
      doc.text(`enhancements in the coming semester.`, 20, yPos);
      
    } else {
      // Above 80% - Appreciation Letter
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Subject: Appreciation for Excellent Teaching Performance`, 20, yPos);
      
      yPos += 20;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`Dear Prof. ${facultyPerformance.faculty},`, 20, yPos);
      
      yPos += 10;
      doc.text(`I am pleased to inform you that based on the recent student feedback analysis, your`, 20, yPos);
      yPos += 7;
      doc.text(`teaching performance has been rated as EXCELLENT with an overall score of ${performance.toFixed(2)}%.`, 20, yPos);
      
      yPos += 12;
      doc.text(`Your dedication to teaching excellence and commitment to student success are highly`, 20, yPos);
      yPos += 7;
      doc.text(`commendable. The feedback highlights your strengths in the following areas:`, 20, yPos);
      
      yPos += 12;
      // Identify strong areas
      const strongAreas = Object.entries(facultyPerformance.byParameter)
        .filter(([param, data]) => data.average >= 80)
        .map(([param]) => param);
      
      if (strongAreas.length > 0) {
        strongAreas.forEach(area => {
          doc.text(`• ${area}`, 25, yPos);
          yPos += 7;
        });
      } else {
        doc.text(`• Teaching methodology and explanation clarity`, 25, yPos);
        yPos += 7;
        doc.text(`• Student engagement and interaction`, 25, yPos);
        yPos += 7;
        doc.text(`• Subject knowledge and syllabus coverage`, 25, yPos);
        yPos += 7;
      }
      
      yPos += 12;
      doc.text(`Your performance serves as an inspiration to other faculty members and contributes`, 20, yPos);
      yPos += 7;
      doc.text(`significantly to maintaining the high academic standards of our institution.`, 20, yPos);
      
      yPos += 12;
      doc.text(`We appreciate your hard work and encourage you to continue your excellent teaching`, 20, yPos);
      yPos += 7;
      doc.text(`practices. Your efforts are truly valued and recognized.`, 20, yPos);
    }
    
    // Common closing for all letters
    yPos += 15;
    doc.text(`Thank you for your contributions to our institution. We look forward to your continued`, 20, yPos);
    yPos += 7;
    doc.text(`dedication to excellence in teaching.`, 20, yPos);
    
    yPos += 20;
    doc.text(`Sincerely,`, 20, yPos);
    yPos += 10;
    doc.text(`Principal`, 20, yPos);
    doc.text(`Scient Institute of Technology`, 20, yPos + 7);
    
    // Determine filename based on performance
    let fileName;
    if (performance < 60) {
      fileName = `Warning_Letter_${facultyPerformance.faculty}.pdf`;
    } else if (performance >= 60 && performance < 80) {
      fileName = `Improvement_Suggestions_${facultyPerformance.faculty}.pdf`;
    } else {
      fileName = `Appreciation_Letter_${facultyPerformance.faculty}.pdf`;
    }
    
    // Save the PDF
    doc.save(fileName);
    
    // Show appropriate success message
    if (performance < 60) {
      toast.warning("Warning letter generated successfully!");
    } else if (performance >= 60 && performance < 80) {
      toast.info("Improvement suggestions letter generated successfully!");
    } else {
      toast.success("Appreciation letter generated successfully!");
    }
  };

  // Generate department performance report
  const generateDepartmentReport = () => {
    if (!departmentDetails) {
      toast.error("No department data to generate report");
      return;
    }
    
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("DEPARTMENT PERFORMANCE REPORT", 105, 15, { align: "center" });
    
    // Add department details
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Department: ${selectedDepartment}`, 20, 30);
    doc.text(`Overall Performance: ${departmentDetails.departmentAverage.toFixed(2)}%`, 20, 40);
    doc.text(`Total Faculties: ${departmentFaculties.length}`, 20, 50);
    doc.text(`Total Subjects: ${departmentDetails.totalSubjects}`, 20, 60);
    
    // Add performance rating
    const rating = departmentDetails.departmentAverage >= 80 ? "EXCELLENT" : 
                  departmentDetails.departmentAverage >= 65 ? "GOOD" : 
                  departmentDetails.departmentAverage >= 50 ? "AVERAGE" : "NEEDS IMPROVEMENT";
    
    doc.text(`Performance Rating: ${rating}`, 20, 70);
    
    // Add faculty performance summary
    doc.setFont(undefined, 'bold');
    doc.text("Faculty Performance Summary:", 20, 85);
    
    let yPos = 95;
    departmentDetails.facultyAverages.forEach(faculty => {
      const facultyRating = faculty.average >= 80 ? "Excellent" : 
                           faculty.average >= 65 ? "Good" : 
                           faculty.average >= 50 ? "Average" : "Needs Improvement";
      
      doc.setFont(undefined, 'normal');
      doc.text(`${faculty.faculty}: ${faculty.average.toFixed(2)}% (${facultyRating})`, 25, yPos);
      yPos += 7;
      
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    });
    
    // Add recommendations
    yPos += 10;
    doc.setFont(undefined, 'bold');
    doc.text("Recommendations:", 20, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'normal');
    if (departmentDetails.departmentAverage >= 80) {
      doc.text("• Continue current teaching methodologies and share best practices across departments", 25, yPos);
      yPos += 7;
      doc.text("• Recognize and reward top performing faculty members", 25, yPos);
    } else if (departmentDetails.departmentAverage >= 65) {
      doc.text("• Organize faculty development programs to enhance teaching skills", 25, yPos);
      yPos += 7;
      doc.text("• Implement peer observation and feedback mechanisms", 25, yPos);
    } else {
      doc.text("• Develop a comprehensive improvement plan with specific targets", 25, yPos);
      yPos += 7;
      doc.text("• Provide mentoring and training for faculty needing support", 25, yPos);
      yPos += 7;
      doc.text("• Review curriculum and teaching methodologies", 25, yPos);
    }
    
    // Save the PDF
    doc.save(`${selectedDepartment}_Performance_Report.pdf`);
    toast.success("Department report generated successfully!");
  };

  // Get performance rating
  const getPerformanceRating = (score) => {
    if (score >= 80) return "EXCELLENT";
    if (score >= 65) return "GOOD";
    if (score >= 50) return "AVERAGE";
    return "NEEDS IMPROVEMENT";
  };

  // Get performance rating color
  const getPerformanceColor = (score) => {
    if (score >= 80) return "#27ae60";
    if (score >= 65) return "#f39c12";
    if (score >= 50) return "#e67e22";
    return "#e74c3c";
  };

  // Get button class based on performance
  const getButtonClass = () => {
    if (!facultyPerformance) return "";
    const performance = facultyPerformance.overallAverage;
    if (performance < 60) return "warning";
    if (performance >= 60 && performance < 80) return "improvement";
    return "appreciation";
  };

  // Get button text based on performance
  const getButtonText = () => {
    if (!facultyPerformance) return "Generate Faculty Letter";
    const performance = facultyPerformance.overallAverage;
    if (performance < 60) return "Generate Warning Letter";
    if (performance >= 60 && performance < 80) return "Generate Improvement Suggestions";
    return "Generate Appreciation Letter";
  };

  return (
    <div className="principal-panel">
      <ToastContainer />
      <h2>Principal Panel - Performance Monitoring System</h2>
      
      <div className="tabs">
        <button 
          className={activeTab === "overview" ? "active" : ""} 
          onClick={() => setActiveTab("overview")}
        >
          College Overview
        </button>
        <button 
          className={activeTab === "faculty" ? "active" : ""} 
          onClick={() => setActiveTab("faculty")}
        >
          Faculty Analysis
        </button>
        <button 
          className={activeTab === "department" ? "active" : ""} 
          onClick={() => setActiveTab("department")}
        >
          Department Analysis
        </button>
      </div>
      
      {/* College Overview Tab */}
      {activeTab === "overview" && (
        <div className="tab-content">
          <h3>College Performance Overview</h3>
          
          {overallCollegePerformance ? (
            <>
              <div className="overall-score">
                <h5>Overall College Performance: {overallCollegePerformance.collegeAverage.toFixed(2)}%</h5>
                <p>Based on {overallCollegePerformance.totalSubjects} subjects across all departments</p>
                <div 
                  className="performance-rating"
                  style={{backgroundColor: getPerformanceColor(overallCollegePerformance.collegeAverage)}}
                >
                  {getPerformanceRating(overallCollegePerformance.collegeAverage)}
                </div>
              </div>
              
              <div className="charts-container">
                <div className="chart">
                  <h5>Department Performance Comparison</h5>
                  <Bar 
                    data={getCollegePerformanceChartData()} 
                    options={{
                      scales: {
                        y: {
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
              
              <div className="summary-cards">
                <div className="summary-card">
                  <h4>Total Faculties</h4>
                  <div className="summary-value">{overallCollegePerformance.totalFaculties}</div>
                  <div className="summary-label">Across all departments</div>
                </div>
                
                <div className="summary-card">
                  <h4>Total Subjects</h4>
                  <div className="summary-value">{overallCollegePerformance.totalSubjects}</div>
                  <div className="summary-label">Being taught currently</div>
                </div>
                
                <div className="summary-card">
                  <h4>College Average</h4>
                  <div className="summary-value">{overallCollegePerformance.collegeAverage.toFixed(2)}%</div>
                  <div className="summary-label">Overall performance</div>
                </div>
              </div>
              
              <div className="performance-tables">
                <div className="top-performers">
                  <h5>Top Performing Departments</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Performance</th>
                        <th>Rating</th>
                        <th>Faculties</th>
                        <th>Subjects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentPerformance
                        .sort((a, b) => b.average - a.average)
                        .map((dept, index) => (
                        <tr key={index}>
                          <td>{dept.department}</td>
                          <td>{dept.average.toFixed(2)}%</td>
                          <td>
                            <span style={{color: getPerformanceColor(dept.average)}}>
                              {getPerformanceRating(dept.average)}
                            </span>
                          </td>
                          <td>{dept.facultyCount}</td>
                          <td>{dept.subjectCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="performance-comparison">
                  <div className="top-performers">
                    <h5>Top Performing Faculties</h5>
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Performance</th>
                          <th>Rating</th>
                          <th>Subjects</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPerformers.map((faculty, index) => (
                          <tr key={index}>
                            <td>{faculty.faculty}</td>
                            <td>{faculty.average.toFixed(2)}%</td>
                            <td>
                              <span style={{color: getPerformanceColor(faculty.average)}}>
                                {getPerformanceRating(faculty.average)}
                              </span>
                            </td>
                            <td>{faculty.subjectCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="need-improvement">
                    <h5>Faculties Needing Support</h5>
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Performance</th>
                          <th>Rating</th>
                          <th>Subjects</th>
                        </tr>
                      </thead>
                      <tbody>
                        {needImprovement.map((faculty, index) => (
                          <tr key={index}>
                            <td>{faculty.faculty}</td>
                            <td>{faculty.average.toFixed(2)}%</td>
                            <td>
                              <span style={{color: getPerformanceColor(faculty.average)}}>
                                {getPerformanceRating(faculty.average)}
                              </span>
                            </td>
                            <td>{faculty.subjectCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p>Loading college performance data...</p>
          )}
        </div>
      )}
      
      {/* Faculty Analysis Tab */}
      {activeTab === "faculty" && (
        <div className="tab-content">
          <h3>Faculty Performance Analysis</h3>
          
          <div className="selection-section">
            <select 
              value={selectedFaculty} 
              onChange={e => setSelectedFaculty(e.target.value)}
              style={{width: "300px", marginBottom: "20px"}}
            >
              <option value="">Select Faculty</option>
              {facultyList.map((faculty, index) => (
                <option key={index} value={faculty}>{faculty}</option>
              ))}
            </select>
          </div>
          
          {selectedFaculty && (
            <>
              <div className="faculty-info">
                <h4>Faculty: {selectedFaculty}</h4>
                <p>Classes Teaching: {facultyClasses.join(', ') || 'No classes assigned'}</p>
              </div>
              
              {facultyPerformance ? (
                <div className="performance-results">
                  <div className="overall-score">
                    <h5>Overall Performance: {facultyPerformance.overallAverage.toFixed(2)}%</h5>
                    <p>Based on {facultyPerformance.subjects.length} subjects</p>
                    <div 
                      className="performance-rating"
                      style={{backgroundColor: getPerformanceColor(facultyPerformance.overallAverage)}}
                    >
                      {getPerformanceRating(facultyPerformance.overallAverage)}
                    </div>
                  </div>
                  
                  <div className="charts-container">
                    <div className="chart">
                      <h5>Performance by Parameter</h5>
                      <Bar 
                        data={getFacultyPerformanceChartData()} 
                        options={{
                          scales: {
                            y: {
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
                    
                    <div className="chart">
                      <h5>Performance Distribution</h5>
                      <Doughnut data={getPerformanceDistributionData()} />
                    </div>
                  </div>
                  
                  <div className="subject-performance">
                    <h5>Subject-wise Performance</h5>
                    <table>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Class</th>
                          <th>Branch</th>
                          <th>Performance</th>
                          <th>Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {facultyPerformance.subjects.map((subject, index) => (
                          <tr key={index}>
                            <td>{subject.subject}</td>
                            <td>{subject.class}</td>
                            <td>{subject.branch}</td>
                            <td>{subject.average.toFixed(2)}%</td>
                            <td>
                              <span style={{color: getPerformanceColor(subject.average)}}>
                                {getPerformanceRating(subject.average)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <button 
                    onClick={generateFacultyLetter} 
                    className={`download-btn ${getButtonClass()}`}
                  >
                    {getButtonText()}
                  </button>
                </div>
              ) : (
                <p>No performance data available for this faculty.</p>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Department Analysis Tab */}
      {activeTab === "department" && (
        <div className="tab-content">
          <h3>Department Performance Analysis</h3>
          
          <div className="selection-section">
            <select 
              value={selectedDepartment} 
              onChange={e => setSelectedDepartment(e.target.value)}
              style={{width: "300px", marginBottom: "20px"}}
            >
              <option value="">Select Department</option>
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>
          
          {selectedDepartment && (
            <>
              <div className="branch-info">
                <h4>Department: {selectedDepartment}</h4>
                <p>Faculties: {departmentFaculties.join(', ') || 'No faculties assigned'}</p>
              </div>
              
              {departmentDetails ? (
                <div className="performance-results">
                  <div className="overall-score">
                    <h5>Overall Department Performance: {departmentDetails.departmentAverage.toFixed(2)}%</h5>
                    <p>Based on {departmentDetails.totalSubjects} subjects</p>
                    <div 
                      className="performance-rating"
                      style={{backgroundColor: getPerformanceColor(departmentDetails.departmentAverage)}}
                    >
                      {getPerformanceRating(departmentDetails.departmentAverage)}
                    </div>
                  </div>
                  
                  <div className="charts-container">
                    <div className="chart">
                      <h5>Faculty Performance Comparison</h5>
                      <Bar 
                        data={getDepartmentFacultyChartData()} 
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
                  
                  <div className="faculty-performance">
                    <h5>Faculty Performance Details</h5>
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Performance</th>
                          <th>Rating</th>
                          <th>Subjects</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departmentDetails.facultyAverages.map((faculty, index) => (
                          <tr key={index}>
                            <td>{faculty.faculty}</td>
                            <td>{faculty.average.toFixed(2)}%</td>
                            <td>
                              <span style={{color: getPerformanceColor(faculty.average)}}>
                                {getPerformanceRating(faculty.average)}
                              </span>
                            </td>
                            <td>{faculty.subjects.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <button onClick={generateDepartmentReport} className="download-btn">
                    Download Department Report
                  </button>
                </div>
              ) : (
                <p>No performance data available for this department.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PrincipalPanel;