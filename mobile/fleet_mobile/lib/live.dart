
import 'package:socket_io_client/socket_io_client.dart'
as IO;

import 'telemetry.dart';

class FleetLive {
  IO.Socket? _socket;

  void connect({
    required String region,
    required String deviceId,
    required void Function(Telemetry) onTelemetry,
    required void Function(bool) onStatusChanged,
  }) {
    disconnect();

    final normalizedRegion = region.trim().toLowerCase();

    final socket = IO.io(
      'http://10.0.2.2:3000',
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .enableForceNew()
          .build(),
    );

    _socket = socket;

    socket.onConnect((_) {
      print('[Socket.IO] Connected: $deviceId');

      socket.emit(
        'join-region',
        normalizedRegion,
      );

      onStatusChanged(true);
    });

    socket.on('region:joined', (data) {
      print('[Socket.IO] Joined region: $data');
    });

    socket.onDisconnect((_) {
      print('[Socket.IO] Disconnected: $deviceId');
      onStatusChanged(false);
    });

    socket.onConnectError((error) {
      print('[Socket.IO] Connection error: $error');
      onStatusChanged(false);
    });

    socket.on('telemetry:update', (data) {
      Telemetry item;

      try {
        if (data is! Map) return;

        item = Telemetry.fromJson(
          Map<String, dynamic>.from(data),
        );
      } catch (error) {
        print('[Socket.IO] Invalid data: $error');
        return;
      }

      if (item.deviceId != deviceId) {
        return;
      }

      // Виклик UI-обробника поза try/catch.
      onTelemetry(item);
    });

    socket.connect();
  }

  void disconnect() {
    final socket = _socket;

    // Спочатку прибираємо посилання.
    _socket = null;

    if (socket == null) return;

    socket.clearListeners();
    socket.disconnect();
    socket.dispose();
  }
}
