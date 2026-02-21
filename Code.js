// ═══════════════════════════════════════════════════════════════
// CODE.GS — A-Lab Automation Hub Entry Point
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const page  = e.parameter.page  || 'Login';
  const token = e.parameter.t     || '';

  // Auth gate: validate session before serving any page except Login
  if (page !== 'Login') {
    const session = authValidateSession(token);
    if (!session) {
      // Redirect to login
      return HtmlService.createTemplateFromFile('Login')
        .evaluate()
        .setTitle('A-Lab — Sign In')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    }
  }

  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle('A-Lab — Automation Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ─── Unified POST/RPC router ──────────────────────────────────────
// All client-side google.script.run calls route through here.
// Each module (Branches, Patients, etc.) has its own handler file.

function handleBranchRequest(action, payload) {
  // Delegates to BranchesService.gs
  return _handleBranchRequest(action, payload);
}

// Internal alias (avoids name collision if you add more modules)
function _handleBranchRequest(action, payload) {
  switch (action) {
    case 'GET_BRANCHES':   return getBranches();
    case 'CREATE_BRANCH':  return createBranch(payload);
    case 'UPDATE_BRANCH':  return updateBranch(payload);
    case 'DELETE_BRANCH':  return deleteBranch(payload.branch_id);
    default:               return { success: false, error: 'Unknown action: ' + action };
  }
}

function setup() {
  const props = PropertiesService.getScriptProperties();

  // Check if DB_SPREADSHEET_ID is set
  const dbId = props.getProperty('DB_SPREADSHEET_ID');
  if (!dbId) {
    // Create a new spreadsheet automatically
    const ss = SpreadsheetApp.create('A-Lab Database');
    props.setProperty('DB_SPREADSHEET_ID', ss.getId());
    Logger.log('Created new database spreadsheet: ' + ss.getUrl());
  }

  const result = bootstrapDatabase();
  Logger.log(result);

  return {
    status: 'ok',
    message: result,
    db_url: SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID')
    ).getUrl(),
  };
}