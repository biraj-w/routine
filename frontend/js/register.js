async function register() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const msg = document.getElementById("register-msg");

  if (!name || !email || !password || !confirmPassword) {
    msg.style.color = "red";
    msg.innerText = "All fields are required!";
    return;
  }

  if (password !== confirmPassword) {
    msg.style.color = "red";
    msg.innerText = "Passwords do not match!";
    return;
  }

  try {
    const res = await fetch("http://127.0.0.1:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      msg.style.color = "green";
      msg.innerText = "Registration successful! Redirecting to login...";
      setTimeout(() => (window.location.href = "login.html"), 2000);
    } else {
      msg.style.color = "red";
      msg.innerText = data.message || "Registration failed!";
    }
  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Server error: " + err.message;
  }
}
