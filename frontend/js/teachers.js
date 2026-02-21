const API_BASE = "http://127.0.0.1:3000/api/teachers";
const token = localStorage.getItem("token");

const teacherTable = document.getElementById("teacher-table-body");
const msg = document.getElementById("teacher-msg");

// Redirect if not logged in
if (!token) {
  alert("Unauthorized! Please login again.");
  window.location.href = "login.html";
}

// Fetch all teachers
async function fetchTeachers() {
  try {
    const res = await fetch(API_BASE, {
      headers: { Authorization: "Bearer " + token },
    });

    const teachers = await res.json();
    if (!res.ok) throw new Error(teachers.message || "Failed to load teachers");

    teacherTable.innerHTML = "";

    teachers.forEach((t) => {
      teacherTable.innerHTML += `
        <tr>
          <td>${t.id}</td>
          <td>${t.name}</td>
          <td>${t.department}</td>
          <td>
            <button onclick="editTeacher(${t.id})">Edit</button>
            <button onclick="deleteTeacher(${t.id})">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Add / Update teacher
async function submitTeacher() {
  const id = document.getElementById("teacher-id").value;
  const name = document.getElementById("teacher-name").value.trim();
  const department = document.getElementById("teacher-department").value.trim();

  if (!name || !department) {
    msg.style.color = "red";
    msg.innerText = "All fields are required";
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `${API_BASE}/${id}` : API_BASE;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ name, department }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to save teacher");

    msg.style.color = "green";
    msg.innerText = data.message || "Teacher saved successfully";

    clearForm();
    fetchTeachers();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Edit teacher
async function editTeacher(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { Authorization: "Bearer " + token },
    });

    const t = await res.json();
    if (!res.ok) throw new Error(t.message || "Failed to fetch teacher");

    document.getElementById("teacher-id").value = t.id;
    document.getElementById("teacher-name").value = t.name;
    document.getElementById("teacher-department").value = t.department;

    document.getElementById("form-title").innerText = "Edit Teacher";
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Delete teacher
async function deleteTeacher(id) {
  if (!confirm("Are you sure?")) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) throw new Error("Failed to delete teacher");

    fetchTeachers();
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = err.message;
  }
}

// Clear form
function clearForm() {
  document.getElementById("teacher-id").value = "";
  document.getElementById("teacher-name").value = "";
  document.getElementById("teacher-department").value = "";
  document.getElementById("form-title").innerText = "Add Teacher";
}

// Auto-load
window.onload = fetchTeachers;
