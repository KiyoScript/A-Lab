// ═══════════════════════════════════════════════════════════════
// DEPT_LAB_SERVICES SERVICE
// Many-to-many mapping: Department ↔ Lab Services
// Stored in each branch's own Spreadsheet → "Dept_LabServices" sheet
//
// Schema:
//   A: mapping_id   B: dept_id   C: lab_id   D: created_at
//
// A lab service can belong to multiple departments (shared).
// On first load, auto-migrates existing dept_id from Lab Services sheet.
// ═══════════════════════════════════════════════════════════════

// ─── Get or create Dept_LabServices sheet in a branch SS ─────────
function _getDeptLabSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
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
    sh.setColumnWidth(2, 180); // dept_id
    sh.setColumnWidth(3, 180); // lab_id
    sh.setColumnWidth(4, 200); // created_at

    // ── AUTO-MIGRATE: read existing dept_id from Lab Services ──
    try {
      const labSh   = ss.getSheetByName('Lab Services');
      if (labSh) {
        const labData = labSh.getDataRange().getValues();
        const rows    = [];
        labData.slice(1).forEach(function(r) {
          const labId  = String(r[0] || '').trim();
          const deptId = String(r[1] || '').trim();
          if (labId && deptId) {
            const mappingId = 'DLM-' + Utilities.getUuid().substring(0, 8).toUpperCase();
            rows.push([mappingId, deptId, labId, new Date().toISOString()]);
          }
        });
        if (rows.length > 0) {
          sh.getRange(2, 1, rows.length, 4).setValues(rows);
        }
      }
    } catch(e) {
      Logger.log('Auto-migrate error: ' + e.message);
    }
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _deptLabRowToObj(row) {
  return {
    mapping_id: String(row[0] || ''),
    dept_id:    String(row[1] || ''),
    lab_id:     String(row[2] || ''),
    created_at: String(row[3] || '')
  };
}

// ═══════════════════════════════════════════════════════════════
// GET: Returns { dept_id → [lab_id, ...] } map for a branch
// ═══════════════════════════════════════════════════════════════
function getDeptLabMappings(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    // Determine which branches to query
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();

    // Result: { branch_id → { dept_id → [lab_id,...] } }
    const result = {};

    for (var b = 1; b < branchData.length; b++) {
      const bRow     = branchData[b];
      const branchId = String(bRow[0] || '');
      const ssId     = String(bRow[7] || '');
      if (!ssId || !branchId) continue;

      // Branch admin: only their branch
      if (session.role === 'branch_admin' && branchId !== session.branch_id) continue;

      // Super admin with filter
      if (payload && payload.branch_id && branchId !== payload.branch_id) continue;

      try {
        const sh   = _getDeptLabSheet(ssId);
        const data = sh.getDataRange().getValues();
        const map  = {}; // dept_id → [lab_id, ...]

        data.slice(1).forEach(function(r) {
          const deptId = String(r[1] || '').trim();
          const labId  = String(r[2] || '').trim();
          if (!deptId || !labId) return;
          if (!map[deptId]) map[deptId] = [];
          if (!map[deptId].includes(labId)) map[deptId].push(labId);
        });

        result[branchId] = map;
      } catch(e) {
        Logger.log('getDeptLabMappings branch ' + branchId + ': ' + e.message);
      }
    }

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE: Replaces all lab service assignments for a department
// payload: { dept_id, branch_id, lab_ids: [...] }
// ═══════════════════════════════════════════════════════════════
function saveDeptLabServices(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.dept_id)   return { success: false, error: 'dept_id is required.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };

    // Enforce branch admin scope
    if (session.role === 'branch_admin' && payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied: not your branch.' };

    // Find branch SS
    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.branch_id);
    });
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getDeptLabSheet(ssId);
    const data = sh.getDataRange().getValues();

    // Remove all existing rows for this dept_id
    // Go backwards to avoid index shifting
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
      const lastRow = sh.getLastRow();
      sh.getRange(lastRow + 1, 1, rows.length, 4).setValues(rows);
    }

    return { success: true, saved: labIds.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET LAB SERVICES FOR A SPECIFIC DEPARTMENT
// Returns flat list of lab_ids assigned to a dept
// payload: { dept_id, branch_id }
// ═══════════════════════════════════════════════════════════════
function getLabServicesForDept(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    if (!payload.dept_id || !payload.branch_id)
      return { success: false, error: 'dept_id and branch_id are required.' };

    // Branch admin scope
    if (session.role === 'branch_admin' && payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const branchRow  = branchData.find(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.branch_id);
    });
    if (!branchRow) return { success: false, error: 'Branch not found.' };

    const ssId = String(branchRow[7]);
    const sh   = _getDeptLabSheet(ssId);
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
function getDeptsForLabService(labId, branchSsId) {
  try {
    const sh   = _getDeptLabSheet(branchSsId);
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