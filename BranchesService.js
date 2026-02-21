// ═══════════════════════════════════════════════════════════════
// BRANCHES SERVICE
// ═══════════════════════════════════════════════════════════════

// ─── Get or Auto-Create the Registry Spreadsheet ─────────────────
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
function _createBranchSpreadsheet(branchName, branchCode) {
  const title = '[A-Lab] ' + branchName + ' (' + branchCode + ') — Lab Orders';
  const ss = SpreadsheetApp.create(title);

  const ordersSheet = ss.getActiveSheet();
  ordersSheet.setName('Lab Orders');
  const orderHeaders = [
    'order_no', 'patient_name', 'doctor', 'tests',
    'amount', 'discount', 'net_amount', 'status',
    'med_tech', 'ordered_at', 'released_at', 'notes'
  ];
  ordersSheet.appendRow(orderHeaders);
  ordersSheet.getRange(1, 1, 1, orderHeaders.length)
    .setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  ordersSheet.setFrozenRows(1);
  ordersSheet.setColumnWidths(1, orderHeaders.length, 150);

  const summarySheet = ss.insertSheet('Summary');
  summarySheet.appendRow(['Metric', 'Value']);
  summarySheet.appendRow(['Branch', branchName]);
  summarySheet.appendRow(['Branch Code', branchCode]);
  summarySheet.appendRow(['Total Orders',  "=COUNTA('Lab Orders'!A2:A)"]);
  summarySheet.appendRow(['Total Revenue', "=SUM('Lab Orders'!G2:G)"]);
  summarySheet.appendRow(['For Release',   "=COUNTIF('Lab Orders'!H2:H,\"For Release\")"]);
  summarySheet.appendRow(['On Review',     "=COUNTIF('Lab Orders'!H2:H,\"On Review\")"]);
  summarySheet.appendRow(['Received',      "=COUNTIF('Lab Orders'!H2:H,\"Received\")"]);
  summarySheet.appendRow(['Pending',       "=COUNTIF('Lab Orders'!H2:H,\"Pending\")"]);
  summarySheet.getRange(1, 1, 1, 2)
    .setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  summarySheet.setFrozenRows(1);
  summarySheet.setColumnWidth(1, 160);
  summarySheet.setColumnWidth(2, 200);

  ss.setActiveSheet(ordersSheet);
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

    return { success: true, data: { branch_id: branchId, branch_name: payload.branch_name.trim(),
      branch_code: payload.branch_code.trim().toUpperCase(), address: payload.address || '',
      contact: payload.contact || '', email: payload.email || '', status: payload.status || 'Active',
      spreadsheet_id: ssInfo.id, spreadsheet_url: ssInfo.url, created_at: now, updated_at: now } };
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
      if (ssId) SpreadsheetApp.openById(ssId)
        .rename('[A-Lab] ' + payload.branch_name.trim() + ' (' + payload.branch_code.trim().toUpperCase() + ') — Lab Orders');
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

// ─── Run this once in the Apps Script editor to verify setup ─────
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