const API_URL = 'http://127.0.0.1:8787';

async function runTests() {
  console.log('--- Starting Admin User Management Test Suite ---');

  // 1. Check setup status
  const setupRes = await fetch(`${API_URL}/api/auth/setup-status`);
  const setupData = await setupRes.json();
  console.log('1. Setup status:', setupData);

  // 2. Provision initial admin if needed
  let adminToken = '';
  let adminId = '';
  if (setupData.needsSetup) {
    console.log('2. Provisioning initial admin...');
    const regRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!', role: 'admin' })
    });
    const regData = await regRes.json();
    console.log('Initial admin provisioned:', regData.user);
    adminToken = regData.token;
    adminId = regData.user.id;
  } else {
    console.log('2. Logging in as root admin...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!' })
    });
    const loginData = await loginRes.json();
    adminToken = loginData.token;
    adminId = loginData.user.id;
  }

  if (!adminToken) {
    throw new Error('Could not obtain admin token');
  }

  // 3. Test unauthenticated / non-admin access to /api/admin/users
  console.log('3. Testing unauthenticated access to /api/admin/users...');
  const unauthRes = await fetch(`${API_URL}/api/admin/users`);
  console.log('Unauthenticated status code:', unauthRes.status, '(Expected: 401)');
  if (unauthRes.status !== 401) throw new Error('Unauthenticated access was not blocked');

  // 4. Test admin list users
  console.log('4. Listing users with admin token...');
  const listRes = await fetch(`${API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const listData = await listRes.json();
  console.log(`Listed ${listData.users.length} users successfully.`, listData.users.map(u => ({ email: u.email, role: u.role, status: u.status })));

  // 5. Create a test viewer user via invite
  console.log('5. Inviting test member user...');
  const testEmail = `testuser_${Date.now()}@example.org`;
  const inviteRes = await fetch(`${API_URL}/api/auth/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: testEmail, role: 'viewer' })
  });
  const inviteData = await inviteRes.json();
  console.log('Invite created:', inviteData.email, 'Token:', inviteData.inviteToken);

  // 6. Activate the test user account
  console.log('6. Activating test user account with password...');
  const actRes = await fetch(`${API_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: inviteData.inviteToken, password: 'UserPass12345!' })
  });
  const actData = await actRes.json();
  console.log('Activated user:', actData.user);
  const testUserId = actData.user.id;
  const testUserToken = actData.token;

  // 7. Verify non-admin cannot access admin endpoint
  console.log('7. Verifying non-admin cannot access /api/admin/users...');
  const nonAdminRes = await fetch(`${API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${testUserToken}` }
  });
  console.log('Non-admin status code:', nonAdminRes.status, '(Expected: 403)');
  if (nonAdminRes.status !== 403) throw new Error('Non-admin was not blocked with 403');

  // 8. Test role change (promote viewer to analyst)
  console.log('8. Promoting viewer to analyst...');
  const roleRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/role`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'analyst' })
  });
  const roleData = await roleRes.json();
  console.log('Role updated:', roleData.user);
  if (roleData.user.role !== 'analyst') throw new Error('Role was not updated to analyst');

  // 9. Test suspending user account
  console.log('9. Suspending test user account...');
  const suspendRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'suspended' })
  });
  const suspendData = await suspendRes.json();
  console.log('Status updated:', suspendData.user);
  if (suspendData.user.status !== 'suspended') throw new Error('Status was not updated to suspended');

  // 10. Verify suspended user cannot log in
  console.log('10. Verifying suspended user cannot log in...');
  const loginSuspendedRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'UserPass12345!' })
  });
  console.log('Login attempt for suspended user:', loginSuspendedRes.status, '(Expected: 403)');
  if (loginSuspendedRes.status !== 403) throw new Error('Suspended user was allowed to log in');

  // 11. Reactivate user account
  console.log('11. Reactivating user account...');
  const reactivateRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'active' })
  });
  const reactivateData = await reactivateRes.json();
  console.log('Reactivated user status:', reactivateData.user.status);

  // 12. Verify user can log in again
  console.log('12. Verifying user can now log in...');
  const loginActiveRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'UserPass12345!' })
  });
  console.log('Login attempt for reactivated user:', loginActiveRes.status, '(Expected: 200)');
  if (loginActiveRes.status !== 200) throw new Error('Reactivated user could not log in');

  // 13. Test brute-force rate-limiting and admin unlock
  console.log('13. Simulating 5 failed login attempts to trigger account lock...');
  for (let i = 0; i < 5; i++) {
    await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword!' })
    });
  }

  // Check if locked
  const lockedLoginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'UserPass12345!' })
  });
  console.log('Locked login attempt status:', lockedLoginRes.status, '(Expected: 429)');
  if (lockedLoginRes.status !== 429) throw new Error('Brute-force account lock was not triggered');

  // Admin unlocks account
  console.log('13b. Admin unlocking account...');
  const unlockRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/unlock`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const unlockData = await unlockRes.json();
  console.log('Unlock response:', unlockData);

  // Verify can log in immediately after unlock
  const postUnlockLogin = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'UserPass12345!' })
  });
  console.log('Login after admin unlock status:', postUnlockLogin.status, '(Expected: 200)');
  if (postUnlockLogin.status !== 200) throw new Error('User still locked after admin unlock');

  // 14. Test re-issuing reset / activation invite link
  console.log('14. Testing re-issuing activation / reset link...');
  const reissueRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/reset-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const reissueData = await reissueRes.json();
  console.log('Re-issued invite token:', reissueData.inviteToken);

  // User resets password with new token
  const resetActRes = await fetch(`${API_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: reissueData.inviteToken, password: 'BrandNewPassword99!' })
  });
  console.log('Password reset via re-issued link status:', resetActRes.status, '(Expected: 200)');

  // 15. Test direct password set by admin
  console.log('15. Testing direct password update by admin...');
  const directPwRes = await fetch(`${API_URL}/api/admin/users/${testUserId}/password`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: 'DirectAdminResetPass1!' })
  });
  const directPwData = await directPwRes.json();
  console.log('Direct password update:', directPwData.message);

  // Verify login with directly set password
  const loginDirectRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'DirectAdminResetPass1!' })
  });
  console.log('Login with directly set password status:', loginDirectRes.status, '(Expected: 200)');
  if (loginDirectRes.status !== 200) throw new Error('Could not log in with directly set password');

  // 16. Test safety guard: Admin cannot delete themselves
  console.log('16. Testing self-deletion protection...');
  const selfDelRes = await fetch(`${API_URL}/api/admin/users/${adminId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('Self-deletion status:', selfDelRes.status, '(Expected: 400)');
  if (selfDelRes.status !== 400) throw new Error('Self-deletion was not prevented');

  // 17. Test safety guard: Admin cannot suspend themselves
  console.log('17. Testing self-suspension protection...');
  const selfSuspRes = await fetch(`${API_URL}/api/admin/users/${adminId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'suspended' })
  });
  console.log('Self-suspension status:', selfSuspRes.status, '(Expected: 400)');
  if (selfSuspRes.status !== 400) throw new Error('Self-suspension was not prevented');

  // 18. Test deleting test user
  console.log('18. Testing user deletion...');
  const delRes = await fetch(`${API_URL}/api/admin/users/${testUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('User deletion status:', delRes.status, '(Expected: 200)');
  if (delRes.status !== 200) throw new Error('User deletion failed');

  // Verify user is gone from list
  const finalListRes = await fetch(`${API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const finalListData = await finalListRes.json();
  const exists = finalListData.users.some(u => u.id === testUserId);
  console.log('Deleted user still in list?', exists, '(Expected: false)');
  if (exists) throw new Error('User still exists after deletion');

  console.log('\n✅ ALL 18 ADMIN USER MANAGEMENT TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
