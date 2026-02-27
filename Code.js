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

// ─── Lab Service requests ────────────────────────────────────────
function handleLabServiceRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_LAB_SERVICES':    return getLabServices(token);
    case 'CREATE_LAB_SERVICE':  return createLabService(payload, token);
    case 'UPDATE_LAB_SERVICE':  return updateLabService(payload, token);
    case 'DELETE_LAB_SERVICE':  return deleteLabService(payload.lab_id, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Branch requests ──────────────────────────────────────────────
function handleBranchRequest(action, payload, token) {
  const session = _getSession(token);
  if (!session) return { success: false, error: 'Session expired. Please log in again.', expired: true };

  switch (action) {
    case 'GET_BRANCHES':   return getBranches(token);
    case 'CREATE_BRANCH':  return session.role !== 'super_admin'
                            ? { success: false, error: 'Unauthorized. Only super admins can create branches.' }
                            : createBranch(payload);
    case 'UPDATE_BRANCH':  return session.role !== 'super_admin'
                            ? { success: false, error: 'Unauthorized. Only super admins can update branches.' }
                            : updateBranch(payload);
    case 'DELETE_BRANCH':  return session.role !== 'super_admin'
                            ? { success: false, error: 'Unauthorized. Only super admins can delete branches.' }
                            : deleteBranch(payload.branch_id);
    default:               return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Department requests ─────────────────────────────────────────
function handleDepartmentRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_DEPARTMENTS':    return getDepartments(payload, token);
    case 'CREATE_DEPARTMENT':  return createDepartment(payload, token);
    case 'UPDATE_DEPARTMENT':  return updateDepartment(payload, token);
    case 'DELETE_DEPARTMENT':  return deleteDepartment(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Patient requests ─────────────────────────────────────────────
function handlePatientRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_PATIENTS':              return getPatients(payload, token);
    case 'CREATE_PATIENT':            return createPatient(payload, token);
    case 'UPDATE_PATIENT':            return updatePatient(payload, token);
    case 'DELETE_PATIENT':            return deletePatient(payload, token);
    case 'GET_DISCOUNTS_FOR_PATIENT': return getDiscountsForPatient(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Package requests ────────────────────────────────────────────
function handlePackageRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_PACKAGES':              return getPackages(token);
    case 'CREATE_PACKAGE':            return createPackage(payload, token);
    case 'UPDATE_PACKAGE':            return updatePackage(payload, token);
    case 'DELETE_PACKAGE':            return deletePackage(payload.package_id, token);
    case 'GET_LABS_FOR_PACKAGE':      return getLabsForPackage(payload, token);
    case 'SAVE_PACKAGE_LAB_SERVICES': return savePackageLabServices(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Dept ↔ Lab Service mapping requests ─────────────────────────
function handleDeptLabRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_DEPT_LAB_MAPPINGS':     return getDeptLabMappings(payload, token);
    case 'SAVE_DEPT_LAB_SERVICES':    return saveDeptLabServices(payload, token);
    case 'GET_LAB_SERVICES_FOR_DEPT': return getLabServicesForDept(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Admin requests ───────────────────────────────────────────────
function handleAdminRequest(action, payload, token) {
  if (action === 'LOGIN') return login(payload.username, payload.password);
  if (action === 'GET_SESSION') return getSession(token);
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