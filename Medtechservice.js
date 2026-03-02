// ═══════════════════════════════════════════════════════════════
// MEDTECH SERVICE
// MedTech accounts are stored per-branch in each branch's SS
// under a "MedTechs" sheet.
//
// Schema: medtech_id | last_name | first_name | middle_name |
//         email | password_hash | role | status | branch_id |
//         branch_name | created_at | updated_at
//
// Access rules:
//   READ  → super_admin + branch_admin (both can view)
//   WRITE → branch_admin ONLY (create / update / delete / change pw)
//           Technologist is automatically assigned to the branch
//           admin's own branch — no manual branch selection needed.
//   BLOCKED → super_admin cannot create / edit / delete MedTechs
// ═══════════════════════════════════════════════════════════════

// ─── MedTech Sheet helper ─────────────────────────────────────────
function _getMedTechSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('MedTechs');

  if (!sh) {
    sh = ss.insertSheet('MedTechs');
    const headers = [
      'medtech_id', 'last_name', 'first_name', 'middle_name',
      'email', 'password_hash', 'role', 'status',
      'branch_id', 'branch_name', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // medtech_id
    sh.setColumnWidth(2,  140); // last_name
    sh.setColumnWidth(3,  140); // first_name
    sh.setColumnWidth(4,  140); // middle_name
    sh.setColumnWidth(5,  200); // email
    sh.setColumnWidth(6,  240); // password_hash
    sh.setColumnWidth(7,  160); // role
    sh.setColumnWidth(8,   90); // status
    sh.setColumnWidth(9,  140); // branch_id
    sh.setColumnWidth(10, 160); // branch_name
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
  }

  return sh;
}

function _medtechRowToObj(row) {
  return {
    medtech_id:  String(row[0]  || ''),
    last_name:   String(row[1]  || ''),
    first_name:  String(row[2]  || ''),
    middle_name: String(row[3]  || ''),
    email:       String(row[4]  || ''),
    // password_hash intentionally excluded
    role:        String(row[6]  || ''),
    status:      String(row[7]  || 'Active'),
    branch_id:   String(row[8]  || ''),
    branch_name: String(row[9]  || ''),
    created_at:  String(row[10] || ''),
    updated_at:  String(row[11] || '')
  };
}

// ─── Auth guards ──────────────────────────────────────────────────
// Returns session or null if expired
function _requireReadAccess(token) {
  const s = _getSession(token);
  if (!s) return null;
  // Both super_admin and branch_admin can read
  if (!['super_admin', 'branch_admin'].includes(s.role)) return null;
  return s;
}

// Returns session only if caller is branch_admin; null otherwise
function _requireBranchAdmin(token) {
  const s = _getSession(token);
  if (!s) return null;
  if (s.role !== 'branch_admin') return null;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ — super_admin + branch_admin
// super_admin sees all branches; branch_admin sees only theirs
// ═══════════════════════════════════════════════════════════════
function getMedTechs(payload, token) {
  try {
    const session = _requireReadAccess(token);
    if (!session) return { success: false, error: 'Session expired. Please log in again.', expired: true };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const result     = [];

    for (var b = 1; b < branchData.length; b++) {
      const branchRow = branchData[b];
      const ssId      = String(branchRow[7] || '');
      if (!ssId) continue;

      // branch_admin: only their own branch
      if (session.role === 'branch_admin' && String(branchRow[0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        data.slice(1)
          .filter(r => r[0] !== '')
          .forEach(r => result.push(_medtechRowToObj(r)));
      } catch (_) { /* skip unreadable SS */ }
    }

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — branch_admin ONLY
// Technologist is auto-assigned to the branch admin's branch.
// Super admin is blocked.
// ═══════════════════════════════════════════════════════════════
function createMedTech(payload, token) {
  try {
    const session = _requireBranchAdmin(token);

    // Distinguish expired vs unauthorised
    if (!session) {
      const raw = _getSession(token);
      if (!raw) return { success: false, error: 'Session expired. Please log in again.', expired: true };
      return { success: false, error: 'Only Branch Admins can enroll technologists.' };
    }

    // Validate required fields
    if (!payload.last_name  || !payload.last_name.trim())  return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim()) return { success: false, error: 'First name is required.' };
    if (!payload.email      || !payload.email.trim())      return { success: false, error: 'Email is required.' };
    if (!payload.password   || !payload.password.trim())   return { success: false, error: 'Password is required.' };
    if (payload.password.trim().length < 6)                return { success: false, error: 'Password must be at least 6 characters.' };
    if (!payload.role       || !payload.role.trim())       return { success: false, error: 'Role is required.' };

    // Always use the branch admin's own branch — ignore any client-supplied branch_id
    const targetBranchId = session.branch_id;
    if (!targetBranchId) return { success: false, error: 'Your session has no branch assigned. Contact a super admin.' };

    // Look up the branch spreadsheet
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(targetBranchId));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getMedTechSheet(ssId);
    const data = sh.getDataRange().getValues();

    // Check duplicate email within branch
    const exists = data.slice(1).some(r => String(r[4]).toLowerCase() === payload.email.trim().toLowerCase());
    if (exists) return { success: false, error: 'An account with this email already exists in your branch.' };

    const now       = new Date().toISOString();
    const medtechId = 'MT-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      medtechId,
      payload.last_name.trim(),
      payload.first_name.trim(),
      (payload.middle_name || '').trim(),
      payload.email.trim().toLowerCase(),
      _hashPassword(payload.password.trim()),
      payload.role.trim(),
      payload.status || 'Active',
      targetBranchId,
      String(branchRow[1]),   // branch_name from registry
      now, now
    ]);

    return {
      success: true,
      data: {
        medtech_id:  medtechId,
        last_name:   payload.last_name.trim(),
        first_name:  payload.first_name.trim(),
        middle_name: (payload.middle_name || '').trim(),
        email:       payload.email.trim().toLowerCase(),
        role:        payload.role.trim(),
        status:      payload.status || 'Active',
        branch_id:   targetBranchId,
        branch_name: String(branchRow[1]),
        created_at:  now,
        updated_at:  now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — branch_admin ONLY
// Branch admin can only edit technologists in their own branch.
// ═══════════════════════════════════════════════════════════════
function updateMedTech(payload, token) {
  try {
    const session = _requireBranchAdmin(token);

    if (!session) {
      const raw = _getSession(token);
      if (!raw) return { success: false, error: 'Session expired. Please log in again.', expired: true };
      return { success: false, error: 'Only Branch Admins can update technologist accounts.' };
    }

    if (!payload.medtech_id) return { success: false, error: 'MedTech ID is required.' };

    // Find the record — only within the branch admin's own branch SS
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    var foundSh  = null;
    var foundIdx = -1;

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;
      // Only search within the branch admin's own branch
      if (String(branchData[b][0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.medtech_id));
        if (idx !== -1) { foundSh = sh; foundIdx = idx; break; }
      } catch (_) {}
    }

    if (!foundSh || foundIdx === -1)
      return { success: false, error: 'Technologist not found in your branch.' };

    const now = new Date().toISOString();
    const row = foundIdx + 1;

    if (payload.last_name)   foundSh.getRange(row, 2).setValue(payload.last_name.trim());
    if (payload.first_name)  foundSh.getRange(row, 3).setValue(payload.first_name.trim());
    if (payload.middle_name !== undefined) foundSh.getRange(row, 4).setValue((payload.middle_name || '').trim());
    if (payload.email)       foundSh.getRange(row, 5).setValue(payload.email.trim().toLowerCase());
    if (payload.password && payload.password.trim() !== '')
      foundSh.getRange(row, 6).setValue(_hashPassword(payload.password.trim()));
    if (payload.role)   foundSh.getRange(row, 7).setValue(payload.role.trim());
    if (payload.status) foundSh.getRange(row, 8).setValue(payload.status);
    foundSh.getRange(row, 12).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — branch_admin ONLY (own branch only)
// ═══════════════════════════════════════════════════════════════
function deleteMedTech(medtechId, token) {
  try {
    const session = _requireBranchAdmin(token);

    if (!session) {
      const raw = _getSession(token);
      if (!raw) return { success: false, error: 'Session expired. Please log in again.', expired: true };
      return { success: false, error: 'Only Branch Admins can remove technologist accounts.' };
    }

    if (!medtechId) return { success: false, error: 'MedTech ID is required.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;
      // Only within the branch admin's own branch
      if (String(branchData[b][0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(medtechId));
        if (idx !== -1) {
          sh.deleteRow(idx + 1);
          return { success: true };
        }
      } catch (_) {}
    }

    return { success: false, error: 'Technologist not found in your branch.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD — branch_admin ONLY (own branch only)
// ═══════════════════════════════════════════════════════════════
function changeMedTechPassword(payload, token) {
  try {
    const session = _requireBranchAdmin(token);

    if (!session) {
      const raw = _getSession(token);
      if (!raw) return { success: false, error: 'Session expired. Please log in again.', expired: true };
      return { success: false, error: 'Only Branch Admins can change technologist passwords.' };
    }

    if (!payload.medtech_id)  return { success: false, error: 'MedTech ID is required.' };
    if (!payload.new_password || !payload.new_password.trim())
      return { success: false, error: 'New password is required.' };
    if (payload.new_password.trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;
      if (String(branchData[b][0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.medtech_id));
        if (idx !== -1) {
          const row = idx + 1;
          sh.getRange(row, 6).setValue(_hashPassword(payload.new_password.trim()));
          sh.getRange(row, 12).setValue(new Date().toISOString());
          return { success: true };
        }
      } catch (_) {}
    }

    return { success: false, error: 'Technologist not found in your branch.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}