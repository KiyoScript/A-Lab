// ═══════════════════════════════════════════════════════════════
// DEPARTMENTS SERVICE
// Departments are GLOBAL — stored in Registry SS → "Departments" sheet.
// NOT branch-specific. Same pattern as Discounts & Lab Services.
//
// Schema:
//   A: dept_id   B: dept_name   C: is_active   D: created_at   E: updated_at
//
// All roles can read; only super_admin can write.
// ═══════════════════════════════════════════════════════════════

function _getDeptSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Departments');

  if (!sh) {
    sh = ss.insertSheet('Departments');
    const headers = ['dept_id', 'dept_name', 'is_active', 'created_at', 'updated_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); // dept_id
    sh.setColumnWidth(2, 260); // dept_name
    sh.setColumnWidth(3, 90);  // is_active
    sh.setColumnWidth(4, 180); // created_at
    sh.setColumnWidth(5, 180); // updated_at
  }

  return sh;
}

function _deptRowToObj(row) {
  return {
    dept_id:    String(row[0] || ''),
    dept_name:  String(row[1] || ''),
    is_active:  String(row[2]).toUpperCase() === 'TRUE' || row[2] === true,
    created_at: String(row[3] || ''),
    updated_at: String(row[4] || '')
  };
}

// ─── Auth helpers ─────────────────────────────────────────────────
function _requireSession(token) {
  const s = _getSession(token);
  if (!s) return null;
  return s;
}

function _requireSuperAdminDept(token) {
  const s = _getSession(token);
  if (!s) return { expired: true };
  if (s.role !== 'super_admin') return { denied: true };
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ — all roles (super_admin + branch_admin)
// ═══════════════════════════════════════════════════════════════
function getDepartments(payload, token) {
  try {
    const session = _requireSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getDeptSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    // Build dept_id → [lab_ids] from global Dept_LabServices sheet
    const labIdsMap = {}; // dept_id → [lab_id, ...]
    try {
      const mapSh   = _getDeptLabSheet();
      const mapData = mapSh.getDataRange().getValues();
      mapData.slice(1).forEach(function(r) {
        const deptId = String(r[1] || '').trim();
        const labId  = String(r[2] || '').trim();
        if (!deptId || !labId) return;
        if (!labIdsMap[deptId]) labIdsMap[deptId] = [];
        if (!labIdsMap[deptId].includes(labId)) labIdsMap[deptId].push(labId);
      });
    } catch(_) {}

    // For branch_admin: get their disabled labs to adjust counts
    var disabledIds = [];
    if (session && session.role === 'branch_admin' && session.branch_id) {
      try { disabledIds = getDisabledLabsForBranch(session.branch_id); } catch(_) {}
    }

    var depts = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        const dept       = _deptRowToObj(r);
        const allLabIds  = labIdsMap[dept.dept_id] || [];
        const available  = allLabIds.filter(function(id) { return !disabledIds.includes(id); });
        dept.lab_service_count        = allLabIds.length;
        dept.lab_service_available    = available.length;
        dept.lab_service_has_disabled = available.length < allLabIds.length;
        return dept;
      });

    // Branch admin: hide departments with no available services
    if (session && session.role === 'branch_admin') {
      depts = depts.filter(function(d) {
        return d.lab_service_available > 0;
      });
    }

    depts.sort(function(a, b) {
      return a.dept_name.localeCompare(b.dept_name);
    });

    return { success: true, data: depts };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function createDepartment(payload, token) {
  try {
    const session = _requireSuperAdminDept(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.dept_name || !payload.dept_name.trim())
      return { success: false, error: 'Department name is required.' };

    const sh   = _getDeptSheet();
    const data = sh.getDataRange().getValues();

    // Duplicate name check
    const exists = data.slice(1).some(function(r) {
      return String(r[1]).trim().toLowerCase() === payload.dept_name.trim().toLowerCase();
    });
    if (exists) return { success: false, error: 'A department with that name already exists.' };

    const now      = new Date().toISOString();
    const deptId   = 'DEPT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    sh.appendRow([deptId, payload.dept_name.trim(), isActive, now, now]);

    return {
      success: true,
      data: {
        dept_id:    deptId,
        dept_name:  payload.dept_name.trim(),
        is_active:  isActive,
        created_at: now,
        updated_at: now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function updateDepartment(payload, token) {
  try {
    const session = _requireSuperAdminDept(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.dept_id)   return { success: false, error: 'dept_id is required.' };
    if (!payload.dept_name || !payload.dept_name.trim())
      return { success: false, error: 'Department name is required.' };

    const sh   = _getDeptSheet();
    const data = sh.getDataRange().getValues();

    // Duplicate name check (exclude self)
    const duplicate = data.slice(1).some(function(r) {
      return String(r[0]) !== String(payload.dept_id) &&
             String(r[1]).trim().toLowerCase() === payload.dept_name.trim().toLowerCase();
    });
    if (duplicate) return { success: false, error: 'Another department with that name already exists.' };

    const idx = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.dept_id);
    });
    if (idx === -1) return { success: false, error: 'Department not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2, 1, 2).setValues([[
      payload.dept_name.trim(),
      payload.is_active !== false
    ]]);
    sh.getRange(row, 5).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
// Also cleans up all Dept_LabServices mapping entries for this dept
// ═══════════════════════════════════════════════════════════════
function deleteDepartment(payload, token) {
  try {
    const session = _requireSuperAdminDept(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.dept_id) return { success: false, error: 'dept_id is required.' };

    const sh   = _getDeptSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.dept_id);
    });
    if (idx === -1) return { success: false, error: 'Department not found.' };

    sh.deleteRow(idx + 1);

    // Clean up global Dept_LabServices mappings for this dept
    try {
      const mapSh   = _getDeptLabSheet();
      const mapData = mapSh.getDataRange().getValues();
      for (var i = mapData.length - 1; i >= 1; i--) {
        if (String(mapData[i][1] || '').trim() === String(payload.dept_id)) {
          mapSh.deleteRow(i + 1);
        }
      }
    } catch(_) {}

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
    case 'GET_DEPARTMENTS':   return getDepartments(payload, token);
    case 'CREATE_DEPARTMENT': return createDepartment(payload, token);
    case 'UPDATE_DEPARTMENT': return updateDepartment(payload, token);
    case 'DELETE_DEPARTMENT': return deleteDepartment(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}