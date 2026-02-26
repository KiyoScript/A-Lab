// ═══════════════════════════════════════════════════════════════
// CODE.GS — A-Lab Automation Hub Entry Point
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const page  = e.parameter.page || 'Index';
  const token = e.parameter.token || '';

  // Public pages — always accessible
  if (page === 'Login') return _serve('Login');

  // All other pages require a valid session token
  const session = _getSession(token);
  if (!session) return _serve('Login');

  return _serve(page);
}

function _serve(page) {
  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle('A-Lab — Automation Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ─── Branch requests ──────────────────────────────────────────────
function handleBranchRequest(action, payload, token) {
  // Validate session for all branch actions
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_BRANCHES':   return getBranches();
    case 'CREATE_BRANCH':  return createBranch(payload);
    case 'UPDATE_BRANCH':  return updateBranch(payload);
    case 'DELETE_BRANCH':  return deleteBranch(payload.branch_id);
    default:               return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Admin requests ───────────────────────────────────────────────
function handleAdminRequest(action, payload, token) {
  // LOGIN does not need a token
  if (action === 'LOGIN') return login(payload.username, payload.password);

  // GET_SESSION just validates the token
  if (action === 'GET_SESSION') return getSession(token);

  // All other actions require a valid session
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };

  switch (action) {
    case 'LOGOUT':              return logout(token);
    case 'GET_SUPER_ADMINS':    return getSuperAdmins();
    case 'CREATE_SUPER_ADMIN':  return createSuperAdmin(payload);
    case 'UPDATE_SUPER_ADMIN':  return updateSuperAdmin(payload);
    case 'DELETE_SUPER_ADMIN':  return deleteSuperAdmin(payload.admin_id);
    case 'GET_BRANCH_ADMINS':   return getBranchAdmins();
    case 'CREATE_BRANCH_ADMIN': return createBranchAdmin(payload);
    case 'UPDATE_BRANCH_ADMIN': return updateBranchAdmin(payload);
    case 'DELETE_BRANCH_ADMIN': return deleteBranchAdmin(payload.admin_id);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Department requests ──────────────────────────────────────────
function handleDepartmentRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_DEPARTMENTS':   return getDepartments(payload, token);
    case 'CREATE_DEPARTMENT': return createDepartment(payload, token);
    case 'UPDATE_DEPARTMENT': return updateDepartment(payload, token);
    case 'DELETE_DEPARTMENT': return deleteDepartment(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}