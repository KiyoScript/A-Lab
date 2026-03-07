// ═══════════════════════════════════════════════════════════════
// ORDERS SERVICE
// ═══════════════════════════════════════════════════════════════
//
// Order Status Flow:
//   DRAFT → OPEN → PAID → IN_PROGRESS → FOR_RELEASE → RELEASED
//
// Order Item Status Flow:
//   PENDING → RUNNING → DONE
//
// Result Status Flow:
//   DRAFT → FOR_VERIFICATION → VERIFIED → RELEASED
//
// ── Orders Sheet Schema (per branch SS) ─────────────────────────
//   A: order_id           B: order_number       C: patient_id
//   D: patient_snapshot   E: referring_doctor_id F: doctor_snapshot
//   G: status             H: payment_method      I: payment_amount
//   J: payment_discount   K: amount_paid         L: change
//   M: notes              N: order_date          O: created_by
//   P: created_at         Q: updated_at
//
// ── Order_Items Sheet Schema (per branch SS) ─────────────────────
//   A: item_id            B: order_id            C: item_type
//   D: item_ref_id        E: item_name_snapshot  F: fee
//   G: item_status        H: result_status       I: result_file_url
//   J: result_drive_id    K: result_file_name    L: started_by
//   M: started_at         N: completed_by        O: completed_at
//   P: created_at
//
// ── Access ───────────────────────────────────────────────────────
//   Technologist  → full access (create, process, upload, verify, release)
//   Branch Admin  → view all + delete DRAFT orders
//   Super Admin   → view all (read only)
//   Doctor        → view own referrals only (read only)
// ═══════════════════════════════════════════════════════════════

// ─── Sheet helpers ────────────────────────────────────────────────
function _getOrderSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Orders');
  if (!sh) {
    sh = ss.insertSheet('Orders');
    const headers = [
      'order_id','order_number','patient_id','patient_snapshot',
      'referring_doctor_id','doctor_snapshot','status','payment_method',
      'payment_amount','payment_discount','amount_paid','change',
      'notes','order_date','created_by','created_at','updated_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold').setBackground('#0f172a')
      .setFontColor('#ffffff').setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 160);
  }
  return sh;
}

function _getOrderItemSheet(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sh = ss.getSheetByName('Order_Items');
  if (!sh) {
    sh = ss.insertSheet('Order_Items');
    const headers = [
      'item_id','order_id','item_type','item_ref_id','item_name_snapshot',
      'fee','item_status','result_status','result_file_url','result_drive_id',
      'result_file_name','started_by','started_at','completed_by','completed_at',
      'created_at'
    ];
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold').setBackground('#0f172a')
      .setFontColor('#ffffff').setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 160);
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
    status:              String(row[6]  || 'DRAFT'),
    payment_method:      String(row[7]  || ''),
    payment_amount:      Number(row[8])  || 0,
    payment_discount:    Number(row[9])  || 0,
    amount_paid:         Number(row[10]) || 0,
    change:              Number(row[11]) || 0,
    notes:               String(row[12] || ''),
    order_date:          String(row[13] || ''),
    created_by:          String(row[14] || ''),
    created_at:          String(row[15] || ''),
    updated_at:          String(row[16] || '')
  };
}

function _orderItemRowToObj(row) {
  return {
    item_id:            String(row[0]  || ''),
    order_id:           String(row[1]  || ''),
    item_type:          String(row[2]  || ''),
    item_ref_id:        String(row[3]  || ''),
    item_name_snapshot: String(row[4]  || ''),
    fee:                Number(row[5])  || 0,
    item_status:        String(row[6]  || 'PENDING'),
    result_status:      String(row[7]  || ''),
    result_file_url:    String(row[8]  || ''),
    result_drive_id:    String(row[9]  || ''),
    result_file_name:   String(row[10] || ''),
    started_by:         String(row[11] || ''),
    started_at:         String(row[12] || ''),
    completed_by:       String(row[13] || ''),
    completed_at:       String(row[14] || ''),
    created_at:         String(row[15] || '')
  };
}

// ─── Helpers ──────────────────────────────────────────────────────
function _generateOrderNumber(spreadsheetId) {
  try {
    const sh    = _getOrderSheet(spreadsheetId);
    const count = Math.max(sh.getLastRow() - 1, 0);
    const today = new Date();
    const ymd   = today.getFullYear().toString() +
                  String(today.getMonth() + 1).padStart(2, '0') +
                  String(today.getDate()).padStart(2, '0');
    return 'ORD-' + ymd + '-' + String(count + 1).padStart(4, '0');
  } catch(e) {
    return 'ORD-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  }
}

function _getBranchSsId(branchId) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  const row  = data.find(function(r, i) {
    return i > 0 && String(r[0]) === String(branchId);
  });
  return row ? String(row[7] || '') : null;
}

function _getBranchName(branchId) {
  const sh   = _getRegistrySheet();
  const data = sh.getDataRange().getValues();
  const row  = data.find(function(r, i) {
    return i > 0 && String(r[0]) === String(branchId);
  });
  return row ? String(row[1] || '') : '';
}

function _canAccessOrders(role) {
  return ['medtech', 'branch_admin', 'super_admin', 'doctor'].includes(role);
}

function _isTechnologist(role) {
  return role === 'medtech';
}

// ─── Get or create Drive folder ───────────────────────────────────
function _getOrCreateDriveFolder(branchName, patientName, orderNumber) {
  try {
    const rootFolderName = 'A-Lab Results';
    let rootFolder;
    const rootQuery = DriveApp.getFoldersByName(rootFolderName);
    if (rootQuery.hasNext()) {
      rootFolder = rootQuery.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }

    function _getOrCreate(parent, name) {
      const q = parent.getFoldersByName(name);
      return q.hasNext() ? q.next() : parent.createFolder(name);
    }

    const branchFolder  = _getOrCreate(rootFolder, branchName);
    const patientFolder = _getOrCreate(branchFolder, patientName);
    const orderFolder   = _getOrCreate(patientFolder, orderNumber);
    return orderFolder;
  } catch(e) {
    throw new Error('Drive folder error: ' + e.message);
  }
}

// ─── Find order row helper ────────────────────────────────────────
function _findOrderRow(spreadsheetId, orderId) {
  const sh   = _getOrderSheet(spreadsheetId);
  const data = sh.getDataRange().getValues();
  const idx  = data.findIndex(function(r, i) {
    return i > 0 && String(r[0]) === String(orderId);
  });
  return { sh, data, idx };
}

function _findItemRow(spreadsheetId, itemId) {
  const sh   = _getOrderItemSheet(spreadsheetId);
  const data = sh.getDataRange().getValues();
  const idx  = data.findIndex(function(r, i) {
    return i > 0 && String(r[0]) === String(itemId);
  });
  return { sh, data, idx };
}

// ═══════════════════════════════════════════════════════════════
// 1. GET ORDERS
// ═══════════════════════════════════════════════════════════════
function getOrders(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_canAccessOrders(session.role)) return { success: false, error: 'Access denied.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const result     = [];

    for (var b = 1; b < branchData.length; b++) {
      const branchId   = String(branchData[b][0] || '');
      const branchName = String(branchData[b][1] || '');
      const ssId       = String(branchData[b][7] || '');
      if (!ssId) continue;

      if (['medtech', 'branch_admin', 'doctor'].includes(session.role)) {
        if (branchId !== session.branch_id) continue;
      }

      try {
        const sh   = _getOrderSheet(ssId);
        const data = sh.getDataRange().getValues();
        if (data.length <= 1) continue;

        data.slice(1).filter(function(r) { return r[0] !== ''; }).forEach(function(r) {
          const order = _orderRowToObj(r);
          order.branch_id   = branchId;
          order.branch_name = branchName;
          if (session.role === 'doctor' && order.referring_doctor_id !== session.doctor_id) return;
          result.push(order);
        });
      } catch(_) {}
    }

    result.sort(function(a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    return { success: true, data: result };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. GET ORDER ITEMS
// ═══════════════════════════════════════════════════════════════
function getOrderItems(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_canAccessOrders(session.role)) return { success: false, error: 'Access denied.' };
    if (!payload.order_id || !payload.branch_id)
      return { success: false, error: 'order_id and branch_id are required.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const sh    = _getOrderItemSheet(ssId);
    const data  = sh.getDataRange().getValues();
    const items = data.slice(1)
      .filter(function(r) { return r[0] !== '' && String(r[1]) === String(payload.order_id); })
      .map(_orderItemRowToObj);

    return { success: true, data: items };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. CREATE ORDER — saves as DRAFT, no payment yet
// ═══════════════════════════════════════════════════════════════
function createOrder(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can create orders.' };
    if (!session.branch_id)
      return { success: false, error: 'You are not assigned to a branch.' };
    if (!payload.patient_id)
      return { success: false, error: 'Patient is required.' };
    if (!payload.items || !payload.items.length)
      return { success: false, error: 'At least one lab service or package is required.' };

    const branchInfo = _getBranchSsId(session.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch spreadsheet not found.' };
    const ssId = branchInfo.ssId;
    const now             = new Date().toISOString();
    const orderId         = 'ORD-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const orderNumber     = _generateOrderNumber(ssId);
    const paymentAmount   = payload.items.reduce(function(s, i) { return s + (Number(i.fee) || 0); }, 0);
    const paymentDiscount = Number(payload.payment_discount) || 0;

    const orderSh = _getOrderSheet(ssId);
    orderSh.appendRow([
      orderId, orderNumber,
      payload.patient_id,
      payload.patient_snapshot    || '',
      payload.referring_doctor_id || '',
      payload.doctor_snapshot     || '',
      'DRAFT', '',                    // status, payment_method
      paymentAmount, paymentDiscount,
      0, 0,                           // amount_paid, change
      payload.notes || '',
      now,                            // order_date
      session.full_name || session.username || '',
      now, now
    ]);

    const itemSh = _getOrderItemSheet(ssId);
    payload.items.forEach(function(item) {
      itemSh.appendRow([
        'ITM-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
        orderId,
        item.item_type          || 'service',
        item.item_ref_id        || '',
        item.item_name_snapshot || '',
        Number(item.fee)        || 0,
        'PENDING', '', '', '', '', '', '', '', '', now
      ]);
    });

    return {
      success: true,
      data: { order_id: orderId, order_number: orderNumber, status: 'DRAFT', payment_amount: paymentAmount }
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. CONFIRM ORDER — DRAFT → OPEN
// ═══════════════════════════════════════════════════════════════
function confirmOrder(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can confirm orders.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const { sh, data, idx } = _findOrderRow(ssId, payload.order_id);
    if (idx === -1) return { success: false, error: 'Order not found.' };
    if (String(data[idx][6]) !== 'DRAFT')
      return { success: false, error: 'Only DRAFT orders can be confirmed.' };

    const now = new Date().toISOString();
    sh.getRange(idx + 1, 7).setValue('OPEN');
    sh.getRange(idx + 1, 17).setValue(now);

    return { success: true, data: { status: 'OPEN' } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. RECORD PAYMENT — OPEN → PAID
// payload: { order_id, branch_id, payment_method, amount_paid }
// ═══════════════════════════════════════════════════════════════
function recordPayment(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can record payment.' };
    if (!payload.payment_method)
      return { success: false, error: 'Payment method is required.' };
    if (!payload.amount_paid || Number(payload.amount_paid) <= 0)
      return { success: false, error: 'Amount paid is required.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const { sh, data, idx } = _findOrderRow(ssId, payload.order_id);
    if (idx === -1) return { success: false, error: 'Order not found.' };
    if (String(data[idx][6]) !== 'OPEN')
      return { success: false, error: 'Only OPEN orders can be paid.' };

    const paymentAmount   = Number(data[idx][8])  || 0;
    const paymentDiscount = Number(data[idx][9])  || 0;
    const amountPaid      = Number(payload.amount_paid);
    const total           = paymentAmount - paymentDiscount;
    const change          = Math.max(amountPaid - total, 0);

    const now = new Date().toISOString();
    sh.getRange(idx + 1, 7).setValue('PAID');
    sh.getRange(idx + 1, 8).setValue(payload.payment_method);
    sh.getRange(idx + 1, 11).setValue(amountPaid);
    sh.getRange(idx + 1, 12).setValue(change);
    sh.getRange(idx + 1, 17).setValue(now);

    return { success: true, data: { status: 'PAID', amount_paid: amountPaid, change, total } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. START ITEM — PENDING → RUNNING
//    Auto-advances order PAID → IN_PROGRESS
// ═══════════════════════════════════════════════════════════════
function startItem(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can start items.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;


    // Verify order status
    const orderResult = _findOrderRow(ssId, payload.order_id);
    if (orderResult.idx === -1) return { success: false, error: 'Order not found.' };
    const orderStatus = String(orderResult.data[orderResult.idx][6] || '');
    if (!['PAID', 'IN_PROGRESS'].includes(orderStatus))
      return { success: false, error: 'Order must be PAID before processing items.' };

    // Update item
    const itemResult = _findItemRow(ssId, payload.item_id);
    if (itemResult.idx === -1) return { success: false, error: 'Item not found.' };
    if (String(itemResult.data[itemResult.idx][6]) !== 'PENDING')
      return { success: false, error: 'Item is already started or completed.' };

    const now = new Date().toISOString();
    itemResult.sh.getRange(itemResult.idx + 1, 7).setValue('RUNNING');
    itemResult.sh.getRange(itemResult.idx + 1, 12).setValue(session.full_name || session.username || '');
    itemResult.sh.getRange(itemResult.idx + 1, 13).setValue(now);

    // Auto-advance order to IN_PROGRESS
    if (orderStatus === 'PAID') {
      orderResult.sh.getRange(orderResult.idx + 1, 7).setValue('IN_PROGRESS');
      orderResult.sh.getRange(orderResult.idx + 1, 17).setValue(now);
    }

    return { success: true, data: { item_status: 'RUNNING', order_status: 'IN_PROGRESS' } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. COMPLETE ITEM — RUNNING → DONE
//    Auto-advances order IN_PROGRESS → FOR_RELEASE if all DONE
// ═══════════════════════════════════════════════════════════════
function completeItem(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can complete items.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const itemResult = _findItemRow(ssId, payload.item_id);
    if (itemResult.idx === -1) return { success: false, error: 'Item not found.' };
    if (String(itemResult.data[itemResult.idx][6]) !== 'RUNNING')
      return { success: false, error: 'Item must be RUNNING to complete.' };

    const now = new Date().toISOString();
    itemResult.sh.getRange(itemResult.idx + 1, 7).setValue('DONE');
    itemResult.sh.getRange(itemResult.idx + 1, 14).setValue(session.full_name || session.username || '');
    itemResult.sh.getRange(itemResult.idx + 1, 15).setValue(now);

    // Check if all items DONE → advance order to FOR_RELEASE
    const freshData  = itemResult.sh.getDataRange().getValues();
    const allItems   = freshData.slice(1).filter(function(r) {
      return r[0] !== '' && String(r[1]) === String(payload.order_id);
    });
    const allDone    = allItems.every(function(r) { return String(r[6]) === 'DONE'; });
    let newOrderStatus = 'IN_PROGRESS';

    if (allDone) {
      const orderResult = _findOrderRow(ssId, payload.order_id);
      if (orderResult.idx !== -1) {
        orderResult.sh.getRange(orderResult.idx + 1, 7).setValue('FOR_RELEASE');
        orderResult.sh.getRange(orderResult.idx + 1, 17).setValue(now);
        newOrderStatus = 'FOR_RELEASE';
      }
    }

    return { success: true, data: { item_status: 'DONE', order_status: newOrderStatus, all_items_done: allDone } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. UPLOAD RESULT — PDF/DOC to Drive + link to item
//    Sets result_status → FOR_VERIFICATION
// payload: { item_id, order_id, branch_id, file_data (base64), file_name, mime_type }
// ═══════════════════════════════════════════════════════════════
function uploadResult(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can upload results.' };
    if (!payload.item_id || !payload.order_id || !payload.branch_id)
      return { success: false, error: 'item_id, order_id, and branch_id are required.' };
    if (!payload.file_data || !payload.file_name)
      return { success: false, error: 'File data and file name are required.' };

    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowed.includes(payload.mime_type))
      return { success: false, error: 'Only PDF and DOC/DOCX files are allowed.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    // Get order info for Drive folder path
    const orderResult = _findOrderRow(ssId, payload.order_id);
    if (orderResult.idx === -1) return { success: false, error: 'Order not found.' };
    const orderNumber = String(orderResult.data[orderResult.idx][1] || '');
    const patientName = String(orderResult.data[orderResult.idx][3] || 'Unknown Patient');
    const branchName  = _getBranchName(payload.branch_id);

    // Get item
    const itemResult = _findItemRow(ssId, payload.item_id);
    if (itemResult.idx === -1) return { success: false, error: 'Item not found.' };

    // Upload to Drive
    const folder    = _getOrCreateDriveFolder(branchName, patientName, orderNumber);
    const blob      = Utilities.newBlob(
      Utilities.base64Decode(payload.file_data),
      payload.mime_type,
      payload.file_name
    );
    const driveFile = folder.createFile(blob);
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileUrl = driveFile.getUrl();
    const fileId  = driveFile.getId();
    const now     = new Date().toISOString();

    // Update item
    itemResult.sh.getRange(itemResult.idx + 1, 8).setValue('FOR_VERIFICATION');
    itemResult.sh.getRange(itemResult.idx + 1, 9).setValue(fileUrl);
    itemResult.sh.getRange(itemResult.idx + 1, 10).setValue(fileId);
    itemResult.sh.getRange(itemResult.idx + 1, 11).setValue(payload.file_name);

    return {
      success: true,
      data: { result_status: 'FOR_VERIFICATION', result_file_url: fileUrl, result_drive_id: fileId, file_name: payload.file_name }
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. VERIFY RESULT — FOR_VERIFICATION → VERIFIED
// ═══════════════════════════════════════════════════════════════
function verifyResult(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can verify results.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const itemResult = _findItemRow(ssId, payload.item_id);
    if (itemResult.idx === -1) return { success: false, error: 'Item not found.' };
    if (String(itemResult.data[itemResult.idx][7]) !== 'FOR_VERIFICATION')
      return { success: false, error: 'Result must be FOR_VERIFICATION to verify.' };

    itemResult.sh.getRange(itemResult.idx + 1, 8).setValue('VERIFIED');

    return { success: true, data: { result_status: 'VERIFIED' } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. REJECT RESULT — sends back for re-upload
//     Reverts result to DRAFT, clears file, reverts order if needed
// ═══════════════════════════════════════════════════════════════
function rejectResult(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can reject results.' };

    const ssId = _getBranchSsId(payload.branch_id);
    if (!ssId) return { success: false, error: 'Branch not found.' };

    const itemResult = _findItemRow(ssId, payload.item_id);
    if (itemResult.idx === -1) return { success: false, error: 'Item not found.' };

    const resultStatus = String(itemResult.data[itemResult.idx][7] || '');
    if (!['FOR_VERIFICATION', 'VERIFIED'].includes(resultStatus))
      return { success: false, error: 'Result cannot be rejected at this stage.' };

    // Clear result so it can be re-uploaded
    itemResult.sh.getRange(itemResult.idx + 1, 8).setValue('DRAFT');
    itemResult.sh.getRange(itemResult.idx + 1, 9).setValue('');
    itemResult.sh.getRange(itemResult.idx + 1, 10).setValue('');
    itemResult.sh.getRange(itemResult.idx + 1, 11).setValue('');

    // Revert order from FOR_RELEASE → IN_PROGRESS
    const orderResult = _findOrderRow(ssId, payload.order_id);
    if (orderResult.idx !== -1 && String(orderResult.data[orderResult.idx][6]) === 'FOR_RELEASE') {
      orderResult.sh.getRange(orderResult.idx + 1, 7).setValue('IN_PROGRESS');
      orderResult.sh.getRange(orderResult.idx + 1, 17).setValue(new Date().toISOString());
    }

    return { success: true, data: { result_status: 'DRAFT' } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 11. RELEASE ORDER — FOR_RELEASE → RELEASED
//     All item results must be VERIFIED first
// ═══════════════════════════════════════════════════════════════
function releaseOrder(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role))
      return { success: false, error: 'Only technologists can release orders.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const orderResult = _findOrderRow(ssId, payload.order_id);
    if (orderResult.idx === -1) return { success: false, error: 'Order not found.' };
    if (String(orderResult.data[orderResult.idx][6]) !== 'FOR_RELEASE')
      return { success: false, error: 'Order must be FOR_RELEASE to release.' };

    // All results must be VERIFIED
    const itemSh   = _getOrderItemSheet(ssId);
    const itemData = itemSh.getDataRange().getValues();
    const items    = itemData.slice(1).filter(function(r) {
      return r[0] !== '' && String(r[1]) === String(payload.order_id);
    });
    const allVerified = items.every(function(r) { return String(r[7]) === 'VERIFIED'; });
    if (!allVerified)
      return { success: false, error: 'All results must be VERIFIED before releasing.' };

    const now = new Date().toISOString();
    orderResult.sh.getRange(orderResult.idx + 1, 7).setValue('RELEASED');
    orderResult.sh.getRange(orderResult.idx + 1, 17).setValue(now);

    // Mark all results RELEASED
    itemData.forEach(function(r, i) {
      if (i === 0 || !r[0]) return;
      if (String(r[1]) === String(payload.order_id)) {
        itemSh.getRange(i + 1, 8).setValue('RELEASED');
      }
    });

    return { success: true, data: { status: 'RELEASED' } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 12. DELETE ORDER — DRAFT only
// ═══════════════════════════════════════════════════════════════
function deleteOrder(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!['medtech', 'branch_admin'].includes(session.role))
      return { success: false, error: 'Unauthorized.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const { sh, data, idx } = _findOrderRow(ssId, payload.order_id);
    if (idx === -1) return { success: false, error: 'Order not found.' };
    if (String(data[idx][6]) !== 'DRAFT')
      return { success: false, error: 'Only DRAFT orders can be deleted.' };

    // Delete items first (reverse to preserve indices)
    const itemSh   = _getOrderItemSheet(ssId);
    const itemData = itemSh.getDataRange().getValues();
    for (var i = itemData.length - 1; i >= 1; i--) {
      if (String(itemData[i][1]) === String(payload.order_id)) {
        itemSh.deleteRow(i + 1);
      }
    }
    sh.deleteRow(idx + 1);

    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 13. UPDATE ORDER NOTES — DRAFT or OPEN only
// ═══════════════════════════════════════════════════════════════
function updateOrderNotes(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_isTechnologist(session.role)) return { success: false, error: 'Unauthorized.' };

    const branchInfo = _getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const { sh, data, idx } = _findOrderRow(ssId, payload.order_id);
    if (idx === -1) return { success: false, error: 'Order not found.' };
    if (!['DRAFT', 'OPEN'].includes(String(data[idx][6])))
      return { success: false, error: 'Notes can only be edited on DRAFT or OPEN orders.' };

    sh.getRange(idx + 1, 13).setValue(payload.notes || '');
    sh.getRange(idx + 1, 17).setValue(new Date().toISOString());

    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}