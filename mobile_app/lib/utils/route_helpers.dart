import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

class BusStopPoint {
  final int order;
  final String name;
  final double lat;
  final double lng;

  const BusStopPoint({
    required this.order,
    required this.name,
    required this.lat,
    required this.lng,
  });
}

List<BusStopPoint> parseBusStops(String? rawJson) {
  if (rawJson == null || rawJson.trim().isEmpty) return [];
  try {
    final dynamic decoded = jsonDecode(rawJson);
    if (decoded is! List) return [];
    final List<BusStopPoint> out = [];
    for (int i = 0; i < decoded.length; i++) {
      final item = decoded[i];
      if (item is Map) {
        final double? lat = (item['lat'] as num?)?.toDouble();
        final double? lng = (item['lng'] as num?)?.toDouble();
        if (lat != null && lng != null) {
          out.add(
            BusStopPoint(
              order: (item['order'] as num?)?.toInt() ?? (i + 1),
              name: (item['name'] as String?)?.trim().isNotEmpty == true
                  ? (item['name'] as String).trim()
                  : 'Stop ${i + 1}',
              lat: lat,
              lng: lng,
            ),
          );
        }
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

List<LatLng> parseBusPolyline(
  String? rawJson,
  List<BusStopPoint> fallbackStops,
) {
  if (rawJson != null && rawJson.trim().isNotEmpty) {
    try {
      final dynamic decoded = jsonDecode(rawJson);
      if (decoded is List && decoded.length >= 2) {
        final List<LatLng> pts = [];
        for (final pt in decoded) {
          if (pt is List && pt.length >= 2) {
            final double? lat = (pt[0] as num?)?.toDouble();
            final double? lng = (pt[1] as num?)?.toDouble();
            if (lat != null && lng != null) {
              pts.add(LatLng(lat, lng));
            }
          }
        }
        if (pts.length >= 2) return pts;
      }
    } catch (_) {}
  }
  return fallbackStops.map((s) => LatLng(s.lat, s.lng)).toList();
}

Future<String?> showSosCategoryPickerDialog(
  BuildContext context, {
  required String title,
  required String subtitle,
}) {
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Color(0xFFDC2626)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: Color(0xFF991B1B),
              ),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
          ),
          const SizedBox(height: 14),
          _buildSosCategoryBtn(
            ctx,
            category: 'medical',
            label: 'Medical Emergency',
            icon: Icons.medical_services_rounded,
            color: const Color(0xFFDC2626),
          ),
          const SizedBox(height: 8),
          _buildSosCategoryBtn(
            ctx,
            category: 'accident',
            label: 'Accident',
            icon: Icons.car_crash_rounded,
            color: const Color(0xFFB45309),
          ),
          const SizedBox(height: 8),
          _buildSosCategoryBtn(
            ctx,
            category: 'mechanical',
            label: 'Mechanical Breakdown',
            icon: Icons.build_circle_rounded,
            color: const Color(0xFF334155),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
      ],
    ),
  );
}

Widget _buildSosCategoryBtn(
  BuildContext ctx, {
  required String category,
  required String label,
  required IconData icon,
  required Color color,
}) {
  return ElevatedButton.icon(
    style: ElevatedButton.styleFrom(
      backgroundColor: color,
      foregroundColor: Colors.white,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    icon: Icon(icon, size: 19),
    label: Text(
      label,
      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
    ),
    onPressed: () => Navigator.pop(ctx, category),
  );
}
