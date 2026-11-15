import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal
} from 'react-native';
import {
  AdminUser,
  getAdminUsers,
  updateUserRole,
  updateUserStatus,
  unlockUserAccount,
  reissueUserInvite,
  resetUserPasswordDirect,
  deleteUserAccount,
  inviteUser,
  registerUser,
  runRetentionPurge,
  clearDatabase
} from '../services/dataService';

interface AdminViewProps {
  currentUser?: { email?: string | null; role?: string | null } | null;
  onDataChanged?: () => void;
}

export function AdminView({ currentUser, onDataChanged }: AdminViewProps) {
  // State: User Directory
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State: Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'analyst' | 'viewer'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'suspended' | 'pending' | 'locked'>('ALL');

  // State: Invite Team Member
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'analyst' | 'admin'>('analyst');
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // State: Direct Provisioning Modal
  const [showDirectModal, setShowDirectModal] = useState<boolean>(false);
  const [directEmail, setDirectEmail] = useState<string>('');
  const [directPassword, setDirectPassword] = useState<string>('');
  const [directRole, setDirectRole] = useState<'viewer' | 'analyst' | 'admin'>('viewer');
  const [directLoading, setDirectLoading] = useState<boolean>(false);

  // State: Manual Password Reset Modal
  const [resetModalUser, setResetModalUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [resetLoading, setResetLoading] = useState<boolean>(false);

  // State: Retention & DB Maintenance
  const [purgeLoading, setPurgeLoading] = useState<boolean>(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState<boolean>(false);

  // Action busy indicators per user id
  const [busyUsers, setBusyUsers] = useState<Record<string, string>>({});

  const setBusy = (userId: string, action: string | null) => {
    setBusyUsers(prev => {
      const next = { ...prev };
      if (action) {
        next[userId] = action;
      } else {
        delete next[userId];
      }
      return next;
    });
  };

  const loadUsers = async (isSilent: boolean = false) => {
    if (!isSilent) setLoadingUsers(true);
    setErrorMessage(null);
    try {
      const userList = await getAdminUsers();
      setUsers(userList);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load user directory');
    } finally {
      if (!isSilent) setLoadingUsers(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadUsers(true);
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin' && u.status === 'active').length;
    const analysts = users.filter(u => u.role === 'analyst' && u.status === 'active').length;
    const viewers = users.filter(u => u.role === 'viewer' && u.status === 'active').length;
    const pending = users.filter(u => Boolean(u.is_pending_invite)).length;
    const lockedOrSuspended = users.filter(u => u.status === 'suspended' || Boolean(u.is_locked)).length;

    return { total, admins, analysts, viewers, pending, lockedOrSuspended };
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        if (!user.email.toLowerCase().includes(query)) return false;
      }

      // Role filter
      if (roleFilter !== 'ALL' && user.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && (user.status !== 'active' || user.is_pending_invite)) return false;
      if (statusFilter === 'suspended' && user.status !== 'suspended') return false;
      if (statusFilter === 'pending' && !user.is_pending_invite) return false;
      if (statusFilter === 'locked' && !user.is_locked) return false;

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Invite Team Member Handler
  const handleInviteUser = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setGeneratedInviteLink(null);
    setCopiedLink(false);

    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }

    setInviteLoading(true);
    try {
      const res = await inviteUser(inviteEmail.trim(), inviteRole);
      const origin = (typeof window !== 'undefined' && window.location?.origin)
        ? window.location.origin
        : 'https://aildata-web.pages.dev';
      const fullLink = `${origin}/?invite=${res.inviteToken}`;
      setGeneratedInviteLink(fullLink);
      setSuccessMessage(`Invitation link created for ${res.email} (${res.role.toUpperCase()}). Valid for 7 days.`);
      setInviteEmail('');
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate invitation link.');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } else {
      Alert.alert('Activation Link', text);
    }
  };

  // Direct Account Provisioning Handler
  const handleDirectProvision = async () => {
    if (!directEmail.trim() || !directEmail.includes('@')) {
      Alert.alert('Validation Error', 'A valid email address is required.');
      return;
    }
    if (!directPassword || directPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }

    setDirectLoading(true);
    try {
      await registerUser(directEmail.trim(), directPassword, directRole);
      setShowDirectModal(false);
      setDirectEmail('');
      setDirectPassword('');
      setSuccessMessage(`Account directly provisioned for ${directEmail.trim()}.`);
      await loadUsers(true);
    } catch (err: any) {
      Alert.alert('Provisioning Failed', err.message || 'Failed to create user account.');
    } finally {
      setDirectLoading(false);
    }
  };

  // Role Change Handler
  const handleChangeRole = async (user: AdminUser, newRole: 'viewer' | 'analyst' | 'admin') => {
    if (user.role === newRole) return;
    setBusy(user.id, 'role');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateUserRole(user.id, newRole);
      setSuccessMessage(`Updated ${user.email} role to ${newRole.toUpperCase()}.`);
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to change role.');
    } finally {
      setBusy(user.id, null);
    }
  };

  // Status Toggle Handler
  const handleToggleStatus = async (user: AdminUser) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    const actionLabel = nextStatus === 'suspended' ? 'Deactivate' : 'Reactivate';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to ${actionLabel.toLowerCase()} account ${user.email}?`);
      if (!confirmed) return;
    }

    setBusy(user.id, 'status');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateUserStatus(user.id, nextStatus);
      setSuccessMessage(`Account ${user.email} is now ${nextStatus.toUpperCase()}.`);
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to ${actionLabel.toLowerCase()} user.`);
    } finally {
      setBusy(user.id, null);
    }
  };

  // Unlock Account Handler
  const handleUnlockUser = async (user: AdminUser) => {
    setBusy(user.id, 'unlock');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await unlockUserAccount(user.id);
      setSuccessMessage(`Brute-force lock cleared for ${user.email}.`);
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unlock user.');
    } finally {
      setBusy(user.id, null);
    }
  };

  // Re-issue Invite / Activation Link Handler
  const handleReissueInvite = async (user: AdminUser) => {
    setBusy(user.id, 'reissue');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await reissueUserInvite(user.id);
      const origin = (typeof window !== 'undefined' && window.location?.origin)
        ? window.location.origin
        : 'https://aildata-web.pages.dev';
      const fullLink = `${origin}/?invite=${res.inviteToken}`;
      setGeneratedInviteLink(fullLink);
      setSuccessMessage(`Fresh activation link generated for ${user.email}. Valid for 7 days.`);
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate link.');
    } finally {
      setBusy(user.id, null);
    }
  };

  // Direct Password Reset Handler
  const handleDirectPasswordReset = async () => {
    if (!resetModalUser) return;
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }

    setResetLoading(true);
    try {
      await resetUserPasswordDirect(resetModalUser.id, newPassword);
      setSuccessMessage(`Password updated successfully for ${resetModalUser.email}.`);
      setResetModalUser(null);
      setNewPassword('');
      await loadUsers(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  // Delete User Handler
  const handleDeleteUser = async (user: AdminUser) => {
    const isCurrentAdmin = (currentUser?.email || '').toLowerCase() === user.email.toLowerCase();
    if (isCurrentAdmin) {
      Alert.alert('Action Forbidden', 'You cannot delete your own administrator account.');
      return;
    }

    const message = `Are you sure you want to permanently delete user "${user.email}"? This action cannot be undone.`;
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (!confirmed) return;
    }

    setBusy(user.id, 'delete');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deleteUserAccount(user.id);
      setSuccessMessage(`User ${user.email} was permanently deleted.`);
      await loadUsers(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete user.');
    } finally {
      setBusy(user.id, null);
    }
  };

  // Maintenance Handlers
  const handleRunPurge = async () => {
    setPurgeLoading(true);
    setPurgeResult(null);
    try {
      const res = await runRetentionPurge();
      setPurgeResult(`Purge complete: ${res.result?.purged_records ?? 0} records rolled up & removed.`);
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      Alert.alert('Purge Error', err.message || 'Purge failed.');
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    const msg = 'CRITICAL WARNING: This will permanently delete ALL detainee profiles, charges, detentions, correspondence, and dynamic records. Are you completely sure?';
    if (Platform.OS === 'web') {
      if (!window.confirm(msg)) return;
      if (!window.confirm('Please confirm a second time: This cannot be undone.')) return;
    }
    setClearLoading(true);
    try {
      await clearDatabase();
      Alert.alert('Database Reset', 'All dynamic records and relational entities have been wiped.');
      if (onDataChanged) onDataChanged();
      await loadUsers(true);
    } catch (err: any) {
      Alert.alert('Reset Failed', err.message || 'Database reset failed.');
    } finally {
      setClearLoading(false);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' };
      case 'analyst':
        return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
      default:
        return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' };
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header Banner */}
      <View style={styles.headerRow}>
        <View>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.title}>🛡️ Admin Control Center</Text>
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>SUPERUSER ACCESS</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            User management, role-based access control, account security, and data governance.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, refreshing && styles.disabledButton]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Text style={styles.refreshButtonText}>{refreshing ? 'Refreshing...' : '🔄 Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {/* Alert Notices */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage(null)}>
            <Text style={styles.closeAlertText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {successMessage && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ {successMessage}</Text>
          <TouchableOpacity onPress={() => setSuccessMessage(null)}>
            <Text style={styles.closeAlertText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Generated Invite Link Card (Highlighted) */}
      {generatedInviteLink && (
        <View style={styles.inviteHighlightCard}>
          <View style={styles.inviteHighlightHeader}>
            <Text style={styles.inviteHighlightTitle}>🔗 Activation / Reset Link Ready</Text>
            <Text style={styles.inviteHighlightSubtitle}>
              Share this link securely with the user. It allows them to set their own password and expires in 7 days.
            </Text>
          </View>
          <View style={styles.inviteLinkRow}>
            <TextInput
              style={styles.inviteLinkInput}
              value={generatedInviteLink}
              editable={false}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={[styles.copyButton, copiedLink && styles.copiedButton]}
              onPress={() => copyToClipboard(generatedInviteLink)}
            >
              <Text style={styles.copyButtonText}>{copiedLink ? '✓ Copied!' : '📋 Copy Link'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Overview Metrics Cards */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Users</Text>
          <Text style={styles.metricValue}>{metrics.total}</Text>
          <Text style={styles.metricSub}>Registered Accounts</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#ef4444' }]}>
          <Text style={styles.metricLabel}>Admins</Text>
          <Text style={[styles.metricValue, { color: '#b91c1c' }]}>{metrics.admins}</Text>
          <Text style={styles.metricSub}>Full Security Control</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#3b82f6' }]}>
          <Text style={styles.metricLabel}>Analysts</Text>
          <Text style={[styles.metricValue, { color: '#1d4ed8' }]}>{metrics.analysts}</Text>
          <Text style={styles.metricSub}>Data Ingestion & Edit</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#22c55e' }]}>
          <Text style={styles.metricLabel}>Viewers</Text>
          <Text style={[styles.metricValue, { color: '#15803d' }]}>{metrics.viewers}</Text>
          <Text style={styles.metricSub}>Read-Only Access</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#f59e0b' }]}>
          <Text style={styles.metricLabel}>Pending Invites</Text>
          <Text style={[styles.metricValue, { color: '#b45309' }]}>{metrics.pending}</Text>
          <Text style={styles.metricSub}>Awaiting Activation</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#6b7280' }]}>
          <Text style={styles.metricLabel}>Locked / Inactive</Text>
          <Text style={[styles.metricValue, { color: '#4b5563' }]}>{metrics.lockedOrSuspended}</Text>
          <Text style={styles.metricSub}>Suspended or Rate-Limited</Text>
        </View>
      </View>

      {/* Section 1: Invite / Provision New User */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>➕ Provision & Invite Users</Text>
            <Text style={styles.cardSubtitle}>
              Invite team members via a 7-day self-service activation link, or provision directly.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setShowDirectModal(true)}
          >
            <Text style={styles.secondaryButtonText}>⚡ Direct Password Setup</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.provisionForm}>
          <View style={styles.formRow}>
            <View style={{ flex: 2 }}>
              <Text style={styles.inputLabel}>Team Member Email</Text>
              <TextInput
                style={styles.textInput}
                placeholder="colleague@organization.org"
                placeholderTextColor="#94a3b8"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={{ flex: 1.5 }}>
              <Text style={styles.inputLabel}>Assigned Role</Text>
              <View style={styles.rolePickerRow}>
                {(['viewer', 'analyst', 'admin'] as const).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.rolePill, inviteRole === r && styles.rolePillActive]}
                    onPress={() => setInviteRole(r)}
                  >
                    <Text style={[styles.rolePillText, inviteRole === r && styles.rolePillTextActive]}>
                      {r.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={[styles.primaryButton, inviteLoading && styles.disabledButton]}
                onPress={handleInviteUser}
                disabled={inviteLoading}
              >
                {inviteLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Generate Invite Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Section 2: User Directory & Security Management */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>👥 Team Directory & Access Control</Text>
            <Text style={styles.cardSubtitle}>
              Manage permissions, suspend/reactivate accounts, clear failed login locks, and re-issue credentials.
            </Text>
          </View>
          <Text style={styles.countBadge}>
            Showing {filteredUsers.length} of {users.length} users
          </Text>
        </View>

        {/* Search & Filter Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Search users by email..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Role Filter Pills */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Role:</Text>
            {(['ALL', 'admin', 'analyst', 'viewer'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, roleFilter === f && styles.filterPillActive]}
                onPress={() => setRoleFilter(f)}
              >
                <Text style={[styles.filterPillText, roleFilter === f && styles.filterPillTextActive]}>
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status Filter Pills */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Status:</Text>
            {(['ALL', 'active', 'pending', 'suspended', 'locked'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.filterPill, statusFilter === s && styles.filterPillActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.filterPillText, statusFilter === s && styles.filterPillTextActive]}>
                  {s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* User Table / Directory */}
        {loadingUsers ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading team accounts...</Text>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No matching accounts found</Text>
            <Text style={styles.emptySubtitle}>Adjust your search query or active filters to view users.</Text>
          </View>
        ) : (
          <View style={styles.tableContainer}>
            {filteredUsers.map(user => {
              const isSelf = (currentUser?.email || '').toLowerCase() === user.email.toLowerCase();
              const roleStyle = getRoleBadgeStyle(user.role);
              const isLocked = Boolean(user.is_locked);
              const isPending = Boolean(user.is_pending_invite);
              const isSuspended = user.status === 'suspended';
              const busyAction = busyUsers[user.id];

              return (
                <View key={user.id} style={[styles.userRow, isSuspended && styles.userRowSuspended]}>
                  {/* Left Column: User Identity & Badges */}
                  <View style={styles.userInfoCol}>
                    <View style={styles.userEmailRow}>
                      <Text style={[styles.userEmail, isSuspended && styles.textMuted]}>{user.email}</Text>
                      {isSelf && (
                        <View style={styles.selfBadge}>
                          <Text style={styles.selfBadgeText}>YOU</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.badgeRow}>
                      {/* Role Badge */}
                      <View style={[styles.badgePill, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
                        <Text style={[styles.badgePillText, { color: roleStyle.text }]}>
                          {user.role.toUpperCase()}
                        </Text>
                      </View>

                      {/* Status Badges */}
                      {isPending ? (
                        <View style={[styles.badgePill, styles.badgePending]}>
                          <Text style={styles.badgePendingText}>⏳ PENDING ACTIVATION</Text>
                        </View>
                      ) : isSuspended ? (
                        <View style={[styles.badgePill, styles.badgeSuspended]}>
                          <Text style={styles.badgeSuspendedText}>⛔ SUSPENDED</Text>
                        </View>
                      ) : (
                        <View style={[styles.badgePill, styles.badgeActive]}>
                          <Text style={styles.badgeActiveText}>✓ ACTIVE</Text>
                        </View>
                      )}

                      {/* Locked Badge */}
                      {isLocked && (
                        <View style={[styles.badgePill, styles.badgeLocked]}>
                          <Text style={styles.badgeLockedText}>🔒 LOCKED ({user.failed_attempts} FAILED)</Text>
                        </View>
                      )}
                    </View>

                    {/* Metadata Subtitle */}
                    <Text style={styles.userMeta}>
                      Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'} • Last Login: {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                    </Text>
                  </View>

                  {/* Middle Column: Role Selector */}
                  <View style={styles.roleCol}>
                    <Text style={styles.colLabel}>Change Role:</Text>
                    <View style={styles.miniRoleRow}>
                      {(['viewer', 'analyst', 'admin'] as const).map(r => (
                        <TouchableOpacity
                          key={r}
                          disabled={busyAction !== undefined || (isSelf && user.role === 'admin' && r !== 'admin')}
                          style={[
                            styles.miniRolePill,
                            user.role === r && styles.miniRolePillActive,
                            (isSelf && user.role === 'admin' && r !== 'admin') && styles.disabledButton
                          ]}
                          onPress={() => handleChangeRole(user, r)}
                        >
                          <Text style={[styles.miniRoleText, user.role === r && styles.miniRoleTextActive]}>
                            {r.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Right Column: Security Action Buttons */}
                  <View style={styles.actionCol}>
                    {busyAction ? (
                      <View style={styles.busyContainer}>
                        <ActivityIndicator size="small" color="#2563eb" />
                        <Text style={styles.busyText}>{busyAction}...</Text>
                      </View>
                    ) : (
                      <View style={styles.actionButtonsRow}>
                        {/* Unlock Button if locked */}
                        {isLocked && (
                          <TouchableOpacity
                            style={styles.unlockButton}
                            onPress={() => handleUnlockUser(user)}
                          >
                            <Text style={styles.unlockButtonText}>🔓 Unlock</Text>
                          </TouchableOpacity>
                        )}

                        {/* Status Toggle (Suspend / Reactivate) */}
                        {!isSelf && (
                          <TouchableOpacity
                            style={[styles.actionBtn, isSuspended ? styles.activateBtn : styles.suspendBtn]}
                            onPress={() => handleToggleStatus(user)}
                          >
                            <Text style={[styles.actionBtnText, isSuspended ? styles.activateBtnText : styles.suspendBtnText]}>
                              {isSuspended ? 'Reactivate' : 'Suspend'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Re-issue Link / Reset */}
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleReissueInvite(user)}
                        >
                          <Text style={styles.actionBtnText}>🔗 Reset Link</Text>
                        </TouchableOpacity>

                        {/* Direct Password Modal Trigger */}
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => {
                            setResetModalUser(user);
                            setNewPassword('');
                          }}
                        >
                          <Text style={styles.actionBtnText}>🔑 Set PW</Text>
                        </TouchableOpacity>

                        {/* Delete User */}
                        {!isSelf && (
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDeleteUser(user)}
                          >
                            <Text style={styles.deleteBtnText}>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Section 3: Data Lifecycle & Database Maintenance */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>⚙️ Data Lifecycle & Maintenance</Text>
            <Text style={styles.cardSubtitle}>
              Execute automated 1-year retention rollups or perform database resets.
            </Text>
          </View>
        </View>

        {purgeResult && (
          <View style={styles.purgeResultBox}>
            <Text style={styles.purgeResultText}>✓ {purgeResult}</Text>
          </View>
        )}

        <View style={styles.maintenanceRow}>
          <View style={styles.maintenanceCol}>
            <Text style={styles.maintenanceHeading}>1-Year Retention Policy Sweep</Text>
            <Text style={styles.maintenanceDesc}>
              Archives inactive historical bookings older than 365 days into permanent rollup metrics and frees staging records.
            </Text>
            <TouchableOpacity
              style={[styles.purgeButton, purgeLoading && styles.disabledButton]}
              disabled={purgeLoading}
              onPress={handleRunPurge}
            >
              {purgeLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.purgeButtonText}>🧹 Run 1-Year Retention Purge & Rollup</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.maintenanceCol, { borderTopWidth: Platform.OS === 'web' ? 0 : 1, borderTopColor: '#e2e8f0' }]}>
            <Text style={styles.maintenanceHeading}>Database Reset (Destructive)</Text>
            <Text style={styles.maintenanceDesc}>
              Clears all dynamic records and cascades through all normalized tables (detainees, charges, detentions, correspondence).
            </Text>
            <TouchableOpacity
              style={[styles.clearButton, clearLoading && styles.disabledButton]}
              disabled={clearLoading}
              onPress={handleClearDatabase}
            >
              {clearLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.clearButtonText}>🗑️ Clear Database Records</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modal: Direct User Provisioning */}
      <Modal visible={showDirectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚡ Direct Account Provisioning</Text>
            <Text style={styles.modalSubtitle}>
              Create a new user account with a temporary password immediately.
            </Text>

            <Text style={styles.inputLabel}>User Email</Text>
            <TextInput
              style={styles.textInput}
              placeholder="user@example.org"
              placeholderTextColor="#94a3b8"
              value={directEmail}
              onChangeText={setDirectEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Initial Password (Min 8 chars)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={directPassword}
              onChangeText={setDirectPassword}
            />

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Role</Text>
            <View style={styles.rolePickerRow}>
              {(['viewer', 'analyst', 'admin'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rolePill, directRole === r && styles.rolePillActive]}
                  onPress={() => setDirectRole(r)}
                >
                  <Text style={[styles.rolePillText, directRole === r && styles.rolePillTextActive]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowDirectModal(false)}
                disabled={directLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, directLoading && styles.disabledButton]}
                onPress={handleDirectProvision}
                disabled={directLoading}
              >
                {directLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Manual Password Reset */}
      <Modal visible={resetModalUser !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔑 Direct Password Reset</Text>
            <Text style={styles.modalSubtitle}>
              Assign a new password for account: <Text style={{ fontWeight: '700' }}>{resetModalUser?.email}</Text>
            </Text>

            <Text style={styles.inputLabel}>New Password (Min 8 characters)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setResetModalUser(null)}
                disabled={resetLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, resetLoading && styles.disabledButton]}
                onPress={handleDirectPasswordReset}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  adminBadge: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: '#991b1b',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  refreshButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  closeAlertText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  inviteHighlightCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 16,
  },
  inviteHighlightHeader: {
    marginBottom: 10,
  },
  inviteHighlightTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
  },
  inviteHighlightSubtitle: {
    fontSize: 13,
    color: '#3b82f6',
    marginTop: 2,
  },
  inviteLinkRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inviteLinkInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1e3a8a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  copiedButton: {
    backgroundColor: '#16a34a',
  },
  copyButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    borderRadius: 10,
    padding: 14,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  provisionForm: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 10,
    padding: 16,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rolePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  rolePillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  rolePillTextActive: {
    color: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchContainer: {
    flex: 1,
    minWidth: 240,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  clearSearchButton: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  clearSearchText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  filterPillActive: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  tableContainer: {
    gap: 12,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  userRowSuspended: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    opacity: 0.85,
  },
  userInfoCol: {
    flex: 2,
    minWidth: 260,
  },
  userEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  userEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  textMuted: {
    color: '#64748b',
  },
  selfBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  badgeActiveText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
  },
  badgePending: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  badgePendingText: {
    color: '#a16207',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSuspended: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  badgeSuspendedText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeLocked: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  badgeLockedText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  userMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  roleCol: {
    flex: 1,
    minWidth: 170,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  miniRoleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  miniRolePill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  miniRolePillActive: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  miniRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  miniRoleTextActive: {
    color: '#ffffff',
  },
  actionCol: {
    flex: 1.5,
    minWidth: 240,
    alignItems: 'flex-end',
  },
  busyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  busyText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  unlockButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  unlockButtonText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  suspendBtn: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  suspendBtnText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '600',
  },
  activateBtn: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  activateBtnText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  deleteBtnText: {
    fontSize: 12,
  },
  maintenanceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  maintenanceCol: {
    flex: 1,
    minWidth: 260,
    gap: 10,
    paddingTop: 10,
  },
  maintenanceHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  maintenanceDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  purgeButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  purgeButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  purgeResultBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  purgeResultText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 13,
  },
  clearButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
});
