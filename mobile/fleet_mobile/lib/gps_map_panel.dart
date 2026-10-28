
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'telemetry.dart';

class GpsMapPanel extends StatefulWidget {
  final String deviceId;
  final List<Telemetry> telemetry;

  const GpsMapPanel({
    super.key,
    required this.deviceId,
    required this.telemetry,
  });

  @override
  State<GpsMapPanel> createState() => _GpsMapPanelState();
}

class _GpsMapPanelState extends State<GpsMapPanel> {
  final MapController _controller = MapController();

  Telemetry? _savedGps;
  bool _loading = true;
  bool _mapReady = false;
  bool _centered = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadLastPosition();
  }

  LatLng? _parseGps(Telemetry item) {
    if (item.metric != 'gps') return null;

    dynamic value = item.value;

    if (value is String) {
      try {
        value = jsonDecode(value);
      } catch (_) {
        return null;
      }
    }

    if (value is! Map) return null;

    final lat = double.tryParse(
      value['lat']?.toString() ?? '',
    );

    final lon = double.tryParse(
      value['lon']?.toString() ??
          value['lng']?.toString() ??
          '',
    );

    if (lat == null || lon == null) return null;
    if (!lat.isFinite || !lon.isFinite) return null;

    if (lat < -90 || lat > 90) return null;
    if (lon < -180 || lon > 180) return null;

    return LatLng(lat, lon);
  }

  Telemetry? get _latestGps {
    Telemetry? latest;

    void consider(Telemetry item) {
      if (_parseGps(item) == null) return;

      if (latest == null ||
          item.timestamp.isAfter(latest!.timestamp)) {
        latest = item;
      }
    }

    if (_savedGps != null) {
      consider(_savedGps!);
    }

    for (final item in widget.telemetry) {
      consider(item);
    }

    return latest;
  }

  Future<void> _loadLastPosition() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final now = DateTime.now();

      final rows = await FleetApi.getTelemetryHistory(
        deviceId: widget.deviceId,
        metric: 'gps',
        from: now.subtract(const Duration(hours: 24)),
        to: now,
      );

      if (!mounted) return;

      Telemetry? latest;

      for (final item in rows) {
        if (_parseGps(item) == null) continue;

        if (latest == null ||
            item.timestamp.isAfter(latest.timestamp)) {
          latest = item;
        }
      }

      setState(() {
        _savedGps = latest;
        _loading = false;
      });

      _centerOnLatest();
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _centerOnLatest({bool force = false}) {
    if (!_mapReady) return;

    final gps = _latestGps;
    if (gps == null) return;

    final position = _parseGps(gps);
    if (position == null) return;

    if (!_centered || force) {
      _controller.move(position, 14);
      _centered = true;
    }
  }

  @override
  void didUpdateWidget(covariant GpsMapPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.deviceId != widget.deviceId) {
      _savedGps = null;
      _centered = false;
      _loadLastPosition();
    }
  }

  String _formatTime(DateTime time) {
    final local = time.toLocal();

    String two(int n) => n.toString().padLeft(2, '0');

    return '${two(local.day)}.${two(local.month)} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final gps = _latestGps;
    final position = gps == null ? null : _parseGps(gps);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'GPS-позиція',
              style: Theme.of(context).textTheme.titleMedium,
            ),

            const SizedBox(height: 8),

            if (_loading)
              const LinearProgressIndicator(),

            if (_error != null)
              Text(
                'Помилка GPS: $_error',
                style: const TextStyle(color: Colors.red),
              ),

            if (!_loading && position == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Немає GPS-даних за останні 24 години',
                ),
              ),

            if (position != null) ...[
              Text(
                'Координати: '
                    '${position.latitude.toStringAsFixed(6)}, '
                    '${position.longitude.toStringAsFixed(6)}',
              ),

              Text(
                'Останнє оновлення: ${_formatTime(gps!.timestamp)}',
              ),

              const SizedBox(height: 12),

              SizedBox(
                height: 300,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: FlutterMap(
                    mapController: _controller,
                    options: MapOptions(
                      initialCenter: position,
                      initialZoom: 14,
                      onMapReady: () {
                        _mapReady = true;
                        _centerOnLatest(force: true);
                      },
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName:
                        'com.example.fleet_mobile',
                      ),

                      MarkerLayer(
                        markers: [
                          Marker(
                            point: position,
                            width: 56,
                            height: 56,
                            child: const Icon(
                              Icons.local_shipping,
                              size: 42,
                              color: Colors.blue,
                            ),
                          ),
                        ],
                      ),

                      RichAttributionWidget(
                        attributions: [
                          TextSourceAttribution(
                            'OpenStreetMap contributors',
                            onTap: () => launchUrl(
                              Uri.parse(
                                'https://www.openstreetmap.org/copyright',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 8),

              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () {
                    _centerOnLatest(force: true);
                  },
                  icon: const Icon(Icons.my_location),
                  label: const Text('Центрувати'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
