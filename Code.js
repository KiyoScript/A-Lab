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

  // Doctors get their own portal shell
  if (session.role === 'doctor' && page === 'Index') return _serve('DoctorIndex');

  // Technologists get their own portal shell
  if (session.role === 'medtech' && page === 'Index') return _serve('TechIndex');

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

function getAppInitData(token) {
  return {
    url:     ScriptApp.getService().getUrl(),
    session: getSession(token)
  };
}

// ─── Lab Service requests ────────────────────────────────────────
function handleLabServiceRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_LAB_SERVICES':    return getLabServices(payload, token);
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
    case 'GET_BRANCHES':   return getBranches(payload, token);
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
    case 'GET_PACKAGES':              return getPackages(payload, token);
    case 'CREATE_PACKAGE':            return createPackage(payload, token);
    case 'UPDATE_PACKAGE':            return updatePackage(payload, token);
    case 'DELETE_PACKAGE':            return deletePackage(payload.package_id, token);
    case 'GET_LABS_FOR_PACKAGE':      return getLabsForPackage(payload, token);
    case 'SAVE_PACKAGE_LAB_SERVICES': return savePackageLabServices(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Branch Lab Services requests ────────────────────────────────
function handleBranchLabRequest(action, payload, token) {
  const session = _getSession(token);
  if (!session) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_BRANCH_LAB_SERVICES':   return getBranchLabServices(payload, token);
    case 'UPDATE_BRANCH_LAB_SERVICE': return updateBranchLabService(payload, token);
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

// ─── MedTech requests ────────────────────────────────────────────
function handleMedTechRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_MEDTECHS':            return getMedTechs(payload, token);
    case 'CREATE_MEDTECH':          return createMedTech(payload, token);
    case 'UPDATE_MEDTECH':          return updateMedTech(payload, token);
    case 'DELETE_MEDTECH':          return deleteMedTech(payload.medtech_id, token);
    case 'CHANGE_MT_PASSWORD':      return changeMedTechPassword(payload, token);
    case 'CHANGE_OWN_MT_PASSWORD':  return changeOwnMedTechPassword(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Doctor requests ──────────────────────────────────────────────
function handleDoctorRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_DOCTORS':             return getDoctors(payload, token);
    case 'CREATE_DOCTOR':           return createDoctor(payload, token);
    case 'UPDATE_DOCTOR':           return updateDoctor(payload, token);
    case 'DELETE_DOCTOR':           return deleteDoctor(payload.doctor_id, token);
    case 'ASSIGN_DOCTOR_TO_BRANCH': return assignDoctorToBranch(payload, token);
    case 'UNASSIGN_DOCTOR':         return unassignDoctor(payload, token);
    case 'GET_DOCTOR_HISTORY':      return getDoctorAssignmentHistory(payload, token);
    case 'CHANGE_DOCTOR_PASSWORD':      return changeDoctorPassword(payload, token);
    case 'CHANGE_OWN_DOCTOR_PASSWORD':  return changeOwnDoctorPassword(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── PhilHealth requests ──────────────────────────────────────────
function handlePhilHealthRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_CLAIMS':          return getClaims(payload, token);
    case 'UPDATE_CLAIM_STATUS': return updateClaimStatus(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Orders requests ──────────────────────────────────────────────
function handleOrderRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_ORDERS':        return getOrders(payload, token);
    case 'GET_ORDER_ITEMS':   return getOrderItems(payload, token);
    case 'GET_ORDER_CLAIM':   return getOrderClaim(payload, token);
    case 'CREATE_ORDER':      return createOrder(payload, token);
    case 'CONFIRM_ORDER':     return confirmOrder(payload, token);
    case 'RECORD_PAYMENT':    return recordPayment(payload, token);
    case 'START_ITEM':        return startItem(payload, token);
    case 'COMPLETE_ITEM':     return completeItem(payload, token);
    case 'UPLOAD_RESULT':     return uploadResult(payload, token);
    case 'VERIFY_RESULT':     return verifyResult(payload, token);
    case 'REJECT_RESULT':     return rejectResult(payload, token);
    case 'RELEASE_ORDER':     return releaseOrder(payload, token);
    case 'DELETE_ORDER':      return deleteOrder(payload, token);
    case 'UPDATE_ORDER_NOTES':return updateOrderNotes(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Admin requests ───────────────────────────────────────────────
function handleAdminRequest(action, payload, token) {
  if (action === 'LOGIN') return login(payload.username, payload.password, payload.role_hint);
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
    case 'DELETE_BRANCH_ADMIN':               return deleteBranchAdmin(payload.admin_id);
    case 'CHANGE_OWN_BRANCH_ADMIN_PASSWORD':  return changeOwnBranchAdminPassword(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ── Branches ────────────────────────────────────────────────────
function getBranchesInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const branches = getBranches({}, token);
    return { success: true, session: session.data, branches: branches };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Departments ─────────────────────────────────────────────────
function getDepartmentsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const depts = getDepartments({}, token);
    return { success: true, session: session.data, depts: depts };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Lab Services ────────────────────────────────────────────────
function getLabServicesInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const labs = getLabServices({}, token);
    return { success: true, session: session.data, labs: labs };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Packages ────────────────────────────────────────────────────
function getPackagesInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const packages = getPackages({}, token);
    const labs     = getLabServices({}, token);
    return { success: true, session: session.data, packages: packages, labs: labs };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Discounts ───────────────────────────────────────────────────
function getDiscountsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const discounts = getDiscountsAll(token);
    return { success: true, session: session.data, discounts: discounts };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Doctors ─────────────────────────────────────────────────────
function getDoctorsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const doctors  = getDoctors({}, token);
    const branches = getBranches({}, token);
    return { success: true, session: session.data, doctors: doctors, branches: branches };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── MedTechs ────────────────────────────────────────────────────
function getMedTechsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const medtechs = getMedTechs({}, token);
    const branches = getBranches({}, token);
    return { success: true, session: session.data, medtechs: medtechs, branches: branches };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Orders ──────────────────────────────────────────────────────
function getOrdersInitData(token) {
   try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const orders = getOrders({}, token);
    return { success: true, session: session.data, orders: orders };
   } catch(e) {
     return { success: false, error: e.message };
   }
}

// ── Patients ────────────────────────────────────────────────────
function getPatientsInitData(token) {
  try {
    const session  = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const patients  = getPatients({}, token);
    const branches  = getBranches({}, token);
    const discounts = getDiscountsAll(token);
    return { success: true, session: session.data, patients: patients, branches: branches, discounts: discounts };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── Admins ──────────────────────────────────────────────────────
function getAdminsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const s = session.data;
    const isBranchAdmin = s.role === 'branch_admin';
    const branches      = getBranches({}, token);
    const branchAdmins  = getBranchAdmins(token);
    const superAdmins   = isBranchAdmin ? { success: true, data: [] } : getSuperAdmins(token);
    return { success: true, session: s, branches: branches, branchAdmins: branchAdmins, superAdmins: superAdmins };
  } catch(e) {
    return { success: false, error: e.message };
  }
}