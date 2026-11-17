import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { DynamicRecord, clearDatabase, deleteCategoryRecords, registerUser, inviteUser, getDashboardStats, runRetentionPurge, DashboardStats } from '../services/dataService';
import { BarChart, LineChart, DonutChart, HorizontalBarGauge } from '../components/Charts';
import { DatePickerInput, parseISODate } from '../components/DatePicker';

interface DashboardViewProps {
  records: DynamicRecord[];
  storageMode: string;
  tables: string[];
  currentUser?: { email?: string | null; role?: string | null } | null;
  onDataChanged: () => void;
}

export function DashboardView({ records, storageMode, tables, currentUser, onDataChanged }: DashboardViewProps) {
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';

  // Server Stats State
  const [serverStats, setServerStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Dynamic As-of Cutoff Date State
  const [asOfDate, setAsOfDate] = useState<string>('');

  // Admin User Invitation State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState<'viewer' | 'analyst' | 'admin'>('analyst');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Admin Retention Purge State
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  // Fetch Server-side /api/stats
  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const data = await getDashboardStats();
      setServerStats(data);
    } catch {
      // Fallback gracefully to client-side record calculations if offline or unauthenticated
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [records]);

  // Extract unique categories / imported sheets
  const categories = useMemo(() => {
    const cats = new Set<string>();
    records.forEach(r => cats.add(r.category));
    return Array.from(cats);
  }, [records]);

  // Fallback Client Calculations if Server Stats are unavailable
  const fallbackAnalytics = useMemo(() => {
    const countries: { [key: string]: number } = {};
    const agencies: { [key: string]: number } = {};
    const sexes: { [key: string]: number } = {};
    
    let currentCount = 0;
    let releasedCount = 0;
    let currentWithPenpalCount = 0;
    const cutoffDate = asOfDate ? (parseISODate(asOfDate) || new Date()) : new Date();

    records.forEach(r => {
      try {
        const data = JSON.parse(r.dataJson);
        
        const country = data['Country'] || data['COO'] || 'Unknown';
        if (country && String(country).trim()) {
          countries[String(country).trim()] = (countries[String(country).trim()] || 0) + 1;
        }

        const agency = data['Delivering Agency'] || 'Unknown';
        if (agency && String(agency).trim()) {
          agencies[String(agency).trim()] = (agencies[String(agency).trim()] || 0) + 1;
        }

        const sex = data['Sex'] || 'Unknown';
        if (sex && String(sex).trim()) {
          sexes[String(sex).trim()] = (sexes[String(sex).trim()] || 0) + 1;
        }

        let depDateStr = '';
        for (const [k, v] of Object.entries(data)) {
          const lKey = k.toLowerCase();
          if ((lKey.includes('departure') || lKey.includes('release') || lKey.includes('dep date')) && v !== null && v !== undefined && String(v).trim() !== '') {
            depDateStr = String(v);
            break;
          }
        }

        let isCurrent = false;
        if (!depDateStr || depDateStr.trim() === '' || depDateStr.toLowerCase() === 'present' || depDateStr.toLowerCase() === 'today' || depDateStr.toLowerCase() === 'ongoing') {
          isCurrent = true;
          currentCount++;
        } else {
          const depDate = new Date(depDateStr);
          if (isNaN(depDate.getTime())) {
            isCurrent = true;
            currentCount++;
          } else if (depDate <= cutoffDate) {
            releasedCount++;
          } else {
            isCurrent = true;
            currentCount++;
          }
        }

        let hasPenpal = false;
        for (const [k, v] of Object.entries(data)) {
          if (k.toLowerCase().includes('penpal') && v !== null && v !== undefined && String(v).trim() !== '') {
            hasPenpal = true;
            break;
          }
        }

        if (isCurrent && hasPenpal) {
          currentWithPenpalCount++;
        }
      } catch {
        currentCount++;
      }
    });

    const topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];
    const topAgencies = Object.entries(agencies).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];
    const sexDistribution = Object.entries(sexes).sort((a, b) => b[1] - a[1]) as [string, number][];
    const penpalPercentage = currentCount > 0 ? ((currentWithPenpalCount / currentCount) * 100).toFixed(1) : '0.0';

    return { topCountries, topAgencies, sexDistribution, currentCount, releasedCount, penpalPercentage };
  }, [records, asOfDate]);

  // Unified Analytics Values (Server preferenced unless custom as-of cutoff date is selected)
  const activeCount = asOfDate ? fallbackAnalytics.currentCount : (serverStats ? serverStats.currentCount : fallbackAnalytics.currentCount);
  const releasedCount = asOfDate ? fallbackAnalytics.releasedCount : (serverStats ? serverStats.releasedCount : fallbackAnalytics.releasedCount);
  const penpalPercent = serverStats 
    ? (serverStats.currentCount > 0 ? ((serverStats.withPenpalCount / serverStats.currentCount) * 100).toFixed(1) : '0.0')
    : fallbackAnalytics.penpalPercentage;
  const topCountries = serverStats ? serverStats.topCountries : fallbackAnalytics.topCountries;
  const topAgencies = serverStats ? serverStats.topAgencies : fallbackAnalytics.topAgencies;
  const sexDistribution = serverStats ? serverStats.sexDistribution : fallbackAnalytics.sexDistribution;

  // Chart data: Removals in last 6 months (by month)
  const removalsChartData = useMemo(() => {
    if (serverStats?.removalsByMonth && serverStats.removalsByMonth.length > 0) {
      return serverStats.removalsByMonth.map(r => ({
        label: r.month,
        value: r.count
      }));
    }
    return [];
  }, [serverStats]);

  // Chart data: Average new bookings per day per month (Intake velocity)
  const intakeVelocityChartData = useMemo(() => {
    if (serverStats?.intakeVelocity && serverStats.intakeVelocity.length > 0) {
      return serverStats.intakeVelocity.map(r => ({
        label: r.month,
        value: r.avgPerDay
      }));
    }
    return [];
  }, [serverStats]);

  // Chart data: Age group distribution
  const ageDistributionData = useMemo(() => {
    if (serverStats?.ageDistribution && serverStats.ageDistribution.length > 0) {
      return serverStats.ageDistribution.map(r => ({
        label: r.group,
        count: r.count,
        percentage: r.percentage
      }));
    }
    return [];
  }, [serverStats]);

  // Chart data: Origin (Country of Origin) Donut Chart
  const originChartData = useMemo(() => {
    if (serverStats?.originDistribution && serverStats.originDistribution.length > 0) {
      const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
      return serverStats.originDistribution.map((r, i) => ({
        label: r.country,
        value: r.count,
        percentage: r.percentage,
        color: colors[i % colors.length]
      }));
    }
    return [];
  }, [serverStats]);

  const handleClearDatabase = async () => {
    if (!isAdmin) {
      alert('Only administrators can clear database records.');
      return;
    }
    const confirmClear = typeof window !== 'undefined' && window.confirm 
      ? window.confirm('Are you sure you want to clear all database records?') 
      : true;

    if (confirmClear) {
      try {
        await clearDatabase();
        await onDataChanged();
        await loadStats();
        alert('Database cleared successfully.');
      } catch (e: any) {
        alert(`Failed to clear database: ${e.message}`);
      }
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (!isAdmin) return;
    const confirmDelete = typeof window !== 'undefined' && window.confirm 
      ? window.confirm(`Are you sure you want to delete all records for imported sheet "${cat}"?`) 
      : true;

    if (confirmDelete) {
      try {
        await deleteCategoryRecords(cat);
        await onDataChanged();
        await loadStats();
        alert(`Successfully deleted records for "${cat}".`);
      } catch (e: any) {
        alert(`Failed to delete records: ${e.message}`);
      }
    }
  };

  const handleInviteUser = async () => {
    setAdminMessage(null);
    setAdminError(null);
    setInviteLink(null);
    setCopied(false);

    if (!adminEmail.trim()) {
      setAdminError('Email address is required to invite a team member.');
      return;
    }

    setAdminLoading(true);
    try {
      const res = await inviteUser(adminEmail.trim(), adminRole);
      const origin = typeof window !== 'undefined' && window.location?.origin 
        ? window.location.origin 
        : 'https://aildata.khanis.workers.dev';
      const fullLink = `${origin}/?invite=${res.inviteToken}`;
      setInviteLink(fullLink);
      setAdminMessage(`Invitation generated for ${res.email} (${res.role.toUpperCase()}). The link is valid for 7 days.`);
      setAdminEmail('');
    } catch (e: any) {
      setAdminError(e.message || 'Failed to generate invitation link');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteLink) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } else {
      alert(`Copy this activation link:\n${inviteLink}`);
    }
  };

  const handleRunPurge = async () => {
    if (!isAdmin) return;
    const confirmPurge = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Execute 1-year retention purge and snapshot aggregate metrics into aggregate_rollups?')
      : true;

    if (!confirmPurge) return;

    setPurgeLoading(true);
    setPurgeResult(null);
    try {
      const res = await runRetentionPurge();
      const info = res.result;
      setPurgeResult(
        `Purge Completed: ${info.purgedDetentionsCount} detentions, ${info.purgedDetaineesCount} orphaned detainees, and ${info.purgedDynamicRecordsCount} raw staging rows purged (>1 year). Snapshot date: ${info.snapshotDate}`
      );
      await onDataChanged();
      await loadStats();
    } catch (e: any) {
      alert(`Purge failed: ${e.message}`);
    } finally {
      setPurgeLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>System Overview & Custody Analytics</Text>
        {statsLoading && <ActivityIndicator size="small" color="#2563eb" />}
      </View>

      {/* Dynamic As-Of Cutoff Date Bar */}
      <View style={styles.cutoffBar}>
        <View style={styles.cutoffLeft}>
          <Text style={styles.cutoffLabel}>📅 Analytics Cutoff Date:</Text>
          <Text style={styles.cutoffDesc}>
            {asOfDate ? `Viewing custody metrics calculated as of ${asOfDate}` : 'Viewing live custody status (current date)'}
          </Text>
        </View>
        <View style={styles.cutoffRight}>
          <DatePickerInput
            value={asOfDate}
            onChange={setAsOfDate}
            placeholder="Live / Today"
            compact
            allowClear
            title="Select Analytics Cutoff Date"
            style={{ width: 170 }}
          />
        </View>
      </View>
      
      {/* Top Metric Cards */}
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Records Ingested</Text>
          <Text style={styles.cardValue}>
            {serverStats ? serverStats.totalDynamic.toLocaleString() : records.length.toLocaleString()}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🟢 Current In Custody</Text>
          <Text style={[styles.cardValue, { color: '#166534' }]}>{activeCount.toLocaleString()}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔴 Released / Transferred</Text>
          <Text style={[styles.cardValue, { color: '#991b1b' }]}>{releasedCount.toLocaleString()}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✉️ Current with Penpals</Text>
          <Text style={[styles.cardValue, { color: '#2563eb' }]}>{penpalPercent}%</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: '#dc2626', borderLeftWidth: 4 }]}>
          <Text style={styles.cardTitle}>🚪 Removed (Last 6 Mo)</Text>
          <Text style={[styles.cardValue, { color: '#b91c1c' }]}>
            {serverStats?.removedLast6Months !== undefined ? serverStats.removedLast6Months.toLocaleString() : '-'}
          </Text>
        </View>
        <View style={[styles.card, { borderLeftColor: '#0284c7', borderLeftWidth: 4 }]}>
          <Text style={styles.cardTitle}>⚡ New / Day (Intake)</Text>
          <Text style={[styles.cardValue, { color: '#0369a1' }]}>
            {serverStats?.intakeVelocity && serverStats.intakeVelocity.length > 0
              ? `${serverStats.intakeVelocity[serverStats.intakeVelocity.length - 1].avgPerDay}/d`
              : '0.0/d'}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage Engine</Text>
          <Text style={styles.cardSubValue}>{storageMode}</Text>
        </View>
      </View>

      {/* Relational Entity Live Counts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🗄️ Normalized Relational Entities (Live D1 Counts)</Text>
        <View style={styles.badgeContainer}>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>
              detainees: <Text style={styles.tableBadgeHighlight}>{serverStats?.counts?.detainees ?? '-'}</Text>
            </Text>
          </View>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>
              detentions: <Text style={styles.tableBadgeHighlight}>{serverStats?.counts?.detentions ?? '-'}</Text>
            </Text>
          </View>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>
              charges: <Text style={styles.tableBadgeHighlight}>{serverStats?.counts?.charges ?? '-'}</Text>
            </Text>
          </View>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>
              legal_proceedings: <Text style={styles.tableBadgeHighlight}>{serverStats?.counts?.legal_proceedings ?? '-'}</Text>
            </Text>
          </View>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>
              correspondence: <Text style={styles.tableBadgeHighlight}>{serverStats?.counts?.correspondence ?? '-'}</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Visual Relational Analytics & Trends (Charts) */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.mainSectionTitle}>📊 Relational Analytics & Demographic Charts</Text>
        <Text style={styles.sectionSubtitle}>
          Computed exclusively from normalized relational entities in Cloudflare D1.
        </Text>
      </View>

      {/* Charts Row 1: Removals & Intake Velocity Trends */}
      <View style={styles.rowGrid}>
        {/* Metric 1: Removals in Last 6 Months (Bar Chart) */}
        <View style={styles.halfSection}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.sectionTitle}>🚪 Removed in Last 6 Months</Text>
            <View style={[styles.kpiPill, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
              <Text style={[styles.kpiPillText, { color: '#991b1b' }]}>
                {serverStats?.removedLast6Months ?? 0} Departed
              </Text>
            </View>
          </View>
          <Text style={styles.chartSubtitle}>Monthly departed detainees from normalized detentions</Text>
          <BarChart 
            data={removalsChartData} 
            barColor="#ef4444" 
            height={190} 
          />
        </View>

        {/* Metric 2: Average New Per Day Per Month (Line Chart) */}
        <View style={styles.halfSection}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.sectionTitle}>📈 Average New Per Day Per Month</Text>
            <View style={[styles.kpiPill, { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' }]}>
              <Text style={[styles.kpiPillText, { color: '#0369a1' }]}>
                {serverStats?.intakeVelocity && serverStats.intakeVelocity.length > 0 
                  ? `${serverStats.intakeVelocity[serverStats.intakeVelocity.length - 1].avgPerDay}/day` 
                  : '0.0/day'}
              </Text>
            </View>
          </View>
          <Text style={styles.chartSubtitle}>Intake velocity rate calculated from normalized book_date_gcj</Text>
          <LineChart 
            data={intakeVelocityChartData} 
            strokeColor="#0284c7" 
            height={190} 
            valueSuffix="/d"
          />
        </View>
      </View>

      {/* Charts Row 2: Stats by Age Group & Stats by Origin */}
      <View style={styles.rowGrid}>
        {/* Metric 3: Stats by Age Group (Horizontal Bar Gauge) */}
        <View style={styles.halfSection}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.sectionTitle}>🎂 Stats by Age Group</Text>
            <View style={[styles.kpiPill, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
              <Text style={[styles.kpiPillText, { color: '#b45309' }]}>
                {serverStats?.counts?.detainees ?? 0} Total
              </Text>
            </View>
          </View>
          <Text style={styles.chartSubtitle}>Proportional age breakdown across normalized detainee profiles</Text>
          <HorizontalBarGauge data={ageDistributionData} />
        </View>

        {/* Metric 4: Stats by Origin (Donut Chart) */}
        <View style={styles.halfSection}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.sectionTitle}>🌍 Stats by Origin (Country of Origin)</Text>
            <View style={[styles.kpiPill, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
              <Text style={[styles.kpiPillText, { color: '#15803d' }]}>Global COO</Text>
            </View>
          </View>
          <Text style={styles.chartSubtitle}>Country distribution of normalized subjects in custody</Text>
          <DonutChart 
            data={originChartData} 
            size={180} 
            centerTitle={String(serverStats?.counts?.detainees ?? 0)} 
            centerSubtitle="DETAINEES" 
          />
        </View>
      </View>

      {/* Column Aggregations */}
      <View style={styles.rowGrid}>
        {/* Top Countries */}
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>🌍 Top Countries of Origin (COO)</Text>
          {topCountries.length === 0 ? (
            <Text style={styles.emptyText}>No country data available.</Text>
          ) : (
            topCountries.map(([country, count]) => (
              <View key={country} style={styles.statRow}>
                <Text style={styles.statLabel}>{country}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>

        {/* Top Delivering Agencies */}
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>🏛️ Top Delivering Agencies</Text>
          {topAgencies.length === 0 ? (
            <Text style={styles.emptyText}>No agency data available.</Text>
          ) : (
            topAgencies.map(([agency, count]) => (
              <View key={agency} style={styles.statRow}>
                <Text style={styles.statLabel}>{agency}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Sex Distribution & Active Sheets */}
      <View style={styles.rowGrid}>
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>👥 Sex Distribution</Text>
          {sexDistribution.length === 0 ? (
            <Text style={styles.emptyText}>No demographic data available.</Text>
          ) : (
            sexDistribution.map(([sex, count]) => (
              <View key={sex} style={styles.statRow}>
                <Text style={styles.statLabel}>{sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : sex}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>📁 Raw Ingested Sheet Categories</Text>
          {isAdmin ? (
            <Text style={[styles.sectionDesc, { fontSize: 12, marginBottom: 8 }]}>
              Admin controls: click any sheet badge below to delete its records:
            </Text>
          ) : (
            <Text style={[styles.sectionDesc, { fontSize: 12, marginBottom: 8 }]}>
              Currently imported sheet categories:
            </Text>
          )}
          
          <View style={styles.badgeContainer}>
            {categories.length === 0 ? (
              <Text style={styles.emptyText}>No imported sheets yet.</Text>
            ) : (
              categories.map(cat => (
                <TouchableOpacity 
                  key={cat} 
                  style={[styles.categoryBadge, isAdmin && { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]} 
                  disabled={!isAdmin}
                  onPress={() => handleDeleteCategory(cat)}
                >
                  <Text style={[styles.categoryText, isAdmin && { color: '#991b1b' }]}>
                    {cat} ({records.filter(r => r.category === cat).length}) {isAdmin ? '🗑️' : ''}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </View>

      {/* Admin User Invitation Card */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Admin: Invite Team Member (One-Click Link)</Text>
          <Text style={styles.sectionDesc}>
            Generate a secure activation link with assigned permissions. The invited team member sets their own password.
          </Text>

          {adminError && <Text style={styles.errorText}>{adminError}</Text>}
          {adminMessage && <Text style={styles.successText}>{adminMessage}</Text>}

          {inviteLink && (
            <View style={styles.inviteLinkCard}>
              <Text style={styles.inviteLinkHeading}>🔗 Activation Link Generated:</Text>
              <TextInput
                style={styles.inviteLinkInput}
                value={inviteLink}
                editable={false}
                selectTextOnFocus
              />
              <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
                <Text style={styles.copyButtonText}>{copied ? '✓ Link Copied!' : '📋 Copy Invite Link'}</Text>
              </TouchableOpacity>
              <Text style={styles.inviteHelperText}>
                Send this link to the team member. When opened, they will be prompted to choose their own password to activate their account.
              </Text>
            </View>
          )}

          <View style={styles.provisionForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Team Member Email</Text>
              <TextInput
                style={styles.adminInput}
                placeholder="colleague@aildata.org"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={adminEmail}
                onChangeText={setAdminEmail}
              />
            </View>

            <Text style={styles.inputLabel}>Assigned Role</Text>
            <View style={styles.rolePickerRow}>
              {(['viewer', 'analyst', 'admin'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rolePill, adminRole === r && styles.activeRolePill]}
                  onPress={() => setAdminRole(r)}
                >
                  <Text style={[styles.rolePillText, adminRole === r && styles.activeRolePillText]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              style={[styles.provisionButton, adminLoading && styles.disabledButton]} 
              disabled={adminLoading} 
              onPress={handleInviteUser}
            >
              {adminLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.provisionButtonText}>Generate Invitation Link</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Database Maintenance & Ephemeral Retention (Admin Only) */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ Data Lifecycle & Database Maintenance</Text>
          <Text style={styles.sectionDesc}>
            Manage automatic retention policies, permanent rollup snapshots, and raw staging data.
          </Text>

          {purgeResult && (
            <View style={styles.purgeResultBox}>
              <Text style={styles.purgeResultText}>✓ {purgeResult}</Text>
            </View>
          )}

          <View style={styles.actionRow}>
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

            <TouchableOpacity style={styles.clearButton} onPress={handleClearDatabase}>
              <Text style={styles.clearButtonText}>🗑️ Clear Database Records</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  cutoffBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cutoffLeft: {
    flex: 1,
    minWidth: 200,
  },
  cutoffLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  cutoffDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cutoffRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  rowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  halfSection: {
    flex: 1,
    minWidth: 300,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  cardSubValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  sectionHeaderRow: {
    marginTop: 6,
    marginBottom: 16,
  },
  mainSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  chartTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 14,
  },
  kpiPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  kpiPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  statCount: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 13,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  categoryText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '500',
  },
  tableBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tableBadgeText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '500',
  },
  tableBadgeHighlight: {
    color: '#2563eb',
    fontWeight: '700',
  },
  provisionForm: {
    gap: 12,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    minWidth: 200,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  adminInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  rolePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  activeRolePill: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeRolePillText: {
    color: '#ffffff',
  },
  provisionButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  provisionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
  },
  successText: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
  },
  inviteLinkCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  inviteLinkHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1d4ed8',
    marginBottom: 6,
  },
  inviteLinkInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1e293b',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  copyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  inviteHelperText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  purgeButton: {
    backgroundColor: '#4338ca',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
  },
  purgeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  purgeResultBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
  },
  purgeResultText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
