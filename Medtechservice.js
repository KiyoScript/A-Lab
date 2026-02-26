// ═══════════════════════════════════════════════════════════════
// MEDTECH SERVICE
// MedTech accounts are stored per-branch in each branch's SS
// under a "MedTechs" sheet.
// Schema: medtech_id | last_name | first_name | middle_name |
//         email | password_hash | role | status | branch_id |
//         branch_name | created_at | updated_at
// Only admin (super_admin or branch_admin) can manage MedTechs.
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

// ═══════════════════════════════════════════════════════════════
// READ — Get all MedTechs (admin sees all branches or filtered)
// ═══════════════════════════════════════════════════════════════
function getMedTechs(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const allMedTechs = [];

    for (var b = 1; b < branchData.length; b++) {
      const bRow  = branchData[b];
      const bId   = String(bRow[0] || '');
      const bName = String(bRow[1] || '');
      const ssId  = String(bRow[7] || '');
      if (!ssId) continue;

      // Branch admin sees only their branch
      if (session.role === 'branch_admin' && bId !== session.branch_id) continue;

      // Optional branch filter for super_admin
      if (session.role === 'super_admin' && payload && payload.branch_id && bId !== payload.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        data.slice(1).filter(r => r[0] !== '').forEach(r => {
          allMedTechs.push(_medtechRowToObj(r));
        });
      } catch(_) {}
    }

    return { success: true, data: allMedTechs };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════
function createMedTech(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    // Only branch_admin can enroll MedTechs
    if (session.role !== 'branch_admin')
      return { success: false, error: 'Only branch admins can enroll Med Techs.' };

    // Validate required fields
    if (!payload.last_name  || !payload.last_name.trim())  return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim()) return { success: false, error: 'First name is required.' };
    if (!payload.email      || !payload.email.trim())      return { success: false, error: 'Email is required.' };
    if (!payload.password   || !payload.password.trim())   return { success: false, error: 'Password is required.' };
    if (!payload.role       || !payload.role.trim())       return { success: false, error: 'Role is required.' };

    // Determine target branch
    let targetBranchId = payload.branch_id;
    if (session.role === 'branch_admin') targetBranchId = session.branch_id;
    if (!targetBranchId) return { success: false, error: 'Branch is required.' };

    // Find branch spreadsheet
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(targetBranchId));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getMedTechSheet(ssId);
    const data = sh.getDataRange().getValues();

    // Check duplicate email within branch
    const exists = data.slice(1).some(r => String(r[4]).toLowerCase() === payload.email.trim().toLowerCase());
    if (exists) return { success: false, error: 'Email already exists in this branch.' };

    const now        = new Date().toISOString();
    const medtechId  = 'MT-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      medtechId,
      payload.last_name.trim(),
      payload.first_name.trim(),
      (payload.middle_name || '').trim(),
      payload.email.trim().toLowerCase(),
      _hashPassword(payload.password),
      payload.role.trim(),
      payload.status || 'Active',
      targetBranchId,
      String(branchRow[1]),
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
        created_at:  now, updated_at: now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════
function updateMedTech(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (session.role !== 'branch_admin')
      return { success: false, error: 'Only branch admins can edit Med Techs.' };

    // Find across branch spreadsheets
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    var foundSh  = null;
    var foundIdx = -1;

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;

      // Branch admin can only manage their branch
      if (session.role === 'branch_admin' && String(branchData[b][0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.medtech_id));
        if (idx !== -1) { foundSh = sh; foundIdx = idx; break; }
      } catch(_) {}
    }

    if (!foundSh || foundIdx === -1) return { success: false, error: 'MedTech not found.' };

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
// DELETE
// ═══════════════════════════════════════════════════════════════
function deleteMedTech(medtechId, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (session.role !== 'branch_admin')
      return { success: false, error: 'Only branch admins can remove Med Techs.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;
      if (session.role === 'branch_admin' && String(branchData[b][0]) !== session.branch_id) continue;

      try {
        const sh   = _getMedTechSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(medtechId));
        if (idx !== -1) {
          sh.deleteRow(idx + 1);
          return { success: true };
        }
      } catch(_) {}
    }

    return { success: false, error: 'MedTech not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD (admin resets for a MedTech)
// ═══════════════════════════════════════════════════════════════
function changeMedTechPassword(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (session.role !== 'branch_admin')
      return { success: false, error: 'Only branch admins can change Med Tech passwords.' };

    if (!payload.medtech_id)  return { success: false, error: 'MedTech ID is required.' };
    if (!payload.new_password || !payload.new_password.trim())
      return { success: false, error: 'New password is required.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const ssId = String(branchData[b][7] || '');
      if (!ssId) continue;
      if (session.role === 'branch_admin' && String(branchData[b][0]) !== session.branch_id) continue;

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
      } catch(_) {}
    }

    return { success: false, error: 'MedTech not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}