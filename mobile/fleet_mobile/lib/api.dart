
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'telemetry.dart';
import 'device.dart';

class FleetApi {
  static const String baseUrl = 'http://10.0.2.2:3000';

  static Future<List<Device>> getDevices() async {
    final uri = Uri.parse('$baseUrl/api/v1/devices');

    final response = await http
        .get(uri)
        .timeout(const Duration(seconds: 10));

    if (response.statusCode != 200) {
      throw Exception(
        'Помилка сервера: HTTP ${response.statusCode}',
      );
    }

    final dynamic data = jsonDecode(response.body);

    if (data is! List) {
      throw const FormatException(
        'API повернув неправильний формат даних',
      );
    }

    return data.map((item) {
      return Device.fromJson(
        Map<String, dynamic>.from(item as Map),
      );
    }).toList();
  }


  static Future<List<Telemetry>> getTelemetryHistory({
    required String deviceId,
    required DateTime from,
    required DateTime to,
    String? metric,
  }) async {
    final allRows = <Telemetry>[];

    String? cursor;

    do {
      final uri = Uri.parse(
        '$baseUrl/api/v1/telemetry',
      ).replace(
        queryParameters: {
          'device': deviceId,
          'from': (from.millisecondsSinceEpoch ~/ 1000)
              .toString(),
          'to': (to.millisecondsSinceEpoch ~/ 1000)
              .toString(),
          'limit': '1000',
          'pagination': 'cursor',
          if (cursor != null) 'cursor': cursor,
          if (metric != null) 'metric': metric,
        },
      );

      final response = await http
          .get(uri)
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        throw Exception(
          'Помилка історії: HTTP ${response.statusCode}',
        );
      }

      final dynamic result = jsonDecode(response.body);

      if (result is! Map) {
        throw const FormatException(
          'Неправильний формат відповіді',
        );
      }

      final data = result['data'];

      if (data is! List) {
        throw const FormatException(
          'Відсутній масив data',
        );
      }

      for (final row in data) {
        allRows.add(
          Telemetry.fromJson(
            Map<String, dynamic>.from(row as Map),
          ),
        );
      }

      final hasMore = result['has_more'] == true;
      final nextCursor = result['next_cursor'];

      if (hasMore) {
        if (nextCursor is! String ||
            nextCursor.isEmpty ||
            nextCursor == cursor) {
          throw const FormatException(
            'Некоректний курсор пагінації',
          );
        }
        cursor = nextCursor;
      } else {
        cursor = null;
      }
    } while (cursor != null);

    allRows.sort(
          (a, b) => b.timestamp.compareTo(a.timestamp),
    );

    return allRows;
  }
}
