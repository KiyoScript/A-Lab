// ═══════════════════════════════════════════════════════════════════
//  DATABASE.js — A-Lab Sheet-based Database Schema & Bootstrap
//  All data is stored in a single Google Spreadsheet (DB_SPREADSHEET_ID)
// ═══════════════════════════════════════════════════════════════════

const DB_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');

// ── TABLE NAMES ────────────────────────────────────────────────────
const TABLES = {
  USER:             'USERS',
  BRANCH:           'BRANCH',
  DEPARTMENT:       'DEPARTMENT',
  LAB_SERVICE:      'LAB_SERVICE',
  BRANCH_LAB:       'BRANCH_LAB',
  DOCTOR:           'DOCTOR',
  PATIENT:          'PATIENT',
  MEDTECH:          'MEDTECH',
  DISCOUNT:         'DISCOUNT',
  PATIENT_DISCOUNT: 'PATIENT_DISCOUNT',
};

// ── ROLES ──────────────────────────────────────────────────────────
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',   // Full access - all branches, all modules
  BRANCH_ADMIN: 'BRANCH_ADMIN', // Full access to own branch only
  MEDTECH:     'MEDTECH',       // Can process/release orders, view patients
  RECEPTIONIST:'RECEPTIONIST',  // Can register patients, create orders
  DOCTOR:      'DOCTOR',        // Read-only: own orders, patient results
  VIEWER:      'VIEWER',        // Read-only across assigned branch
};

// ── ROLE PERMISSIONS MAP ───────────────────────────────────────────
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]:   ['*'],  // wildcard = everything
  [ROLES.BRANCH_ADMIN]:  ['dashboard', 'branch.own', 'department', 'lab_service', 'branch_lab', 'doctor', 'patient', 'medtech', 'discount', 'patient_discount', 'order'],
  [ROLES.MEDTECH]:       ['dashboard', 'patient.read', 'order.read', 'order.process', 'order.release'],
  [ROLES.RECEPTIONIST]:  ['dashboard', 'patient', 'order.create', 'order.read', 'discount.read', 'patient_discount'],
  [ROLES.DOCTOR]:        ['dashboard', 'order.read.own', 'patient.read'],
  [ROLES.VIEWER]:        ['dashboard', 'order.read', 'patient.read'],
};

// ── SCHEMA DEFINITIONS ─────────────────────────────────────────────
// Each entry: [ column_name, example/description ]

const SCHEMA = {

  USERS: [
    ['user_id',       'UUID – auto-generated'],
    ['username',      'Login username (unique)'],
    ['password_hash', 'SHA-256 hashed password'],
    ['salt',          'Random salt for hashing'],
    ['full_name',     'Display name'],
    ['email',         'Email address'],
    ['role',          'SUPER_ADMIN | BRANCH_ADMIN | MEDTECH | RECEPTIONIST | DOCTOR | VIEWER'],
    ['branch_id',     'FK → BRANCH.branch_id (null = all branches for SUPER_ADMIN)'],
    ['is_active',     'TRUE / FALSE'],
    ['last_login',    'ISO datetime'],
    ['created_at',    'ISO datetime'],
    ['updated_at',    'ISO datetime'],
  ],

  BRANCH: [
    ['branch_id',   'UUID'],
    ['code',        'e.g. ALAB-MNL'],
    ['name',        'Branch full name'],
    ['address',     'Street address'],
    ['city',        'City'],
    ['phone',       'Contact number'],
    ['email',       'Branch email'],
    ['is_active',   'TRUE / FALSE'],
    ['created_at',  'ISO datetime'],
    ['updated_at',  'ISO datetime'],
  ],

  DEPARTMENT: [
    ['dept_id',    'UUID'],
    ['branch_id',  'FK → BRANCH.branch_id'],
    ['code',       'e.g. CHEM, HEMA'],
    ['name',       'Department name'],
    ['head',       'Department head name'],
    ['is_active',  'TRUE / FALSE'],
    ['created_at', 'ISO datetime'],
    ['updated_at', 'ISO datetime'],
  ],

  LAB_SERVICE: [
    ['service_id',   'UUID'],
    ['dept_id',      'FK → DEPARTMENT.dept_id'],
    ['code',         'e.g. FBS, CBC'],
    ['name',         'Full service name'],
    ['description',  'Optional description'],
    ['price',        'Regular price (PHP)'],
    ['turnaround_hrs','Expected TAT in hours'],
    ['specimen_type','e.g. Blood, Urine, Stool'],
    ['is_package',   'TRUE if this is a bundled package'],
    ['is_active',    'TRUE / FALSE'],
    ['created_at',   'ISO datetime'],
    ['updated_at',   'ISO datetime'],
  ],

  BRANCH_LAB: [
    ['branch_lab_id', 'UUID'],
    ['branch_id',     'FK → BRANCH.branch_id'],
    ['service_id',    'FK → LAB_SERVICE.service_id'],
    ['custom_price',  'Override price for this branch (null = use LAB_SERVICE.price)'],
    ['is_available',  'TRUE / FALSE'],
    ['created_at',    'ISO datetime'],
    ['updated_at',    'ISO datetime'],
  ],

  DOCTOR: [
    ['doctor_id',   'UUID'],
    ['branch_id',   'FK → BRANCH.branch_id'],
    ['prc_no',      'PRC license number'],
    ['first_name',  'First name'],
    ['last_name',   'Last name'],
    ['specialty',   'Medical specialty'],
    ['phone',       'Contact number'],
    ['email',       'Email address'],
    ['is_active',   'TRUE / FALSE'],
    ['created_at',  'ISO datetime'],
    ['updated_at',  'ISO datetime'],
  ],

  PATIENT: [
    ['patient_id',   'UUID'],
    ['branch_id',    'Registered at branch – FK → BRANCH.branch_id'],
    ['first_name',   'First name'],
    ['last_name',    'Last name'],
    ['birthdate',    'YYYY-MM-DD'],
    ['sex',          'M / F'],
    ['civil_status', 'Single / Married / etc.'],
    ['phone',        'Contact number'],
    ['email',        'Email address'],
    ['address',      'Home address'],
    ['philhealth_no','PhilHealth number (optional)'],
    ['created_at',   'ISO datetime'],
    ['updated_at',   'ISO datetime'],
  ],

  MEDTECH: [
    ['medtech_id',  'UUID'],
    ['branch_id',   'FK → BRANCH.branch_id'],
    ['prc_no',      'PRC license number'],
    ['first_name',  'First name'],
    ['last_name',   'Last name'],
    ['dept_id',     'Assigned dept – FK → DEPARTMENT.dept_id'],
    ['phone',       'Contact number'],
    ['email',       'Email address'],
    ['is_active',   'TRUE / FALSE'],
    ['created_at',  'ISO datetime'],
    ['updated_at',  'ISO datetime'],
  ],

  DISCOUNT: [
    ['discount_id',   'UUID'],
    ['code',          'e.g. PWD, SENIOR, PHILHEALTH'],
    ['name',          'Discount name'],
    ['type',          'PERCENTAGE | FIXED'],
    ['value',         'Percent (0-100) or fixed PHP amount'],
    ['description',   'Description / eligibility notes'],
    ['is_active',     'TRUE / FALSE'],
    ['created_at',    'ISO datetime'],
    ['updated_at',    'ISO datetime'],
  ],

  PATIENT_DISCOUNT: [
    ['pd_id',        'UUID'],
    ['patient_id',   'FK → PATIENT.patient_id'],
    ['discount_id',  'FK → DISCOUNT.discount_id'],
    ['order_id',     'FK → ORDER.order_id (if linked to a specific order)'],
    ['verified_by',  'User who verified – FK → USERS.user_id'],
    ['valid_from',   'YYYY-MM-DD'],
    ['valid_until',  'YYYY-MM-DD (null = no expiry)'],
    ['notes',        'Supporting document reference'],
    ['created_at',   'ISO datetime'],
    ['updated_at',   'ISO datetime'],
  ],

};

// ── HELPER: Get or Create Sheet ────────────────────────────────────
function _getSheet(tableName) {
  const ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  return ss.getSheetByName(tableName) || ss.insertSheet(tableName);
}

// ── BOOTSTRAP: Create all sheets with headers ──────────────────────
function bootstrapDatabase() {
  const ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);

  Object.keys(SCHEMA).forEach(tableName => {
    let sheet = ss.getSheetByName(tableName);

    if (!sheet) {
      sheet = ss.insertSheet(tableName);
      Logger.log('Created sheet: ' + tableName);
    }

    // Write headers only if sheet is empty
    if (sheet.getLastRow() === 0) {
      const headers = SCHEMA[tableName].map(col => col[0]);
      const descriptions = SCHEMA[tableName].map(col => col[1]);

      // Row 1 = column names (bold, frozen)
      sheet.appendRow(headers);

      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1e293b');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontFamily('Arial');
      headerRange.setFontSize(10);

      // Row 2 = descriptions (italic, light gray) — helper row
      sheet.appendRow(descriptions);
      const descRange = sheet.getRange(2, 1, 1, descriptions.length);
      descRange.setFontStyle('italic');
      descRange.setFontColor('#94a3b8');
      descRange.setBackground('#f8fafc');
      descRange.setFontSize(9);

      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
      Logger.log('Initialized headers for: ' + tableName);
    }
  });

  // Seed default super admin if USERS is empty (beyond header+desc rows)
  _seedSuperAdmin(ss);

  Logger.log('✅ Database bootstrap complete.');
  return '✅ Database bootstrap complete. All tables initialized.';
}

// ── SEED: Default Super Admin ──────────────────────────────────────
function _seedSuperAdmin(ss) {
  const sheet = ss.getSheetByName('USERS');
  // If only 2 rows (header + desc), seed an admin
  if (sheet.getLastRow() <= 2) {
    const salt = Utilities.getUuid();
    const rawPassword = 'Admin@2024!';
    const hash = _hashPassword(rawPassword, salt);
    const now = new Date().toISOString();
    const adminId = Utilities.getUuid();

    sheet.appendRow([
      adminId,          // user_id
      'superadmin',     // username
      hash,             // password_hash
      salt,             // salt
      'Super Admin',    // full_name
      'admin@alab.com', // email
      ROLES.SUPER_ADMIN,// role
      '',               // branch_id (null = all)
      'TRUE',           // is_active
      '',               // last_login
      now,              // created_at
      now,              // updated_at
    ]);

    Logger.log('🔑 Seeded super admin. Username: superadmin | Password: Admin@2024!');
    Logger.log('⚠️  CHANGE THIS PASSWORD IMMEDIATELY after first login!');
  }
}

// ── CRUD HELPERS ───────────────────────────────────────────────────

function dbGetAll(tableName) {
  const sheet = _getSheet(tableName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 2) return []; // only headers + desc

  const headers = data[0];
  return data.slice(2).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function dbGetById(tableName, idField, idValue) {
  return dbGetAll(tableName).find(row => row[idField] === idValue) || null;
}

function dbInsert(tableName, rowObj) {
  const sheet = _getSheet(tableName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const now = new Date().toISOString();
  rowObj.created_at = now;
  rowObj.updated_at = now;
  if (!rowObj[headers[0]]) rowObj[headers[0]] = Utilities.getUuid();
  const row = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
  sheet.appendRow(row);
  return rowObj;
}

function dbUpdate(tableName, idField, idValue, updates) {
  const sheet = _getSheet(tableName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idField);
  if (idCol === -1) return false;

  for (let r = 2; r < data.length; r++) {
    if (data[r][idCol] === idValue) {
      updates.updated_at = new Date().toISOString();
      Object.keys(updates).forEach(key => {
        const colIdx = headers.indexOf(key);
        if (colIdx !== -1) sheet.getRange(r + 1, colIdx + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function dbDelete(tableName, idField, idValue) {
  const sheet = _getSheet(tableName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idField);
  if (idCol === -1) return false;

  for (let r = data.length - 1; r >= 2; r--) {
    if (data[r][idCol] === idValue) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

// ── UTILITY ────────────────────────────────────────────────────────
function _hashPassword(password, salt) {
  const raw = password + salt;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}