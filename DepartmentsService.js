// ═══════════════════════════════════════════════════════════════
// DEPARTMENTS SERVICE
// Departments are stored in each branch's own Spreadsheet
// under a "Departments" sheet.
// Schema: dept_id | dept_name | is_active | branch_id | created_at | updated_at
// ═══════════════════════════════════════════════════════════════

function _getDeptSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Departments');

  if (!sh) {
    sh = ss.insertSheet('Departments');
    const headers = ['dept_id', 'dept_name', 'is_active', 'branch_id', 'created_at', 'updated_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160); // dept_id
    sh.setColumnWidth(2, 240); // dept_name
    sh.setColumnWidth(3, 90);  // is_active
    sh.setColumnWidth(4, 140); // branch_id
    sh.setColumnWidth(5, 180); // created_at
    sh.setColumnWidth(6, 180); // updated_at
  }

  return sh;
}

function _deptRowToObj(row, branchId, branchName) {
  return {
    dept_id:     String(row[0] || ''),
    dept_name:   String(row[1] || ''),
    is_active:   String(row[2]).toUpperCase() === 'TRUE' || row[2] === true,
    branch_id:   String(row[3] || branchId || ''),
    branch_name: branchName || '',
    created_at:  String(row[4] || ''),
    updated_at:  String(row[5] || '')
  };
}

// ─── Auth helper ──────────────────────────────────────────────────
function _requireSession(token) {
  const s = _getSession(token);
  if (!s) return null;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════

function getDepartments(payload, token) {
  try {
    const session = _requireSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const allDepts   = [];

    for (var b = 1; b < branchData.length; b++) {
      const bRow       = branchData[b];
      const bId        = String(bRow[0] || '');
      const bName      = String(bRow[1] || '');
      const ssId       = String(bRow[7] || '');

      if (!ssId) continue;

      // Branch admin: only their branch
      if (session.role === 'branch_admin' && bId !== session.branch_id) continue;

      // Super admin with branchId filter
      if (session.role === 'super_admin' && payload && payload.branch_id && bId !== payload.branch_id) continue;

      try {
        const sh   = _getDeptSheet(ssId);
        const data = sh.getDataRange().getValues();
        data.slice(1).filter(r => r[0] !== '').forEach(r => {
          allDepts.push(_deptRowToObj(r, bId, bName));
        });
      } catch(_) {}
    }

    // Sort by branch then sort_order
    allDepts.sort((a, b) => {
      if (a.branch_id < b.branch_id) return -1;
      if (a.branch_id > b.branch_id) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    return { success: true, data: allDepts };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════

function createDepartment(payload, token) {
  try {
    const session = _requireSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.dept_name || !payload.dept_name.trim())
      return { success: false, error: 'Department name is required.' };

    // Determine target branch
    let targetBranchId = payload.branch_id;
    if (session.role === 'branch_admin') {
      targetBranchId = session.branch_id; // enforce own branch
    }
    if (!targetBranchId) return { success: false, error: 'Branch is required.' };

    // Find branch spreadsheet
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(targetBranchId));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getDeptSheet(ssId);

    const now     = new Date().toISOString();
    const deptId  = 'DEPT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const isActive = payload.is_active !== undefined ? payload.is_active : true;

    sh.appendRow([
      deptId,
      payload.dept_name.trim(),
      isActive,
      targetBranchId,
      now,
      now
    ]);

    return {
      success: true,
      data: {
        dept_id:     deptId,
        dept_name:   payload.dept_name.trim(),
        is_active:   isActive,
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
// UPDATE
// ═══════════════════════════════════════════════════════════════

function updateDepartment(payload, token) {
  try {
    const session = _requireSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.dept_id) return { success: false, error: 'dept_id is required.' };

    // Enforce branch admin scope
    if (session.role === 'branch_admin' && payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied: not your branch.' };

    // Find the branch spreadsheet
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(payload.branch_id));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getDeptSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.dept_id));
    if (idx === -1) return { success: false, error: 'Department not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.dept_name.trim());
    sh.getRange(row, 3).setValue(payload.is_active);
    sh.getRange(row, 6).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════

function deleteDepartment(payload, token) {
  try {
    const session = _requireSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.dept_id || !payload.branch_id)
      return { success: false, error: 'dept_id and branch_id are required.' };

    // Enforce branch admin scope
    if (session.role === 'branch_admin' && payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied: not your branch.' };

    // Find the branch spreadsheet
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find((r, i) => i > 0 && String(r[0]) === String(payload.branch_id));
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getDeptSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.dept_id));
    if (idx === -1) return { success: false, error: 'Department not found.' };

    sh.deleteRow(idx + 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

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