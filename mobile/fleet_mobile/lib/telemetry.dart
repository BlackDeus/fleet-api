
import 'dart:convert';

class Telemetry {
  final int id;
  final String deviceId;
  final String metric;
  final dynamic value;
  final DateTime timestamp;

  const Telemetry({
    required this.id,
    required this.deviceId,
    required this.metric,
    required this.value,
    required this.timestamp,
  });

  factory Telemetry.fromJson(Map<String, dynamic> json) {
    final rawTs = num.tryParse(
      json['ts'].toString(),
    ) ??
        0;

    dynamic rawValue = json['value'];

    // SQLite може повертати JSON як рядок.
    if (rawValue is String &&
        (rawValue.startsWith('{') ||
            rawValue.startsWith('['))) {
      try {
        rawValue = jsonDecode(rawValue);
      } catch (_) {
        // Залишаємо значення рядком.
      }
    }

    return Telemetry(
      id: int.tryParse(
        json['id']?.toString() ?? '',
      ) ??
          0,
      deviceId: json['device_id']?.toString() ?? '',
      metric: json['metric']?.toString() ?? '',
      value: rawValue,
      timestamp: DateTime.fromMillisecondsSinceEpoch(
        (rawTs * 1000).round(),
      ),
    );
  }

  double? get numericValue {
    if (value is num) {
      return (value as num).toDouble();
    }

    if (value is String) {
      return double.tryParse(value);
    }

    return null;
  }

  // Для об'єднання REST та Socket.IO без дублікатів.
  String get uniqueKey =>
      '$deviceId|$metric|'
          '${timestamp.millisecondsSinceEpoch}|'
          '${jsonEncode(value)}';
}
