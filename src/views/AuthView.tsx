import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { loginUser, registerUser, getSetupStatus, validateInvite, activateAccount } from '../services/dataService';

interface AuthViewProps {
  onLoginSuccess: () => void;
}

export function AuthView({ onLoginSuccess }: AuthViewProps) {
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [checkingSetup, setCheckingSetup] = useState<boolean>(true);

  // Invite Flow State
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Check for ?invite=token in browser URL
    let tokenFromUrl: string | null = null;
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      tokenFromUrl = searchParams.get('invite');
      if (!tokenFromUrl && window.location.hash.includes('invite=')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || window.location.hash.substring(1));
        tokenFromUrl = hashParams.get('invite');
      }
    }

    if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
      validateInvite(tokenFromUrl)
        .then(res => {
          if (!isMounted) return;
          if (res.valid && res.email) {
            setInviteEmail(res.email);
            setInviteRole(res.role || 'viewer');
          } else {
            setInviteError(res.error || 'Invitation link is invalid or expired.');
          }
          setCheckingSetup(false);
        })
        .catch(() => {
          if (isMounted) {
            setInviteError('Failed to validate invitation link.');
            setCheckingSetup(false);
          }
        });
      return () => { isMounted = false; };
    }

    // Normal setup check if no invite token
    getSetupStatus()
      .then(res => {
        if (isMounted) {
          setNeedsSetup(res.needsSetup);
          setCheckingSetup(false);
        }
      })
      .catch(() => {
        if (isMounted) setCheckingSetup(false);
      });

    return () => { isMounted = false; };
  }, []);

  const handleActivateSubmit = async () => {
    setError(null);
    if (!password || !confirmPassword) {
      setError('Please choose and confirm your password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!inviteToken) return;

    setLoading(true);
    try {
      await activateAccount(inviteToken, password);
      // Clean query parameter from browser address bar
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStandardSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (needsSetup) {
        // First-use initial administrator onboarding
        await registerUser(email, password, 'admin');
        onLoginSuccess();
      } else {
        // Standard user login
        await loginUser(email, password);
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // 1. Invite Error View
  if (inviteToken && inviteError) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Aildata Security Portal</Text>
          <Text style={styles.subtitle}>Invitation Link Expired or Invalid</Text>
          <Text style={styles.errorText}>{inviteError}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setInviteToken(null);
              setInviteError(null);
              if (typeof window !== 'undefined' && window.history) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }}
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 2. Invite Activation View (User sets their own password)
  if (inviteToken && inviteEmail) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Aildata Account Activation</Text>
          <Text style={styles.subtitle}>
            Welcome! You have been invited to join Aildata. Create your password to activate your account.
          </Text>

          <View style={styles.inviteBadge}>
            <Text style={styles.inviteBadgeText}>
              Account: <Text style={{ fontWeight: '700' }}>{inviteEmail}</Text> • Role: <Text style={{ fontWeight: '700' }}>{(inviteRole || 'viewer').toUpperCase()}</Text>
            </Text>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Text style={styles.label}>Choose Your Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Minimum 8 characters"
            placeholderTextColor="#888"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Repeat your password"
            placeholderTextColor="#888"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity style={styles.button} onPress={handleActivateSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Activate Account & Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 3. Standard Login / First-Time Admin Setup View
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Aildata Security Portal</Text>
        <Text style={styles.subtitle}>
          {needsSetup 
            ? 'First-Time Setup: Create Initial Administrator Account'
            : 'Sign in to access your secure workspace'}
        </Text>

        {needsSetup && (
          <View style={styles.setupBanner}>
            <Text style={styles.setupBannerText}>
              🛡️ No administrator account detected. The first registered account is automatically granted root Administrator privileges.
            </Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. admin@aildata.org"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••••••"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleStandardSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {needsSetup ? 'Create Administrator Account' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  inviteBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  inviteBadgeText: {
    color: '#166534',
    fontSize: 13,
    textAlign: 'center',
  },
  setupBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  setupBannerText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center'
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 16
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  }
});
