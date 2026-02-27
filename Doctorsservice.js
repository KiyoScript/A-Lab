// ═══════════════════════════════════════════════════════════════
// DOCTORS SERVICE
// Doctors are global — stored in Registry SS → "Doctors" sheet.
// All roles can read; only super_admin can CREATE / UPDATE / DELETE.
//
// Schema:
//   A: doctor_id      B: last_name      C: first_name
//   D: middle_name    E: suffix         F: specialty
//   G: license_no     H: contact        I: email
//   J: is_active      K: created_at     L: updated_at
// ═══════════════════════════════════════════════════════════════

// ─── Sheet accessor ───────────────────────────────────────────────
function _getDoctorSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Doctors');

  if (!sh) {
    sh = ss.insertSheet('Doctors');
    const headers = [
      'doctor_id', 'last_name', 'first_name', 'middle_name',
      'suffix', 'specialty', 'license_no', 'contact',
      'email', 'is_active', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  160); // doctor_id
    sh.setColumnWidth(2,  140); // last_name
    sh.setColumnWidth(3,  140); // first_name
    sh.setColumnWidth(4,  130); // middle_name
    sh.setColumnWidth(5,   90); // suffix
    sh.setColumnWidth(6,  200); // specialty
    sh.setColumnWidth(7,  140); // license_no
    sh.setColumnWidth(8,  130); // contact
    sh.setColumnWidth(9,  200); // email
    sh.setColumnWidth(10,  90); // is_active
    sh.setColumnWidth(11, 180); // created_at
    sh.setColumnWidth(12, 180); // updated_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _doctorRowToObj(row) {
  return {
    doctor_id:   String(row[0]  || ''),
    last_name:   String(row[1]  || ''),
    first_name:  String(row[2]  || ''),
    middle_name: String(row[3]  || ''),
    suffix:      String(row[4]  || ''),
    specialty:   String(row[5]  || ''),
    license_no:  String(row[6]  || ''),
    contact:     String(row[7]  || ''),
    email:       String(row[8]  || ''),
    is_active:   row[9] === true || String(row[9]).toUpperCase() === 'TRUE',
    created_at:  String(row[10] || ''),
    updated_at:  String(row[11] || '')
  };
}

// ─── Auth guard: super_admin only ────────────────────────────────
function _requireSuperAdminDoctor(token) {
  const s = _getSession(token);
  if (!s)                      return { expired: true };
  if (s.role !== 'super_admin') return { denied: true };
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ — all authenticated roles
// ═══════════════════════════════════════════════════════════════
function getDoctors(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const doctors = data.slice(1)
      .filter(r => r[0] !== '')
      .map(_doctorRowToObj);

    return { success: true, data: doctors };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function createDoctor(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.last_name  || !payload.last_name.trim())
      return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim())
      return { success: false, error: 'First name is required.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();

    // Duplicate license check (if provided)
    if (payload.license_no && payload.license_no.trim()) {
      const dup = data.slice(1).some(r =>
        String(r[6]).trim().toLowerCase() === payload.license_no.trim().toLowerCase()
      );
      if (dup) return { success: false, error: 'License number already exists.' };
    }

    const now      = new Date().toISOString();
    const doctorId = 'DR-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    sh.appendRow([
      doctorId,
      payload.last_name.trim(),
      payload.first_name.trim(),
      (payload.middle_name  || '').trim(),
      (payload.suffix       || '').trim(),
      (payload.specialty    || '').trim(),
      (payload.license_no   || '').trim(),
      (payload.contact      || '').trim(),
      (payload.email        || '').trim(),
      payload.is_active !== false ? true : false,
      now,
      now
    ]);

    return {
      success: true,
      data: _doctorRowToObj([
        doctorId,
        payload.last_name.trim(), payload.first_name.trim(),
        (payload.middle_name || '').trim(), (payload.suffix || '').trim(),
        (payload.specialty || '').trim(), (payload.license_no || '').trim(),
        (payload.contact || '').trim(), (payload.email || '').trim(),
        payload.is_active !== false,
        now, now
      ])
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — super_admin only
// ═══════════════════════════════════════════════════════════════
function updateDoctor(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.doctor_id)
      return { success: false, error: 'Doctor ID is required.' };
    if (!payload.last_name || !payload.last_name.trim())
      return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim())
      return { success: false, error: 'First name is required.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.doctor_id));
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    // Duplicate license check (excluding self)
    if (payload.license_no && payload.license_no.trim()) {
      const dup = data.slice(1).some((r, i) =>
        i !== idx - 1 &&
        String(r[6]).trim().toLowerCase() === payload.license_no.trim().toLowerCase()
      );
      if (dup) return { success: false, error: 'License number already exists.' };
    }

    const now = new Date().toISOString();
    const row = idx + 1;

    sh.getRange(row, 2).setValue(payload.last_name.trim());
    sh.getRange(row, 3).setValue(payload.first_name.trim());
    sh.getRange(row, 4).setValue((payload.middle_name  || '').trim());
    sh.getRange(row, 5).setValue((payload.suffix       || '').trim());
    sh.getRange(row, 6).setValue((payload.specialty    || '').trim());
    sh.getRange(row, 7).setValue((payload.license_no   || '').trim());
    sh.getRange(row, 8).setValue((payload.contact      || '').trim());
    sh.getRange(row, 9).setValue((payload.email        || '').trim());
    sh.getRange(row, 10).setValue(payload.is_active !== false ? true : false);
    sh.getRange(row, 12).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
// ═══════════════════════════════════════════════════════════════
function deleteDoctor(doctorId, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!doctorId) return { success: false, error: 'Doctor ID is required.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(doctorId));
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    sh.deleteRow(idx + 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER — add these cases to handleRequest() in Code.gs
// ═══════════════════════════════════════════════════════════════
//   case 'GET_DOCTORS':    return getDoctors(token);
//   case 'CREATE_DOCTOR':  return createDoctor(payload, token);
//   case 'UPDATE_DOCTOR':  return updateDoctor(payload, token);
//   case 'DELETE_DOCTOR':  return deleteDoctor(payload.doctor_id, token);