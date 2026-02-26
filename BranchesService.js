// ═══════════════════════════════════════════════════════════════
// BRANCHES SERVICE
// ═══════════════════════════════════════════════════════════════

function _getOrCreateRegistry() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('REGISTRY_SS_ID');

  if (!ssId || ssId.trim() === '') {
    const ss = SpreadsheetApp.create('[A-Lab] Registry');
    ssId = ss.getId();
    props.setProperty('REGISTRY_SS_ID', ssId);
    Logger.log('Created new Registry SS: ' + ssId + ' | URL: ' + ss.getUrl());
  }

  return SpreadsheetApp.openById(ssId);
}

function _getRegistrySheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Branches');

  if (!sh) {
    sh = ss.insertSheet('Branches');
    const headers = [
      'branch_id', 'branch_name', 'branch_code', 'address',
      'contact', 'email', 'status', 'spreadsheet_id',
      'spreadsheet_url', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 160);
  }

  return sh;
}

function _rowToObj(row) {
  return {
    branch_id:       String(row[0]  || ''),
    branch_name:     String(row[1]  || ''),
    branch_code:     String(row[2]  || ''),
    address:         String(row[3]  || ''),
    contact:         String(row[4]  || ''),
    email:           String(row[5]  || ''),
    status:          String(row[6]  || 'Active'),
    spreadsheet_id:  String(row[7]  || ''),
    spreadsheet_url: String(row[8]  || ''),
    created_at:      String(row[9]  || ''),
    updated_at:      String(row[10] || '')
  };
}



// ─── Auto-create Spreadsheet for a new Branch ────────────────────
// ─── Auto-create Spreadsheet for a new Branch ────────────────────
// Replace the existing _createBranchSpreadsheet() in BranchesService.js
// with this updated version. Only the MedTechs block (step 4) is new.
// ─────────────────────────────────────────────────────────────────

function _createBranchSpreadsheet(branchName, branchCode) {
  const title = '[A-Lab] ' + branchName + ' (' + branchCode + ')';
  const ss = SpreadsheetApp.create(title);

  // ── 1. DEPARTMENTS sheet ──────────────────────────────────────
  const deptSheet = ss.getActiveSheet();
  deptSheet.setName('Departments');

  const deptHeaders = ['dept_id', 'dept_name', 'is_active', 'branch_id', 'created_at', 'updated_at'];
  deptSheet.appendRow(deptHeaders);
  deptSheet.getRange(1, 1, 1, deptHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  deptSheet.setFrozenRows(1);
  deptSheet.setColumnWidth(1, 160); // dept_id
  deptSheet.setColumnWidth(2, 220); // dept_name
  deptSheet.setColumnWidth(3, 90);  // is_active
  deptSheet.setColumnWidth(4, 140); // branch_id
  deptSheet.setColumnWidth(5, 180); // created_at
  deptSheet.setColumnWidth(6, 180); // updated_at

  // ── 2. ADMINS sheet ──────────────────────────────────────────
  const adminsSheet = ss.insertSheet('Admins');
  const adminHeaders = [
    'admin_id', 'full_name', 'username', 'password_hash',
    'branch_id', 'branch_name', 'status', 'created_at', 'updated_at'
  ];
  adminsSheet.appendRow(adminHeaders);
  adminsSheet.getRange(1, 1, 1, adminHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  adminsSheet.setFrozenRows(1);
  adminsSheet.setColumnWidth(1, 160); // admin_id
  adminsSheet.setColumnWidth(2, 180); // full_name
  adminsSheet.setColumnWidth(3, 160); // username
  adminsSheet.setColumnWidth(4, 240); // password_hash
  adminsSheet.setColumnWidth(5, 140); // branch_id
  adminsSheet.setColumnWidth(6, 160); // branch_name
  adminsSheet.setColumnWidth(7, 90);  // status
  adminsSheet.setColumnWidth(8, 180); // created_at
  adminsSheet.setColumnWidth(9, 180); // updated_at

  // ── 3. LAB SERVICES sheet ───────────────────────────────────
  const labSheet = ss.insertSheet('Lab Services');
  const labHeaders = [
    'lab_id', 'dept_id', 'lab_code', 'lab_name',
    'description', 'default_fee', 'tat_hours', 'specimen_type',
    'is_active', 'branch_id', 'created_at', 'updated_at'
  ];
  labSheet.appendRow(labHeaders);
  labSheet.getRange(1, 1, 1, labHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  labSheet.setFrozenRows(1);
  labSheet.setColumnWidth(1,  160); // lab_id
  labSheet.setColumnWidth(2,  160); // dept_id
  labSheet.setColumnWidth(3,  110); // lab_code
  labSheet.setColumnWidth(4,  200); // lab_name
  labSheet.setColumnWidth(5,  260); // description
  labSheet.setColumnWidth(6,  110); // default_fee
  labSheet.setColumnWidth(7,  100); // tat_hours
  labSheet.setColumnWidth(8,  150); // specimen_type
  labSheet.setColumnWidth(9,   90); // is_active
  labSheet.setColumnWidth(10, 140); // branch_id
  labSheet.setColumnWidth(11, 180); // created_at
  labSheet.setColumnWidth(12, 180); // updated_at

  // ── 4. MEDTECHS sheet ────────────────────────────────────────
  const mtSheet = ss.insertSheet('MedTechs');
  const mtHeaders = [
    'medtech_id', 'last_name', 'first_name', 'middle_name',
    'email', 'password_hash', 'role', 'status',
    'branch_id', 'branch_name', 'created_at', 'updated_at'
  ];
  mtSheet.appendRow(mtHeaders);
  mtSheet.getRange(1, 1, 1, mtHeaders.length)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  mtSheet.setFrozenRows(1);
  mtSheet.setColumnWidth(1,  160); // medtech_id
  mtSheet.setColumnWidth(2,  140); // last_name
  mtSheet.setColumnWidth(3,  140); // first_name
  mtSheet.setColumnWidth(4,  140); // middle_name
  mtSheet.setColumnWidth(5,  220); // email
  mtSheet.setColumnWidth(6,  260); // password_hash
  mtSheet.setColumnWidth(7,  180); // role
  mtSheet.setColumnWidth(8,   90); // status
  mtSheet.setColumnWidth(9,  140); // branch_id
  mtSheet.setColumnWidth(10, 170); // branch_name
  mtSheet.setColumnWidth(11, 180); // created_at
  mtSheet.setColumnWidth(12, 180); // updated_at

  // ── Sample data rows (greyed out — for reference only) ───────
  const sampleBg   = '#f8fafc';
  const sampleFont = '#94a3b8';
  const sampleRows = [
    [
      '← auto-generated', 'Dela Cruz', 'Juan', 'Santos',
      'jdelacruz@branch.com', '← hashed on enroll', 'Medical Technologist', 'Active',
      '← auto-filled', branchName, '← auto-filled', '← auto-filled'
    ],
    [
      '← auto-generated', 'Reyes', 'Maria', 'Lopez',
      'mreyes@branch.com', '← hashed on enroll', 'Senior Med Tech', 'Active',
      '← auto-filled', branchName, '← auto-filled', '← auto-filled'
    ],
    [
      '← auto-generated', 'Santos', 'Pedro', '',
      'psantos@branch.com', '← hashed on enroll', 'Lab Supervisor', 'Active',
      '← auto-filled', branchName, '← auto-filled', '← auto-filled'
    ]
  ];

  sampleRows.forEach((row, i) => {
    mtSheet.appendRow(row);
    const rowNum = i + 2; // data starts at row 2
    mtSheet.getRange(rowNum, 1, 1, mtHeaders.length)
      .setBackground(sampleBg)
      .setFontColor(sampleFont)
      .setFontStyle('italic');
  });

  // Add a note on the header explaining sample rows
  mtSheet.getRange(1, 1).setNote(
    'MedTechs sheet — managed by A-Lab system.\n' +
    'Rows 2–4 are sample/reference rows and will be replaced when real enrollments are made.\n' +
    'Do NOT manually edit this sheet.'
  );

  // ── 5. Bring Departments to front ────────────────────────────
  ss.setActiveSheet(deptSheet);
  ss.moveActiveSheet(1);

  return { id: ss.getId(), url: ss.getUrl() };
}

// ─── CRUD ─────────────────────────────────────────────────────────
function getBranches() {
  try {
    const sh   = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    const rows = data.slice(1).filter(r => r[0] !== '').map(_rowToObj);
    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function createBranch(payload) {
  try {
    if (!payload.branch_name || !payload.branch_name.trim())
      return { success: false, error: 'Branch name is required.' };
    if (!payload.branch_code || !payload.branch_code.trim())
      return { success: false, error: 'Branch code is required.' };

    const sh       = _getRegistrySheet();
    const now      = new Date().toISOString();
    const branchId = 'BR-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const ssInfo   = _createBranchSpreadsheet(
      payload.branch_name.trim(),
      payload.branch_code.trim().toUpperCase()
    );

    sh.appendRow([
      branchId,
      payload.branch_name.trim(),
      payload.branch_code.trim().toUpperCase(),
      payload.address || '',
      payload.contact || '',
      payload.email   || '',
      payload.status  || 'Active',
      ssInfo.id,
      ssInfo.url,
      now, now
    ]);

    return {
      success: true,
      data: {
        branch_id: branchId,
        branch_name: payload.branch_name.trim(),
        branch_code: payload.branch_code.trim().toUpperCase(),
        address: payload.address || '',
        contact: payload.contact || '',
        email: payload.email || '',
        status: payload.status || 'Active',
        spreadsheet_id: ssInfo.id,
        spreadsheet_url: ssInfo.url,
        created_at: now,
        updated_at: now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateBranch(payload) {
  try {
    const sh   = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.branch_id));
    if (idx === -1) return { success: false, error: 'Branch not found: ' + payload.branch_id };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.branch_name.trim());
    sh.getRange(row, 3).setValue(payload.branch_code.trim().toUpperCase());
    sh.getRange(row, 4).setValue(payload.address || '');
    sh.getRange(row, 5).setValue(payload.contact || '');
    sh.getRange(row, 6).setValue(payload.email   || '');
    sh.getRange(row, 7).setValue(payload.status  || 'Active');
    sh.getRange(row, 11).setValue(now);

    try {
      const ssId = String(data[idx][7] || '');
      if (ssId) {
        const branchSs = SpreadsheetApp.openById(ssId);

        // Rename the spreadsheet
        branchSs.rename('[A-Lab] ' + payload.branch_name.trim() + ' (' + payload.branch_code.trim().toUpperCase() + ')');

        // Sync branch_name in all admin rows (col 6 = branch_name)
        const adminSh = branchSs.getSheetByName('Admins');
        if (adminSh && adminSh.getLastRow() > 1) {
          const numRows = adminSh.getLastRow() - 1;
          const branchNameCol = adminSh.getRange(2, 6, numRows, 1);
          const vals = branchNameCol.getValues().map(() => [payload.branch_name.trim()]);
          branchNameCol.setValues(vals);
        }
      }
    } catch(_) {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteBranch(branchId) {
  try {
    const sh   = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(branchId));
    if (idx === -1) return { success: false, error: 'Branch not found: ' + branchId };
    sh.deleteRow(idx + 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Run once in Apps Script editor to verify setup ──────────────
function setupAndVerify() {
  try {
    const sh = _getRegistrySheet();
    const ss = sh.getParent();
    Logger.log('✅ Registry OK → ' + ss.getName());
    Logger.log('   URL: ' + ss.getUrl());
    Logger.log('   ID: ' + ss.getId());
    Logger.log('   Branches: ' + (sh.getLastRow() - 1));
    PropertiesService.getScriptProperties().setProperty('REGISTRY_SS_ID', ss.getId());
  } catch(e) {
    Logger.log('❌ Error: ' + e.message);
  }
}