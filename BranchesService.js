// ═══════════════════════════════════════════════════════════════
// BRANCHES SERVICE
// Handles full CRUD for Branches.
// On branch creation → automatically creates a Google Spreadsheet
// and stores its ID + URL in the registry sheet.
// ═══════════════════════════════════════════════════════════════

const REGISTRY_SS_ID  = PropertiesService.getScriptProperties().getProperty('REGISTRY_SS_ID');
const BRANCHES_SHEET  = 'Branches';

// ─── Sheet helpers ───────────────────────────────────────────────

function _getRegistrySheet() {
  const ss = SpreadsheetApp.openById(REGISTRY_SS_ID);
  let sh = ss.getSheetByName(BRANCHES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BRANCHES_SHEET);
    sh.appendRow([
      'branch_id', 'branch_name', 'branch_code', 'address',
      'contact', 'email', 'status', 'spreadsheet_id',
      'spreadsheet_url', 'created_at', 'updated_at'
    ]);
    sh.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _rowToObj(row) {
  return {
    branch_id:       row[0],
    branch_name:     row[1],
    branch_code:     row[2],
    address:         row[3],
    contact:         row[4],
    email:           row[5],
    status:          row[6],
    spreadsheet_id:  row[7],
    spreadsheet_url: row[8],
    created_at:      row[9],
    updated_at:      row[10]
  };
}

// ─── Auto-create Spreadsheet for a branch ────────────────────────

function _createBranchSpreadsheet(branchName, branchCode) {
  const title = `[A-Lab] ${branchName} (${branchCode}) — Lab Orders`;
  const ss = SpreadsheetApp.create(title);

  // ── Lab Orders sheet ──
  const ordersSheet = ss.getActiveSheet();
  ordersSheet.setName('Lab Orders');
  ordersSheet.appendRow([
    'order_no', 'patient_name', 'doctor', 'tests',
    'amount', 'discount', 'net_amount', 'status',
    'med_tech', 'ordered_at', 'released_at', 'notes'
  ]);
  ordersSheet.getRange(1, 1, 1, 12)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff');
  ordersSheet.setFrozenRows(1);
  ordersSheet.setColumnWidths(1, 12, 150);

  // ── Summary sheet ──
  const summarySheet = ss.insertSheet('Summary');
  summarySheet.appendRow(['Metric', 'Value']);
  summarySheet.appendRow(['Branch', branchName]);
  summarySheet.appendRow(['Branch Code', branchCode]);
  summarySheet.appendRow(['Total Orders', "=COUNTA('Lab Orders'!A2:A)"])
  summarySheet.appendRow(['Total Revenue', "=SUM('Lab Orders'!G2:G)"]);
  summarySheet.appendRow(['For Release', "=COUNTIF('Lab Orders'!H2:H,\"For Release\")"]);
  summarySheet.appendRow(['On Review', "=COUNTIF('Lab Orders'!H2:H,\"On Review\")"]);
  summarySheet.appendRow(['Received', "=COUNTIF('Lab Orders'!H2:H,\"Received\")"]);
  summarySheet.appendRow(['Pending', "=COUNTIF('Lab Orders'!H2:H,\"Pending\")"]);
  summarySheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  summarySheet.setFrozenRows(1);
  summarySheet.setColumnWidth(1, 160);
  summarySheet.setColumnWidth(2, 200);

  // ── Move Summary to front ──
  ss.setActiveSheet(ordersSheet);

  return { id: ss.getId(), url: ss.getUrl() };
}

// ─── CRUD Functions ───────────────────────────────────────────────

function getBranches() {
  try {
    const sh = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    const rows = data.slice(1).map(_rowToObj);
    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function createBranch(payload) {
  try {
    const sh = _getRegistrySheet();
    const now = new Date().toISOString();
    const branchId = 'BR-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    // Auto-create spreadsheet
    const ssInfo = _createBranchSpreadsheet(payload.branch_name, payload.branch_code);

    sh.appendRow([
      branchId,
      payload.branch_name,
      payload.branch_code,
      payload.address   || '',
      payload.contact   || '',
      payload.email     || '',
      payload.status    || 'Active',
      ssInfo.id,
      ssInfo.url,
      now,
      now
    ]);

    return {
      success: true,
      data: {
        branch_id:       branchId,
        branch_name:     payload.branch_name,
        branch_code:     payload.branch_code,
        address:         payload.address   || '',
        contact:         payload.contact   || '',
        email:           payload.email     || '',
        status:          payload.status    || 'Active',
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

function updateBranch(payload) {
  try {
    const sh = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && r[0] === payload.branch_id);
    if (idx === -1) return { success: false, error: 'Branch not found.' };

    const now     = new Date().toISOString();
    const rowNum  = idx + 1; // 1-based

    sh.getRange(rowNum, 2).setValue(payload.branch_name);
    sh.getRange(rowNum, 3).setValue(payload.branch_code);
    sh.getRange(rowNum, 4).setValue(payload.address   || '');
    sh.getRange(rowNum, 5).setValue(payload.contact   || '');
    sh.getRange(rowNum, 6).setValue(payload.email     || '');
    sh.getRange(rowNum, 7).setValue(payload.status    || 'Active');
    sh.getRange(rowNum, 11).setValue(now);

    // Also rename the spreadsheet to reflect new name/code
    try {
      const ssId = data[idx][7];
      if (ssId) {
        const branchSS = SpreadsheetApp.openById(ssId);
        branchSS.rename(`[A-Lab] ${payload.branch_name} (${payload.branch_code}) — Lab Orders`);
      }
    } catch(_) { /* non-fatal */ }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteBranch(branchId) {
  try {
    const sh   = _getRegistrySheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && r[0] === branchId);
    if (idx === -1) return { success: false, error: 'Branch not found.' };

    sh.deleteRow(idx + 1);
    // Note: We intentionally do NOT delete the Spreadsheet to preserve data.
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Web-app router additions ─────────────────────────────────────
// Call these from your existing doPost or a dedicated handler.

function handleBranchRequest(action, payload) {
  switch (action) {
    case 'GET_BRANCHES':   return getBranches();
    case 'CREATE_BRANCH':  return createBranch(payload);
    case 'UPDATE_BRANCH':  return updateBranch(payload);
    case 'DELETE_BRANCH':  return deleteBranch(payload.branch_id);
    default:               return { success: false, error: 'Unknown action: ' + action };
  }
}