import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export interface CountryDataPoint {
  country: string;
  count: number;
  percentage: number;
}

interface WorldHeatMapProps {
  data: CountryDataPoint[];
  height?: number;
}

export function WorldHeatMap({ data, height = 350 }: WorldHeatMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryDataPoint | null>(null);
  const [loadingMap, setLoadingMap] = useState<boolean>(true);

  const dataMap = new Map((data || []).map(d => [d.country.toLowerCase().trim(), d]));
  const maxCount = Math.max(...(data || []).map(d => d.count), 1);

  // Helper for sequential heat color ramp
  const getHeatColor = (count: number) => {
    if (!count || count === 0) return '#e2e8f0'; // Gray for countries with 0 data
    const ratio = count / maxCount;
    if (ratio > 0.75) return '#1e3a8a'; // Deep Navy
    if (ratio > 0.5) return '#2563eb';  // Royal Blue
    if (ratio > 0.25) return '#3b82f6'; // Medium Blue
    if (ratio > 0.1) return '#60a5fa';  // Light Blue
    return '#93c5fd';                  // Soft Tint
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setLoadingMap(false);
      return;
    }

    let isMounted = true;
    let leafletMap: any = null;

    try {
      const L = require('leaflet');
      // Ensure Leaflet CSS is present
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (mapContainerRef.current && !mapRef.current) {
        leafletMap = L.map(mapContainerRef.current, {
          center: [20, 0],
          zoom: 2,
          minZoom: 1,
          maxZoom: 6,
          attributionControl: false,
          maxBounds: [[-90, -180], [90, 180]],
          maxBoundsViscosity: 1.0,
        });

        // Add standard OpenStreetMap public tile layer with noWrap to prevent horizontal world repeating
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          subdomains: 'abc',
          noWrap: true,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(leafletMap);

        mapRef.current = leafletMap;

        // Fetch Natural Earth GeoJSON for accurate country shapes
        fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
          .then(res => res.json())
          .then(geojson => {
            if (!isMounted || !mapRef.current) return;

            L.geoJson(geojson, {
              style: (feature: any) => {
                const name = (feature.properties?.ADMIN || feature.properties?.name || '').toLowerCase().trim();
                // Match country name or common aliases
                let matched = dataMap.get(name);
                if (!matched) {
                  if (name.includes('mexico')) matched = dataMap.get('mexico');
                  else if (name.includes('colombia')) matched = dataMap.get('colombia');
                  else if (name.includes('guatemala')) matched = dataMap.get('guatemala');
                  else if (name.includes('honduras')) matched = dataMap.get('honduras');
                  else if (name.includes('el salvador')) matched = dataMap.get('el salvador');
                  else if (name.includes('united states') || name.includes('usa')) matched = dataMap.get('usa');
                  else if (name.includes('canada')) matched = dataMap.get('canada');
                  else if (name.includes('cuba')) matched = dataMap.get('cuba');
                  else if (name.includes('peru')) matched = dataMap.get('peru');
                  else if (name.includes('ecuador')) matched = dataMap.get('ecuador');
                  else if (name.includes('venezuela')) matched = dataMap.get('venezuela');
                }

                const count = matched ? matched.count : 0;
                const fillColor = getHeatColor(count);

                return {
                  fillColor: fillColor,
                  weight: 1,
                  opacity: 1,
                  color: '#ffffff',
                  fillOpacity: count > 0 ? 0.85 : 0.25,
                };
              },
              onEachFeature: (feature: any, layer: any) => {
                const name = feature.properties?.ADMIN || feature.properties?.name || 'Unknown';
                let matched = dataMap.get(name.toLowerCase().trim());

                layer.on({
                  mouseover: (e: any) => {
                    const l = e.target;
                    l.setStyle({
                      weight: 1.5,
                      color: '#ffffff',
                      fillOpacity: 0.95,
                    });
                    l.bringToFront();
                  },
                  mouseout: (e: any) => {
                    const l = e.target;
                    leafletMap.resetStyle(l);
                  },
                  click: () => {
                    if (matched) {
                      setSelectedCountry(matched);
                    } else {
                      setSelectedCountry({ country: name, count: 0, percentage: 0 });
                    }
                  },
                });
              },
            }).addTo(leafletMap);

            setLoadingMap(false);
          })
          .catch(err => {
            console.warn('Failed to load countries GeoJSON', err);
            setLoadingMap(false);
          });
      }
    } catch (err) {
      console.warn('Leaflet initialization error', err);
      setLoadingMap(false);
    }

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [data]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.fallbackContainer, { height }]}>
        <Text style={styles.fallbackText}>Interactive Leaflet Choropleth map is optimized for Web Dashboard view.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.mapContainer, { height }]} ref={mapContainerRef as any}>
        {loadingMap && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Loading GIS world boundaries...</Text>
          </View>
        )}
      </View>

      {/* Footer Legend & Selection Details */}
      <View style={styles.footerRow}>
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Custody Density:</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', backgroundColor: '#93c5fd', borderRadius: '2px', display: 'inline-block' }}></span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Low</span>
            <span style={{ width: '12px', height: '12px', backgroundColor: '#2563eb', borderRadius: '2px', display: 'inline-block', marginLeft: '6px' }}></span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>High</span>
          </div>
        </View>

        {selectedCountry ? (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedTitle}>{selectedCountry.country}</Text>
            <Text style={styles.selectedText}>
              {selectedCountry.count} detainees ({selectedCountry.percentage}% of total)
            </Text>
          </View>
        ) : (
          <Text style={styles.hintText}>Click any country on the map for details</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  mapContainer: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    zIndex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
  },
  fallbackText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  selectedBanner: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  selectedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e40af',
  },
  selectedText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '500',
  },
  hintText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
