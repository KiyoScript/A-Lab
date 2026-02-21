// ═══════════════════════════════════════════════════════════════════
//  AUTH.js — A-Lab Authentication & Authorization
// ═══════════════════════════════════════════════════════════════════

const SESSION_DURATION_HOURS = 8;
const SESSION_PROP_KEY = 'alab_session_';

// ── LOGIN ──────────────────────────────────────────────────────────
function authLogin(username, password) {
  try {
    if (!username || !password) {
      return { success: false, error: 'Username and password are required.' };
    }

    const users = dbGetAll(TABLES.USER);
    const user = users.find(u => u.username === username.trim().toLowerCase());

    if (!user) {
      return { success: false, error: 'Invalid username or password.' };
    }

    if (user.is_active !== 'TRUE' && user.is_active !== true) {
      return { success: false, error: 'Account is deactivated. Contact your administrator.' };
    }

    const hash = _hashPassword(password, user.salt);
    if (hash !== user.password_hash) {
      return { success: false, error: 'Invalid username or password.' };
    }

    // Create session token
    const token = Utilities.getUuid();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + SESSION_DURATION_HOURS);

    const session = {
      token,
      user_id:   user.user_id,
      username:  user.username,
      full_name: user.full_name,
      role:      user.role,
      branch_id: user.branch_id,
      email:     user.email,
      expires_at: expiry.toISOString(),
    };

    // Store session in Script Properties (server-side)
    PropertiesService.getScriptProperties()
      .setProperty(SESSION_PROP_KEY + token, JSON.stringify(session));

    // Update last_login
    dbUpdate(TABLES.USER, 'user_id', user.user_id, {
      last_login: new Date().toISOString(),
    });

    return {
      success: true,
      token,
      user: {
        user_id:   user.user_id,
        username:  user.username,
        full_name: user.full_name,
        role:      user.role,
        branch_id: user.branch_id,
        email:     user.email,
      },
    };

  } catch (err) {
    Logger.log('authLogin error: ' + err.message);
    return { success: false, error: 'Authentication error. Please try again.' };
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────
function authLogout(token) {
  try {
    PropertiesService.getScriptProperties()
      .deleteProperty(SESSION_PROP_KEY + token);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

// ── VALIDATE SESSION ──────────────────────────────────────────────
function authValidateSession(token) {
  try {
    if (!token) return null;

    const raw = PropertiesService.getScriptProperties()
      .getProperty(SESSION_PROP_KEY + token);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (new Date() > new Date(session.expires_at)) {
      // Expired — clean up
      PropertiesService.getScriptProperties().deleteProperty(SESSION_PROP_KEY + token);
      return null;
    }

    return session;
  } catch (err) {
    return null;
  }
}

// ── PERMISSION CHECK ──────────────────────────────────────────────
function authCan(session, permission) {
  if (!session) return false;
  const perms = ROLE_PERMISSIONS[session.role] || [];
  return perms.includes('*') || perms.includes(permission);
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────
function authChangePassword(token, currentPassword, newPassword) {
  const session = authValidateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  if (newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters.' };
  }

  const user = dbGetById(TABLES.USER, 'user_id', session.user_id);
  if (!user) return { success: false, error: 'User not found.' };

  const currentHash = _hashPassword(currentPassword, user.salt);
  if (currentHash !== user.password_hash) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newSalt = Utilities.getUuid();
  const newHash = _hashPassword(newPassword, newSalt);

  dbUpdate(TABLES.USER, 'user_id', session.user_id, {
    password_hash: newHash,
    salt: newSalt,
  });

  return { success: true, message: 'Password changed successfully.' };
}

// ── USER MANAGEMENT (Admin functions) ────────────────────────────

function adminCreateUser(token, userData) {
  const session = authValidateSession(token);
  if (!session) return { success: false, error: 'Not authenticated.' };
  if (!authCan(session, 'user.manage') && session.role !== ROLES.SUPER_ADMIN && session.role !== ROLES.BRANCH_ADMIN) {
    return { success: false, error: 'Insufficient permissions.' };
  }

  // Branch admin can only create users for their own branch
  if (session.role === ROLES.BRANCH_ADMIN && userData.branch_id !== session.branch_id) {
    return { success: false, error: 'You can only create users for your own branch.' };
  }

  // Check username uniqueness
  const existing = dbGetAll(TABLES.USER).find(u => u.username === userData.username.toLowerCase());
  if (existing) return { success: false, error: 'Username already exists.' };

  const salt = Utilities.getUuid();
  const hash = _hashPassword(userData.password, salt);

  const newUser = {
    username:      userData.username.toLowerCase().trim(),
    password_hash: hash,
    salt,
    full_name:     userData.full_name,
    email:         userData.email || '',
    role:          userData.role,
    branch_id:     userData.branch_id || '',
    is_active:     'TRUE',
    last_login:    '',
  };

  const created = dbInsert(TABLES.USER, newUser);
  const { password_hash, salt: s, ...safeUser } = created;
  return { success: true, user: safeUser };
}

function adminListUsers(token) {
  const session = authValidateSession(token);
  if (!session) return { success: false, error: 'Not authenticated.' };

  let users = dbGetAll(TABLES.USER);

  // Branch admin only sees their branch
  if (session.role === ROLES.BRANCH_ADMIN) {
    users = users.filter(u => u.branch_id === session.branch_id);
  }

  // Strip sensitive fields
  return {
    success: true,
    users: users.map(u => {
      const { password_hash, salt, ...safe } = u;
      return safe;
    }),
  };
}

function adminToggleUser(token, targetUserId, isActive) {
  const session = authValidateSession(token);
  if (!session) return { success: false, error: 'Not authenticated.' };
  if (session.role !== ROLES.SUPER_ADMIN && session.role !== ROLES.BRANCH_ADMIN) {
    return { success: false, error: 'Insufficient permissions.' };
  }
  if (targetUserId === session.user_id) {
    return { success: false, error: 'You cannot deactivate your own account.' };
  }

  dbUpdate(TABLES.USER, 'user_id', targetUserId, { is_active: isActive ? 'TRUE' : 'FALSE' });
  return { success: true };
}

// ── CLIENT-CALLABLE WRAPPERS (called via google.script.run) ──────

function clientLogin(username, password) {
  return authLogin(username, password);
}

function clientLogout(token) {
  return authLogout(token);
}

function clientGetSession(token) {
  const session = authValidateSession(token);
  if (!session) return { valid: false };
  return {
    valid: true,
    user: {
      user_id:   session.user_id,
      username:  session.username,
      full_name: session.full_name,
      role:      session.role,
      branch_id: session.branch_id,
      email:     session.email,
    },
  };
}

function clientChangePassword(token, currentPassword, newPassword) {
  return authChangePassword(token, currentPassword, newPassword);
}

function clientCreateUser(token, userData) {
  return adminCreateUser(token, userData);
}

function clientListUsers(token) {
  return adminListUsers(token);
}

function clientToggleUser(token, targetUserId, isActive) {
  return adminToggleUser(token, targetUserId, isActive);
}