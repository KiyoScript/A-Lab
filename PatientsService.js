// ═══════════════════════════════════════════════════════════════
// PATIENTS SERVICE
// Patients stored per-branch SS → "Patients" sheet
// Patient ↔ Discount mapping → per-branch SS → "Patient_Discounts"
//
// Patients schema:
//   A: patient_id    B: last_name      C: first_name
//   D: middle_name   E: sex            F: birth_date
//   G: contact_number  H: email_address  I: address
//   J: branch_id     K: created_at     L: updated_at
//
// Patient_Discounts schema:
//   A: mapping_id   B: patient_id   C: discount_id   D: created_at
//
// Access: super_admin and branch_admin can create/edit/delete
//         branch_admin only sees their own branch patients
// ═══════════════════════════════════════════════════════════════

// ─── Patient sheet accessor ───────────────────────────────────────
function _getPatientSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Patients');

  if (!sh) {
    sh = ss.insertSheet('Patients');
    const headers = [
      'patient_id', 'last_name', 'first_name', 'middle_name',
      'sex', 'birth_date', 'contact_number', 'email_address',
      'address', 'branch_id', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // patient_id
    sh.setColumnWidth(2,  140); // last_name
    sh.setColumnWidth(3,  140); // first_name
    sh.setColumnWidth(4,  140); // middle_name
    sh.setColumnWidth(5,   80); // sex
    sh.setColumnWidth(6,  110); // birth_date
    sh.setColumnWidth(7,  130); // contact_number
    sh.setColumnWidth(8,  200); // email_address
    sh.setColumnWidth(9,  250); // address
    sh.setColumnWidth(10, 140); // branch_id
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
  }

  return sh;
}

// ─── Patient_Discounts mapping sheet accessor ─────────────────────
function _getPatientDiscountSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Patient_Discounts');

  if (!sh) {
    sh = ss.insertSheet('Patient_Discounts');
    const headers = ['mapping_id', 'patient_id', 'discount_id', 'created_at'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); // mapping_id
    sh.setColumnWidth(2, 180); // patient_id
    sh.setColumnWidth(3, 180); // discount_id
    sh.setColumnWidth(4, 200); // created_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _patientRowToObj(row, branchName) {
  // birth_date: GSheets may return a Date object — normalize to YYYY-MM-DD string
  var rawDate   = row[5];
  var birthDate = '';
  if (rawDate) {
    try {
      var d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        var yyyy = d.getFullYear();
        var mm   = String(d.getMonth() + 1).padStart(2, '0');
        var dd   = String(d.getDate()).padStart(2, '0');
        birthDate = yyyy + '-' + mm + '-' + dd;
      }
    } catch(_) { birthDate = String(rawDate); }
  }

  return {
    patient_id:      String(row[0]  || ''),
    last_name:       String(row[1]  || ''),
    first_name:      String(row[2]  || ''),
    middle_name:     String(row[3]  || ''),
    sex:             String(row[4]  || ''),
    birth_date:      birthDate,
    contact_number:  String(row[6]  || ''),
    email_address:   String(row[7]  || ''),
    address:         String(row[8]  || ''),
    branch_id:       String(row[9]  || ''),
    branch_name:     branchName     || '',
    created_at:      String(row[10] || ''),
    updated_at:      String(row[11] || '')
  };
}

// ─── Get branch SS info from registry ─────────────────────────────
function _getBranchSsId(branchId) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  const row  = data.find(function(r, i) { return i > 0 && String(r[0]) === String(branchId); });
  if (!row) return null;
  return { ssId: String(row[7] || ''), branchName: String(row[1] || '') };
}

// ─── Build discount_id → discount_name map (from Registry SS) ─────
function _buildDiscountMap() {
  const map = {};
  try {
    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    data.slice(1).forEach(function(r) {
      if (r[0]) map[String(r[0])] = {
        discount_name: String(r[1] || ''),
        discount_type: String(r[2] || ''),
        value:         Number(r[3] || 0)
      };
    });
  } catch(_) {}
  return map;
}

// ═══════════════════════════════════════════════════════════════
// SAVE PATIENT DISCOUNTS (internal helper)
// Replaces all discount mappings for a patient
// ═══════════════════════════════════════════════════════════════
function _savePatientDiscounts(spreadsheetId, patientId, discountIds) {
  try {
    const sh   = _getPatientDiscountSheet(spreadsheetId);
    const data = sh.getDataRange().getValues();

    // Delete existing rows for this patient (go backwards)
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1] || '').trim() === String(patientId)) {
        sh.deleteRow(i + 1);
      }
    }

    // Insert new mappings
    if (discountIds && discountIds.length > 0) {
      const now  = new Date().toISOString();
      const rows = discountIds.map(function(dId) {
        return [
          'PDM-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
          patientId,
          dId,
          now
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }
  } catch(e) {
    Logger.log('_savePatientDiscounts error: ' + e.message);
  }
}

// ─── Get discount_ids for a patient ───────────────────────────────
function _getPatientDiscountIds(spreadsheetId, patientId) {
  try {
    const sh   = _getPatientDiscountSheet(spreadsheetId);
    const data = sh.getDataRange().getValues();
    return data.slice(1)
      .filter(function(r) { return r[0] !== '' && String(r[1]).trim() === String(patientId); })
      .map(function(r) { return String(r[2]).trim(); })
      .filter(Boolean);
  } catch(_) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// READ — all admins (branch admin sees own branch only)
// Returns patients with discount_ids array
// ═══════════════════════════════════════════════════════════════
function getPatients(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const allPatients = [];
    const discountMap = _buildDiscountMap();

    for (var b = 1; b < branchData.length; b++) {
      const bRow      = branchData[b];
      const bId       = String(bRow[0] || '');
      const bName     = String(bRow[1] || '');
      const ssId      = String(bRow[7] || '');

      if (!ssId) continue;

      // Branch admin: only their branch
      if (session.role === 'branch_admin' && bId !== session.branch_id) continue;

      // Super admin with branch filter
      if (payload && payload.branch_id && bId !== payload.branch_id) continue;

      try {
        const sh   = _getPatientSheet(ssId);
        const data = sh.getDataRange().getValues();

        // Build patient_id → [discount_ids] for this branch
        const discMap = {};
        try {
          const mapSh   = _getPatientDiscountSheet(ssId);
          const mapData = mapSh.getDataRange().getValues();
          mapData.slice(1).forEach(function(r) {
            const pid = String(r[1] || '').trim();
            const did = String(r[2] || '').trim();
            if (!pid || !did) return;
            if (!discMap[pid]) discMap[pid] = [];
            if (!discMap[pid].includes(did)) discMap[pid].push(did);
          });
        } catch(_) {}

        data.slice(1).filter(function(r) { return r[0] !== ''; }).forEach(function(r) {
          const patient = _patientRowToObj(r, bName);
          const dIds    = discMap[patient.patient_id] || [];
          patient.discount_ids   = dIds;
          patient.discount_count = dIds.length;
          // Attach discount names for display
          patient.discount_names = dIds.map(function(id) {
            return discountMap[id] ? discountMap[id].discount_name : id;
          });
          allPatients.push(patient);
        });
      } catch(_) {}
    }

    // Sort by branch then last_name
    allPatients.sort(function(a, b) {
      if (a.branch_id < b.branch_id) return -1;
      if (a.branch_id > b.branch_id) return 1;
      return a.last_name.localeCompare(b.last_name);
    });

    return { success: true, data: allPatients };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════
function createPatient(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role === 'super_admin')
      return { success: false, error: 'Access denied. Super admins cannot create patients.' };
    if (session.role !== 'branch_admin')
      return { success: false, error: 'Unauthorized.' };

    if (!payload.last_name  || !payload.last_name.trim())  return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim()) return { success: false, error: 'First name is required.' };
    if (!payload.sex)                                       return { success: false, error: 'Sex is required.' };
    if (!payload.birth_date)                                return { success: false, error: 'Birth date is required.' };
    if (!payload.contact_number || !payload.contact_number.trim()) return { success: false, error: 'Contact number is required.' };
    if (!payload.address || !payload.address.trim())        return { success: false, error: 'Address is required.' };

    // Determine target branch
    var targetBranchId = payload.branch_id;
    if (session.role === 'branch_admin') targetBranchId = session.branch_id;
    if (!targetBranchId) return { success: false, error: 'Branch is required.' };

    const branchInfo = _getBranchSsId(targetBranchId);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };

    const sh        = _getPatientSheet(branchInfo.ssId);
    const now       = new Date().toISOString();
    const patientId = 'PAT-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      patientId,
      payload.last_name.trim(),
      payload.first_name.trim(),
      (payload.middle_name || '').trim(),
      payload.sex,
      payload.birth_date,
      payload.contact_number.trim(),
      (payload.email_address || '').trim(),
      payload.address.trim(),
      targetBranchId,
      now,
      now
    ]);

    // Save discount assignments
    const discountIds = payload.discount_ids || [];
    if (discountIds.length > 0) {
      _savePatientDiscounts(branchInfo.ssId, patientId, discountIds);
    }

    return {
      success: true,
      data: {
        patient_id:     patientId,
        last_name:      payload.last_name.trim(),
        first_name:     payload.first_name.trim(),
        middle_name:    (payload.middle_name || '').trim(),
        sex:            payload.sex,
        birth_date:     payload.birth_date,
        contact_number: payload.contact_number.trim(),
        email_address:  (payload.email_address || '').trim(),
        address:        payload.address.trim(),
        branch_id:      targetBranchId,
        branch_name:    branchInfo.branchName,
        discount_ids:   discountIds,
        discount_count: discountIds.length,
        created_at:     now,
        updated_at:     now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════
function updatePatient(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role === 'super_admin')
      return { success: false, error: 'Access denied. Super admins cannot edit patients.' };
    if (session.role !== 'branch_admin')
      return { success: false, error: 'Unauthorized.' };

    if (!payload.patient_id) return { success: false, error: 'patient_id is required.' };
    if (!payload.branch_id)  return { success: false, error: 'branch_id is required.' };

    if (payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied: not your branch.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };

    const sh   = _getPatientSheet(branchInfo.ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.patient_id);
    });
    if (idx === -1) return { success: false, error: 'Patient not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.last_name.trim());
    sh.getRange(row, 3).setValue(payload.first_name.trim());
    sh.getRange(row, 4).setValue((payload.middle_name || '').trim());
    sh.getRange(row, 5).setValue(payload.sex);
    sh.getRange(row, 6).setValue(payload.birth_date);
    sh.getRange(row, 7).setValue(payload.contact_number.trim());
    sh.getRange(row, 8).setValue((payload.email_address || '').trim());
    sh.getRange(row, 9).setValue(payload.address.trim());
    sh.getRange(row, 12).setValue(now);

    // Update discount assignments
    if (payload.discount_ids !== undefined) {
      _savePatientDiscounts(branchInfo.ssId, payload.patient_id, payload.discount_ids);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════
function deletePatient(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role === 'super_admin')
      return { success: false, error: 'Access denied. Super admins cannot delete patients.' };
    if (session.role !== 'branch_admin')
      return { success: false, error: 'Unauthorized.' };

    if (!payload.patient_id) return { success: false, error: 'patient_id is required.' };
    if (!payload.branch_id)  return { success: false, error: 'branch_id is required.' };

    if (payload.branch_id !== session.branch_id)
      return { success: false, error: 'Access denied: not your branch.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };

    const sh   = _getPatientSheet(branchInfo.ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.patient_id);
    });
    if (idx === -1) return { success: false, error: 'Patient not found.' };

    sh.deleteRow(idx + 1);

    // Clean up discount mappings
    _savePatientDiscounts(branchInfo.ssId, payload.patient_id, []);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET DISCOUNTS FOR PATIENT (for pre-checking modal)
// ═══════════════════════════════════════════════════════════════
function getDiscountsForPatient(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!payload.patient_id) return { success: false, error: 'patient_id is required.' };
    if (!payload.branch_id)  return { success: false, error: 'branch_id is required.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };

    const ids = _getPatientDiscountIds(branchInfo.ssId, payload.patient_id);
    return { success: true, data: ids };
  } catch (e) {
    return { success: false, error: e.message };
  }
}