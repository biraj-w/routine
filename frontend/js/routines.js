const API_BASE = "http://127.0.0.1:3000/api/routines";
const STUDENT_API = "http://127.0.0.1:3000/api/students";
const TEACHER_API = "http://127.0.0.1:3000/api/teachers";
const SUBJECT_API = "http://127.0.0.1:3000/api/subjects";

const routineTableBody = document.getElementById("routine-table-body");
const msg = document.getElementById("routine-msg");

const studentSelect = document.getElementById("routine-student");
const teacherSelect = document.getElementById("routine-teacher");
const subjectSelect = document.getElementById("routine-subject");

/**
 * Populate dropdowns with students, teachers, and subjects
 */
async function fetchDropdowns() {
  try {
    const [students, teachers, subjects] = await Promise.all([
      fetch(STUDENT_API).then(res => res.json()),
      fetch(TEACHER_API).then(res => res.json()),
      fetch(SUBJECT_API).then(res => res.json()),
    ]);

    // Populate students
    studentSelect.innerHTML = '<option value="">Select Student</option>';
    students.forEach(s => {
      studentSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });

    // Populate teachers
    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    teachers.forEach(t => {
      teacherSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });

    // Populate subjects
    subjectSelect.innerHTML = '<option value="">Select Subject</option>';
    subjects.forEach(s => {
      subjectSelect.innerHTML += `<option value="${s.id}">${s.subjectName || s.name}</option>`;
    });
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Failed to load dropdowns: " + err.message;
  }
}

/**
 * Auto-load
 */
window.onload = () => {
  fetchDropdowns().then(fetchRoutines);
};