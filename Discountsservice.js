// ═══════════════════════════════════════════════════════════════
// DISCOUNTS SERVICE
// Discounts are global — stored in Registry SS → "Discounts" sheet.
// Schema: discount_id | discount_name | discount_type | value |
//         description | is_active | created_at | updated_at
//
// discount_type: 'percentage' | 'fixed'
// value: numeric (e.g. 20 means 20% or ₱20.00)
//
// Only super_admin may perform CRUD; branch_admin can read via GET_DISCOUNTS_ALL.
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
// READ — super_admin only
// ═══════════════════════════════════════════════════════════════
function getDiscounts(token) {
  try {
    const session = _requireSuperAdmin(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied. Super admin only.' };

    return _cacheGet('DISCOUNTS', function() {

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const rows = data.slice(1).filter(r => r[0] !== '').map(_discountRowToObj);
    return { success: true, data: rows };

    }); // end _cacheGet
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// ═══════════════════════════════════════════════════════════════
// READ ALL — super_admin AND branch_admin


// ═══════════════════════════════════════════════════════════════
// READ ALL — super_admin AND branch_admin
// Used by patient form discount checklist
// ═══════════════════════════════════════════════════════════════
function getDiscountsAll(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['super_admin', 'branch_admin', 'medtech'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    return _cacheGet('DISCOUNTS', function() {

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const rows = data.slice(1).filter(r => r[0] !== '').map(_discountRowToObj);
    return { success: true, data: rows };

    }); // end _cacheGet
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — super_admin only
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

    const sh   = _getDiscountSheet();
    const data = sh.getDataRange().getValues();
    const exists = data.slice(1).some(r =>
      String(r[1]).trim().toLowerCase() === payload.discount_name.trim().toLowerCase()
    );
    if (exists) return { success: false, error: 'A discount with that name already exists.' };

    const now        = new Date().toISOString();
    const discountId = 'DISC-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const isActive   = payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    _cacheClear('DISCOUNTS');

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
// UPDATE — super_admin only
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

    const duplicate = data.slice(1).some(r =>
      String(r[0]) !== String(payload.discount_id) &&
      String(r[1]).trim().toLowerCase() === payload.discount_name.trim().toLowerCase()
    );
    if (duplicate) return { success: false, error: 'Another discount with that name already exists.' };

    const idx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(payload.discount_id));
    if (idx === -1) return { success: false, error: 'Discount not found.' };

    const now = new Date().toISOString();
    const row = idx + 1;
    sh.getRange(row, 2, 1, 5).setValues([[
      payload.discount_name.trim(),
      payload.discount_type,
      value,
      (payload.description || '').trim(),
      payload.is_active !== undefined ? Boolean(payload.is_active) : true
    ]]);
    sh.getRange(row, 8).setValue(now);

    _cacheClear('DISCOUNTS');

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — super_admin only
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

    _cacheClear('DISCOUNTS');

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

  // GET_DISCOUNTS_ALL — readable by both super_admin and branch_admin
  if (action === 'GET_DISCOUNTS_ALL') {
    if (!['super_admin', 'branch_admin', 'medtech'].includes(session.role))
      return { success: false, error: 'Access denied.' };
    return getDiscountsAll(token);
  }

  // GET_DISCOUNTS — readable by branch_admin (read-only page access)
  if (action === 'GET_DISCOUNTS' && session.role === 'branch_admin') return getDiscountsAll(token);

  // All other actions: super_admin only
  if (session.role !== 'super_admin') return { success: false, error: 'Access denied. Super admin only.' };

  switch (action) {
    case 'GET_DISCOUNTS':   return getDiscounts(token);
    case 'CREATE_DISCOUNT': return createDiscount(payload, token);
    case 'UPDATE_DISCOUNT': return updateDiscount(payload, token);
    case 'DELETE_DISCOUNT': return deleteDiscount(payload.discount_id, token);
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}