
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(
    RemoteMessage message,
    ) async {
  await Firebase.initializeApp();

  debugPrint(
    '[FCM] Фонове повідомлення: ${message.messageId}',
  );
}

class FirebaseService {
  static Future<void> initialize() async {
    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(
      firebaseMessagingBackgroundHandler,
    );

    final messaging = FirebaseMessaging.instance;

    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    debugPrint(
      '[FCM] Дозвіл: ${settings.authorizationStatus}',
    );

    try {
      final token = await messaging.getToken();

      debugPrint('[FCM] TOKEN: $token');
    } catch (e) {
      debugPrint('[FCM] Помилка отримання токена: $e');
    }

    messaging.onTokenRefresh.listen((token) {
      debugPrint('[FCM] Новий TOKEN: $token');
    });

    FirebaseMessaging.onMessage.listen((message) {
      debugPrint(
        '[FCM] Повідомлення: ${message.notification?.title}',
      );

      debugPrint(
        '[FCM] Текст: ${message.notification?.body}',
      );
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      debugPrint(
        '[FCM] Відкрито повідомлення: ${message.messageId}',
      );
    });
  }
}
