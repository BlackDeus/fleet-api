
import 'package:flutter/material.dart';

import 'api.dart';
import 'device.dart';
import 'live.dart';
import 'telemetry.dart';
import 'chart_panel.dart';
import 'gps_map_panel.dart';

class DeviceDetailScreen extends StatefulWidget {
  final Device device;

  const DeviceDetailScreen({
    super.key,
    required this.device,
  });

  @override
  State<DeviceDetailScreen> createState() =>
      _DeviceDetailScreenState();
}

class _DeviceDetailScreenState
    extends State<DeviceDetailScreen> {
  final FleetLive live = FleetLive();
  Duration selectedRange = const Duration(minutes: 15);

  List<Telemetry> telemetry = [];

  bool loading = true;
  bool connected = false;
  String? errorMessage;

  @override
  void initState() {
    super.initState();

    // Спочатку підключаємо live-події,
    // щоб не пропустити нові повідомлення.
    connectLive();
    loadHistory();
  }

  void connectLive() {
    live.connect(
      region: widget.device.region,
      deviceId: widget.device.deviceId,

      onTelemetry: (item) {
        if (!mounted) return;

        setState(() {
          mergeTelemetry([item]);
        });
      },

      onStatusChanged: (status) {
        if (!mounted) return;

        setState(() {
          connected = status;
        });
      },
    );
  }

  void mergeTelemetry(List<Telemetry> incoming) {
    final unique = <String, Telemetry>{};

    for (final item in telemetry) {
      unique[item.uniqueKey] = item;
    }

    for (final item in incoming) {
      unique[item.uniqueKey] = item;
    }

    telemetry = unique.values.toList()
      ..sort(
            (a, b) => b.timestamp.compareTo(a.timestamp),
      );


    final now = DateTime.now();
    final windowStart = now.subtract(selectedRange);

    telemetry = telemetry.where((item) {
      return !item.timestamp.isBefore(windowStart) &&
          !item.timestamp.isAfter(now);
    }).toList();

  }

  Future<void> loadHistory() async {
    if (!mounted) return;

    setState(() {
      loading = true;
      errorMessage = null;
    });

    try {

      final now = DateTime.now();

      final history = await FleetApi.getTelemetryHistory(
        deviceId: widget.device.deviceId,
        from: now.subtract(selectedRange),
        to: now,
      );

      if (!mounted) return;

      setState(() {
        mergeTelemetry(history);
        loading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        errorMessage = error.toString();
        loading = false;
      });
    }
  }

  Telemetry? latestMetric(String metric) {
    for (final item in telemetry) {
      if (item.metric == metric) {
        return item;
      }
    }
    return null;
  }

  String formatValue(Telemetry? item, String unit) {
    if (item == null) return 'Немає даних';

    final value = item.numericValue;

    if (value == null) {
      return item.value.toString();
    }

    return '${value.toStringAsFixed(1)} $unit';
  }

  String formatTime(DateTime date) {
    final local = date.toLocal();

    String two(int number) =>
        number.toString().padLeft(2, '0');

    return '${two(local.hour)}:'
        '${two(local.minute)}:'
        '${two(local.second)}';
  }

  Widget metricCard({
    required String title,
    required String value,
    required IconData icon,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 28),
            const SizedBox(height: 12),
            Text(title),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    live.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final speed = latestMetric('speed');
    final fuel = latestMetric('fuel');

    final history = telemetry.where(
          (item) =>
      item.metric == 'speed' ||
          item.metric == 'fuel',
    ).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.device.deviceId),
        actions: [
          IconButton(
            onPressed: loadHistory,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: loadHistory,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Row(
              children: [
                Icon(
                  Icons.circle,
                  size: 12,
                  color: connected
                      ? Colors.green
                      : Colors.red,
                ),
                const SizedBox(width: 8),
                Text(
                  connected
                      ? 'Socket.IO підключено'
                      : 'Socket.IO відключено',
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Регіон: ${widget.device.region}',
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: metricCard(
                    title: 'Швидкість',
                    value: formatValue(
                      speed,
                      'км/год',
                    ),
                    icon: Icons.speed,
                  ),
                ),
                Expanded(
                  child: metricCard(
                    title: 'Пальне',
                    value: formatValue(
                      fuel,
                      '%',
                    ),
                    icon: Icons.local_gas_station,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),


            const SizedBox(height: 16),

            GpsMapPanel(
              deviceId: widget.device.deviceId,
              telemetry: telemetry,
            ),

            const SizedBox(height: 16),

            const Text(
              'Період відображення',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 12),

            SegmentedButton<Duration>(
              segments: const [
                ButtonSegment<Duration>(
                  value: Duration(minutes: 15),
                  label: Text('15 хв'),
                ),
                ButtonSegment<Duration>(
                  value: Duration(hours: 1),
                  label: Text('1 год'),
                ),
                ButtonSegment<Duration>(
                  value: Duration(hours: 24),
                  label: Text('24 год'),
                ),
              ],
              selected: {selectedRange},
              onSelectionChanged: (selection) {
                setState(() {
                  selectedRange = selection.first;
                  telemetry = [];
                });

                loadHistory();
              },
            ),

            const SizedBox(height: 16),

            ChartPanel(
              title: 'Графік швидкості',
              metric: 'speed',
              unit: 'км/год',
              color: Colors.blue,
              telemetry: telemetry,
              timeRange: selectedRange,
            ),

            const SizedBox(height: 12),

            ChartPanel(
              title: 'Графік пального',
              metric: 'fuel',
              unit: '%',
              color: Colors.orange,
              telemetry: telemetry,
              timeRange: selectedRange,
            ),

            const SizedBox(height: 20),

            const SizedBox(height: 16),
            const Text(
              'Історія телеметрії',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (loading)
              const LinearProgressIndicator(),
            if (errorMessage != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Помилка REST API: $errorMessage',
                ),
              ),
            if (!loading && history.isEmpty)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'Немає телеметрії',
                ),
              ),
            ...history.map(
                  (item) => Card(
                child: ListTile(
                  leading: Icon(
                    item.metric == 'speed'
                        ? Icons.speed
                        : Icons.local_gas_station,
                  ),
                  title: Text(
                    item.metric == 'speed'
                        ? 'Швидкість'
                        : 'Пальне',
                  ),
                  subtitle: Text(
                    formatTime(item.timestamp),
                  ),
                  trailing: Text(
                    formatValue(
                      item,
                      item.metric == 'speed'
                          ? 'км/год'
                          : '%',
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
