import { useEffect } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const vehicleIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function RecenterMap({ point }) {
  const map = useMap();
  const lat = point?.lat;
  const lon = point?.lon;
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.panTo([lat, lon], { animate: true });
  }, [map, lat, lon]);
  return null;
}

export default function FleetMap({ vehicles, track, selectedDevice }) {
  const selected = vehicles.find(vehicle => vehicle.deviceId === selectedDevice && vehicle.point);
  const center = selected?.point || vehicles.find(vehicle => vehicle.point)?.point || { lat: 50.4501, lon: 30.5234 };
  const path = track.map(point => [point.lat, point.lon]);

  return (
    <div className="leaflet-frame">
      <MapContainer center={[center.lat, center.lon]} zoom={11} scrollWheelZoom className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap point={selected?.point || null} />
        {vehicles.filter(vehicle => vehicle.point).map(vehicle => (
          <Marker key={vehicle.deviceId} position={[vehicle.point.lat, vehicle.point.lon]} icon={vehicleIcon}>
            <Popup>
              <strong>{vehicle.deviceId}</strong><br />
              Регіон: {(vehicle.region || 'unknown').toUpperCase()}<br />
              Координати: {vehicle.point.lat.toFixed(6)}, {vehicle.point.lon.toFixed(6)}
            </Popup>
          </Marker>
        ))}
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />}
      </MapContainer>
    </div>
  );
}
