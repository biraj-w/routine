async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msg = document.getElementById("login-msg");

  if (!email || !password) {
    msg.style.color = "red";
    msg.innerText = "Email and password are required";
    return;
  }

  try {
    const res = await fetch("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      // ✅ Save JWT
      localStorage.setItem("token", data.token);

      msg.style.color = "green";
      msg.innerText = "Login successful! Redirecting...";

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1000);
    } else {
      msg.style.color = "red";
      msg.innerText = data.message || "Login failed";
    }
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Server not reachable";
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}
