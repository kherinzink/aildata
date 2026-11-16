import React from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import Svg, { Rect, Line, Circle, Path, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';

// ============================================================================
// 1. Bar Chart (Vertical)
// ============================================================================
export interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  barColor?: string;
  valueSuffix?: string;
}

export function BarChart({ data, height = 180, barColor = '#2563eb', valueSuffix = '' }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const chartHeight = height - 40; // reserve 40px for labels
  const barWidth = Math.min(32, Math.max(16, 220 / data.length));
  const svgWidth = Math.max(260, data.length * (barWidth + 18) + 30);

  return (
    <View style={styles.chartWrapper}>
      <Svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`}>
        {/* Baseline grid */}
        <Line x1="10" y1={chartHeight} x2={svgWidth - 10} y2={chartHeight} stroke="#cbd5e1" strokeWidth="1" />
        
        {data.map((item, index) => {
          const x = 20 + index * ((svgWidth - 40) / data.length);
          const barH = (item.value / maxValue) * (chartHeight - 30);
          const y = chartHeight - barH;
          const color = item.color || barColor;

          return (
            <G key={`bar-${index}`}>
              {/* Value on top */}
              <SvgText
                x={x + barWidth / 2}
                y={Math.max(14, y - 6)}
                fill="#475569"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
              >
                {item.value}{valueSuffix}
              </SvgText>

              {/* Bar rectangle */}
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 3)}
                rx="4"
                fill={color}
              />

              {/* X-axis Label */}
              <SvgText
                x={x + barWidth / 2}
                y={height - 10}
                fill="#64748b"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                {item.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ============================================================================
// 2. Line Chart (Intake Trend / Velocity)
// ============================================================================
export interface LineDataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineDataPoint[];
  height?: number;
  strokeColor?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function LineChart({
  data,
  height = 190,
  strokeColor = '#0284c7',
  valuePrefix = '',
  valueSuffix = '/day'
}: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const values = data.map(d => d.value);
  const maxValue = Math.max(...values, 1);
  const chartHeight = height - 44;
  const paddingX = 35;
  const svgWidth = Math.max(300, data.length * 60);

  // Compute (x, y) coordinates for each data point
  const points = data.map((d, i) => {
    const x = paddingX + i * ((svgWidth - paddingX * 2) / Math.max(data.length - 1, 1));
    const y = chartHeight - (d.value / maxValue) * (chartHeight - 35) + 10;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

  return (
    <View style={styles.chartWrapper}>
      <Svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`}>
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Horizontal gridlines */}
        <Line x1={paddingX} y1={chartHeight} x2={svgWidth - paddingX} y2={chartHeight} stroke="#cbd5e1" strokeWidth="1" />
        <Line x1={paddingX} y1={chartHeight / 2} x2={svgWidth - paddingX} y2={chartHeight / 2} stroke="#f1f5f9" strokeDasharray="4,4" strokeWidth="1" />

        {/* Shaded Area Under Line */}
        <Path d={areaD} fill="url(#lineGrad)" />

        {/* Trend Line */}
        <Path d={pathD} fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points & labels */}
        {points.map((p, i) => (
          <G key={`point-${i}`}>
            <Circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke={strokeColor} strokeWidth="2.5" />
            
            {/* Value Callout on top */}
            <SvgText
              x={p.x}
              y={Math.max(12, p.y - 10)}
              fill="#0f172a"
              fontSize="10"
              fontWeight="700"
              textAnchor="middle"
            >
              {valuePrefix}{p.value}{valueSuffix}
            </SvgText>

            {/* X-axis Label */}
            <SvgText
              x={p.x}
              y={height - 8}
              fill="#64748b"
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
            >
              {p.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

// ============================================================================
// 3. Donut / Pie Chart (Proportions & Origins)
// ============================================================================
export interface SliceDataPoint {
  label: string;
  value: number;
  percentage?: number;
  color: string;
}

interface DonutChartProps {
  data: SliceDataPoint[];
  size?: number;
  centerTitle?: string;
  centerSubtitle?: string;
}

const DEFAULT_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export function DonutChart({
  data,
  size = 180,
  centerTitle,
  centerSubtitle = 'TOTAL'
}: DonutChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height: size }]}>
        <Text style={styles.emptyText}>No distribution data</Text>
      </View>
    );
  }

  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const radius = size / 2;
  const strokeWidth = 26;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  // Calculate stroke dash offsets
  let accumulatedPercent = 0;
  const slices = data.map((item, idx) => {
    const percent = item.percentage !== undefined ? item.percentage / 100 : item.value / total;
    const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
    const strokeDashoffset = -circumference * accumulatedPercent;
    accumulatedPercent += percent;
    const color = item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];

    return {
      ...item,
      color,
      percentStr: `${(percent * 100).toFixed(1)}%`,
      strokeDasharray,
      strokeDashoffset
    };
  });

  return (
    <View style={styles.donutContainer}>
      <View style={{ width: size, height: size, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${radius}, ${radius}`}>
            {slices.map((slice, i) => (
              <Circle
                key={`slice-${i}`}
                cx={radius}
                cy={radius}
                r={normalizedRadius}
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                fill="none"
              />
            ))}
          </G>
        </Svg>

        {/* Center hole text */}
        <View style={styles.donutCenter}>
          <Text style={styles.donutCenterTitle}>
            {centerTitle !== undefined ? centerTitle : total}
          </Text>
          <Text style={styles.donutCenterSubtitle}>{centerSubtitle}</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.donutLegend}>
        {slices.map((slice, i) => (
          <View key={`legend-${i}`} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: slice.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{slice.label}</Text>
            <Text style={styles.legendCount}>
              {slice.value} <Text style={styles.legendPercent}>({slice.percentStr})</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// 4. Horizontal Progress / Bar Gauge (Age Groups)
// ============================================================================
interface HorizontalGaugeProps {
  data: { label: string; count: number; percentage: number; color?: string }[];
}

export function HorizontalBarGauge({ data }: HorizontalGaugeProps) {
  if (!data || data.length === 0) {
    return <Text style={styles.emptyText}>No distribution data</Text>;
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <View style={styles.gaugeContainer}>
      {data.map((item, idx) => {
        const color = item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
        const barWidthPercent = `${Math.max(5, (item.count / maxCount) * 100)}%`;

        return (
          <View key={`gauge-${idx}`} style={styles.gaugeRow}>
            <View style={styles.gaugeLabelCol}>
              <Text style={styles.gaugeLabel}>{item.label}</Text>
            </View>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: barWidthPercent as any, backgroundColor: color }]} />
            </View>
            <View style={styles.gaugeValueCol}>
              <Text style={styles.gaugeValue}>{item.count}</Text>
              <Text style={styles.gaugeSub}>({item.percentage}%)</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrapper: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 4,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  donutContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  donutCenterSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  donutLegend: {
    flex: 1,
    minWidth: 160,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  legendCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  legendPercent: {
    fontSize: 11,
    fontWeight: '400',
    color: '#64748b',
  },
  gaugeContainer: {
    gap: 10,
    paddingVertical: 4,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeLabelCol: {
    width: 80,
  },
  gaugeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  gaugeTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 6,
  },
  gaugeValueCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 65,
    justifyContent: 'flex-end',
  },
  gaugeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  gaugeSub: {
    fontSize: 11,
    color: '#64748b',
  },
});
