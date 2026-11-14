import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { loginUser, registerUser } from '../services/dataService';

interface AuthViewProps {
  onLoginSuccess: () => void;
}

export function AuthView({ onLoginSuccess }: AuthViewProps) {
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<string>('viewer');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMsg(null);
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        await registerUser(email, password, role);
        setSuccessMsg('Account created successfully! You can now log in.');
        setIsRegistering(false);
      } else {
        await loginUser(email, password);
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Aildata Security Portal</Text>
        <Text style={styles.subtitle}>
          {isRegistering ? 'Create a Cloudflare D1 Account' : 'Sign in to access your secure workspace'}
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}
        {successMsg && <Text style={styles.successText}>{successMsg}</Text>}

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. user@aildata.org"
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

        {isRegistering && (
          <>
            <Text style={styles.label}>Role (RBAC)</Text>
            <View style={styles.roleContainer}>
              {['viewer', 'analyst', 'admin'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleButton, role === r && styles.activeRoleButton]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleText, role === r && styles.activeRoleText]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isRegistering ? 'Register Account' : 'Sign In'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => {
            setIsRegistering(!isRegistering);
            setError(null);
            setSuccessMsg(null);
          }}
        >
          <Text style={styles.switchText}>
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </Text>
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
    maxWidth: 420,
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
    marginBottom: 24,
    textAlign: 'center'
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
  successText: {
    backgroundColor: '#dcfce7',
    color: '#166534',
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
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  activeRoleButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  activeRoleText: {
    color: '#ffffff'
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
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center'
  },
  switchText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '500'
  }
});
