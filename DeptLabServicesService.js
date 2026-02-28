// ═══════════════════════════════════════════════════════════════
// DEPT_LAB_SERVICES SERVICE
// Many-to-many mapping: Department ↔ Lab Services
// GLOBAL — stored in Registry SS → "Dept_LabServices" sheet.
// No branch dependency. Same pattern as global Lab Services.
//
// Schema:
//   A: mapping_id   B: dept_id   C: lab_id   D: created_at
// ═══════════════════════════════════════════════════════════════

function _getDeptLabSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Dept_LabServices');

  if (!sh) {
    sh = ss.insertSheet('Dept_LabServices');
    const headers = ['mapping_id', 'dept_id', 'lab_id', 'created_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); // mapping_id
    sh.setColumnWidth(2, 200); // dept_id
    sh.setColumnWidth(3, 200); // lab_id
    sh.setColumnWidth(4, 200); // created_at
  }

  return sh;
}

// ═══════════════════════════════════════════════════════════════
// GET: Returns { dept_id → [lab_id, ...] } global map
// ═══════════════════════════════════════════════════════════════
function getDeptLabMappings(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getDeptLabSheet();
    const data = sh.getDataRange().getValues();

    const result = {}; // dept_id → [lab_id, ...]
    data.slice(1).forEach(function(r) {
      const deptId = String(r[1] || '').trim();
      const labId  = String(r[2] || '').trim();
      if (!deptId || !labId) return;
      if (!result[deptId]) result[deptId] = [];
      if (!result[deptId].includes(labId)) result[deptId].push(labId);
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE: Replaces all lab service assignments for a department
// payload: { dept_id, lab_ids: [...] }
// super_admin only
// ═══════════════════════════════════════════════════════════════
function saveDeptLabServices(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.dept_id) return { success: false, error: 'dept_id is required.' };

    const sh   = _getDeptLabSheet();
    const data = sh.getDataRange().getValues();

    // Remove all existing rows for this dept_id (go backwards)
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1] || '').trim() === String(payload.dept_id)) {
        sh.deleteRow(i + 1);
      }
    }

    // Insert new mappings
    const labIds = payload.lab_ids || [];
    const now    = new Date().toISOString();
    if (labIds.length > 0) {
      const rows = labIds.map(function(labId) {
        return [
          'DLM-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
          payload.dept_id,
          labId,
          now
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }

    return { success: true, saved: labIds.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET LAB SERVICES FOR A SPECIFIC DEPARTMENT
// Returns flat list of lab_ids assigned to a dept
// payload: { dept_id }
// ═══════════════════════════════════════════════════════════════
function getLabServicesForDept(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!payload.dept_id) return { success: false, error: 'dept_id is required.' };

    const sh   = _getDeptLabSheet();
    const data = sh.getDataRange().getValues();

    const labIds = [];
    data.slice(1).forEach(function(r) {
      if (String(r[1] || '').trim() === String(payload.dept_id) && r[2]) {
        const labId = String(r[2]).trim();
        if (!labIds.includes(labId)) labIds.push(labId);
      }
    });

    return { success: true, data: labIds };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET DEPARTMENTS FOR A SPECIFIC LAB SERVICE (reverse lookup)
// Returns dept_ids that include a given lab_id
// ═══════════════════════════════════════════════════════════════
function getDeptsForLabService(labId) {
  try {
    const sh   = _getDeptLabSheet();
    const data = sh.getDataRange().getValues();
    const deptIds = [];
    data.slice(1).forEach(function(r) {
      if (String(r[2] || '').trim() === String(labId) && r[1]) {
        const deptId = String(r[1]).trim();
        if (!deptIds.includes(deptId)) deptIds.push(deptId);
      }
    });
    return deptIds;
  } catch(e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════
function handleDeptLabRequest(action, payload, token) {
  if (!_getSession(token)) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  switch (action) {
    case 'GET_DEPT_LAB_MAPPINGS':     return getDeptLabMappings(payload, token);
    case 'SAVE_DEPT_LAB_SERVICES':    return saveDeptLabServices(payload, token);
    case 'GET_LAB_SERVICES_FOR_DEPT': return getLabServicesForDept(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}