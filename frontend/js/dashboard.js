// dashboard.js
const token = localStorage.getItem("token");

// Redirect to login if no token
if (!token) {
  window.location.href = "login.html";
}

// Main content div
const contentDiv = document.getElementById("content");

// Function to navigate between sections
function navigate(section) {
  contentDiv.innerHTML = ""; // clear previous content

  switch(section) {
    case "students":
      contentDiv.innerHTML = `<iframe src="students.html" frameborder="0" style="width:100%; height:600px;"></iframe>`;
      break;
    case "teachers":
      contentDiv.innerHTML = `<iframe src="teachers.html" frameborder="0" style="width:100%; height:600px;"></iframe>`;
      break;
    case "subjects":
      contentDiv.innerHTML = `<iframe src="subjects.html" frameborder="0" style="width:100%; height:600px;"></iframe>`;
      break;
    case "routines":
      contentDiv.innerHTML = `<iframe src="routines.html" frameborder="0" style="width:100%; height:600px;"></iframe>`;
      break;
    default:
      contentDiv.innerHTML = `<p>Select a section from the menu.</p>`;
      break;
  }
}

// Logout function
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "login.html";
}

// Optional: load students section by default
window.onload = () => {
  navigate("students");
};
