// ═══════════════════════════════════════════════════════════════
// DISCOUNTS SERVICE
// Discounts are global — stored in Registry SS → "Discounts" sheet.
// Schema: discount_id | discount_name | discount_type | value |
//         description | is_active | created_at | updated_at
//
// discount_type: 'percentage' | 'fixed'
// value: numeric (e.g. 20 means 20% or ₱20.00)
//
// Only super_admin may perform any CRUD operation.
// ═══════════════════════════════════════════════════════════════

// ─── Sheet accessor ───────────────────────────────────────────────
function _getDiscountSheet() {
  const ss = _getOrCreateRegistry();
  let sh = ss.getSheetByName('Discounts');

  if (!sh) {
    sh = ss.insertSheet('Discounts');
    const headers = [
      'discount_id', 'discount_name', 'discount_type',
      'value', 'description', 'is_active', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); // discount_id
    sh.setColumnWidth(2, 200); // discount_name
    sh.setColumnWidth(3, 120); // discount_type
    sh.setColumnWidth(4, 90);  // value
    sh.setColumnWidth(5, 280); // description
    sh.setColumnWidth(6, 90);  // is_active
    sh.setColumnWidth(7, 180); // created_at
    sh.setColumnWidth(8, 180); // updated_at
  }

  return sh;
}

// ─── Row → object ─────────────────────────────────────────────────
function _discountRowToObj(row) {
  return {
    discount_id:   String(row[0] || ''),
    discount_name: String(row[1] || ''),
    discount_type: String(row[2] || 'percentage'),
    value:         Number(row[3] || 0),
    description:   String(row[4] || ''),
    is_active:     String(row[5]).toUpperCase() === 'TRUE' || row[5] === true,
    created_at:    String(row[6] || ''),
    updated_at:    String(row[7] || '')
  };
}

// ─── Auth guard: super_admin only ─────────────────────────────────
function _requireSuperAdmin(token) {
  const s = _getSession(token);
  if (!s) return { expired: true };
  if (s.role !== 'super_admin') return { denied: true };
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════

function getDiscounts(token) {
  try {
    const session = _requireSuperAdmin(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const rows = data.slice(1)
      .filter(r => r[0] !== '')
      .map(_discountRowToObj);

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════

function createDiscount(payload, token) {
  try {
    const session = _requireSuperAdmin(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.discount_name || !payload.discount_name.trim())
      return { success: false, error: 'Discount name is required.' };
    if (!payload.discount_type || !['percentage', 'fixed'].includes(payload.discount_type))
      return { success: false, error: 'Discount type must be "percentage" or "fixed".' };
    const value = Number(payload.value);
    if (isNaN(value) || value < 0)
      return { success: false, error: 'Value must be a non-negative number.' };
    if (payload.discount_type === 'percentage' && value > 100)
      return { success: false, error: 'Percentage value cannot exceed 100.' };

    // Duplicate name check
    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    const exists = data.slice(1).some(r =>
      String(r[1]).trim().toLowerCase() === payload.discount_name.trim().toLowerCase()
    );
    if (exists) return { success: false, error: 'A discount with that name already exists.' };

    const now        = new Date().toISOString();
    const discountId = 'DISC-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const isActive   = payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    sh.appendRow([
      discountId,
      payload.discount_name.trim(),
      payload.discount_type,
      value,
      (payload.description || '').trim(),
      isActive,
      now,
      now
    ]);

    return {
      success: true,
      data: {
        discount_id:   discountId,
        discount_name: payload.discount_name.trim(),
        discount_type: payload.discount_type,
        value:         value,
        description:   (payload.description || '').trim(),
        is_active:     isActive,
        created_at:    now,
        updated_at:    now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════

function updateDiscount(payload, token) {
  try {
    const session = _requireSuperAdmin(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!payload.discount_id) return { success: false, error: 'discount_id is required.' };
    if (!payload.discount_name || !payload.discount_name.trim())
      return { success: false, error: 'Discount name is required.' };
    if (!payload.discount_type || !['percentage', 'fixed'].includes(payload.discount_type))
      return { success: false, error: 'Discount type must be "percentage" or "fixed".' };
    const value = Number(payload.value);
    if (isNaN(value) || value < 0)
      return { success: false, error: 'Value must be a non-negative number.' };
    if (payload.discount_type === 'percentage' && value > 100)
      return { success: false, error: 'Percentage value cannot exceed 100.' };

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();

    // Duplicate name check (exclude self)
    const duplicate = data.slice(1).some(r =>
      String(r[0]) !== String(payload.discount_id) &&
      String(r[1]).trim().toLowerCase() === payload.discount_name.trim().toLowerCase()
    );
    if (duplicate) return { success: false, error: 'Another discount with that name already exists.' };

    const idx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.discount_id));
    if (idx === -1) return { success: false, error: 'Discount not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2).setValue(payload.discount_name.trim());
    sh.getRange(row, 3).setValue(payload.discount_type);
    sh.getRange(row, 4).setValue(value);
    sh.getRange(row, 5).setValue((payload.description || '').trim());
    sh.getRange(row, 6).setValue(payload.is_active !== undefined ? Boolean(payload.is_active) : true);
    sh.getRange(row, 8).setValue(now);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════

function deleteDiscount(discountId, token) {
  try {
    const session = _requireSuperAdmin(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    if (!discountId) return { success: false, error: 'discount_id is required.' };

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(discountId));
    if (idx === -1) return { success: false, error: 'Discount not found.' };

    sh.deleteRow(idx + 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

function handleDiscountRequest(action, payload, token) {
  const session = _getSession(token);
  if (!session) return { success: false, error: 'Session expired. Please log in again.', expired: true };
  if (session.role !== 'super_admin') return { success: false, error: 'Access denied. Super admin only.' };

  switch (action) {
    case 'GET_DISCOUNTS':    return getDiscounts(token);
    case 'CREATE_DISCOUNT':  return createDiscount(payload, token);
    case 'UPDATE_DISCOUNT':  return updateDiscount(payload, token);
    case 'DELETE_DISCOUNT':  return deleteDiscount(payload.discount_id, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}


// ═══════════════════════════════════════════════════════════════
// DISCOUNTS SERVICE PATCH
// Add this function to DiscountsService.js
// Also add 'GET_DISCOUNTS_ALL' case to handleDiscountRequest()
//
// getDiscountsAll() — allows both super_admin and branch_admin
// to read the global discounts list (needed for patient form checklist)
// ═══════════════════════════════════════════════════════════════

function getDiscountsAll(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    // Both super_admin and branch_admin can read
    if (!['super_admin', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const rows = data.slice(1)
      .filter(function(r) { return r[0] !== ''; })
      .map(_discountRowToObj);

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
