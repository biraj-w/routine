async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("login-msg");

  if (!email || !password) {
    msg.style.color = "red";
    msg.innerText = "Please enter email and password";
    return;
  }

  try {
    const res = await fetch("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.style.color = "red";
      msg.innerText = data.message || "Login failed";
      return;
    }

    localStorage.setItem("token", data.token);
    if (data.role) localStorage.setItem("role", data.role);

    msg.style.color = "green";
    msg.innerText = "Login successful! Redirecting...";
    setTimeout(() => (window.location.href = "dashboard.html"), 500);
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Server error: " + err.message;
  }
}

window.onload = () => {
  if (localStorage.getItem("token")) window.location.href = "dashboard.html";
};
