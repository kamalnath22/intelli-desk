const API_BASE = "http://localhost:8080";
const TOKEN_KEY = "ticket_jwt_token";
const USER_KEY = "ticket_auth_user";

// DOM elements - Header & Auth
const userBar = document.querySelector("#user-bar");
const userName = document.querySelector("#user-name");
const userRole = document.querySelector("#user-role");
const logoutButton = document.querySelector("#logout-button");
const authSection = document.querySelector("#auth-section");
const appSection = document.querySelector("#app-section");
const authMessage = document.querySelector("#auth-message");

// Auth Tabs
const tabLogin = document.querySelector("#tab-login");
const tabRegister = document.querySelector("#tab-register");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const loginEmailInput = document.querySelector("#login-email");
const loginPasswordInput = document.querySelector("#login-password");
const registerNameInput = document.querySelector("#register-name");
const registerEmailInput = document.querySelector("#register-email");
const registerPasswordInput = document.querySelector("#register-password");

// DOM elements - Workspace
const ticketForm = document.querySelector("#ticket-form");
const subjectInput = document.querySelector("#subject");
const descriptionInput = document.querySelector("#description");
const message = document.querySelector("#message");
const ticketsBody = document.querySelector("#tickets-body");
const detail = document.querySelector("#ticket-detail");
const refreshButton = document.querySelector("#refresh-button");
const ticketsTitle = document.querySelector("#tickets-title");
const ticketSearch = document.querySelector("#ticket-search");
const statusFilter = document.querySelector("#status-filter");
const reviewSection = document.querySelector("#review-section");
const reviewBody = document.querySelector("#review-body");
let searchTimer;

// Tab Switching
tabLogin.addEventListener("click", () => switchAuthTab("login"));
tabRegister.addEventListener("click", () => switchAuthTab("register"));

function switchAuthTab(tab) {
    setAuthMessage("");
    if (tab === "login") {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginForm.hidden = false;
        registerForm.hidden = true;
    } else {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        registerForm.hidden = false;
        loginForm.hidden = true;
    }
}

// Quick fill helper for demo accounts
window.fillLogin = function(email, password) {
    switchAuthTab("login");
    loginEmailInput.value = email;
    loginPasswordInput.value = password;
    loginPasswordInput.focus();
};

// Login submission
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("");
    setButtonLoading("#login-submit-btn", true);

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: loginEmailInput.value.trim(),
                password: loginPasswordInput.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(readErrorMessage(data));
        }

        saveAuthSession(data);
        loginForm.reset();
        setupAuthenticatedView();
    } catch (error) {
        setAuthMessage(error.message || "Login failed. Check your credentials.", "error");
    } finally {
        setButtonLoading("#login-submit-btn", false);
    }
});

// Registration submission (Strictly registers as EMPLOYEE)
registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("");
    setButtonLoading("#register-submit-btn", true);

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: registerNameInput.value.trim(),
                email: registerEmailInput.value.trim(),
                password: registerPasswordInput.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(readErrorMessage(data));
        }

        // Automatic sign-in upon successful registration
        saveAuthSession(data);
        registerForm.reset();
        setupAuthenticatedView();
    } catch (error) {
        setAuthMessage(error.message || "Registration failed.", "error");
    } finally {
        setButtonLoading("#register-submit-btn", false);
    }
});

// Logout handler (Stateless: removes token from sessionStorage)
logoutButton.addEventListener("click", () => {
    logout();
});

function logout(logoutMessage = "") {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setupUnauthenticatedView();
    if (logoutMessage) {
        setAuthMessage(logoutMessage, "error");
    }
}

function saveAuthSession(authData) {
    sessionStorage.setItem(TOKEN_KEY, authData.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify({
        userId: authData.userId,
        name: authData.name,
        email: authData.email,
        role: authData.role
    }));
}

function getStoredToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function getStoredUser() {
    try {
        return JSON.parse(sessionStorage.getItem(USER_KEY));
    } catch (e) {
        return null;
    }
}

// Reusable authenticated fetch wrapper
async function apiFetch(path, options = {}) {
    const token = getStoredToken();
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        logout("Session expired or invalid token. Please log in again.");
        throw new Error("Unauthorized");
    }

    return response;
}

// View State Management
function setupAuthenticatedView() {
    const user = getStoredUser();
    if (!user) {
        setupUnauthenticatedView();
        return;
    }

    authSection.hidden = true;
    appSection.hidden = false;
    userBar.hidden = false;

    userName.textContent = user.name;
    userRole.textContent = user.role;
    userRole.className = `role-badge role-${user.role}`;

    ticketsTitle.textContent = user.role === "EMPLOYEE" ? "My Tickets" : user.role === "AGENT" ? "Assigned Tickets" : "All Tickets";
    const canCreateTicket = user.role === "EMPLOYEE";
    ticketForm.hidden = !canCreateTicket;
    ticketForm.style.display = canCreateTicket ? "grid" : "none";
    reviewSection.hidden = !["AGENT", "ADMIN"].includes(user.role);

    setMessage("");
    loadTickets();
    if (["AGENT", "ADMIN"].includes(user.role)) loadReviewQueue();
}

function setupUnauthenticatedView() {
    authSection.hidden = false;
    appSection.hidden = true;
    userBar.hidden = true;
    detail.hidden = true;
    ticketsBody.innerHTML = "";
    ticketForm.hidden = false;
    ticketForm.style.display = "grid";
    reviewSection.hidden = true;
    setMessage("");
}

// Ticket Form submission
ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    setButtonLoading("#ticket-submit-btn", true);

    try {
        const response = await apiFetch("/api/tickets", {
            method: "POST",
            body: JSON.stringify({
                subject: subjectInput.value.trim(),
                description: descriptionInput.value.trim()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(readErrorMessage(data));
        }

        ticketForm.reset();
        setMessage(`Ticket #${data.id} created successfully.`, "success");
        await loadTickets();
        await showTicket(data.id);
    } catch (error) {
        if (error.message !== "Unauthorized") {
            setMessage(error.message || "Ticket could not be created.", "error");
        }
    } finally {
        setButtonLoading("#ticket-submit-btn", false);
    }
});

refreshButton.addEventListener("click", loadTickets);
document.querySelector("#review-refresh-button").addEventListener("click", loadReviewQueue);
statusFilter.addEventListener("change", loadTickets);
ticketSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadTickets, 250);
});

async function loadTickets() {
    try {
        const params = new URLSearchParams();
        if (ticketSearch.value.trim()) params.set("keyword", ticketSearch.value.trim());
        if (statusFilter.value) params.set("status", statusFilter.value);
        const query = params.toString() ? `?${params.toString()}` : "";
        history.replaceState(null, "", `${location.pathname}${query}`);
        const response = await apiFetch(`/api/tickets${query}`);
        const tickets = await response.json();

        if (!response.ok) {
            throw new Error(readErrorMessage(tickets));
        }

        renderTicketStats(tickets);
        renderTickets(tickets);
    } catch (error) {
        if (error.message !== "Unauthorized") {
            ticketsBody.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message || "Tickets could not be loaded.")}</td></tr>`;
        }
    }
}

async function showTicket(id) {
    try {
        const response = await apiFetch(`/api/tickets/${id}`);
        const ticket = await response.json();

        if (!response.ok) {
            throw new Error(readErrorMessage(ticket));
        }

        detail.hidden = false;
        const user = getStoredUser();
        const nextStatus = { OPEN: "IN_PROGRESS", IN_PROGRESS: "RESOLVED", RESOLVED: "CLOSED" }[ticket.status];
        const canChangeStatus = user.role === "ADMIN"
            || (user.role === "AGENT" && ["OPEN", "IN_PROGRESS"].includes(ticket.status))
            || (user.role === "EMPLOYEE" && ticket.status === "RESOLVED");
        detail.innerHTML = `
            <h3>Ticket #${ticket.id}: ${escapeHtml(ticket.subject)}</h3>
            <p><strong>Status:</strong> <span class="status-badge status-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></p>
            <p><strong>Owner:</strong> ${escapeHtml(ticket.userEmail || "System")}</p>
            <p><strong>Assigned agent:</strong> ${escapeHtml(ticket.assignedAgentEmail || "Unassigned")}</p>
            <p><strong>Category:</strong> ${escapeHtml(ticket.category || "Pending review")}</p>
            <p><strong>Predicted category:</strong> ${escapeHtml(ticket.predictedCategory || "N/A")} (${ticket.mlConfidence == null ? "N/A" : `${(ticket.mlConfidence * 100).toFixed(1)}%`})</p>
            <p><strong>Classification:</strong> ${escapeHtml(ticket.classificationStatus || "PENDING")}</p>
            <p><strong>Assigned team:</strong> ${escapeHtml(ticket.assignedTeamName || "Not assigned")}</p>
            <p><strong>Priority:</strong> ${escapeHtml(ticket.priority || "Pending")}</p>
            <p><strong>SLA deadline:</strong> ${formatDate(ticket.slaDeadline)}</p>
            <p><strong>SLA status:</strong> ${escapeHtml(ticket.slaStatus || "Pending")}</p>
            <p><strong>Created:</strong> ${formatDate(ticket.createdAt)}</p>
            <p><strong>Updated:</strong> ${formatDate(ticket.updatedAt || ticket.createdAt)}</p>
            <p><strong>Description:</strong></p>
            <p>${escapeHtml(ticket.description)}</p>
            ${canChangeStatus && nextStatus ? `<div class="detail-actions"><button type="button" class="small" data-status="${nextStatus}">Move to ${formatStatus(nextStatus)}</button></div>` : ""}
            ${user.role === "ADMIN" ? `<div class="assign-controls"><label for="agent-id">Agent user ID</label><input id="agent-id" type="number" min="1" placeholder="e.g. 2"><button type="button" class="secondary small" data-assign>Assign</button>${ticket.assignedAgentId ? `<button type="button" class="secondary small" data-unassign>Unassign</button>` : ""}</div>` : ""}
        `;
        const statusButton = detail.querySelector("[data-status]");
        if (statusButton) statusButton.addEventListener("click", () => updateTicketStatus(ticket.id, statusButton.dataset.status));
        const assignButton = detail.querySelector("[data-assign]");
        if (assignButton) assignButton.addEventListener("click", () => assignTicket(ticket.id));
        const unassignButton = detail.querySelector("[data-unassign]");
        if (unassignButton) unassignButton.addEventListener("click", () => unassignTicket(ticket.id));
    } catch (error) {
        if (error.message !== "Unauthorized") {
            setMessage(error.message || "Ticket details could not be loaded.", "error");
        }
    }
}

async function updateTicketStatus(id, status) {
    if (!confirm(`Move ticket #${id} to ${formatStatus(status)}?`)) return;
    await mutateTicket(`/api/tickets/${id}/status`, { status }, id);
}

async function assignTicket(id) {
    const agentId = Number(document.querySelector("#agent-id").value);
    if (!agentId) return setMessage("Enter a valid agent user ID.", "error");
    await mutateTicket(`/api/tickets/${id}/assign`, { agentId }, id);
}

async function unassignTicket(id) {
    if (!confirm(`Unassign ticket #${id}?`)) return;
    await mutateTicket(`/api/tickets/${id}/unassign`, undefined, id);
}

async function mutateTicket(path, body, id) {
    try {
        const response = await apiFetch(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
        const data = await response.json();
        if (!response.ok) throw new Error(readErrorMessage(data));
        setMessage("Ticket updated successfully.", "success");
        await loadTickets();
        await showTicket(id);
    } catch (error) {
        if (error.message !== "Unauthorized") setMessage(error.message || "Ticket could not be updated.", "error");
    }
}

function renderTickets(tickets) {
    if (!Array.isArray(tickets) || tickets.length === 0) {
        ticketsBody.innerHTML = `<tr><td colspan="8">No tickets found.</td></tr>`;
        detail.hidden = true;
        return;
    }

    ticketsBody.innerHTML = tickets.map((ticket) => `
        <tr data-id="${ticket.id}">
            <td><strong>#${ticket.id}</strong></td>
            <td>${escapeHtml(ticket.subject)}</td>
            <td><span class="status-badge status-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></td>
            <td>${escapeHtml(ticket.userEmail || "System")}</td>
            <td>${escapeHtml(ticket.assignedAgentEmail || "Unassigned")}</td>
            <td>${escapeHtml(ticket.category || ticket.predictedCategory || "Pending")}</td>
            <td>${escapeHtml(ticket.classificationStatus || "PENDING")}${ticket.mlConfidence == null ? "" : ` · ${(ticket.mlConfidence * 100).toFixed(0)}%`}</td>
            <td>${formatDate(ticket.createdAt)}</td>
        </tr>
    `).join("");

    ticketsBody.querySelectorAll("tr").forEach((row) => {
        row.addEventListener("click", () => showTicket(row.dataset.id));
    });
}

async function loadReviewQueue() {
    try {
        const response = await apiFetch("/api/tickets/review-queue");
        const tickets = await response.json();
        if (!response.ok) throw new Error(readErrorMessage(tickets));
        reviewBody.innerHTML = tickets.length
            ? tickets.map((ticket) => reviewRow(ticket)).join("")
            : `<tr><td colspan="6">Review queue is clear.</td></tr>`;
        reviewBody.querySelectorAll("[data-classify]").forEach((button) =>
            button.addEventListener("click", () => classifyTicket(button.dataset.classify)));
    } catch (error) {
        if (error.message !== "Unauthorized") {
            reviewBody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message || "Review queue could not be loaded.")}</td></tr>`;
        }
    }
}

function reviewRow(ticket) {
    const categories = ["Hardware", "HR Support", "Access", "Miscellaneous", "Storage", "Purchase", "Internal Project", "Administrative rights"];
    return `<tr><td><strong>#${ticket.id}</strong></td><td>${escapeHtml(ticket.subject)}</td><td>${escapeHtml(ticket.predictedCategory || "N/A")}</td><td>${ticket.mlConfidence == null ? "N/A" : `${(ticket.mlConfidence * 100).toFixed(1)}%`}</td><td><select id="category-${ticket.id}">${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></td><td><button type="button" class="small" data-classify="${ticket.id}">Classify</button></td></tr>`;
}

async function classifyTicket(id) {
    const category = document.querySelector(`#category-${id}`).value;
    try {
        const response = await apiFetch(`/api/tickets/${id}/classification`, { method: "PATCH", body: JSON.stringify({ category }) });
        const data = await response.json();
        if (!response.ok) throw new Error(readErrorMessage(data));
        setMessage(`Ticket #${id} classified as ${category}.`, "success");
        await loadTickets();
        await loadReviewQueue();
    } catch (error) {
        if (error.message !== "Unauthorized") setMessage(error.message || "Classification failed.", "error");
    }
}

function renderTicketStats(tickets) {
    const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    const stats = statuses.map((status) => `<div class="ticket-stat"><strong>${tickets.filter((ticket) => ticket.status === status).length}</strong><span>${formatStatus(status)}</span></div>`).join("")
        + `<div class="ticket-stat"><strong>${tickets.filter((ticket) => ticket.classificationStatus === "MANUAL_REVIEW").length}</strong><span>Manual review</span></div>`
        + `<div class="ticket-stat"><strong>${tickets.filter((ticket) => ticket.slaStatus === "AT_RISK").length}</strong><span>SLA at risk</span></div>`
        + `<div class="ticket-stat"><strong>${tickets.filter((ticket) => ticket.slaStatus === "BREACHED").length}</strong><span>SLA breached</span></div>`;
    document.querySelector("#ticket-stats").innerHTML = stats;
}

function formatStatus(status) {
    return status === "IN_PROGRESS" ? "In progress" : status.charAt(0) + status.slice(1).toLowerCase();
}

function setButtonLoading(buttonSelector, isLoading) {
    const btn = document.querySelector(buttonSelector);
    if (btn) {
        btn.disabled = isLoading;
    }
}

function setMessage(text, type = "") {
    message.textContent = text;
    message.className = `message ${type}`.trim();
}

function setAuthMessage(text, type = "") {
    authMessage.textContent = text;
    authMessage.className = `message ${type}`.trim();
}

function readErrorMessage(body) {
    if (body.errors) {
        return Object.values(body.errors).join(" ");
    }
    return body.message || "Request failed.";
}

function formatDate(value) {
    if (!value) return "N/A";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

// Initial bootstrap check
if (getStoredToken() && getStoredUser()) {
    setupAuthenticatedView();
} else {
    setupUnauthenticatedView();
}
