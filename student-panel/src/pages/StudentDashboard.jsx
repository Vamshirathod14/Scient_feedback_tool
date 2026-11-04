// src/pages/StudentDashboard.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import './StudentDashboard.css';
import API_BASE_URL from '../config/api';

const QUESTIONS = [
  "Punctuality of teacher",
  "Explanation of the topic/concepts",
  "Clarification of doubts",
  "Utilization of time",
  "Completion of syllabus in time",
  "Communication skills",
  "Teacher's commands and control of the class",
  "Attitude of the teacher towards the students",
  "Use of board & audio visual aids by the teacher",
  "Accesibility of Teacher after class hours"
];

function StudentDashboard({ studentData, onLogout }) {
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [suggestion, setSuggestion] = useState("");
  const [already, setAlready] = useState({ initial: false, final: false });
  const [currentRound, setCurrentRound] = useState("initial");
  const [roundAvailability, setRoundAvailability] = useState({
    initialEnabled: false,
    finalEnabled: false,
    initialEndDate: null,
    finalEndDate: null
  });
  const [isFormValid, setIsFormValid] = useState(false);
  const [touchedFields, setTouchedFields] = useState({});

  // Load available semesters when component mounts
  useEffect(() => {
    loadSemesters();
  }, []);

  // Load subjects and check round availability when semester is selected
  useEffect(() => {
    if (selectedSemester && studentData && studentData.branch && studentData.academicYear) {
      loadSubjects();
      checkSubmissionStatus();
      checkRoundAvailability();
    }
  }, [selectedSemester, studentData]);

  // Validate form whenever feedbacks or semester changes
  useEffect(() => {
    validateForm();
  }, [feedbacks, selectedSemester]);

  // Load available semesters for student's branch and academic year
  const loadSemesters = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/student-semesters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSemesters(res.data);
    } catch (error) {
      toast.error("Failed to load semesters");
    }
  };

  // Check round availability for student's branch and academic year
  const checkRoundAvailability = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/round-status?class=${selectedSemester}&branch=${studentData.branch}&academicYear=${studentData.academicYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setRoundAvailability(res.data);
      
      // Auto-select the first available round
      if (res.data.initialEnabled && !already.initial) {
        setCurrentRound("initial");
      } else if (res.data.finalEnabled && !already.final) {
        setCurrentRound("final");
      }
    } catch (error) {
      console.error("Failed to check round availability:", error);
    }
  };

  // Load subjects for selected semester, student's branch and academic year
  const loadSubjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/subjects`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          class: selectedSemester, 
          branch: studentData.branch,
          academicYear: studentData.academicYear
        }
      });
      setSubjects(res.data);
      
      // Initialize feedbacks array with null values (not rated yet)
      const initialFeedbacks = res.data.map(() => Array(QUESTIONS.length).fill(null));
      setFeedbacks(initialFeedbacks);
      setIsFormValid(false);
    } catch (error) {
      console.error("Failed to load subjects:", error);
      toast.error("Failed to load subjects: " + (error.response?.data?.error || error.message));
    }
  };

  // Check if feedback already submitted for this semester
  const checkSubmissionStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res1 = await axios.get(`${API_BASE_URL}/feedbackcheck`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          class: selectedSemester, 
          branch: studentData.branch,
          academicYear: studentData.academicYear,
          round: "initial"
        }
      });
      
      const res2 = await axios.get(`${API_BASE_URL}/feedbackcheck`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          class: selectedSemester, 
          branch: studentData.branch,
          academicYear: studentData.academicYear,
          round: "final"
        }
      });
      
      setAlready({
        initial: res1.data.submitted,
        final: res2.data.submitted
      });
    } catch (error) {
      console.error("Failed to check submission status:", error);
    }
  };

  // Handle feedback change
  const handleFeedbackChange = (subjectIndex, questionIndex, value) => {
    const newFeedbacks = [...feedbacks];
    newFeedbacks[subjectIndex][questionIndex] = parseInt(value);
    setFeedbacks(newFeedbacks);
    
    // Mark this field as touched
    const fieldKey = `subject-${subjectIndex}-question-${questionIndex}`;
    setTouchedFields(prev => ({ ...prev, [fieldKey]: true }));
  };

  // Validate all fields
  const validateForm = () => {
    // Check if semester is selected
    if (!selectedSemester) {
      setIsFormValid(false);
      return false;
    }
    
    // Check if all feedback ratings are provided (not null)
    const allRatingsProvided = feedbacks.every(subjectFeedbacks => 
      subjectFeedbacks.every(rating => rating !== null && rating >= 1 && rating <= 5)
    );
    
    setIsFormValid(allRatingsProvided);
    return allRatingsProvided;
  };

  // Check if a specific field has error
  const hasError = (subjectIndex, questionIndex) => {
    const fieldKey = `subject-${subjectIndex}-question-${questionIndex}`;
    return touchedFields[fieldKey] && (feedbacks[subjectIndex][questionIndex] === null || 
           feedbacks[subjectIndex][questionIndex] < 1 || 
           feedbacks[subjectIndex][questionIndex] > 5);
  };

  // Submit feedback (one time only per semester per round)
  const submitFeedback = async () => {
    // Mark all fields as touched to show errors
    const allTouched = {};
    feedbacks.forEach((_, subjectIndex) => {
      QUESTIONS.forEach((_, questionIndex) => {
        allTouched[`subject-${subjectIndex}-question-${questionIndex}`] = true;
      });
    });
    setTouchedFields(allTouched);
    
    if (!validateForm()) {
      toast.error("Please complete all required fields before submission");
      return;
    }
    
    if (!selectedSemester || !studentData.branch || !studentData.academicYear) {
      toast.error("Please select semester!");
      return;
    }
    
    // Check if the current round is enabled
    if ((currentRound === "initial" && !roundAvailability.initialEnabled) ||
        (currentRound === "final" && !roundAvailability.finalEnabled)) {
      toast.error(`${currentRound} round feedback is not currently accepted`);
      return;
    }
    
    const fbdata = subjects.map((subj, idx) => ({
      subject: subj.subject,
      subjectCode: subj.subjectCode,
      faculty: subj.faculty,
      facultyId: subj.facultyId,
      answers: QUESTIONS.map((q, qidx) => ({
        question: q,
        score: feedbacks[idx][qidx]
      }))
    }));
    
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/feedback`, {
        class: selectedSemester,
        branch: studentData.branch,
        academicYear: studentData.academicYear,
        feedbacks: fbdata,
        suggestion,
        round: currentRound
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Feedback for ${currentRound} round submitted successfully!`);
      
      // Update submission status
      const newAlready = { ...already };
      if (currentRound === "initial") {
        newAlready.initial = true;
        // Auto-switch to final round if available and not submitted
        if (roundAvailability.finalEnabled && !already.final) {
          setCurrentRound("final");
        }
      } else {
        newAlready.final = true;
      }
      
      setAlready(newAlready);
      setTouchedFields({});
    } catch(e) {
      toast.error(e.response?.data?.error || "Could not submit feedback");
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  // Get round display name
  const getRoundDisplayName = (round) => {
    return round === "initial" ? "Initial" : "Final";
  };

  return (
    <div className="student-dashboard">
      <ToastContainer />
      
      <div className="feedback-container">
        <div className="student-header">
          <div className="student-info">
            <h2>Feedback System</h2>
            <p>Welcome, {studentData?.name} ({studentData?.hallticket}) - {studentData?.branch} - {studentData?.academicYear}</p>
          </div>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
        
        <div className="semester-selection">
          <h3>Select Semester <span className="required-asterisk">*</span></h3>
          <div className="selection-fields">
            <select 
              value={selectedSemester} 
              onChange={e => setSelectedSemester(e.target.value)}
              required
              className={!selectedSemester && touchedFields.semester ? "error" : ""}
            >
              <option value="">Select Semester</option>
              {semesters.map(semester => (
                <option key={semester} value={semester}>{semester}</option>
              ))}
            </select>
            {!selectedSemester && touchedFields.semester && (
              <div className="error-message">Please select a semester</div>
            )}
            
            <div className="branch-info">
              <strong>Your Branch:</strong> {studentData?.branch}
            </div>
            <div className="academic-year-info">
              <strong>Academic Year:</strong> {studentData?.academicYear}
            </div>
          </div>
        </div>

        {selectedSemester && (
          already.initial && already.final ? (
            <div className="already-submitted">
              <h3>Feedback for Both Rounds Already Submitted for {selectedSemester}!</h3>
              <p>Thank you for providing your feedback for both rounds.</p>
            </div>
          ) : already.initial && currentRound === "initial" ? (
            <div className="already-submitted">
              <h3>Initial Round Feedback Already Submitted for {selectedSemester}!</h3>
              <p>You can now proceed to submit Final Round feedback if it's available.</p>
              {roundAvailability.finalEnabled && !already.final && (
                <button onClick={() => setCurrentRound("final")}>Go to Final Round</button>
              )}
            </div>
          ) : already.final && currentRound === "final" ? (
            <div className="already-submitted">
              <h3>Final Round Feedback Already Submitted for {selectedSemester}!</h3>
              <p>Thank you for providing your feedback for both rounds.</p>
            </div>
          ) : (
            ((currentRound === "initial" && roundAvailability.initialEnabled) || 
             (currentRound === "final" && roundAvailability.finalEnabled)) ? (
              <div className="feedback-form">
                <div className="form-instructions">
                  <p>Please rate each faculty on the following criteria (1 = Poor, 5 = Excellent)</p>
                  <p className="required-note"><span className="required-asterisk">*</span> All fields are required</p>
                </div>
                
                <p className="table-scroll-hint">Swipe the table sideways to rate every subject →</p>
                <div className="table-container">
                  <table className="feedback-table">
                    <thead>
                      <tr>
                        <th className="parameter-column">Parameter</th>
                        {subjects.map((subject, index) => (
                          <th key={index} className="subject-column">
                            <div className="subject-name">{subject.subject}</div>
                            <div className="faculty-name">{subject.faculty}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {QUESTIONS.map((question, qIndex) => (
                        <tr key={qIndex}>
                          <td className="question-cell">{question} <span className="required-asterisk">*</span></td>
                          {subjects.map((subject, sIndex) => {
                            const fieldHasError = hasError(sIndex, qIndex);
                            return (
                              <td
                                key={sIndex}
                                data-subject={`${subject.subject} — ${subject.faculty}`}
                                className={`rating-cell ${fieldHasError ? 'error' : ''}`}
                              >
                                <select 
                                  value={feedbacks[sIndex][qIndex] || ""}
                                  onChange={e => handleFeedbackChange(sIndex, qIndex, e.target.value)}
                                  className="rating-select"
                                  required
                                >
                                  <option value="">Select Rating</option>
                                  <option value={5}>Excellent (5)</option>
                                  <option value={4}>Very Good (4)</option>
                                  <option value={3}>Good (3)</option>
                                  <option value={2}>Average (2)</option>
                                  <option value={1}>Poor (1)</option>
                                </select>
                                {fieldHasError && (
                                  <div className="error-message-small">Rating required</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="suggestion-section">
                  <h4>Suggestions (Optional)</h4>
                  <textarea 
                    placeholder="Please provide any suggestions for improvement" 
                    value={suggestion} 
                    onChange={e => setSuggestion(e.target.value)}
                    rows="4"
                  />
                </div>
                
                <button 
                  onClick={submitFeedback} 
                  className="btn-submit"
                  disabled={!isFormValid}
                >
                  Submit Feedback for {getRoundDisplayName(currentRound)} Round
                </button>
              </div>
            ) : (
              <div className="round-disabled">
                <h3>{getRoundDisplayName(currentRound)} Round Feedback is Not Currently Available</h3>
                <p>Please check back later or contact your administrator if you believe this is an error.</p>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

export default StudentDashboard;