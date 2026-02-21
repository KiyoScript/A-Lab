// ═══════════════════════════════════════════════════════════════
// CODE.GS — A-Lab Automation Hub Entry Point
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const page    = e.parameter.page || 'Index';
  const session = _getSession();

  // Public pages — always accessible
  const publicPages = ['Login'];
  if (publicPages.indexOf(page) !== -1) {
    return _serve(page);
  }

  // All other pages require a valid session
  if (!session) {
    return _serve('Login');
  }

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
function handleBranchRequest(action, payload) {
  switch (action) {
    case 'GET_BRANCHES':   return getBranches();
    case 'CREATE_BRANCH':  return createBranch(payload);
    case 'UPDATE_BRANCH':  return updateBranch(payload);
    case 'DELETE_BRANCH':  return deleteBranch(payload.branch_id);
    default:               return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Admin requests ───────────────────────────────────────────────
function handleAdminRequest(action, payload) {
  switch (action) {
    case 'LOGIN':               return login(payload.username, payload.password);
    case 'LOGOUT':              return logout();
    case 'GET_SESSION':         return getSession();
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