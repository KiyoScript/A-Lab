// ═══════════════════════════════════════════════════════════════
// BRANCH LAB SERVICES SERVICE
// Controls which global lab services are enabled per branch.
//
// Registry SS → "Branch_LabServices" sheet
// Schema:
//   A: branch_id   B: lab_id   C: is_enabled   D: updated_at   E: updated_by
//
// Logic:
//   - Absence of a row = enabled (default)
//   - Only rows with is_enabled = FALSE are stored to keep it lean
//   - super_admin only can toggle
// ═══════════════════════════════════════════════════════════════

// ─── Sheet accessor ───────────────────────────────────────────────
function _getBranchLabSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Branch_LabServices');

  if (!sh) {
    sh = ss.insertSheet('Branch_LabServices');
    const headers = ['branch_id', 'lab_id', 'is_enabled', 'updated_at', 'updated_by'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); // branch_id
    sh.setColumnWidth(2, 180); // lab_id
    sh.setColumnWidth(3,  90); // is_enabled
    sh.setColumnWidth(4, 200); // updated_at
    sh.setColumnWidth(5, 180); // updated_by
  }

  return sh;
}

// ═══════════════════════════════════════════════════════════════
// GET BRANCH LAB SERVICES
// Returns all global lab services enriched with branch-specific
// enabled/disabled status, grouped by department.
// payload: { branch_id }
// super_admin only
// ═══════════════════════════════════════════════════════════════
function getBranchLabServices(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Access denied. Super admin only.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };

    // 1. Load all global active lab services
    const labSh   = _getLabSheet();
    const labData = labSh.getDataRange().getValues();
    const allLabs = labData.slice(1)
      .filter(function(r) { return r[0] !== '' && (r[7] === true || String(r[7]).toLowerCase() === 'true'); })
      .map(function(r) { return _labRowToObj(r); });

    // 2. Load branch override rows for this branch
    const brSh   = _getBranchLabSheet();
    const brData = brSh.getDataRange().getValues();
    const disabledMap = {}; // lab_id → true if disabled
    brData.slice(1).forEach(function(r) {
      if (!r[0] || !r[1]) return;
      if (String(r[0]).trim() === String(payload.branch_id).trim()) {
        if (!_readBool(r[2])) disabledMap[String(r[1]).trim()] = true;
      }
    });

    // 3. Load dept → lab mappings
    const deptLabSh   = _getDeptLabSheet();
    const deptLabData = deptLabSh.getDataRange().getValues();
    const labToDept   = {}; // lab_id → dept_id
    deptLabData.slice(1).forEach(function(r) {
      const deptId = String(r[1] || '').trim();
      const labId  = String(r[2] || '').trim();
      if (deptId && labId) labToDept[labId] = deptId;
    });

    // 4. Load departments
    const deptSh   = _getDeptSheet();
    const deptData = deptSh.getDataRange().getValues();
    const deptMap  = {}; // dept_id → dept_name
    deptData.slice(1).forEach(function(r) {
      if (r[0]) deptMap[String(r[0])] = String(r[1] || '');
    });

    // 5. Build enriched result grouped by department
    const grouped = {}; // dept_id → { dept_name, labs: [] }
    const unassigned = [];

    allLabs.forEach(function(lab) {
      const deptId   = labToDept[lab.lab_id] || null;
      const enabled  = !disabledMap[lab.lab_id];
      const enriched = {
        lab_id:        lab.lab_id,
        lab_code:      lab.lab_code,
        lab_name:      lab.lab_name,
        default_fee:   lab.default_fee,
        is_enabled:    enabled
      };

      if (deptId && deptMap[deptId]) {
        if (!grouped[deptId]) {
          grouped[deptId] = { dept_id: deptId, dept_name: deptMap[deptId], labs: [] };
        }
        grouped[deptId].labs.push(enriched);
      } else {
        unassigned.push(enriched);
      }
    });

    // Convert to sorted array
    var result = Object.values(grouped).sort(function(a, b) {
      return a.dept_name.localeCompare(b.dept_name);
    });

    if (unassigned.length > 0) {
      result.push({ dept_id: null, dept_name: 'Unassigned', labs: unassigned });
    }

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE BRANCH LAB SERVICE — toggle a single lab on/off
// payload: { branch_id, lab_id, is_enabled }
// super_admin only
// ═══════════════════════════════════════════════════════════════
function updateBranchLabService(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Access denied. Super admin only.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };
    if (!payload.lab_id)    return { success: false, error: 'lab_id is required.' };

    const sh      = _getBranchLabSheet();
    const data    = sh.getDataRange().getValues();
    const now     = new Date().toISOString();
    const updater = session.full_name || session.username || 'super_admin';
    const isEnabled = _readBool(payload.is_enabled !== false ? payload.is_enabled : false);

    // Find existing row for this branch + lab combo
    const idx = data.findIndex(function(r, i) {
      return i > 0 &&
        String(r[0]) === String(payload.branch_id) &&
        String(r[1]) === String(payload.lab_id);
    });

    if (isEnabled) {
      // If enabling and a row exists → delete it (absence = enabled)
      if (idx !== -1) {
        sh.deleteRow(idx + 1);
      }
      // If no row exists → nothing to do
    } else {
      // If disabling:
      if (idx !== -1) {
        // Update existing row
        sh.getRange(idx + 1, 3, 1, 3).setValues([[false, now, updater]]);
      } else {
        // Insert new disabled row
        sh.appendRow([
          String(payload.branch_id),
          String(payload.lab_id),
          false,
          now,
          updater
        ]);
      }
    }

    return { success: true, is_enabled: isEnabled };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET DISABLED LAB IDS FOR A BRANCH (lightweight — used by packages)
// Returns just the array of disabled lab_ids for a given branch
// ═══════════════════════════════════════════════════════════════
// ─── Normalize boolean from sheet (handles bool, string, number) ──
function _readBool(val) {
  if (val === true)  return true;
  if (val === false) return false;
  if (val === 1)     return true;
  if (val === 0)     return false;
  return String(val).trim().toLowerCase() === 'true';
}

function getDisabledLabsForBranch(branchId) {
  try {
    const sh   = _getBranchLabSheet();
    const data = sh.getDataRange().getValues();
    const disabled = [];
    data.slice(1).forEach(function(r) {
      if (!r[0] || !r[1]) return; // skip blank rows
      if (String(r[0]).trim() === String(branchId).trim()) {
        if (!_readBool(r[2])) disabled.push(String(r[1]).trim());
      }
    });
    return disabled;
  } catch(e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════
function handleBranchLabRequest(action, payload, token) {
  const session = _getSession(token);
  if (!session) return { success: false, error: 'Session expired. Please log in again.', expired: true };

  switch (action) {
    case 'GET_BRANCH_LAB_SERVICES':    return getBranchLabServices(payload, token);
    case 'UPDATE_BRANCH_LAB_SERVICE':  return updateBranchLabService(payload, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}