// ═══════════════════════════════════════════════════════════════
// PACKAGES SERVICE
// Global packages — stored in Registry SS
// All roles can read; only super_admin can write.
//
// Packages sheet schema:
//   A: package_id   B: package_code   C: package_name
//   D: description  E: default_fee    F: is_active
//   G: branch_id    H: created_at     I: updated_at
//
// branch_id: empty/null = global (super_admin); value = branch-exclusive package
//
// Package_LabServices sheet schema (many-to-many):
//   A: mapping_id   B: package_id   C: lab_id   D: created_at
// ═══════════════════════════════════════════════════════════════

// ─── Get or create Packages sheet in Registry SS ─────────────────
function _getPackageSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Packages');

  if (!sh) {
    sh = ss.insertSheet('Packages');
    const headers = [
      'package_id', 'package_code', 'package_name',
      'description', 'default_fee', 'is_active',
      'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // package_id
    sh.setColumnWidth(2,  120); // package_code
    sh.setColumnWidth(3,  220); // package_name
    sh.setColumnWidth(4,  280); // description
    sh.setColumnWidth(5,  110); // default_fee
    sh.setColumnWidth(6,   90); // is_active
    sh.setColumnWidth(7,  180); // created_at
    sh.setColumnWidth(8,  180); // updated_at
  }

  return sh;
}

// ─── Get or create Package_LabServices mapping sheet ─────────────
function _getPackageLabSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Package_LabServices');

  if (!sh) {
    sh = ss.insertSheet('Package_LabServices');
    const headers = ['mapping_id', 'package_id', 'lab_id', 'created_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); // mapping_id
    sh.setColumnWidth(2, 180); // package_id
    sh.setColumnWidth(3, 180); // lab_id
    sh.setColumnWidth(4, 200); // created_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _packageRowToObj(row) {
  return {
    package_id:   String(row[0] || ''),
    package_code: String(row[1] || ''),
    package_name: String(row[2] || ''),
    description:  String(row[3] || ''),
    default_fee:  Number(row[4]) || 0,
    is_active:    row[5] === true || String(row[5]).toLowerCase() === 'true',
    branch_id:    String(row[6] || ''),
    created_at:   String(row[7] || ''),
    updated_at:   String(row[8] || '')
  };
}

// ═══════════════════════════════════════════════════════════════
// READ — all roles
// Returns packages with lab_ids array and lab_count
// ═══════════════════════════════════════════════════════════════
function getPackages(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getPackageSheet();
    const data = sh.getDataRange().getValues();

    // Build package_id → [lab_ids] map from Package_LabServices
    const labMap = {};
    try {
      const mapSh   = _getPackageLabSheet();
      const mapData = mapSh.getDataRange().getValues();
      mapData.slice(1).forEach(function(r) {
        const pkgId = String(r[1] || '').trim();
        const labId = String(r[2] || '').trim();
        if (!pkgId || !labId) return;
        if (!labMap[pkgId]) labMap[pkgId] = [];
        if (!labMap[pkgId].includes(labId)) labMap[pkgId].push(labId);
      });
    } catch(_) {}

    var packages = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        const pkg = _packageRowToObj(r);
        pkg.lab_ids   = labMap[pkg.package_id] || [];
        pkg.lab_count = pkg.lab_ids.length;
        return pkg;
      });

    // Branch admin or medtech: sees global packages + their own branch packages only
    // Also flag packages that contain disabled lab services at their branch
    if (['branch_admin', 'medtech'].includes(session.role)) {
      packages = packages.filter(function(p) {
        return !p.branch_id || p.branch_id === session.branch_id;
      });

      // Get disabled lab ids for this branch
      const disabledLabs = getDisabledLabsForBranch(session.branch_id);

      if (disabledLabs.length > 0) {
        // Load lab names for the disabled ids so we can show them in the warning
        const labSh   = _getLabSheet();
        const labData = labSh.getDataRange().getValues();
        const labNameMap = {};
        labData.slice(1).forEach(function(r) {
          if (r[0]) labNameMap[String(r[0])] = String(r[2] || '');
        });

        packages.forEach(function(pkg) {
          const disabled = pkg.lab_ids.filter(function(id) {
            return disabledLabs.includes(id);
          });
          pkg.disabled_labs = disabled.map(function(id) {
            return { lab_id: id, lab_name: labNameMap[id] || id };
          });
        });
      } else {
        packages.forEach(function(pkg) { pkg.disabled_labs = []; });
      }
    }

    return { success: true, data: packages };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET LAB IDS FOR A PACKAGE
// ═══════════════════════════════════════════════════════════════
function getLabsForPackage(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!payload.package_id) return { success: false, error: 'package_id is required.' };

    const sh   = _getPackageLabSheet();
    const data = sh.getDataRange().getValues();
    const labIds = [];

    data.slice(1).forEach(function(r) {
      if (String(r[1] || '').trim() === String(payload.package_id) && r[2]) {
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
// CREATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function createPackage(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    if (!payload.package_name || !payload.package_name.trim())
      return { success: false, error: 'Package name is required.' };

    const sh    = _getPackageSheet();
    const now   = new Date().toISOString();
    const pkgId = 'PKG-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    // Branch admin packages are tied to their branch; super admin packages are global
    const branchId = session.role === 'branch_admin' ? (session.branch_id || '') : '';

    sh.appendRow([
      pkgId,
      (payload.package_code || '').trim().toUpperCase(),
      payload.package_name.trim(),
      payload.description  || '',
      Number(payload.default_fee) || 0,
      payload.is_active !== false,
      branchId,
      now,
      now
    ]);

    // Save lab service assignments
    const labIds = payload.lab_ids || [];
    if (labIds.length > 0) {
      _savePackageLabServices(pkgId, labIds);
    }

    return {
      success: true,
      data: {
        package_id:   pkgId,
        package_code: (payload.package_code || '').trim().toUpperCase(),
        package_name: payload.package_name.trim(),
        description:  payload.description  || '',
        default_fee:  Number(payload.default_fee) || 0,
        is_active:    payload.is_active !== false,
        lab_ids:      labIds,
        lab_count:    labIds.length,
        created_at:   now,
        updated_at:   now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function updatePackage(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };
    if (!payload.package_id) return { success: false, error: 'package_id is required.' };

    const sh   = _getPackageSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.package_id);
    });
    if (idx === -1) return { success: false, error: 'Package not found.' };

    // Branch admin can only edit their own branch packages
    if (session.role === 'branch_admin') {
      const pkgBranchId = String(data[idx][6] || '');
      if (pkgBranchId !== session.branch_id)
        return { success: false, error: 'Access denied. You can only edit your own branch packages.' };
    }

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2, 1, 5).setValues([[
      (payload.package_code || '').trim().toUpperCase(),
      payload.package_name.trim(),
      payload.description  || '',
      Number(payload.default_fee) || 0,
      payload.is_active !== false
    ]]);
    sh.getRange(row, 9).setValue(now);

    // Replace lab service assignments
    if (payload.lab_ids !== undefined) {
      _savePackageLabServices(payload.package_id, payload.lab_ids);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
// ═══════════════════════════════════════════════════════════════
function deletePackage(packageId, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };
    if (!packageId) return { success: false, error: 'package_id is required.' };

    const sh   = _getPackageSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(packageId);
    });
    if (idx === -1) return { success: false, error: 'Package not found.' };

    // Branch admin can only delete their own branch packages
    if (session.role === 'branch_admin') {
      const pkgBranchId = String(data[idx][6] || '');
      if (pkgBranchId !== session.branch_id)
        return { success: false, error: 'Access denied. You can only delete your own branch packages.' };
    }

    sh.deleteRow(idx + 1);

    // Clean up Package_LabServices mappings
    _savePackageLabServices(packageId, []);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE LAB SERVICES FOR A PACKAGE (internal helper)
// Replaces all existing mappings for a package_id
// ═══════════════════════════════════════════════════════════════
function _savePackageLabServices(packageId, labIds) {
  try {
    const sh   = _getPackageLabSheet();
    const data = sh.getDataRange().getValues();

    // Delete existing rows for this package (go backwards)
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1] || '').trim() === String(packageId)) {
        sh.deleteRow(i + 1);
      }
    }

    // Insert new mappings
    if (labIds && labIds.length > 0) {
      const now  = new Date().toISOString();
      const rows = labIds.map(function(labId) {
        return [
          'PLM-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
          packageId,
          labId,
          now
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }
  } catch(e) {
    Logger.log('_savePackageLabServices error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE LAB SERVICES FOR A PACKAGE (public — called from router)
// payload: { package_id, lab_ids: [...] }
// ═══════════════════════════════════════════════════════════════
function savePackageLabServices(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'super_admin') return { success: false, error: 'Only super admins can update package assignments.' };
    if (!payload.package_id) return { success: false, error: 'package_id is required.' };

    _savePackageLabServices(payload.package_id, payload.lab_ids || []);
    return { success: true, saved: (payload.lab_ids || []).length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}