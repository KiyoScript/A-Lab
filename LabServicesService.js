// ═══════════════════════════════════════════════════════════════
// LAB SERVICES SERVICE
// Global lab services — stored in Registry SS → "Lab Services" sheet
// NOT branch-specific. All roles can read; only super_admin can write.
//
// Schema:
//   A: lab_id       B: lab_code     C: lab_name
//   D: description  E: default_fee  F: tat_hours
//   G: specimen_type  H: is_active  I: created_at  J: updated_at
// ═══════════════════════════════════════════════════════════════

// ─── Get or create Lab Services sheet in Registry SS ─────────────
function _getLabSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Lab Services');

  if (!sh) {
    sh = ss.insertSheet('Lab Services');
    const headers = [
      'lab_id', 'lab_code', 'lab_name',
      'description', 'default_fee', 'tat_hours',
      'specimen_type', 'is_active', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // lab_id
    sh.setColumnWidth(2,  110); // lab_code
    sh.setColumnWidth(3,  220); // lab_name
    sh.setColumnWidth(4,  280); // description
    sh.setColumnWidth(5,  110); // default_fee
    sh.setColumnWidth(6,  100); // tat_hours
    sh.setColumnWidth(7,  160); // specimen_type
    sh.setColumnWidth(8,   90); // is_active
    sh.setColumnWidth(9,  180); // created_at
    sh.setColumnWidth(10, 180); // updated_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _labRowToObj(row) {
  return {
    lab_id:        String(row[0] || ''),
    lab_code:      String(row[1] || ''),
    lab_name:      String(row[2] || ''),
    description:   String(row[3] || ''),
    default_fee:   Number(row[4]) || 0,
    tat_hours:     Number(row[5]) || 0,
    specimen_type: String(row[6] || ''),
    is_active:     row[7] === true || String(row[7]).toLowerCase() === 'true',
    created_at:    String(row[8]  || ''),
    updated_at:    String(row[9]  || '')
  };
}

// ═══════════════════════════════════════════════════════════════
// READ — all roles
// ═══════════════════════════════════════════════════════════════
function getLabServices(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getLabSheet();
    const data = sh.getDataRange().getValues();
    var labs = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r)    { return _labRowToObj(r); });

    // Branch admin: filter out services disabled at their branch
    if (session.role === 'branch_admin' && session.branch_id) {
      const disabledIds = getDisabledLabsForBranch(session.branch_id);
      if (disabledIds.length > 0) {
        labs = labs.filter(function(l) {
          return !disabledIds.includes(l.lab_id);
        });
      }
    }

    return { success: true, data: labs };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function createLabService(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Only super admins can create lab services.' };

    if (!payload.lab_name || !payload.lab_name.trim()) return { success: false, error: 'Lab name is required.' };

    const sh   = _getLabSheet();
    const data = sh.getDataRange().getValues();

    // Check duplicate lab_code globally (only if lab_code is provided)
    if (payload.lab_code && payload.lab_code.trim()) {
      const dup = data.slice(1).some(function(r) {
        return r[0] !== '' && String(r[1]).toLowerCase() === payload.lab_code.trim().toLowerCase();
      });
      if (dup) return { success: false, error: 'Lab code already exists.' };
    }

    const now   = new Date().toISOString();
    const labId = 'LAB-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      labId,
      payload.lab_code.trim().toUpperCase(),
      payload.lab_name.trim(),
      payload.description   || '',
      Number(payload.default_fee) || 0,
      Number(payload.tat_hours)   || 0,
      payload.specimen_type || '',
      payload.is_active !== false,
      now,
      now
    ]);

    return {
      success: true,
      data: {
        lab_id:        labId,
        lab_code:      payload.lab_code.trim().toUpperCase(),
        lab_name:      payload.lab_name.trim(),
        description:   payload.description   || '',
        default_fee:   Number(payload.default_fee) || 0,
        tat_hours:     Number(payload.tat_hours)   || 0,
        specimen_type: payload.specimen_type || '',
        is_active:     payload.is_active !== false,
        created_at:    now,
        updated_at:    now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function updateLabService(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Only super admins can update lab services.' };
    if (!payload.lab_id) return { success: false, error: 'lab_id is required.' };

    const sh   = _getLabSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.lab_id);
    });
    if (idx === -1) return { success: false, error: 'Lab service not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.lab_code.trim().toUpperCase());
    sh.getRange(row, 3).setValue(payload.lab_name.trim());
    sh.getRange(row, 4).setValue(payload.description   || '');
    sh.getRange(row, 5).setValue(Number(payload.default_fee) || 0);
    sh.getRange(row, 6).setValue(Number(payload.tat_hours)   || 0);
    sh.getRange(row, 7).setValue(payload.specimen_type || '');
    sh.getRange(row, 8).setValue(payload.is_active !== false);
    sh.getRange(row, 10).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
// Also cleans up all Dept_LabServices mapping entries across all branches
// ═══════════════════════════════════════════════════════════════
function deleteLabService(labId, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Only super admins can delete lab services.' };
    if (!labId) return { success: false, error: 'lab_id is required.' };

    const sh   = _getLabSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(labId);
    });
    if (idx === -1) return { success: false, error: 'Lab service not found.' };

    sh.deleteRow(idx + 1);

    // Clean up Dept_LabServices mappings across all branch SSes
    try {
      const branchSh   = _getRegistrySheet();
      const branchData = branchSh.getDataRange().getValues();
      for (var b = 1; b < branchData.length; b++) {
        const ssId = String(branchData[b][7] || '');
        if (!ssId) continue;
        try {
          const ss    = SpreadsheetApp.openById(ssId);
          const mapSh = ss.getSheetByName('Dept_LabServices');
          if (!mapSh) continue;
          const mapData = mapSh.getDataRange().getValues();
          for (var i = mapData.length - 1; i >= 1; i--) {
            if (String(mapData[i][2] || '').trim() === String(labId)) {
              mapSh.deleteRow(i + 1);
            }
          }
        } catch(_) {}
      }
    } catch(_) {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}