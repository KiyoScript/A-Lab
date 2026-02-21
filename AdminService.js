// ═══════════════════════════════════════════════════════════════
// ADMIN SERVICE
// Manages Super Admins (Registry-level) and Branch Admins (per branch).
// Super Admin → stored in Registry SS → "Super Admins" sheet
// Branch Admin → stored in branch SS → "Admins" sheet
// ═══════════════════════════════════════════════════════════════

// ─── Shared: simple password hash (SHA-256 via Utilities) ────────
function _hashPassword(plain) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    plain,
    Utilities.Charset.UTF_8
  );
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ─── Super Admin Sheet (in Registry SS) ──────────────────────────
function _getSuperAdminSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Super Admins');

  if (!sh) {
    sh = ss.insertSheet('Super Admins');
    const headers = ['admin_id', 'full_name', 'username', 'password_hash', 'status', 'created_at', 'updated_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 170);
  }

  return sh;
}

// ─── Branch Admin Sheet (in branch SS) ───────────────────────────
function _getBranchAdminSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Admins');

  if (!sh) {
    sh = ss.insertSheet('Admins');
    const headers = ['admin_id', 'full_name', 'username', 'password_hash', 'branch_id', 'branch_name', 'status', 'created_at', 'updated_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 160);
  }

  return sh;
}

// ─── SESSION helpers (Script Properties = server-side session) ───
function _setSession(data) {
  PropertiesService.getUserProperties().setProperty('ALAB_SESSION', JSON.stringify(data));
}

function _getSession() {
  const raw = PropertiesService.getUserProperties().getProperty('ALAB_SESSION');
  return raw ? JSON.parse(raw) : null;
}

function _clearSession() {
  PropertiesService.getUserProperties().deleteProperty('ALAB_SESSION');
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

function login(username, password) {
  try {
    if (!username || !password) return { success: false, error: 'Username and password are required.' };

    const hashed = _hashPassword(password.trim());
    const uname  = username.trim().toLowerCase();

    // 1. Check Super Admins first
    const superSh   = _getSuperAdminSheet();
    const superData = superSh.getDataRange().getValues();
    for (var i = 1; i < superData.length; i++) {
      const row = superData[i];
      if (String(row[2]).toLowerCase() === uname && String(row[3]) === hashed) {
        if (String(row[4]) !== 'Active') return { success: false, error: 'Account is inactive.' };
        const session = {
          admin_id:  String(row[0]),
          full_name: String(row[1]),
          username:  String(row[2]),
          role:      'super_admin',
          branch_id: null,
          branch_name: null
        };
        _setSession(session);
        return { success: true, data: session };
      }
    }

    // 2. Check Branch Admins across all branches
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;

      try {
        const adminSh   = _getBranchAdminSheet(ssId);
        const adminData = adminSh.getDataRange().getValues();
        for (var a = 1; a < adminData.length; a++) {
          const row = adminData[a];
          if (String(row[2]).toLowerCase() === uname && String(row[3]) === hashed) {
            if (String(row[6]) !== 'Active') return { success: false, error: 'Account is inactive.' };
            const session = {
              admin_id:    String(row[0]),
              full_name:   String(row[1]),
              username:    String(row[2]),
              role:        'branch_admin',
              branch_id:   String(row[4]),
              branch_name: String(row[5])
            };
            _setSession(session);
            return { success: true, data: session };
          }
        }
      } catch(_) { /* skip unreadable branch SS */ }
    }

    return { success: false, error: 'Invalid username or password.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function logout() {
  _clearSession();
  return { success: true };
}

function getSession() {
  const s = _getSession();
  return s ? { success: true, data: s } : { success: false, error: 'Not logged in.' };
}

// ═══════════════════════════════════════════════════════════════
// SUPER ADMIN CRUD (only super_admin can call these)
// ═══════════════════════════════════════════════════════════════

function getSuperAdmins() {
  try {
    const sh   = _getSuperAdminSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    return {
      success: true,
      data: data.slice(1).filter(r => r[0] !== '').map(r => ({
        admin_id:   String(r[0]),
        full_name:  String(r[1]),
        username:   String(r[2]),
        status:     String(r[4]),
        created_at: String(r[5]),
        updated_at: String(r[6])
        // password_hash intentionally excluded
      }))
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function createSuperAdmin(payload) {
  try {
    if (!payload.full_name || !payload.username || !payload.password)
      return { success: false, error: 'Full name, username, and password are required.' };

    // Check for duplicate username
    const sh   = _getSuperAdminSheet();
    const data = sh.getDataRange().getValues();
    const exists = data.slice(1).some(r => String(r[2]).toLowerCase() === payload.username.trim().toLowerCase());
    if (exists) return { success: false, error: 'Username already exists.' };

    const now     = new Date().toISOString();
    const adminId = 'SA-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    sh.appendRow([
      adminId,
      payload.full_name.trim(),
      payload.username.trim().toLowerCase(),
      _hashPassword(payload.password),
      payload.status || 'Active',
      now, now
    ]);

    return { success: true, data: { admin_id: adminId, full_name: payload.full_name.trim(),
      username: payload.username.trim().toLowerCase(), status: payload.status || 'Active',
      created_at: now, updated_at: now } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateSuperAdmin(payload) {
  try {
    const sh   = _getSuperAdminSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.admin_id));
    if (idx === -1) return { success: false, error: 'Admin not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.full_name.trim());
    sh.getRange(row, 3).setValue(payload.username.trim().toLowerCase());
    if (payload.password && payload.password.trim() !== '')
      sh.getRange(row, 4).setValue(_hashPassword(payload.password.trim()));
    sh.getRange(row, 5).setValue(payload.status || 'Active');
    sh.getRange(row, 7).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteSuperAdmin(adminId) {
  try {
    const sh   = _getSuperAdminSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(adminId));
    if (idx === -1) return { success: false, error: 'Admin not found.' };
    sh.deleteRow(idx + 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// BRANCH ADMIN CRUD (super_admin manages these)
// ═══════════════════════════════════════════════════════════════

function getBranchAdmins() {
  try {
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const allAdmins  = [];

    for (var b = 1; b < branchData.length; b++) {
      const bRow  = branchData[b];
      const ssId  = String(bRow[7] || '');
      if (!ssId) continue;

      try {
        const adminSh   = _getBranchAdminSheet(ssId);
        const adminData = adminSh.getDataRange().getValues();
        adminData.slice(1).filter(r => r[0] !== '').forEach(r => {
          allAdmins.push({
            admin_id:    String(r[0]),
            full_name:   String(r[1]),
            username:    String(r[2]),
            branch_id:   String(r[4]),
            branch_name: String(r[5]),
            status:      String(r[6]),
            created_at:  String(r[7]),
            updated_at:  String(r[8])
          });
        });
      } catch(_) {}
    }

    return { success: true, data: allAdmins };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function createBranchAdmin(payload) {
  try {
    if (!payload.full_name || !payload.username || !payload.password || !payload.branch_id)
      return { success: false, error: 'Full name, username, password, and branch are required.' };

    // Get branch info
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(payload.branch_id));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId      = String(branchRow[7]);
    const adminSh   = _getBranchAdminSheet(ssId);
    const adminData = adminSh.getDataRange().getValues();

    // Check duplicate username within branch
    const exists = adminData.slice(1).some(r => String(r[2]).toLowerCase() === payload.username.trim().toLowerCase());
    if (exists) return { success: false, error: 'Username already exists in this branch.' };

    const now     = new Date().toISOString();
    const adminId = 'ADM-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    adminSh.appendRow([
      adminId,
      payload.full_name.trim(),
      payload.username.trim().toLowerCase(),
      _hashPassword(payload.password),
      payload.branch_id,
      String(branchRow[1]),  // branch_name
      payload.status || 'Active',
      now, now
    ]);

    return { success: true, data: { admin_id: adminId, full_name: payload.full_name.trim(),
      username: payload.username.trim().toLowerCase(), branch_id: payload.branch_id,
      branch_name: String(branchRow[1]), status: payload.status || 'Active',
      created_at: now, updated_at: now } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateBranchAdmin(payload) {
  try {
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;

      try {
        const adminSh   = _getBranchAdminSheet(ssId);
        const adminData = adminSh.getDataRange().getValues();
        const idx       = adminData.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.admin_id));
        if (idx === -1) continue;

        const now = new Date().toISOString();
        const row = idx + 1;
        adminSh.getRange(row, 2).setValue(payload.full_name.trim());
        adminSh.getRange(row, 3).setValue(payload.username.trim().toLowerCase());
        if (payload.password && payload.password.trim() !== '')
          adminSh.getRange(row, 4).setValue(_hashPassword(payload.password.trim()));
        adminSh.getRange(row, 7).setValue(payload.status || 'Active');
        adminSh.getRange(row, 9).setValue(now);

        return { success: true };
      } catch(_) {}
    }

    return { success: false, error: 'Admin not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteBranchAdmin(adminId) {
  try {
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;

      try {
        const adminSh   = _getBranchAdminSheet(ssId);
        const adminData = adminSh.getDataRange().getValues();
        const idx       = adminData.findIndex((r, i) => i > 0 && String(r[0]) === String(adminId));
        if (idx === -1) continue;
        adminSh.deleteRow(idx + 1);
        return { success: true };
      } catch(_) {}
    }

    return { success: false, error: 'Admin not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

function handleAdminRequest(action, payload) {
  switch (action) {
    // Auth
    case 'LOGIN':              return login(payload.username, payload.password);
    case 'LOGOUT':             return logout();
    case 'GET_SESSION':        return getSession();
    // Super Admins
    case 'GET_SUPER_ADMINS':   return getSuperAdmins();
    case 'CREATE_SUPER_ADMIN': return createSuperAdmin(payload);
    case 'UPDATE_SUPER_ADMIN': return updateSuperAdmin(payload);
    case 'DELETE_SUPER_ADMIN': return deleteSuperAdmin(payload.admin_id);
    // Branch Admins
    case 'GET_BRANCH_ADMINS':  return getBranchAdmins();
    case 'CREATE_BRANCH_ADMIN':return createBranchAdmin(payload);
    case 'UPDATE_BRANCH_ADMIN':return updateBranchAdmin(payload);
    case 'DELETE_BRANCH_ADMIN':return deleteBranchAdmin(payload.admin_id);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ─── Run once to bootstrap the first Super Admin ─────────────────
function bootstrapSuperAdmin() {
  const result = createSuperAdmin({
    full_name: 'Super Admin',
    username:  'superadmin',
    password:  'Admin@1234',   // ← change this after first login!
    status:    'Active'
  });
  Logger.log(JSON.stringify(result));
}