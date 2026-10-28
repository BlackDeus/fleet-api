
import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'api.dart';
import 'device.dart';
import 'device_detail_screen.dart';
import 'device_list_screen.dart';
import 'firebase_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await FirebaseService.initialize();

  runApp(const FleetApp());
}

class FleetApp extends StatefulWidget {
  const FleetApp({super.key});

  @override
  State<FleetApp> createState() => _FleetAppState();
}

class _FleetAppState extends State<FleetApp> {
  final GlobalKey<NavigatorState> navigatorKey =
  GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _openDeviceFromNotification(message);
    });

    _checkInitialMessage();
  }

  Future<void> _checkInitialMessage() async {
    final message =
    await FirebaseMessaging.instance.getInitialMessage();

    if (message != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _openDeviceFromNotification(message);
      });
    }
  }

  Future<void> _openDeviceFromNotification(
      RemoteMessage message,
      ) async {
    final deviceId = message.data['device_id'];

    if (deviceId == null || deviceId.isEmpty) {
      debugPrint('[FCM] device_id відсутній');
      return;
    }

    try {
      final devices = await FleetApi.getDevices();

      Device? selectedDevice;

      for (final device in devices) {
        if (device.deviceId == deviceId) {
          selectedDevice = device;
          break;
        }
      }

      if (selectedDevice == null) {
        debugPrint('[FCM] Пристрій не знайдено: $deviceId');
        return;
      }

      final navigator = navigatorKey.currentState;

      if (navigator == null || !mounted) return;

      navigator.push(
        MaterialPageRoute(
          builder: (_) => DeviceDetailScreen(
            device: selectedDevice!,
          ),
        ),
      );
    } catch (e) {
      debugPrint('[FCM] Помилка відкриття пристрою: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Fleet Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.blue,
        ),
        useMaterial3: true,
      ),
      home: const DeviceListScreen(),
    );
  }
}
