const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('token');
let me = null;

async function api(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  const body = await response.json();
  if (!response.ok) {
    const details = body.error.details?.map(d => `${d.path}: ${d.message}`).join('; ');
    throw new Error(details ? `${body.error.message} (${details})` : body.error.message);
  }
  return body.data;
}

// Runs an action and shows any error text instead of failing silently.
async function run(action) {
  $('error').textContent = '';
  try { await action(); } catch (error) { $('error').textContent = error.message; }
}

function logout() {
  token = null;
  me = null;
  sessionStorage.removeItem('token');
  $('panel').classList.add('hidden');
  $('login-form').classList.remove('hidden');
}

async function showPanel() {
  me = await api('/auth/me');
  const users = await api('/users'); // 403 for a non-admin
  $('me').textContent = `${me.email} (${me.role})`;
  $('login-form').classList.add('hidden');
  $('panel').classList.remove('hidden');
  renderUsers(users);
}

function renderUsers(users) {
  $('users').replaceChildren(...users.map(user => {
    const select = document.createElement('select');
    for (const role of ['user', 'admin']) select.add(new Option(role, role, false, role === user.role));
    select.disabled = user.id === me.id;
    select.onchange = () => run(async () => {
      await api(`/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) });
      await showPanel();
    });
    const row = document.createElement('tr');
    for (const content of [user.email, select, new Date(user.created_at).toLocaleString()]) {
      const cell = row.insertCell();
      cell.append(content);
    }
    return row;
  }));
}

$('login-form').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const form = new FormData(event.target);
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    token = data.token;
    sessionStorage.setItem('token', token);
    event.target.reset();
    try { await showPanel(); } catch (error) { logout(); throw error; }
  });
};

$('create-form').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    await api('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    event.target.reset();
    await showPanel();
  });
};

$('logout').onclick = logout;

if (token) run(async () => { try { await showPanel(); } catch (error) { logout(); throw error; } });
