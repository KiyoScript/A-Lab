// ═══════════════════════════════════════════════════════════════
// LAB SERVICES SERVICE
// Stored in each branch's own spreadsheet → "Lab Services" sheet
// Schema:
//   A: lab_id       B: dept_id      C: lab_code     D: lab_name
//   E: description  F: default_fee  G: tat_hours    H: specimen_type
//   I: is_active    J: branch_id    K: created_at   L: updated_at
//
// Access:
//   super_admin  → CRUD on all branches
//   branch_admin → CRUD on assigned branch only
// ═══════════════════════════════════════════════════════════════

// ─── Get or create Lab Services sheet in a branch SS ─────────────
function _getLabSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Lab Services');

  if (!sh) {
    sh = ss.insertSheet('Lab Services');
    const headers = [
      'lab_id', 'dept_id', 'lab_code', 'lab_name',
      'description', 'default_fee', 'tat_hours', 'specimen_type',
      'is_active', 'branch_id', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // lab_id
    sh.setColumnWidth(2,  160); // dept_id
    sh.setColumnWidth(3,  110); // lab_code
    sh.setColumnWidth(4,  200); // lab_name
    sh.setColumnWidth(5,  260); // description
    sh.setColumnWidth(6,  110); // default_fee
    sh.setColumnWidth(7,  100); // tat_hours
    sh.setColumnWidth(8,  150); // specimen_type
    sh.setColumnWidth(9,   90); // is_active
    sh.setColumnWidth(10, 140); // branch_id
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _labRowToObj(row, branchName, deptName) {
  return {
    lab_id:        String(row[0]  || ''),
    dept_id:       String(row[1]  || ''),
    dept_name:     deptName || '',
    lab_code:      String(row[2]  || ''),
    lab_name:      String(row[3]  || ''),
    description:   String(row[4]  || ''),
    default_fee:   Number(row[5]) || 0,
    tat_hours:     Number(row[6]) || 0,
    specimen_type: String(row[7]  || ''),
    is_active:     row[8] === true || String(row[8]).toLowerCase() === 'true',
    branch_id:     String(row[9]  || ''),
    branch_name:   branchName || '',
    created_at:    String(row[10] || ''),
    updated_at:    String(row[11] || '')
  };
}

// ─── Build dept lookup map for a branch SS ────────────────────────
function _buildDeptMap(spreadsheetId) {
  const map = {};
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sh = ss.getSheetByName('Departments');
    if (!sh) return map;
    const data = sh.getDataRange().getValues();
    data.slice(1).forEach(r => {
      if (r[0]) map[String(r[0])] = String(r[1] || '');
    });
  } catch(_) {}
  return map;
}

// ═══════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════

function getLabServices(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const allLabs    = [];

    for (var b = 1; b < branchData.length; b++) {
      const bRow       = branchData[b];
      const ssId       = String(bRow[7] || '');
      const branchId   = String(bRow[0] || '');
      const branchName = String(bRow[1] || '');

      if (!ssId) continue;

      // Branch admin: skip other branches
      if (session.role === 'branch_admin' && branchId !== session.branch_id) continue;

      try {
        const deptMap = _buildDeptMap(ssId);
        const sh      = _getLabSheet(ssId);
        const data    = sh.getDataRange().getValues();
        data.slice(1).filter(r => r[0] !== '').forEach(r => {
          const deptName = deptMap[String(r[1])] || '';
          allLabs.push(_labRowToObj(r, branchName, deptName));
        });
      } catch(_) {}
    }

    return { success: true, data: allLabs };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════

function createLabService(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.lab_name  || !payload.lab_name.trim())  return { success: false, error: 'Lab name is required.' };
    if (!payload.lab_code  || !payload.lab_code.trim())  return { success: false, error: 'Lab code is required.' };
    if (!payload.dept_id)                                return { success: false, error: 'Department is required.' };
    if (!payload.branch_id)                              return { success: false, error: 'Branch is required.' };

    // Branch admin: own branch only
    if (session.role === 'branch_admin' && payload.branch_id !== session.branch_id)
      return { success: false, error: 'You can only manage your own branch lab services.' };

    // Get branch SS
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(payload.branch_id));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getLabSheet(ssId);
    const data = sh.getDataRange().getValues();

    // Check duplicate lab_code within branch
    const dup = data.slice(1).some(r =>
      r[0] !== '' && String(r[2]).toLowerCase() === payload.lab_code.trim().toLowerCase()
    );
    if (dup) return { success: false, error: 'Lab code already exists in this branch.' };

    const now   = new Date().toISOString();
    const labId = 'LAB-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      labId,
      payload.dept_id,
      payload.lab_code.trim().toUpperCase(),
      payload.lab_name.trim(),
      payload.description   || '',
      Number(payload.default_fee)  || 0,
      Number(payload.tat_hours)    || 0,
      payload.specimen_type || '',
      payload.is_active !== false,
      payload.branch_id,
      now,
      now
    ]);

    const deptMap  = _buildDeptMap(ssId);
    const deptName = deptMap[payload.dept_id] || '';

    return {
      success: true,
      data: {
        lab_id:        labId,
        dept_id:       payload.dept_id,
        dept_name:     deptName,
        lab_code:      payload.lab_code.trim().toUpperCase(),
        lab_name:      payload.lab_name.trim(),
        description:   payload.description   || '',
        default_fee:   Number(payload.default_fee)  || 0,
        tat_hours:     Number(payload.tat_hours)    || 0,
        specimen_type: payload.specimen_type || '',
        is_active:     payload.is_active !== false,
        branch_id:     payload.branch_id,
        branch_name:   String(branchRow[1]),
        created_at:    now,
        updated_at:    now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════

function updateLabService(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.lab_id) return { success: false, error: 'lab_id is required.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const bRow     = branchData[b];
      const ssId     = String(bRow[7] || '');
      const branchId = String(bRow[0] || '');
      if (!ssId) continue;

      if (session.role === 'branch_admin' && branchId !== session.branch_id) continue;

      try {
        const sh   = _getLabSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.lab_id));
        if (idx === -1) continue;

        const now = new Date().toISOString();
        const row = idx + 1;

        sh.getRange(row, 2).setValue(payload.dept_id || data[idx][1]);
        sh.getRange(row, 3).setValue(payload.lab_code.trim().toUpperCase());
        sh.getRange(row, 4).setValue(payload.lab_name.trim());
        sh.getRange(row, 5).setValue(payload.description   || '');
        sh.getRange(row, 6).setValue(Number(payload.default_fee)  || 0);
        sh.getRange(row, 7).setValue(Number(payload.tat_hours)    || 0);
        sh.getRange(row, 8).setValue(payload.specimen_type || '');
        sh.getRange(row, 9).setValue(payload.is_active !== false);
        sh.getRange(row, 12).setValue(now);

        return { success: true };
      } catch(_) {}
    }

    return { success: false, error: 'Lab service not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════

function deleteLabService(labId, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!labId) return { success: false, error: 'lab_id is required.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    for (var b = 1; b < branchData.length; b++) {
      const bRow     = branchData[b];
      const ssId     = String(bRow[7] || '');
      const branchId = String(bRow[0] || '');
      if (!ssId) continue;

      if (session.role === 'branch_admin' && branchId !== session.branch_id) continue;

      try {
        const sh   = _getLabSheet(ssId);
        const data = sh.getDataRange().getValues();
        const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(labId));
        if (idx === -1) continue;

        sh.deleteRow(idx + 1);
        return { success: true };
      } catch(_) {}
    }

    return { success: false, error: 'Lab service not found.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}