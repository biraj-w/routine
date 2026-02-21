// ================= SUBJECT MANAGEMENT =================
const API_BASE = "http://127.0.0.1:3000/api/subjects";
const token = localStorage.getItem("token");

const subjectTable = document.getElementById("subject-table-body");
const msg = document.getElementById("subject-msg");
const submitBtn = document.getElementById("submitBtn");
const formTitle = document.getElementById("form-title");

const subjectIdInput = document.getElementById("subject-id");
const subjectNameInput = document.getElementById("subject-name");

// ================= AUTH CHECK =================
if (!token) {
  alert("Session expired. Please login again.");
  window.location.href = "login.html";
}

// ================= HELPER FUNCTIONS =================
const showMessage = (text, type = "success") => {
  msg.textContent = text;
  msg.style.color = type === "error" ? "#e74a3b" : "#1cc88a";
};

const clearMessage = () => {
  msg.textContent = "";
};

const clearForm = () => {
  subjectIdInput.value = "";
  subjectNameInput.value = "";
  formTitle.textContent = "Add Subject";
};

const createButton = (text, className, onClick) => {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.className = className;
  btn.addEventListener("click", onClick);
  return btn;
};

// ================= FETCH SUBJECTS =================
async function fetchSubjects() {
  try {
    clearMessage();
    subjectTable.innerHTML = "";

    const res = await fetch(API_BASE, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const subjects = await res.json();
    if (!res.ok) throw new Error(subjects.message || "Failed to load subjects");

    subjects.forEach((subject) => {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = subject.id;

      const nameCell = document.createElement("td");
      nameCell.textContent = subject.subjectName;

      const actionCell = document.createElement("td");

      const editBtn = createButton("Edit", "edit-btn", () =>
        editSubject(subject.id)
      );
      const deleteBtn = createButton("Delete", "delete-btn", () =>
        deleteSubject(subject.id)
      );

      actionCell.append(editBtn, deleteBtn);
      row.append(idCell, nameCell, actionCell);
      subjectTable.appendChild(row);
    });
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// ================= ADD / UPDATE =================
async function submitSubject() {
  const id = subjectIdInput.value;
  const name = subjectNameInput.value.trim();

  if (!name) {
    showMessage("Subject name is required", "error");
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `${API_BASE}/${id}` : API_BASE;

  try {
    submitBtn.disabled = true;

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subjectName: name }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to save subject");

    showMessage(data.message || "Saved successfully");
    clearForm();
    fetchSubjects();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
}

// ================= EDIT =================
async function editSubject(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const subject = await res.json();
    if (!res.ok) throw new Error(subject.message || "Failed to fetch subject");

    subjectIdInput.value = subject.id;
    subjectNameInput.value = subject.subjectName;
    formTitle.textContent = "Edit Subject";
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// ================= DELETE =================
async function deleteSubject(id) {
  if (!confirm("Are you sure you want to delete this subject?")) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Delete failed");

    showMessage(data.message || "Deleted successfully");
    fetchSubjects();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// ================= EVENTS =================
submitBtn.addEventListener("click", submitSubject);
window.addEventListener("DOMContentLoaded", fetchSubjects);