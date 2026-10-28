
import 'package:flutter/material.dart';

import 'api.dart';
import 'device.dart';
import 'device_detail_screen.dart';

class DeviceListScreen extends StatefulWidget {
  const DeviceListScreen({super.key});

  @override
  State<DeviceListScreen> createState() =>
      _DeviceListScreenState();
}

class _DeviceListScreenState extends State<DeviceListScreen> {
  late Future<List<Device>> devicesFuture;

  @override
  void initState() {
    super.initState();
    loadDevices();
  }

  void loadDevices() {
    devicesFuture = FleetApi.getDevices();
  }

  void refreshDevices() {
    setState(() {
      loadDevices();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Транспортний парк'),
        actions: [
          IconButton(
            onPressed: refreshDevices,
            icon: const Icon(Icons.refresh),
            tooltip: 'Оновити',
          ),
        ],
      ),
      body: FutureBuilder<List<Device>>(
        future: devicesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState ==
              ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48),
                  const SizedBox(height: 12),
                  Text(
                    'Не вдалося завантажити транспорт',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${snapshot.error}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: refreshDevices,
                    child: const Text('Спробувати ще'),
                  ),
                ],
              ),
            );
          }

          final devices = snapshot.data ?? [];

          if (devices.isEmpty) {
            return const Center(
              child: Text('Транспортних засобів немає'),
            );
          }

          return ListView.builder(
            itemCount: devices.length,
            itemBuilder: (context, index) {
              final device = devices[index];

              return Card(
                margin: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                child: ListTile(
                  leading: const Icon(
                    Icons.local_shipping,
                    size: 32,
                  ),
                  title: Text(device.deviceId),

                  subtitle: Text(
                    'Регіон: ${device.region}',
                  ),
                  trailing: const Icon(
                    Icons.chevron_right,
                  ),

                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => DeviceDetailScreen(
                          device: device,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
