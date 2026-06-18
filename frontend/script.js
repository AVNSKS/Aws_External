const roleDescriptions = {
  Admin: 'Full access to manage every record and review team performance.',
  Manager: 'Can review progress, monitor approvals, and add operational updates.',
  Staff: 'Can view the dashboard and submit routine task updates.'
};

const state = {
  records: [],
  role: 'Admin',
  user: '',
  token: '',
  authMode: 'login'
};

const apiBaseUrl = window.API_BASE_URL || window.location.origin;

const recordsBody = document.getElementById('recordsBody');
const totalCount = document.getElementById('totalCount');
const completedCount = document.getElementById('completedCount');
const pendingCount = document.getElementById('pendingCount');
const formMessage = document.getElementById('formMessage');
const roleLabel = document.getElementById('roleLabel');
const roleDescription = document.getElementById('roleDescription');
const refreshButton = document.getElementById('refreshButton');
const recordForm = document.getElementById('recordForm');
const roleButtons = document.querySelectorAll('.role-button');
const loginPanel = document.getElementById('loginPanel');
const loginForm = document.getElementById('loginForm');
const authTitle = document.getElementById('authTitle');
const authSubmitButton = document.getElementById('authSubmitButton');
const authMessage = document.getElementById('authMessage');
const authHelp = document.getElementById('authHelp');
const roleField = document.getElementById('roleField');
const authTabs = document.querySelectorAll('.auth-tab');
const appBanner = document.getElementById('appBanner');
const sessionUser = document.getElementById('sessionUser');
const sessionRole = document.getElementById('sessionRole');
const logoutButton = document.getElementById('logoutButton');
const dashboardContent = document.getElementById('dashboardContent');
const toggleStatusButton = document.getElementById('toggleStatusButton');

function getSavedSession() {
  try {
    return JSON.parse(localStorage.getItem('dashboardSession') || 'null');
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem('dashboardSession', JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem('dashboardSession');
}

async function authFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  return fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  });
}

function setAuthMode(mode) {
  state.authMode = mode === 'register' ? 'register' : 'login';
  const isRegistering = state.authMode === 'register';

  authTitle.textContent = isRegistering ? 'Create an account' : 'Sign in to open the dashboard';
  authSubmitButton.textContent = isRegistering ? 'Create account' : 'Log in';
  roleField.hidden = !isRegistering;
  authMessage.textContent = '';
  authHelp.innerHTML = isRegistering
    ? 'New accounts are saved in the backend users table and can log in immediately.'
    : 'Use one of the seeded accounts with password <strong>demo123</strong>. The dashboard loads the account role after login.';

  const passwordInput = loginForm.elements.password;
  passwordInput.placeholder = isRegistering ? 'At least 6 characters' : 'demo123';
  passwordInput.autocomplete = isRegistering ? 'new-password' : 'current-password';

  authTabs.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.authMode === state.authMode);
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function renderStats() {
  totalCount.textContent = state.records.length;
  completedCount.textContent = state.records.filter((record) => record.status === 'completed').length;
  pendingCount.textContent = state.records.filter((record) => record.status === 'pending').length;
}

function renderTable() {
  if (!state.records.length) {
    recordsBody.innerHTML = '<tr><td colspan="5" class="empty-state">No operational records yet.</td></tr>';
    return;
  }

  recordsBody.innerHTML = state.records
    .map(
      (record) => `
        <tr>
          <td>${record.username || 'Unknown'}</td>
          <td>${record.team_name}</td>
          <td>${record.task_name}</td>
          <td><span class="status-badge status-${record.status}">${record.status}</span></td>
          <td>${formatDate(record.created_at)}</td>
        </tr>
      `
    )
    .join('');
}

function renderDashboard() {
  renderStats();
  renderTable();
}

async function loadRecords() {
  recordsBody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading records...</td></tr>';

  try {
    const response = await authFetch('/records');

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please log in again.');
      }
      throw new Error('Request failed');
    }

    state.records = await response.json();
    renderDashboard();
    formMessage.textContent = '';
  } catch (error) {
    console.error(error);
    recordsBody.innerHTML = '<tr><td colspan="4" class="empty-state">Unable to load records.</td></tr>';
  }
}

async function submitRecord(event) {
  event.preventDefault();

  const formData = new FormData(recordForm);
  const payload = {
    teamName: formData.get('teamName'),
    taskName: formData.get('taskName'),
    status: formData.get('status')
  };

  try {
    const response = await authFetch('/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please log in again.');
      }
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || 'Unable to create record');
    }

    recordForm.reset();
    formMessage.textContent = 'Record added successfully.';
    await loadRecords();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function updateFirstRecordStatus() {
  if (!state.records.length) {
    formMessage.textContent = 'No records available to update.';
    return;
  }

  const [firstRecord] = state.records;
  const nextStatus = firstRecord.status === 'completed' ? 'pending' : 'completed';

  try {
    const response = await authFetch(`/records/${firstRecord.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: nextStatus })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || 'Unable to update record');
    }

    formMessage.textContent = 'Record status updated.';
    await loadRecords();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

function setRole(role) {
  state.role = role;
  roleLabel.textContent = role;
  roleDescription.textContent = roleDescriptions[role] || roleDescriptions.Admin;
  sessionRole.textContent = `Role: ${role}`;

  roleButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.role === role);
  });
}

async function showApp(session) {
  state.user = session.username;
  state.role = session.role;
  state.token = session.token;
  loginPanel.hidden = true;
  appBanner.hidden = false;
  dashboardContent.hidden = false;
  document.body.classList.remove('login-view');
  document.body.classList.add('dashboard-view');
  authMessage.textContent = '';
  sessionUser.textContent = `Welcome, ${session.username}`;
  sessionRole.textContent = `Role: ${session.role}`;
  setRole(session.role);
  loadRecords();
}

function showLogin() {
  state.user = '';
  state.token = '';
  appBanner.hidden = true;
  dashboardContent.hidden = true;
  loginPanel.hidden = false;
  document.body.classList.add('login-view');
  document.body.classList.remove('dashboard-view');
}

async function handleAuthSuccess(data) {
  const session = {
    token: data.token,
    username: data.user.username,
    role: data.user.role
  };

  saveSession(session);
  formMessage.textContent = '';
  await showApp(session);
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();
  const role = String(formData.get('role') || 'Staff').trim();
  const path = state.authMode === 'register' ? '/auth/register' : '/auth/login';
  const payload = state.authMode === 'register' ? { username, password, role } : { username, password };

  authMessage.textContent = '';

  authFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || 'Authentication failed.');
      }

      return response.json();
    })
    .then(handleAuthSuccess)
    .catch((error) => {
      authMessage.textContent = error.message;
    });
});

logoutButton.addEventListener('click', () => {
  authFetch('/auth/logout', { method: 'POST' }).finally(() => {
    clearSession();
    showLogin();
  });
});

roleButtons.forEach((button) => {
  button.addEventListener('click', () => setRole(button.dataset.role));
});

authTabs.forEach((button) => {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});

recordForm.addEventListener('submit', submitRecord);
refreshButton.addEventListener('click', loadRecords);
toggleStatusButton.addEventListener('click', updateFirstRecordStatus);

const savedSession = getSavedSession();

setRole(state.role);
setAuthMode(state.authMode);

if (savedSession?.token && savedSession?.username && savedSession?.role) {
  state.token = savedSession.token;
  authFetch('/auth/me')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Session expired');
      }

      return response.json();
    })
    .then((data) => {
      showApp({
        token: savedSession.token,
        username: data.user.username,
        role: data.user.role
      });
    })
    .catch(() => {
      clearSession();
      showLogin();
    });
} else {
  showLogin();
}
