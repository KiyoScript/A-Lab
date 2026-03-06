// ═══════════════════════════════════════════════════════════════
// ORDERS SERVICE
// Orders stored per-branch SS → "Orders" sheet
// Order line items → per-branch SS → "Order_Items" sheet
//
// Orders schema:
//   A: order_id            B: order_number         C: patient_id
//   D: patient_snapshot    E: referring_doctor_id  F: doctor_snapshot
//   G: technologist_id     H: created_by           I: status
//   J: payment_amount      K: payment_discount     L: amount_paid
//   M: change              N: notes                O: order_date
//   P: created_at          Q: updated_at
//
// Order_Items schema:
//   A: item_id   B: order_id   C: item_type (service/package)
//   D: item_ref_id   E: item_name_snapshot   F: fee   G: created_at
//
// Status flow:
//   Pending → Processing → For Review → For Release → Released
//
// Access:
//   CREATE            → medtech only
//   READ              → medtech (own branch) | branch_admin (own branch) |
//                       super_admin (all) | doctor (their referrals only)
//   ADVANCE STATUS    → medtech (Pending→Processing, For Release→Released)
//                       branch_admin (Processing→For Review→For Release)
//   DELETE            → branch_admin only (Pending status only)
// ═══════════════════════════════════════════════════════════════

// ─── Sheet helpers ────────────────────────────────────────────────
function _getOrderSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Orders');

  if (!sh) {
    sh = ss.insertSheet('Orders');
    const headers = [
      'order_id', 'order_number', 'patient_id', 'patient_snapshot',
      'referring_doctor_id', 'doctor_snapshot', 'technologist_id', 'created_by',
      'status', 'payment_amount', 'payment_discount', 'amount_paid',
      'change', 'notes', 'order_date', 'created_at', 'updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,  180); // order_id
    sh.setColumnWidth(2,  160); // order_number
    sh.setColumnWidth(3,  160); // patient_id
    sh.setColumnWidth(4,  200); // patient_snapshot
    sh.setColumnWidth(5,  160); // referring_doctor_id
    sh.setColumnWidth(6,  200); // doctor_snapshot
    sh.setColumnWidth(7,  160); // technologist_id
    sh.setColumnWidth(8,  160); // created_by
    sh.setColumnWidth(9,  120); // status
    sh.setColumnWidth(10, 130); // payment_amount
    sh.setColumnWidth(11, 140); // payment_discount
    sh.setColumnWidth(12, 120); // amount_paid
    sh.setColumnWidth(13, 100); // change
    sh.setColumnWidth(14, 240); // notes
    sh.setColumnWidth(15, 180); // order_date
    sh.setColumnWidth(16, 180); // created_at
    sh.setColumnWidth(17, 180); // updated_at
  }

  return sh;
}

function _getOrderItemSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Order_Items');

  if (!sh) {
    sh = ss.insertSheet('Order_Items');
    const headers = [
      'item_id', 'order_id', 'item_type',
      'item_ref_id', 'item_name_snapshot', 'fee', 'created_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); // item_id
    sh.setColumnWidth(2, 180); // order_id
    sh.setColumnWidth(3, 100); // item_type
    sh.setColumnWidth(4, 160); // item_ref_id
    sh.setColumnWidth(5, 240); // item_name_snapshot
    sh.setColumnWidth(6, 100); // fee
    sh.setColumnWidth(7, 180); // created_at
  }

  return sh;
}

// ─── Row → Object ─────────────────────────────────────────────────
function _orderRowToObj(row) {
  return {
    order_id:            String(row[0]  || ''),
    order_number:        String(row[1]  || ''),
    patient_id:          String(row[2]  || ''),
    patient_snapshot:    String(row[3]  || ''),
    referring_doctor_id: String(row[4]  || ''),
    doctor_snapshot:     String(row[5]  || ''),
    technologist_id:     String(row[6]  || ''),
    created_by:          String(row[7]  || ''),
    status:              String(row[8]  || 'Pending'),
    payment_amount:      Number(row[9])  || 0,
    payment_discount:    Number(row[10]) || 0,
    amount_paid:         Number(row[11]) || 0,
    change:              Number(row[12]) || 0,
    notes:               String(row[13] || ''),
    order_date:          String(row[14] || ''),
    created_at:          String(row[15] || ''),
    updated_at:          String(row[16] || '')
  };
}

function _orderItemRowToObj(row) {
  return {
    item_id:            String(row[0] || ''),
    order_id:           String(row[1] || ''),
    item_type:          String(row[2] || ''),
    item_ref_id:        String(row[3] || ''),
    item_name_snapshot: String(row[4] || ''),
    fee:                Number(row[5]) || 0,
    created_at:         String(row[6] || '')
  };
}

// ─── Generate human-readable order number ─────────────────────────
function _generateOrderNumber(spreadsheetId) {
  try {
    const sh    = _getOrderSheet(spreadsheetId);
    const count = Math.max(sh.getLastRow() - 1, 0);
    const today = new Date();
    const ymd   = today.getFullYear().toString() +
                  String(today.getMonth() + 1).padStart(2, '0') +
                  String(today.getDate()).padStart(2, '0');
    return 'ORD-' + ymd + '-' + String(count + 1).padStart(4, '0');
  } catch (e) {
    return 'ORD-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  }
}

// ─── Get branch SS ID from session ───────────────────────────────
function _getBranchSsId(branchId) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  const row  = data.find(function(r, i) {
    return i > 0 && String(r[0]) === String(branchId);
  });
  return row ? String(row[7] || '') : null;
}

// ─── Auth guards ──────────────────────────────────────────────────
function _requireOrderAccess(token) {
  const s = _getSession(token);
  if (!s) return { expired: true };
  if (!['super_admin', 'branch_admin', 'medtech', 'doctor'].includes(s.role))
    return { denied: true };
  return s;
}

function _requireMedtech(token) {
  const s = _getSession(token);
  if (!s) return { expired: true };
  if (s.role !== 'medtech') return { denied: true };
  return s;
}

// ═══════════════════════════════════════════════════════════════
// READ — all roles, filtered by role
// ═══════════════════════════════════════════════════════════════
function getOrders(payload, token) {
  try {
    const session = _requireOrderAccess(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const result     = [];

    for (var b = 1; b < branchData.length; b++) {
      const branchRow  = branchData[b];
      const branchId   = String(branchRow[0] || '');
      const branchName = String(branchRow[1] || '');
      const ssId       = String(branchRow[7] || '');
      if (!ssId) continue;

      // Branch admin + medtech + doctor: only their own branch
      if (['branch_admin', 'medtech', 'doctor'].includes(session.role)) {
        if (branchId !== session.branch_id) continue;
      }

      try {
        const sh   = _getOrderSheet(ssId);
        const data = sh.getDataRange().getValues();
        if (data.length <= 1) continue;

        data.slice(1)
          .filter(function(r) { return r[0] !== ''; })
          .forEach(function(r) {
            const order = _orderRowToObj(r);
            order.branch_id   = branchId;
            order.branch_name = branchName;

            // Doctor: only see orders where they are the referring doctor
            if (session.role === 'doctor') {
              if (order.referring_doctor_id !== session.doctor_id) return;
            }

            result.push(order);
          });
      } catch(_) { /* skip unreadable SS */ }
    }

    // Sort by order_date descending
    result.sort(function(a, b) {
      return String(b.order_date).localeCompare(String(a.order_date));
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GET ORDER ITEMS — for a specific order
// ═══════════════════════════════════════════════════════════════
function getOrderItems(payload, token) {
  try {
    const session = _requireOrderAccess(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied.' };
    if (!payload.order_id) return { success: false, error: 'order_id is required.' };

    const ssId = _getBranchSsId(payload.branch_id || session.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const sh   = _getOrderItemSheet(ssId);
    const data = sh.getDataRange().getValues();

    const items = data.slice(1)
      .filter(function(r) { return r[0] !== '' && String(r[1]) === String(payload.order_id); })
      .map(_orderItemRowToObj);

    return { success: true, data: items };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CREATE — medtech only
// payload: {
//   patient_id, patient_snapshot,
//   referring_doctor_id, doctor_snapshot,
//   notes,
//   amount_paid,
//   payment_discount,
//   items: [{ item_type, item_ref_id, item_name_snapshot, fee }]
// }
// ═══════════════════════════════════════════════════════════════
function createOrder(payload, token) {
  try {
    const session = _requireMedtech(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Only technologists can create orders.' };

    if (!session.branch_id) return { success: false, error: 'Technologist is not assigned to a branch.' };
    if (!payload.patient_id) return { success: false, error: 'Patient is required.' };
    if (!payload.items || !payload.items.length)
      return { success: false, error: 'At least one lab service or package is required.' };

    const ssId = _getBranchSsId(session.branch_id);
    if (!ssId) return { success: false, error: 'Branch spreadsheet not found.' };

    const now         = new Date().toISOString();
    const orderId     = 'ORD-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const orderNumber = _generateOrderNumber(ssId);

    // Calculate totals
    const paymentAmount   = payload.items.reduce(function(sum, i) { return sum + (Number(i.fee) || 0); }, 0);
    const paymentDiscount = Number(payload.payment_discount) || 0;
    const amountPaid      = Number(payload.amount_paid)      || 0;
    const change          = amountPaid - (paymentAmount - paymentDiscount);

    // Write order row
    const orderSh = _getOrderSheet(ssId);
    orderSh.appendRow([
      orderId,
      orderNumber,
      payload.patient_id,
      payload.patient_snapshot  || '',
      payload.referring_doctor_id || '',
      payload.doctor_snapshot   || '',
      session.medtech_id        || '',
      session.full_name         || session.username || '',
      'Pending',
      paymentAmount,
      paymentDiscount,
      amountPaid,
      Math.max(change, 0),
      payload.notes || '',
      now,   // order_date
      now,   // created_at
      now    // updated_at
    ]);

    // Write order items
    const itemSh = _getOrderItemSheet(ssId);
    payload.items.forEach(function(item) {
      const itemId = 'ITM-' + Utilities.getUuid().substring(0, 8).toUpperCase();
      itemSh.appendRow([
        itemId,
        orderId,
        item.item_type          || 'service',
        item.item_ref_id        || '',
        item.item_name_snapshot || '',
        Number(item.fee)        || 0,
        now
      ]);
    });

    return {
      success: true,
      data: {
        order_id:     orderId,
        order_number: orderNumber,
        status:       'Pending',
        payment_amount: paymentAmount,
        created_at:   now
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ADVANCE STATUS
// Medtech:      Pending → Processing, For Release → Released
// Branch Admin: Processing → For Review → For Release
// ═══════════════════════════════════════════════════════════════
var STATUS_FLOW = {
  'Pending':     'Processing',
  'Processing':  'For Review',
  'For Review':  'For Release',
  'For Release': 'Released'
};

var MEDTECH_CAN_ADVANCE    = ['Pending', 'For Release'];
var BRANCH_ADMIN_CAN_ADVANCE = ['Processing', 'For Review'];

function advanceOrderStatus(payload, token) {
  try {
    const session = _requireOrderAccess(token);
    if (session.expired) return { success: false, error: 'Session expired.', expired: true };
    if (session.denied)  return { success: false, error: 'Access denied.' };

    if (!payload.order_id)  return { success: false, error: 'order_id is required.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };

    // Only medtech and branch_admin can advance
    if (!['medtech', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized to advance order status.' };

    // Must be in own branch
    if (session.branch_id && session.branch_id !== payload.branch_id)
      return { success: false, error: 'Access denied. Order is not in your branch.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const sh   = _getOrderSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.order_id);
    });
    if (idx === -1) return { success: false, error: 'Order not found.' };

    const currentStatus = String(data[idx][8] || '');
    const nextStatus    = STATUS_FLOW[currentStatus];

    if (!nextStatus)
      return { success: false, error: 'Order is already at final status.' };

    // Role-based permission check
    if (session.role === 'medtech' && !MEDTECH_CAN_ADVANCE.includes(currentStatus))
      return { success: false, error: 'Technologists can only advance Pending or For Release orders.' };

    if (session.role === 'branch_admin' && !BRANCH_ADMIN_CAN_ADVANCE.includes(currentStatus))
      return { success: false, error: 'Branch admins can only advance Processing or For Review orders.' };

    const now = new Date().toISOString();
    sh.getRange(idx + 1, 9).setValue(nextStatus);
    sh.getRange(idx + 1, 17).setValue(now);

    return { success: true, data: { order_id: payload.order_id, status: nextStatus } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — branch_admin only, Pending orders only
// ═══════════════════════════════════════════════════════════════
function deleteOrder(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (session.role !== 'branch_admin')
      return { success: false, error: 'Only branch admins can delete orders.' };

    if (!payload.order_id)  return { success: false, error: 'order_id is required.' };
    if (!payload.branch_id) return { success: false, error: 'branch_id is required.' };

    if (session.branch_id !== payload.branch_id)
      return { success: false, error: 'Access denied. Order is not in your branch.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const sh   = _getOrderSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.order_id);
    });
    if (idx === -1) return { success: false, error: 'Order not found.' };

    const status = String(data[idx][8] || '');
    if (status !== 'Pending')
      return { success: false, error: 'Only Pending orders can be deleted.' };

    // Delete order items first
    const itemSh   = _getOrderItemSheet(ssId);
    const itemData = itemSh.getDataRange().getValues();
    // Delete in reverse to preserve row indices
    for (var i = itemData.length - 1; i >= 1; i--) {
      if (String(itemData[i][1]) === String(payload.order_id)) {
        itemSh.deleteRow(i + 1);
      }
    }

    // Delete order
    sh.deleteRow(idx + 1);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE NOTES — medtech or branch_admin, non-released orders
// ═══════════════════════════════════════════════════════════════
function updateOrderNotes(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['medtech', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    if (!payload.order_id || !payload.branch_id)
      return { success: false, error: 'order_id and branch_id are required.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const sh   = _getOrderSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.order_id);
    });
    if (idx === -1) return { success: false, error: 'Order not found.' };

    if (String(data[idx][8]) === 'Released')
      return { success: false, error: 'Cannot edit a released order.' };

    sh.getRange(idx + 1, 14).setValue(payload.notes || '');
    sh.getRange(idx + 1, 17).setValue(new Date().toISOString());

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}