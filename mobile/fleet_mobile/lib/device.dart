
class Device {
  final String deviceId;
  final String region;

  const Device({
    required this.deviceId,
    required this.region,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      deviceId: json['device_id']?.toString() ?? '',
      region: json['region']?.toString() ?? 'unknown',
    );
  }
}
