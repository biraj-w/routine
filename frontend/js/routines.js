const API_BASE = "http://127.0.0.1:3000/api/routines";
const STUDENT_API = "http://127.0.0.1:3000/api/students";
const TEACHER_API = "http://127.0.0.1:3000/api/teachers";
const SUBJECT_API = "http://127.0.0.1:3000/api/subjects";

const routineTableBody = document.getElementById("routine-table-body");
const msg = document.getElementById("routine-msg");

const studentSelect = document.getElementById("routine-student");
const teacherSelect = document.getElementById("routine-teacher");
const subjectSelect = document.getElementById("routine-subject");

async function fetchDropdowns() {
  try {
    const [students, teachers, subjects] = await Promise.all([
      fetch(STUDENT_API).then(res => res.json()),
      fetch(TEACHER_API).then(res => res.json()),
      fetch(SUBJECT_API).then(res => res.json())
    ]);

    studentSelect.innerHTML = '<option value="">Select Student</option>';
    students.forEach(s => studentSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`);

    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    teachers.forEach(t => teacherSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);

    subjectSelect.innerHTML = '<option value="">Select Subject</option>';
    subjects.forEach(s => subjectSelect.innerHTML += `<option value="${s.id}">${s.subjectName || s.name}</option>`);
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Failed to load dropdowns: " + err.message;
  }
}

async function fetchRoutines() {
  try {
    const res = await fetch(API_BASE);
    const routines = await res.json();
    routineTableBody.innerHTML = "";

    routines.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.Student ? r.Student.name : "-"}</td>
        <td>${r.Teacher ? r.Teacher.name : "-"}</td>
        <td>${r.Subject ? r.Subject.subjectName || r.Subject.name : "-"}</td>
        <td>${r.day}</td>
        <td>${r.startTime}</td>
        <td>${r.endTime}</td>
        <td>
          <button onclick="editRoutine(${r.id})">Edit</button>
          <button onclick="deleteRoutine(${r.id})">Delete</button>
        </td>
      `;
      routineTableBody.appendChild(tr);
    });
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Failed to load routines: " + err.message;
  }
}

async function submitRoutine() {
  const routineId = document.getElementById("routine-id").value;
  const studentId = studentSelect.value;
  const teacherId = teacherSelect.value;
  const subjectId = subjectSelect.value;
  const day = document.getElementById("routine-day").value;
  const startTime = document.getElementById("routine-start").value;
  const endTime = document.getElementById("routine-end").value;

  if (!studentId || !teacherId || !subjectId || !day || !startTime || !endTime) {
    msg.style.color = "red";
    msg.innerText = "All fields are required";
    return;
  }

  try {
    const method = routineId ? "PUT" : "POST";
    const url = routineId ? `${API_BASE}/${routineId}` : API_BASE;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, teacherId, subjectId, day, startTime, endTime })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Failed to save routine");

    msg.style.color = "green";
    msg.innerText = routineId ? "Routine updated successfully" : "Routine created successfully";

    document.getElementById("routine-form").reset();
    document.getElementById("routine-id").value = "";

    fetchRoutines();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

async function editRoutine(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    const r = await res.json();
    document.getElementById("routine-id").value = r.id;
    studentSelect.value = r.studentId;
    teacherSelect.value = r.teacherId;
    subjectSelect.value = r.subjectId;
    document.getElementById("routine-day").value = r.day;
    document.getElementById("routine-start").value = r.startTime;
    document.getElementById("routine-end").value = r.endTime;

    msg.style.color = "blue";
    msg.innerText = "Editing routine ID " + r.id;
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Failed to load routine: " + err.message;
  }
}

async function deleteRoutine(id) {
  if (!confirm("Are you sure you want to delete this routine?")) return;
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to delete");

    msg.style.color = "green";
    msg.innerText = data.message;

    fetchRoutines();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

window.onload = () => {
  fetchDropdowns().then(fetchRoutines);
};