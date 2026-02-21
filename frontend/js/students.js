const API_BASE = "http://127.0.0.1:3000/api/students";
const token = localStorage.getItem("token");
const studentTable = document.getElementById("student-table-body");
const msg = document.getElementById("student-msg");

// Redirect if not logged in
if (!token) {
  alert("Unauthorized! Please login again.");
  window.location.href = "login.html";
}

// Fetch all students
async function fetchStudents() {
  try {
    const res = await fetch(API_BASE, {
      headers: { Authorization: "Bearer " + token }
    });

    const students = await res.json();

    if (!res.ok) throw new Error(students.message || "Failed to load students");

    studentTable.innerHTML = "";
    students.forEach(s => {
      studentTable.innerHTML += `
        <tr>
          <td>${s.id}</td>
          <td>${s.name}</td>
          <td>${s.rollNo}</td>
          <td>${s.className}</td>
          <td>
            <button onclick="editStudent(${s.id})">Edit</button>
            <button onclick="deleteStudent(${s.id})">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Add or update student
async function submitStudent() {
  const id = document.getElementById("student-id").value;
  const name = document.getElementById("student-name").value.trim();
  const roll = document.getElementById("student-roll").value.trim();
  const cls = document.getElementById("student-class").value.trim();

  if (!name || !roll || !cls) {
    msg.style.color = "red";
    msg.innerText = "All fields are required";
    return;
  }

  const url = id ? `${API_BASE}/${id}` : API_BASE;
  const method = id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      // Send fields matching Sequelize property names
      body: JSON.stringify({ name, rollNo: roll, className: cls })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Failed to save student");

    msg.style.color = "green";
    msg.innerText = data.message || "Student saved successfully";

    clearForm();
    fetchStudents();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Edit student
async function editStudent(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { Authorization: "Bearer " + token }
    });

    const s = await res.json();

    if (!res.ok) throw new Error(s.message || "Failed to fetch student");

    document.getElementById("student-id").value = s.id;
    document.getElementById("student-name").value = s.name;
    document.getElementById("student-roll").value = s.rollNo;
    document.getElementById("student-class").value = s.className;

    document.getElementById("form-title").innerText = "Edit Student";
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Delete student
async function deleteStudent(id) {
  if (!confirm("Are you sure?")) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Failed to delete student");

    msg.style.color = "green";
    msg.innerText = data.message || "Student deleted successfully";

    fetchStudents();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Clear form
function clearForm() {
  document.getElementById("student-id").value = "";
  document.getElementById("student-name").value = "";
  document.getElementById("student-roll").value = "";
  document.getElementById("student-class").value = "";
  document.getElementById("form-title").innerText = "Add Student";
}

// Auto-load
window.onload = fetchStudents;
