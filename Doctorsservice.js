// ═══════════════════════════════════════════════════════════════
// DOCTORS SERVICE  (v2)
// ─────────────────────────────────────────────────────────────
// Doctors sheet  → Registry SS → "Doctors"
//   Schema: doctor_id | last_name | first_name | middle_name |
//           suffix | specialty | license_no | contact | email |
//           username | password_hash | is_active | created_at | updated_at
//
// Doctor_Branches → Registry SS → "Doctor_Branches"
//   Schema: assignment_id | doctor_id | branch_id | branch_name |
//           assigned_at | assigned_by | is_current
//   One row per assignment; only one row per doctor has is_current=TRUE.
//
// Permissions:
//   READ (getDoctors, getDoctorAssignmentHistory) → all authenticated roles
//   WRITE (create/update/delete/assign)           → super_admin only
//   LOGIN (doctorLogin)                           → public (no token)
// ═══════════════════════════════════════════════════════════════

// ─── Doctors sheet ────────────────────────────────────────────────
function _getDoctorSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Doctors');

  if (!sh) {
    sh = ss.insertSheet('Doctors');
    const headers = [
      'doctor_id', 'last_name', 'first_name', 'middle_name',
      'suffix', 'specialty', 'license_no', 'contact', 'email',
      'username', 'password_hash', 'is_active', 'created_at', 'updated_at',
      'must_change_password'
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
    sh.setColumnWidth(10, 160); // username
    sh.setColumnWidth(11, 240); // password_hash
    sh.setColumnWidth(12,  90); // is_active
    sh.setColumnWidth(13, 180); // created_at
    sh.setColumnWidth(14, 180); // updated_at
    sh.setColumnWidth(15, 180); // must_change_password
  }

  return sh;
}

// ─── Doctor_Branches sheet ────────────────────────────────────────
function _getDoctorBranchSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Doctor_Branches');

  if (!sh) {
    sh = ss.insertSheet('Doctor_Branches');
    const headers = [
      'assignment_id', 'doctor_id', 'branch_id', 'branch_name',
      'assigned_at', 'assigned_by', 'is_current'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); // assignment_id
    sh.setColumnWidth(2, 160); // doctor_id
    sh.setColumnWidth(3, 160); // branch_id
    sh.setColumnWidth(4, 200); // branch_name
    sh.setColumnWidth(5, 180); // assigned_at
    sh.setColumnWidth(6, 200); // assigned_by
    sh.setColumnWidth(7,  90); // is_current
  }

  return sh;
}

// ─── Row → Object (excludes password_hash) ───────────────────────
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
    username:    String(row[9]  || ''),
    // row[10] = password_hash — intentionally excluded
    is_active:            row[11] === true || String(row[11]).toUpperCase() === 'TRUE',
    created_at:           String(row[12] || ''),
    updated_at:           String(row[13] || ''),
    must_change_password: row[14] === true || String(row[14]).toUpperCase() === 'TRUE'
  };
}

// ─── Auth guard: super_admin only ────────────────────────────────
function _requireSuperAdminDoctor(token) {
  const s = _getSession(token);
  if (!s)                       return { expired: true };
  if (s.role !== 'super_admin') return { denied: true };
  return s;
}

// Branch admin guard — allows branch_admin and super_admin
function _requireDoctorAccess(token) {
  const s = _getSession(token);
  if (!s) return { expired: true };
  if (!['super_admin', 'branch_admin'].includes(s.role)) return { denied: true };
  return s;
}

// ─── Build { doctor_id → current assignment } map ────────────────
function _buildCurrentBranchMap() {
  const map = {};
  try {
    const sh   = _getDoctorBranchSheet();
    const data = sh.getDataRange().getValues();
    data.slice(1).forEach(function(r) {
      const isCurrent = r[6] === true || String(r[6]).toUpperCase() === 'TRUE';
      if (!isCurrent || !r[1]) return;
      map[String(r[1])] = {
        assignment_id: String(r[0] || ''),
        branch_id:     String(r[2] || ''),
        branch_name:   String(r[3] || ''),
        assigned_at:   String(r[4] || ''),
        assigned_by:   String(r[5] || '')
      };
    });
  } catch (e) {
    Logger.log('_buildCurrentBranchMap error: ' + e.message);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════
// READ — all authenticated roles
// Returns doctors enriched with their current branch assignment
// ═══════════════════════════════════════════════════════════════
function getDoctors(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const branchMap = _buildCurrentBranchMap();

    let doctors = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        const doc        = _doctorRowToObj(r);
        const assignment = branchMap[doc.doctor_id] || null;
        doc.branch_id    = assignment ? assignment.branch_id   : '';
        doc.branch_name  = assignment ? assignment.branch_name : '';
        doc.assigned_at  = assignment ? assignment.assigned_at : '';
        return doc;
      });

    // Branch admin only sees doctors assigned to their branch
    if (session.role === 'branch_admin') {
      doctors = doctors.filter(function(d) {
        return d.branch_id === session.branch_id;
      });
    }

    return { success: true, data: doctors };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — super_admin only
// Required: last_name, first_name, username, password
// ═══════════════════════════════════════════════════════════════
function createDoctor(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    if (!payload.last_name  || !payload.last_name.trim())
      return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim())
      return { success: false, error: 'First name is required.' };
    if (!payload.username   || !payload.username.trim())
      return { success: false, error: 'Username is required.' };
    if (!payload.password   || !payload.password.trim())
      return { success: false, error: 'Password is required.' };
    if (payload.password.trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();

    // Duplicate username check
    const unameLower = payload.username.trim().toLowerCase();
    const dupUsername = data.slice(1).some(function(r) {
      return String(r[9]).trim().toLowerCase() === unameLower;
    });
    if (dupUsername) return { success: false, error: 'Username already exists.' };

    // Duplicate license check
    if (payload.license_no && payload.license_no.trim()) {
      const dupLicense = data.slice(1).some(function(r) {
        return String(r[6]).trim().toLowerCase() === payload.license_no.trim().toLowerCase();
      });
      if (dupLicense) return { success: false, error: 'License number already exists.' };
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
      unameLower,
      _hashPassword(payload.password.trim()),
      payload.is_active !== false,
      now,
      now,
      true  // must_change_password — always true on creation
    ]);

    // Branch admin: auto-assign the new doctor to their branch
    if (session.role === 'branch_admin' && session.branch_id) {
      try {
        const abSh         = _getDoctorBranchSheet();
        const assignmentId = 'DA-' + Utilities.getUuid().substring(0, 8).toUpperCase();
        const assignedBy   = session.full_name || session.username || 'branch_admin';
        abSh.appendRow([
          assignmentId,
          doctorId,
          session.branch_id,
          session.branch_name || '',
          now,
          assignedBy,
          true
        ]);
      } catch (e) {
        Logger.log('Auto-assign doctor error: ' + e.message);
      }
    }

    return {
      success: true,
      data: {
        doctor_id:  doctorId,
        last_name:  payload.last_name.trim(),
        first_name: payload.first_name.trim(),
        username:   unameLower,
        is_active:  payload.is_active !== false,
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
function updateDoctor(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.doctor_id)
      return { success: false, error: 'Doctor ID is required.' };
    if (!payload.last_name  || !payload.last_name.trim())
      return { success: false, error: 'Last name is required.' };
    if (!payload.first_name || !payload.first_name.trim())
      return { success: false, error: 'First name is required.' };
    if (!payload.username   || !payload.username.trim())
      return { success: false, error: 'Username is required.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.doctor_id);
    });
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    const unameLower = payload.username.trim().toLowerCase();

    // Duplicate username check (exclude self)
    const dupUsername = data.slice(1).some(function(r, i) {
      return i !== idx - 1 && String(r[9]).trim().toLowerCase() === unameLower;
    });
    if (dupUsername) return { success: false, error: 'Username already exists.' };

    // Duplicate license check (exclude self)
    if (payload.license_no && payload.license_no.trim()) {
      const dupLicense = data.slice(1).some(function(r, i) {
        return i !== idx - 1 &&
          String(r[6]).trim().toLowerCase() === payload.license_no.trim().toLowerCase();
      });
      if (dupLicense) return { success: false, error: 'License number already exists.' };
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
    sh.getRange(row, 10).setValue(unameLower);
    // Only update password if a new one was provided
    if (payload.password && payload.password.trim().length >= 6) {
      sh.getRange(row, 11).setValue(_hashPassword(payload.password.trim()));
    }
    sh.getRange(row, 12).setValue(payload.is_active !== false);
    sh.getRange(row, 14).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
// Also clears all branch assignments for the doctor
// ═══════════════════════════════════════════════════════════════
function deleteDoctor(doctorId, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    // Branch admin: verify doctor belongs to their branch
    if (session.role === 'branch_admin') {
      const branchMap  = _buildCurrentBranchMap();
      const assignment = branchMap[doctorId];
      if (!assignment || assignment.branch_id !== session.branch_id)
        return { success: false, error: 'Access denied. This doctor is not in your branch.' };
    }

    if (!doctorId) return { success: false, error: 'Doctor ID is required.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(doctorId);
    });
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    sh.deleteRow(idx + 1);
    _clearDoctorAssignments(doctorId);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ASSIGN / REASSIGN TO BRANCH — super_admin only
// Calling this with a new branch_id is also the re-assign flow.
// payload: { doctor_id, branch_id }
// ═══════════════════════════════════════════════════════════════
function assignDoctorToBranch(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.doctor_id) return { success: false, error: 'doctor_id is required.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };

    // Verify doctor exists
    const drSh   = _getDoctorSheet();
    const drData = drSh.getDataRange().getValues();
    const drIdx  = drData.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.doctor_id);
    });
    if (drIdx === -1) return { success: false, error: 'Doctor not found.' };

    // Verify branch exists and fetch name
    const brSh   = _getRegistrySheet();
    const brData = brSh.getDataRange().getValues();
    const brRow  = brData.find(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.branch_id);
    });
    if (!brRow) return { success: false, error: 'Branch not found.' };

    const branchName = String(brRow[1]);

    // Mark all existing assignments for this doctor as non-current
    const abSh   = _getDoctorBranchSheet();
    const abData = abSh.getDataRange().getValues();
    for (var i = 1; i < abData.length; i++) {
      if (String(abData[i][1]) === String(payload.doctor_id)) {
        const isCurrent = abData[i][6] === true || String(abData[i][6]).toUpperCase() === 'TRUE';
        if (isCurrent) {
          abSh.getRange(i + 1, 7).setValue(false);
        }
      }
    }

    // Insert new current assignment
    const now          = new Date().toISOString();
    const assignmentId = 'DA-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const assignedBy   = session.full_name || session.username || 'super_admin';

    abSh.appendRow([
      assignmentId,
      String(payload.doctor_id),
      String(payload.branch_id),
      branchName,
      now,
      assignedBy,
      true
    ]);

    return {
      success: true,
      data: {
        assignment_id: assignmentId,
        doctor_id:     String(payload.doctor_id),
        branch_id:     String(payload.branch_id),
        branch_name:   branchName,
        assigned_at:   now,
        assigned_by:   assignedBy
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UNASSIGN FROM BRANCH — super_admin only
// payload: { doctor_id }
// ═══════════════════════════════════════════════════════════════
function unassignDoctor(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.doctor_id) return { success: false, error: 'doctor_id is required.' };

    _clearDoctorAssignments(payload.doctor_id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Internal: mark all assignments as non-current ───────────────
function _clearDoctorAssignments(doctorId) {
  try {
    const sh   = _getDoctorBranchSheet();
    const data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(doctorId)) {
        sh.getRange(i + 1, 7).setValue(false);
      }
    }
  } catch (e) {
    Logger.log('_clearDoctorAssignments error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET ASSIGNMENT HISTORY — all authenticated roles
// payload: { doctor_id }
// ═══════════════════════════════════════════════════════════════
function getDoctorAssignmentHistory(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!payload.doctor_id) return { success: false, error: 'doctor_id is required.' };

    const sh   = _getDoctorBranchSheet();
    const data = sh.getDataRange().getValues();

    const history = data.slice(1)
      .filter(function(r) { return String(r[1]) === String(payload.doctor_id); })
      .map(function(r) {
        return {
          assignment_id: String(r[0] || ''),
          doctor_id:     String(r[1] || ''),
          branch_id:     String(r[2] || ''),
          branch_name:   String(r[3] || ''),
          assigned_at:   String(r[4] || ''),
          assigned_by:   String(r[5] || ''),
          is_current:    r[6] === true || String(r[6]).toUpperCase() === 'TRUE'
        };
      })
      .sort(function(a, b) { return b.assigned_at.localeCompare(a.assigned_at); });

    return { success: true, data: history };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD — super_admin only
// payload: { doctor_id, new_password }
// ═══════════════════════════════════════════════════════════════
function changeDoctorPassword(payload, token) {
  try {
    const session = _requireSuperAdminDoctor(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.doctor_id)
      return { success: false, error: 'doctor_id is required.' };
    if (!payload.new_password || payload.new_password.trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    // Verify current password if provided
    if (payload.current_password) {
      const currentHashed = _hashPassword(payload.current_password.trim());
      const sh2   = _getDoctorSheet();
      const data2 = sh2.getDataRange().getValues();
      const row2  = data2.find(function(r, i) {
        return i > 0 && String(r[0]) === String(session.doctor_id);
      });
      if (!row2 || String(row2[10]).trim() !== currentHashed)
        return { success: false, error: 'Current password is incorrect.' };
    }

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.doctor_id);
    });
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    sh.getRange(idx + 1, 11).setValue(_hashPassword(payload.new_password.trim()));
    sh.getRange(idx + 1, 14).setValue(new Date().toISOString());
    sh.getRange(idx + 1, 15).setValue(false); // clear must_change_password

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DOCTOR LOGIN — called from AdminService login() as step 3
// Validates username + password against Doctors sheet.
// Returns { success, token, data } on match.
// ═══════════════════════════════════════════════════════════════
function doctorLogin(username, password) {
  try {
    const hashed     = _hashPassword(password.trim());
    const unameLower = username.trim().toLowerCase();

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;

      if (String(row[9]).trim().toLowerCase() === unameLower &&
          String(row[10]).trim() === hashed) {

        const isActive = row[11] === true || String(row[11]).toUpperCase() === 'TRUE';
        if (!isActive) return { success: false, error: 'Account is inactive.' };

        const branchMap  = _buildCurrentBranchMap();
        const doctorId   = String(row[0]);
        const assignment = branchMap[doctorId] || {};

        const sessionData = {
          doctor_id:            doctorId,
          full_name:            String(row[2]).trim() + ' ' + String(row[1]).trim(),
          username:             unameLower,
          role:                 'doctor',
          branch_id:            assignment.branch_id   || null,
          branch_name:          assignment.branch_name || null,
          must_change_password: row[14] === true || String(row[14]).toUpperCase() === 'TRUE'
        };

        const token = _generateToken();
        _setSession(token, sessionData);
        return { success: true, token: token, data: sessionData };
      }
    }

    // No match found — return null so login() in AdminService can continue
    // checking other account types (or return the final error itself)
    return null;
  } catch (e) {
    Logger.log('doctorLogin error: ' + e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE OWN PASSWORD — doctor role only (first login or self-change)
// ═══════════════════════════════════════════════════════════════
function changeOwnDoctorPassword(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'doctor') return { success: false, error: 'Unauthorized.' };

    if (!payload.new_password || payload.new_password.trim().length < 6)
      return { success: false, error: 'Password must be at least 6 characters.' };

    const sh   = _getDoctorSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(session.doctor_id);
    });
    if (idx === -1) return { success: false, error: 'Doctor not found.' };

    sh.getRange(idx + 1, 11).setValue(_hashPassword(payload.new_password.trim()));
    sh.getRange(idx + 1, 14).setValue(new Date().toISOString());
    sh.getRange(idx + 1, 15).setValue(false); // clear must_change_password

    // Update the live session too
    session.must_change_password = false;
    _setSession(token, session);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}