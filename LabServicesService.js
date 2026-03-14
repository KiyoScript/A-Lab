// ═══════════════════════════════════════════════════════════════
// LAB SERVICES SERVICE
// Global lab services — stored in Registry SS → "Lab Services" sheet
// NOT branch-specific. All roles can read; only super_admin can write.
//
// Schema:
//   A: lab_id              B: lab_code           C: lab_name
//   D: description         E: default_fee        F: tat_hours
//   G: specimen_type       H: is_active          I: is_philhealth_covered
//   J: philhealth_rate     K: created_at         L: updated_at
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
      'specimen_type', 'is_active', 'is_philhealth_covered',
      'philhealth_rate', 'created_at', 'updated_at'
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
    sh.setColumnWidth(9,  180); // is_philhealth_covered
    sh.setColumnWidth(10, 140); // philhealth_rate
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _labRowToObj(row) {
  return {
    lab_id:                String(row[0]  || ''),
    lab_code:              String(row[1]  || ''),
    lab_name:              String(row[2]  || ''),
    description:           String(row[3]  || ''),
    default_fee:           Number(row[4]) || 0,
    tat_hours:             Number(row[5]) || 0,
    specimen_type:         String(row[6]  || ''),
    is_active:             row[7] === true || String(row[7]).toLowerCase() === 'true',
    is_philhealth_covered: row[8] === true || String(row[8]).toLowerCase() === 'true',
    philhealth_rate:       Number(row[9]) || 0,
    created_at:            String(row[10] || ''),
    updated_at:            String(row[11] || '')
  };
}

// ═══════════════════════════════════════════════════════════════
// READ — all roles
// ═══════════════════════════════════════════════════════════════
function getLabServices(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    var cacheKey = 'LABS_' + session.role + '_' + (session.branch_id || 'ALL');
    return _cacheGet(cacheKey, function() {

    const sh   = _getLabSheet();
    const data = sh.getDataRange().getValues()
    var labs = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r)    { return _labRowToObj(r); });

    // Branch admin or medtech: filter out services disabled at their branch
    if (['branch_admin', 'medtech'].includes(session.role) && session.branch_id) {
      const disabledIds = getDisabledLabsForBranch(session.branch_id);
      if (disabledIds.length > 0) {
        labs = labs.filter(function(l) {
          return !disabledIds.includes(l.lab_id);
        });
      }
    }

    return { success: true, data: labs };

    }); // end _cacheGet
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

    _cacheClear('LABS_super_admin_ALL');

    sh.appendRow([
      labId,
      payload.lab_code.trim().toUpperCase(),
      payload.lab_name.trim(),
      payload.description   || '',
      Number(payload.default_fee) || 0,
      Number(payload.tat_hours)   || 0,
      payload.specimen_type || '',
      payload.is_active !== false,
      payload.is_philhealth_covered === true,
      Number(payload.philhealth_rate) || 0,
      now,
      now
    ]);

    return {
      success: true,
      data: {
        lab_id:                labId,
        lab_code:              payload.lab_code.trim().toUpperCase(),
        lab_name:              payload.lab_name.trim(),
        description:           payload.description   || '',
        default_fee:           Number(payload.default_fee) || 0,
        tat_hours:             Number(payload.tat_hours)   || 0,
        specimen_type:         payload.specimen_type || '',
        is_active:             payload.is_active !== false,
        is_philhealth_covered: payload.is_philhealth_covered === true,
        philhealth_rate:       Number(payload.philhealth_rate) || 0,
        created_at:            now,
        updated_at:            now
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
    sh.getRange(idx + 1, 2, 1, 12).setValues([[
      payload.lab_code.trim().toUpperCase(),
      payload.lab_name.trim(),
      payload.description   || '',
      Number(payload.default_fee) || 0,
      Number(payload.tat_hours)   || 0,
      payload.specimen_type || '',
      payload.is_active !== false,
      payload.is_philhealth_covered === true,
      Number(payload.philhealth_rate) || 0,
      now
    ]]);
    sh.getRange(row, 10).setValue(now);

    _cacheClear('LABS_super_admin_ALL');

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
          var keepRows = [mapData[0]]; // header
          for (var i = 1; i < mapData.length; i++) {
            if (String(mapData[i][2] || '').trim() !== String(labId)) {
              keepRows.push(mapData[i]);
            }
          }
          if (keepRows.length < mapData.length) {
            mapSh.clearContents();
            if (keepRows.length > 0) {
              mapSh.getRange(1, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
            }
          }
        } catch(_) {}
      }
    } catch(_) {}

    _cacheClear('LABS_super_admin_ALL');

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}