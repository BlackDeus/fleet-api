
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'telemetry.dart';

class ChartPanel extends StatelessWidget {
  final String title;
  final String metric;
  final String unit;
  final Color color;
  final List<Telemetry> telemetry;
  final Duration timeRange;
  const ChartPanel({
    super.key,
    required this.title,
    required this.metric,
    required this.unit,
    required this.color,
    required this.telemetry,
    required this.timeRange,
  });

  @override
  Widget build(BuildContext context) {
    // Відбираємо лише коректні числові вимірювання.
    final points = telemetry.where((item) {
      final value = item.numericValue;

      return item.metric == metric &&
          value != null &&
          value.isFinite &&
          item.timestamp.millisecondsSinceEpoch > 0;
    }).toList()
      ..sort((a, b) =>
          a.timestamp.compareTo(b.timestamp));

    // Прибираємо дублікати часу.
    // Якщо два вимірювання мають однаковий timestamp,
    // залишаємо останнє.
    final unique = <int, Telemetry>{};

    for (final item in points) {
      unique[item.timestamp.millisecondsSinceEpoch] = item;
    }

    final sorted = unique.values.toList()
      ..sort((a, b) =>
          a.timestamp.compareTo(b.timestamp));


    final now = DateTime.now();

    final windowStart = now.subtract(timeRange);

// Вибираємо дані тільки за вибраний період.
    final recent = sorted.where((item) {
      return !item.timestamp.isBefore(windowStart) &&
          !item.timestamp.isAfter(now);
    }).toList();

    final visible = recent;


    if (visible.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 20),
              const Center(
                child: Text('Немає даних для графіка'),
              ),
            ],
          ),
        ),
      );
    }

    // Використовуємо секунди від початку графіка
    // замість великих Unix timestamp.
    final startTime =
        visible.first.timestamp.millisecondsSinceEpoch;

    final spots = visible.map((item) {
      final seconds =
          (item.timestamp.millisecondsSinceEpoch -
              startTime) /
              1000.0;

      return FlSpot(
        seconds,
        item.numericValue!,
      );
    }).toList();

    final minX = 0.0;
    final maxX = math.max(
      spots.last.x,
      60.0,
    );

    // Стабільний масштаб для пального.
    // Для швидкості нижня межа завжди 0.
    double minY;
    double maxY;

    if (metric == 'fuel') {
      minY = 0;
      maxY = 100;
    } else if (metric == 'speed') {
      minY = 0;

      final maxSpeed = spots
          .map((spot) => spot.y)
          .reduce(math.max);

      // Збільшуємо масштаб тільки за потреби.
      maxY = math.max(
        120.0,
        (maxSpeed / 20).ceil() * 20.0 + 20,
      );
    } else {
      final values = spots.map((s) => s.y).toList();

      minY = math.min(
        0.0,
        values.reduce(math.min),
      );

      maxY = math.max(
        10.0,
        values.reduce(math.max) * 1.2,
      );
    }

    final yInterval = metric == 'fuel'
        ? 25.0
        : metric == 'speed'
        ? 20.0
        : math.max((maxY - minY) / 4, 1.0);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              '${visible.length} останніх вимірювань',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 20),

            SizedBox(
              height: 220,
              child: LineChart(
                LineChartData(
                  minX: minX,
                  maxX: maxX,
                  minY: minY,
                  maxY: maxY,

                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: yInterval,
                  ),

                  borderData: FlBorderData(
                    show: true,
                    border: Border(
                      bottom: BorderSide(
                        color: Colors.grey.shade400,
                      ),
                      left: BorderSide(
                        color: Colors.grey.shade400,
                      ),
                    ),
                  ),

                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                      sideTitles:
                      SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles:
                      SideTitles(showTitles: false),
                    ),

                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 42,
                        interval: yInterval,
                        getTitlesWidget: (value, meta) {
                          return SideTitleWidget(
                            meta: meta,
                            child: Text(
                              value.toStringAsFixed(0),
                              style: const TextStyle(
                                fontSize: 10,
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 32,
                        interval: maxX / 3,
                        getTitlesWidget: (value, meta) {
                          final date = DateTime
                              .fromMillisecondsSinceEpoch(
                            startTime +
                                (value * 1000).round(),
                          );

                          String two(int n) =>
                              n.toString().padLeft(2, '0');

                          return SideTitleWidget(
                            meta: meta,
                            child: Text(
                              '${two(date.hour)}:'
                                  '${two(date.minute)}',
                              style: const TextStyle(
                                fontSize: 10,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),

                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: false,
                      color: color,
                      barWidth: 2.5,
                      isStrokeCapRound: true,

                      dotData: FlDotData(
                        show: spots.length <= 8,
                      ),

                      belowBarData: BarAreaData(
                        show: true,
                        color: color.withValues(
                          alpha: 0.08,
                        ),
                      ),
                    ),
                  ],

                  lineTouchData: LineTouchData(
                    touchTooltipData:
                    LineTouchTooltipData(
                      getTooltipItems: (touchedSpots) {
                        return touchedSpots.map((spot) {
                          return LineTooltipItem(
                            '${spot.y.toStringAsFixed(1)} $unit',
                            TextStyle(
                              color: color,
                              fontWeight: FontWeight.bold,
                            ),
                          );
                        }).toList();
                      },
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
