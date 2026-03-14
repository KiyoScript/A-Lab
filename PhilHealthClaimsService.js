// ═══════════════════════════════════════════════════════════════
// PHILHEALTH CLAIMS SERVICE
// ═══════════════════════════════════════════════════════════════
//
// Claim Status Flow:
//   FOR_SUBMISSION → SUBMITTED → APPROVED | REJECTED
//
// ── PhilHealth_Claims Sheet Schema (per branch SS) ───────────────
//   A: claim_id          B: order_id           C: patient_id
//   D: patient_snapshot  E: philhealth_pin     F: benefit_package
//   G: remaining_before  H: benefit_used       I: patient_copay
//   J: status            K: claim_date         L: submitted_at
//   M: approved_at       N: notes              O: created_by
//   P: created_at        Q: updated_at
//
// ── Access ───────────────────────────────────────────────────────
//   Branch Admin + MedTech → full access (view + update status)
//   Super Admin            → read only
// ═══════════════════════════════════════════════════════════════

function _claimRowToObj(row) {
  return {
    claim_id:         String(row[0]  || ''),
    order_id:         String(row[1]  || ''),
    patient_id:       String(row[2]  || ''),
    patient_snapshot: String(row[3]  || ''),
    philhealth_pin:   String(row[4]  || ''),
    benefit_package:  String(row[5]  || ''),
    remaining_before: Number(row[6]) || 0,
    benefit_used:     Number(row[7]) || 0,
    patient_copay:    Number(row[8]) || 0,
    status:           String(row[9]  || 'FOR_SUBMISSION'),
    claim_date:       String(row[10] || ''),
    submitted_at:     String(row[11] || ''),
    approved_at:      String(row[12] || ''),
    notes:            String(row[13] || ''),
    created_by:       String(row[14] || ''),
    created_at:       String(row[15] || ''),
    updated_at:       String(row[16] || '')
  };
}

function _canManageClaims(role) {
  return ['medtech', 'branch_admin', 'super_admin'].includes(role);
}

function _canWriteClaims(role) {
  return ['medtech', 'branch_admin'].includes(role);
}

// ═══════════════════════════════════════════════════════════════
// 1. GET CLAIMS
// ═══════════════════════════════════════════════════════════════
function getClaims(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_canManageClaims(session.role)) return { success: false, error: 'Access denied.' };

    const branchSh   = _getRegistrySheet();
    const branchData = branchSh.getDataRange().getValues();
    const result     = [];

    for (var b = 1; b < branchData.length; b++) {
      const branchId   = String(branchData[b][0] || '');
      const branchName = String(branchData[b][1] || '');
      const ssId       = String(branchData[b][7] || '');
      if (!ssId) continue;

      if (['medtech', 'branch_admin'].includes(session.role)) {
        if (branchId !== session.branch_id) continue;
      }

      try {
        const sh   = _getPhilHealthClaimSheet(ssId);
        const data = sh.getDataRange().getValues();
        if (data.length <= 1) continue;

        data.slice(1).filter(function(r) { return r[0] !== ''; }).forEach(function(r) {
          var claim = _claimRowToObj(r);
          claim.branch_id   = branchId;
          claim.branch_name = branchName;
          result.push(claim);
        });
      } catch(_) {}
    }

    result.sort(function(a, b) {
      return String(b.claim_date).localeCompare(String(a.claim_date));
    });

    return { success: true, data: result };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. UPDATE CLAIM STATUS
// payload: { claim_id, branch_id, status, notes }
// ═══════════════════════════════════════════════════════════════
function updateClaimStatus(payload, token) {
  try {
    const session = _getSession(token);
    if (!session) return { success: false, error: 'Session expired.', expired: true };
    if (!_canWriteClaims(session.role)) return { success: false, error: 'Access denied.' };

    const allowed = ['SUBMITTED', 'APPROVED', 'REJECTED'];
    if (!allowed.includes(payload.status))
      return { success: false, error: 'Invalid status.' };

    const branchInfo = _ord_getBranchSsId(payload.branch_id);
    if (!branchInfo) return { success: false, error: 'Branch not found.' };
    const ssId = branchInfo.ssId;

    const sh   = _getPhilHealthClaimSheet(ssId);
    const data = sh.getDataRange().getValues();
    const idx  = data.findIndex(function(r, i) {
      return i > 0 && String(r[0]) === String(payload.claim_id);
    });
    if (idx === -1) return { success: false, error: 'Claim not found.' };

    const now = new Date().toISOString();

    // Validate transition
    const current = String(data[idx][9] || '');
    const valid = {
      'FOR_SUBMISSION': ['SUBMITTED'],
      'SUBMITTED':      ['APPROVED', 'REJECTED'],
      'APPROVED':       [],
      'REJECTED':       []
    };
    if (!valid[current] || !valid[current].includes(payload.status))
      return { success: false, error: 'Cannot transition from ' + current + ' to ' + payload.status + '.' };

    // Update status
    sh.getRange(idx + 1, 10).setValue(payload.status);
    sh.getRange(idx + 1, 17).setValue(now);

    // Set timestamp fields
    if (payload.status === 'SUBMITTED') {
      sh.getRange(idx + 1, 12).setValue(now);
    }
    if (payload.status === 'APPROVED' || payload.status === 'REJECTED') {
      sh.getRange(idx + 1, 13).setValue(now);
    }

    // Update notes if provided
    if (payload.notes) {
      sh.getRange(idx + 1, 14).setValue(payload.notes);
    }

    return { success: true, data: { status: payload.status } };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. GET CLAIMS INIT DATA
// ═══════════════════════════════════════════════════════════════
function getPhilHealthClaimsInitData(token) {
  try {
    const session = getSession(token);
    if (!session || !session.data) return { success: false, expired: true };
    const claims = getClaims({}, token);
    return { success: true, session: session.data, claims: claims };
  } catch(e) {
    return { success: false, error: e.message };
  }
}