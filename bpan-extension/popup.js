// BPAN Research Notes — Popup Script
let API_BASE = "https://bpan-app.vercel.app";

// Load saved API base on startup
chrome.storage.local.get(["bpan_api_base"], (data) => {
  if (data.bpan_api_base) API_BASE = data.bpan_api_base;
});

const loginView = document.getElementById("login-view");
const loggedInView = document.getElementById("logged-in-view");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const userInfo = document.getElementById("user-info");
const toggleBtn = document.getElementById("toggle-btn");
const logoutBtn = document.getElementById("logout-btn");

// Check if already logged in
chrome.storage.local.get(["bpan_token", "bpan_user_email"], (data) => {
  if (data.bpan_token) {
    showLoggedIn(data.bpan_user_email);
  }
});

// Login
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Please enter email and password");
    return;
  }

  loginBtn.textContent = "Logging in...";
  loginBtn.disabled = true;
  loginError.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/extension/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok && data.token) {
      chrome.storage.local.set({
        bpan_token: data.token,
        bpan_user_email: email,
      });
      showLoggedIn(email);

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "logged-in" });
        }
      });
    } else {
      showError(data.error || "Login failed");
    }
  } catch (err) {
    showError("Could not connect to BPAN. Is the app running?");
  }

  loginBtn.textContent = "Log in";
  loginBtn.disabled = false;
});

// Toggle sidebar
toggleBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "toggle-sidebar" });
    }
  });
  window.close();
});

// Logout
logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["bpan_token", "bpan_user_email"]);
  loginView.style.display = "block";
  loggedInView.style.display = "none";
});

function showLoggedIn(email) {
  loginView.style.display = "none";
  loggedInView.style.display = "block";
  userInfo.textContent = `✓ Logged in as ${email}`;
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
}
