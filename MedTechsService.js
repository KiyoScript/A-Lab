// ═══════════════════════════════════════════════════════════════
// MEDTECHS SERVICE
// Medical Technologist accounts — stored per-branch in branch SS → "MedTechs"
//
// MedTechs schema (branch SS → "MedTechs"):
//   0 : medtech_id           — MT-XXXXXXXX
//   1 : last_name
//   2 : first_name
//   3 : middle_name
//   4 : email                — used as login identifier (must contain @)
//   5 : password_hash        — SHA-256
//   6 : role                 — e.g. "Medical Technologist", "Senior Med Tech"
//   7 : status               — Active / Inactive
//   8 : branch_id
//   9 : branch_name
//  10 : created_at
//  11 : updated_at
//  12 : must_change_password — true on creation; cleared after first pw change
//
// Permissions:
//   READ / WRITE  → super_admin (any branch) or branch_admin (their branch only)
//   LOGIN         → public (no token)
//   CHANGE OWN PW → medtech (their own account, verified by current password)
// ═══════════════════════════════════════════════════════════════

// ─── Sheet accessor ───────────────────────────────────────────────
function _getMedTechSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('MedTechs');

  if (!sh) {
    sh = ss.insertSheet('MedTechs');
    const headers = [
      'medtech_id', 'last_name', 'first_name', 'middle_name',
      'email', 'password_hash', 'role', 'status',
      'branch_id', 'branch_name', 'created_at', 'updated_at',
      'must_change_password'
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
    sh.setColumnWidth(4,  130); // middle_name
    sh.setColumnWidth(5,  220); // email
    sh.setColumnWidth(6,  260); // password_hash
    sh.setColumnWidth(7,  200); // role
    sh.setColumnWidth(8,   90); // status
    sh.setColumnWidth(9,  140); // branch_id
    sh.setColumnWidth(10, 170); // branch_name
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
    sh.setColumnWidth(13, 180); // must_change_password
  }

  return sh;
}

// ─── Row → Object (excludes password_hash) ────────────────────────
function _mtRowToObj(row) {
  return {
    medtech_id:           String(row[0]  || ''),
    last_name:            String(row[1]  || ''),
    first_name:           String(row[2]  || ''),
    middle_name:          String(row[3]  || ''),
    email:                String(row[4]  || ''),
    role:                 String(row[6]  || 'Medical Technologist'),
    status:               String(row[7]  || 'Active'),
    branch_id:            String(row[8]  || ''),
    branch_name:          String(row[9]  || ''),
    created_at:           String(row[10] || ''),
    updated_at:           String(row[11] || ''),
    must_change_password: _readBool(row[12])
  };
}

// ─── Look up a branch's spreadsheet_id by branch_id ──────────────
function _mt_getBranchSsId(branch_id) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(branch_id).trim()) {
      return String(data[i][7] || '');
    }
  }
  return null;
}

// ─── Look up a branch's name by branch_id ────────────────────────
function _getBranchName(branch_id) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(branch_id).trim()) {
      return String(data[i][1] || '');
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════
// GET MEDTECHS
// super_admin : returns all (all branches) or filtered by payload.branch_id
// branch_admin: returns only their branch
// ═══════════════════════════════════════════════════════════════
function getMedTechs(payload, token) {
  try {
    const session = _getSession(token);
    if (!session)                return { success: false, error: 'Session expired.', expired: true };
    if (session.role === 'medtech') return { success: false, error: 'Access denied.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    var results = [];

    if (session.role === 'branch_admin') {
      // Branch admin can only see their own branch
      const ssId = _mt_getBranchSsId(session.branch_id);
      if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };
      const sh   = _getMedTechSheet(ssId);
      const data = sh.getDataRange().getValues();
      results = data.slice(1)
        .filter(function(r) { return r[0] !== ''; })
        .map(_mtRowToObj);

    } else {
      // super_admin: specific branch or all branches
      if (payload && payload.branch_id) {
        const ssId = _mt_getBranchSsId(payload.branch_id);
        if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        results = data.slice(1)
          .filter(function(r) { return r[0] !== ''; })
          .map(_mtRowToObj);
      } else {
        // Aggregate all branches
        for (var b = 1; b < branchData.length; b++) {
          const ssId = String(branchData[b][7] || '');
          if (!ssId) continue;
          try {
            const sh   = _getMedTechSheet(ssId);
            const data = sh.getDataRange().getValues();
            const rows = data.slice(1)
              .filter(function(r) { return r[0] !== ''; })
              .map(_mtRowToObj);
            results = results.concat(rows);
          } catch(_) { /* skip unreadable SS */ }
        }
      }
    }

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE MEDTECH
// ═══════════════════════════════════════════════════════════════
function createMedTech(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin' && session.role !== 'branch_admin')
      return { success: false, error: 'Access denied.' };

    if (!payload.last_name  || !String(payload.last_name).trim())
      return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !String(payload.first_name).trim())
      return { success: false, error: 'First name is required.' };
    if (!payload.email || !String(payload.email).trim())
      return { success: false, error: 'Email is required.' };
    if (String(payload.email).indexOf('@') === -1)
      return { success: false, error: 'Email must be a valid email address.' };
    if (!payload.password || String(payload.password).trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    // Determine target branch
    const branchId = session.role === 'branch_admin'
      ? session.branch_id
      : String(payload.branch_id || '').trim();
    if (!branchId) return { success: false, error: 'Branch is required.' };

    const branchName = session.role === 'branch_admin'
      ? session.branch_name
      : _getBranchName(branchId);

    const ssId = _mt_getBranchSsId(branchId);
    if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };

    const sh         = _getMedTechSheet(ssId);
    const data       = sh.getDataRange().getValues();
    const emailLower = String(payload.email).trim().toLowerCase();

    // Duplicate email check (within this branch)
    const dup = data.slice(1).some(function(r) {
      return r[0] !== '' && String(r[4]).toLowerCase() === emailLower;
    });
    if (dup) return { success: false, error: 'An account with this email already exists in this branch.' };

    const now       = new Date().toISOString();
    const medtechId = 'MT-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      medtechId,
      String(payload.last_name).trim(),
      String(payload.first_name).trim(),
      String(payload.middle_name || '').trim(),
      emailLower,
      _hashPassword(String(payload.password).trim()),
      String(payload.role   || 'Medical Technologist').trim(),
      String(payload.status || 'Active'),
      branchId,
      branchName,
      now,
      now,
      true  // must_change_password on first login
    ]);

    return {
      success: true,
      data: {
        medtech_id:           medtechId,
        last_name:            String(payload.last_name).trim(),
        first_name:           String(payload.first_name).trim(),
        middle_name:          String(payload.middle_name || '').trim(),
        email:                emailLower,
        role:                 String(payload.role || 'Medical Technologist').trim(),
        status:               String(payload.status || 'Active'),
        branch_id:            branchId,
        branch_name:          branchName,
        created_at:           now,
        updated_at:           now,
        must_change_password: true
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE MEDTECH
// ═══════════════════════════════════════════════════════════════
function updateMedTech(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin' && session.role !== 'branch_admin')
      return { success: false, error: 'Access denied.' };

    if (!payload.medtech_id) return { success: false, error: 'medtech_id is required.' };

    const branchId = session.role === 'branch_admin'
      ? session.branch_id
      : String(payload.branch_id || '').trim();
    if (!branchId) return { success: false, error: 'branch_id is required.' };

    const ssId = _mt_getBranchSsId(branchId);
    if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };

    const sh   = _getMedTechSheet(ssId);
    const data = sh.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(payload.medtech_id).trim()) {
        rowIdx = i + 1; // convert to 1-based sheet row
        break;
      }
    }
    if (rowIdx === -1) return { success: false, error: 'MedTech not found.' };

    const now = new Date().toISOString();
    const row = data[rowIdx - 1]; // back to 0-based for reading existing values

    sh.getRange(rowIdx, 2).setValue(payload.last_name   !== undefined ? String(payload.last_name).trim()   : String(row[1]));
    sh.getRange(rowIdx, 3).setValue(payload.first_name  !== undefined ? String(payload.first_name).trim()  : String(row[2]));
    sh.getRange(rowIdx, 4).setValue(payload.middle_name !== undefined ? String(payload.middle_name).trim() : String(row[3]));
    sh.getRange(rowIdx, 7).setValue(payload.role        !== undefined ? String(payload.role).trim()        : String(row[6]));
    sh.getRange(rowIdx, 8).setValue(payload.status      !== undefined ? String(payload.status)             : String(row[7]));
    sh.getRange(rowIdx, 12).setValue(now); // updated_at

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE MEDTECH
// Searches the session-scoped branch(es) for the medtech_id.
// ═══════════════════════════════════════════════════════════════
function deleteMedTech(medtech_id, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin' && session.role !== 'branch_admin')
      return { success: false, error: 'Access denied.' };

    if (!medtech_id) return { success: false, error: 'medtech_id is required.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    var branchIds = [];
    if (session.role === 'branch_admin') {
      branchIds.push(session.branch_id);
    } else {
      for (var b = 1; b < branchData.length; b++) {
        if (branchData[b][0]) branchIds.push(String(branchData[b][0]));
      }
    }

    for (var bi = 0; bi < branchIds.length; bi++) {
      const ssId = _mt_getBranchSsId(branchIds[bi]);
      if (!ssId) continue;
      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][0]).trim() === String(medtech_id).trim()) {
            sh.deleteRow(i + 1);
            return { success: true };
          }
        }
      } catch(_) {}
    }

    return { success: false, error: 'MedTech not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE MEDTECH PASSWORD (admin-initiated)
// payload: { medtech_id, new_password, branch_id }
// branch_id required for super_admin; branch_admin uses session
// ═══════════════════════════════════════════════════════════════
function changeMedTechPassword(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin' && session.role !== 'branch_admin')
      return { success: false, error: 'Access denied.' };

    if (!payload.medtech_id)
      return { success: false, error: 'medtech_id is required.' };
    if (!payload.new_password || String(payload.new_password).trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    const branchId = session.role === 'branch_admin'
      ? session.branch_id
      : String(payload.branch_id || '').trim();
    if (!branchId) return { success: false, error: 'branch_id is required.' };

    const ssId = _mt_getBranchSsId(branchId);
    if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };

    const sh   = _getMedTechSheet(ssId);
    const data = sh.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(payload.medtech_id).trim()) {
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx === -1) return { success: false, error: 'MedTech not found.' };

    const now = new Date().toISOString();
    sh.getRange(rowIdx, 6).setValue(_hashPassword(String(payload.new_password).trim()));
    sh.getRange(rowIdx, 12).setValue(now);
    sh.getRange(rowIdx, 13).setValue(false); // clear must_change_password

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE OWN PASSWORD (medtech-initiated)
// payload: { current_password, new_password }
// ═══════════════════════════════════════════════════════════════
function changeOwnMedTechPassword(payload, token) {
  try {
    const session = _getSession(token);
    if (!session)              return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'medtech') return { success: false, error: 'Access denied.' };

    if (!payload.new_password || String(payload.new_password).trim().length < 6)
      return { success: false, error: 'New password must be at least 6 characters.' };

    const ssId = _mt_getBranchSsId(session.branch_id);
    if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };

    const sh   = _getMedTechSheet(ssId);
    const data = sh.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(session.medtech_id).trim()) {
        if (payload.current_password) {
          if (String(data[i][5]) !== _hashPassword(String(payload.current_password).trim()))
            return { success: false, error: 'Current password is incorrect.' };
        }
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx === -1) return { success: false, error: 'Account not found.' };

    const now = new Date().toISOString();
    sh.getRange(rowIdx, 6).setValue(_hashPassword(String(payload.new_password).trim()));
    sh.getRange(rowIdx, 12).setValue(now);
    sh.getRange(rowIdx, 13).setValue(false); // clear must_change_password

    // Update the live session to reflect the change
    const updatedSession = JSON.parse(JSON.stringify(session));
    updatedSession.must_change_password = false;
    _setSession(token, updatedSession);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// MEDTECH LOGIN
// Called from AdminService.js login() when the username contains '@'.
// Searches all active branch spreadsheets for a matching email + password.
// Returns: { success, token, data }  on match
//          { success:false, error }  if found but inactive
//          null                      if not found (caller tries next strategy)
// ═══════════════════════════════════════════════════════════════
function medtechLogin(email, password) {
  const emailLower = String(email  || '').trim().toLowerCase();
  const hashed     = _hashPassword(String(password || '').trim());

  const branchSh   = _getRegistrySheet();
  const branchData = branchSh.getDataRange().getValues();

  for (var b = 1; b < branchData.length; b++) {
    const bRow   = branchData[b];
    const ssId   = String(bRow[7] || '');
    if (!ssId) continue;

    // Skip inactive branches
    if (String(bRow[6] || '').toLowerCase() !== 'active') continue;

    const branchId = String(bRow[0] || '');
    const branchNm = String(bRow[1] || '');

    try {
      const sh   = _getMedTechSheet(ssId);
      const data = sh.getDataRange().getValues();

      for (var i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue;
        if (String(row[4]).toLowerCase() !== emailLower) continue;
        if (String(row[5]) !== hashed) continue;

        // Email + password matched
        if (String(row[7]) !== 'Active')
          return { success: false, error: 'Account is inactive.' };

        const mustChange = _readBool(row[12]);
        const sessionData = {
          medtech_id:           String(row[0]),
          full_name:            (String(row[2]) + ' ' + String(row[1])).trim(),
          last_name:            String(row[1]),
          first_name:           String(row[2]),
          email:                String(row[4]),
          role:                 'medtech',
          medtech_role:         String(row[6]),
          branch_id:            branchId,
          branch_name:          branchNm,
          must_change_password: mustChange
        };
        const tok = _generateToken();
        _setSession(tok, sessionData);
        return { success: true, token: tok, data: sessionData };
      }
    } catch(_) { /* skip unreadable SS */ }
  }

  return null; // not found — caller will continue with other strategies
}
