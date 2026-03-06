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
// NOTE: Departments and Lab Services are now GLOBAL (stored in Registry SS).
// Branch SS only contains branch-specific data: Admins, MedTechs, Patients, Patient_Discounts.
function _createBranchSpreadsheet(branchName, branchCode) {
  const title = '[A-Lab] ' + branchName + ' (' + branchCode + ')';
  const ss = SpreadsheetApp.create(title);

  // ── 1. ADMINS sheet ───────────────────────────────────────────
  const adminsSheet = ss.getActiveSheet();
  adminsSheet.setName('Admins');

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
  adminsSheet.setColumnWidth(1, 160);
  adminsSheet.setColumnWidth(2, 180);
  adminsSheet.setColumnWidth(3, 160);
  adminsSheet.setColumnWidth(4, 240);
  adminsSheet.setColumnWidth(5, 140);
  adminsSheet.setColumnWidth(6, 160);
  adminsSheet.setColumnWidth(7, 90);
  adminsSheet.setColumnWidth(8, 180);
  adminsSheet.setColumnWidth(9, 180);

  // ── 2. MEDTECHS sheet ─────────────────────────────────────────
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
  mtSheet.setColumnWidth(1,  160);
  mtSheet.setColumnWidth(2,  140);
  mtSheet.setColumnWidth(3,  140);
  mtSheet.setColumnWidth(4,  140);
  mtSheet.setColumnWidth(5,  220);
  mtSheet.setColumnWidth(6,  260);
  mtSheet.setColumnWidth(7,  180);
  mtSheet.setColumnWidth(8,   90);
  mtSheet.setColumnWidth(9,  140);
  mtSheet.setColumnWidth(10, 170);
  mtSheet.setColumnWidth(11, 180);
  mtSheet.setColumnWidth(12, 180);

  // ── Sample data rows for MedTechs (greyed out — for reference only) ──
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
    const rowNum = i + 2;
    mtSheet.getRange(rowNum, 1, 1, mtHeaders.length)
      .setBackground(sampleBg)
      .setFontColor(sampleFont)
      .setFontStyle('italic');
  });

  mtSheet.getRange(1, 1).setNote(
    'MedTechs sheet — managed by A-Lab system.\n' +
    'Rows 2–4 are sample/reference rows and will be replaced when real enrollments are made.\n' +
    'Do NOT manually edit this sheet.'
  );

  // ── 3. PATIENTS sheet ─────────────────────────────────────────
  const patSheet = ss.insertSheet('Patients');
  const patHeaders = [
    'patient_id', 'last_name', 'first_name', 'middle_name',
    'sex', 'birth_date', 'contact_number', 'email_address',
    'address', 'branch_id', 'created_at', 'updated_at'
  ];
  patSheet.appendRow(patHeaders);
  patSheet.getRange(1, 1, 1, patHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  patSheet.setFrozenRows(1);
  patSheet.setColumnWidth(1,  160);
  patSheet.setColumnWidth(2,  140);
  patSheet.setColumnWidth(3,  140);
  patSheet.setColumnWidth(4,  140);
  patSheet.setColumnWidth(5,   80);
  patSheet.setColumnWidth(6,  110);
  patSheet.setColumnWidth(7,  130);
  patSheet.setColumnWidth(8,  200);
  patSheet.setColumnWidth(9,  250);
  patSheet.setColumnWidth(10, 140);
  patSheet.setColumnWidth(11, 180);
  patSheet.setColumnWidth(12, 180);

  // ── 4. PATIENT_DISCOUNTS sheet ────────────────────────────────
  const pdSheet = ss.insertSheet('Patient_Discounts');
  const pdHeaders = ['mapping_id', 'patient_id', 'discount_id', 'created_at'];
  pdSheet.appendRow(pdHeaders);
  pdSheet.getRange(1, 1, 1, pdHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  pdSheet.setFrozenRows(1);
  pdSheet.setColumnWidth(1, 200);
  pdSheet.setColumnWidth(2, 180);
  pdSheet.setColumnWidth(3, 180);
  pdSheet.setColumnWidth(4, 200);

  // ── 5. ORDERS sheet ───────────────────────────────────────────
  const ordersSheet = ss.insertSheet('Orders');
  const ordersHeaders = [
    'order_id','order_number','patient_id','patient_snapshot',
    'referring_doctor_id','doctor_snapshot','status','payment_method',
    'payment_amount','payment_discount','amount_paid','change',
    'notes','order_date','created_by','created_at','updated_at'
  ];
  ordersSheet.appendRow(ordersHeaders);
  ordersSheet.getRange(1,1,1,ordersHeaders.length)
    .setFontWeight('bold').setBackground('#0f172a')
    .setFontColor('#ffffff').setHorizontalAlignment('center');
  ordersSheet.setFrozenRows(1);
  ordersSheet.setColumnWidths(1, ordersHeaders.length, 160);

  // ── 6. ORDER_ITEMS sheet ──────────────────────────────────────
  const itemsSheet = ss.insertSheet('Order_Items');
  const itemsHeaders = [
    'item_id','order_id','item_type','item_ref_id','item_name_snapshot',
    'fee','item_status','result_status','result_file_url','result_drive_id',
    'result_file_name','started_by','started_at','completed_by','completed_at',
    'created_at'
  ];
  itemsSheet.appendRow(itemsHeaders);
  itemsSheet.getRange(1,1,1,itemsHeaders.length)
    .setFontWeight('bold').setBackground('#0f172a')
    .setFontColor('#ffffff').setHorizontalAlignment('center');
  itemsSheet.setFrozenRows(1);
  itemsSheet.setColumnWidths(1, itemsHeaders.length, 160);

  // ── Bring Admins to front ─────────────────────────────────────
  ss.setActiveSheet(adminsSheet);
  ss.moveActiveSheet(1);

  return { id: ss.getId(), url: ss.getUrl() };
}

// ─── CRUD ─────────────────────────────────────────────────────────

// GET — super_admin sees all; branch_admin sees only their own branch
function getBranches(token) {
  try {
    const session = _getSession(token);
    const sh   = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    let rows = data.slice(1).filter(r => r[0] !== '').map(_rowToObj);

    if (session && session.role === 'branch_admin') {
      rows = rows.filter(b => b.branch_id === session.branch_id);
    }

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// CREATE — super_admin only (enforced in Code.js router)
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
        branch_id:       branchId,
        branch_name:     payload.branch_name.trim(),
        branch_code:     payload.branch_code.trim().toUpperCase(),
        address:         payload.address || '',
        contact:         payload.contact || '',
        email:           payload.email   || '',
        status:          payload.status  || 'Active',
        spreadsheet_id:  ssInfo.id,
        spreadsheet_url: ssInfo.url,
        created_at:      now,
        updated_at:      now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// UPDATE — super_admin only (enforced in Code.js router)
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
        branchSs.rename('[A-Lab] ' + payload.branch_name.trim() + ' (' + payload.branch_code.trim().toUpperCase() + ')');

        const adminSh = branchSs.getSheetByName('Admins');
        if (adminSh && adminSh.getLastRow() > 1) {
          const numRows       = adminSh.getLastRow() - 1;
          const branchNameCol = adminSh.getRange(2, 6, numRows, 1);
          const vals          = branchNameCol.getValues().map(() => [payload.branch_name.trim()]);
          branchNameCol.setValues(vals);
        }
      }
    } catch(_) {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// DELETE — super_admin only (enforced in Code.js router)
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